const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────
// IN-MEMORY КЕШ ОТВЕТОВ
// Снижает latency для повторных запросов с одинаковыми параметрами.
// Инстанс Lambda живёт ~5-15 минут → кеш актуален пока инстанс жив.
// TTL = 5 минут: цены и даты доставки не меняются чаще.
// ──────────────────────────────────────────────────────────────────────────
const _responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

function getCacheKey(route, body) {
  // Ключ: маршрут + нормализованное тело запроса (только значимые поля)
  try {
    const b = body || {};
    const order = b.order || b;
    const city = (
      order?.shipping_address?.full_locality_name ||
      order?.shipping_address?.location?.city ||
      order?.shipping_address?.city ||
      b?.address?.city || b?.city || ''
    ).toLowerCase().trim();
    const weight = parseFloat(order?.total_weight || b?.weight || 0).toFixed(2);
    const price  = parseFloat(order?.total_price  || b?.items_price || 0).toFixed(0);
    const addr   = (order?.shipping_address?.address || '').toLowerCase().trim();
    return `${route}|${city}|${weight}|${price}|${addr}`;
  } catch (e) {
    return null;
  }
}

function getCached(key) {
  if (!key) return null;
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache(key, value) {
  if (!key) return;
  // Ограничиваем размер кеша — не более 200 записей
  if (_responseCache.size >= 200) {
    const firstKey = _responseCache.keys().next().value;
    _responseCache.delete(firstKey);
  }
  _responseCache.set(key, { ts: Date.now(), value });
}

// Загружаем пункты выдачи из встроенного модуля (для надежного деплоя на Netlify)
let pickupPoints = [];
try {
  const { pickupPointsData } = require('./pickup-points-data');
  pickupPoints = pickupPointsData || [];
} catch (error) {
  console.error('Ошибка загрузки пунктов выдачи из модуля:', error);
  // Fallback: пробуем загрузить из JSON файла
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    const data = fs.readFileSync(filePath, 'utf8');
    pickupPoints = JSON.parse(data);
  } catch (e) {
    console.error('Ошибка загрузки пунктов выдачи из JSON:', e);
    pickupPoints = [];
  }
}

// Загрузка тарифов курьерской доставки из встроенного модуля (для надёжного деплоя на Netlify)
let _courierPricingCache = null;
function loadCourierPricing() {
  if (_courierPricingCache) return _courierPricingCache;
  try {
    const { courierPricingData } = require('./courier-pricing-data');
    _courierPricingCache = courierPricingData;
    return _courierPricingCache;
  } catch (e) {
    console.warn('Не удалось загрузить courier-pricing-data, пробуем JSON:', e.message);
  }
  // Fallback: пробуем загрузить из JSON файла
  try {
    const filePath = path.join(__dirname, 'courier-pricing.json');
    const data = fs.readFileSync(filePath, 'utf8');
    _courierPricingCache = JSON.parse(data);
    return _courierPricingCache;
  } catch (e) {
    console.warn('Не удалось загрузить courier-pricing.json, используются дефолтные тарифы:', e.message);
    return null;
  }
}

/**
 * Расчет стоимости одной посылки по весу (Дверь-Дверь, Зона 4)
 * Максимальный вес одной посылки: 50 кг
 * Тарифы от 15.12.2025, Автолайт Экспресс, eCommerce Standard
 */
function getCourierPriceForSingleParcel(weight) {
  const w = parseFloat(weight) || 0;
  // Тарифы Зона 4 (Дверь-Дверь) - зона отправки
  if (w <= 1) return 14.80;
  if (w <= 2) return 16.40;
  if (w <= 3) return 17.10;
  if (w <= 5) return 20.00;
  if (w <= 10) return 23.30;
  if (w <= 15) return 26.60;
  if (w <= 20) return 29.80;
  if (w <= 25) return 33.10;
  if (w <= 30) return 36.40;
  if (w <= 35) return 43.80;
  if (w <= 40) return 45.60;
  if (w <= 45) return 48.30;
  if (w <= 50) return 50.20;
  // Более 50 кг - недопустимо для одной посылки
  return 50.20;
}

/**
 * Расчет стоимости курьерской доставки с учетом разделения на несколько посылок
 * Максимальный вес одной посылки: 50 кг
 * Стратегия: максимально загружаем каждую посылку до 50 кг, остаток - отдельная посылка
 * Пример: 75 кг = 50 кг + 25 кг (2 посылки)
 */
function calculateCourierPrice(weight) {
  const pricing = loadCourierPricing();
  if (pricing && pricing.weight_pricing && pricing.weight_pricing.length > 0) {
    const weightKg = parseFloat(weight) || 0;
    for (const tier of pricing.weight_pricing) {
      if (weightKg <= tier.max_weight) {
        return { price: tier.price, currency: pricing.currency || 'BYN', pricing, parcelsCount: 1, parcels: [weightKg] };
      }
    }
    if (pricing.oversized_pricing) {
      const maxTier = pricing.weight_pricing[pricing.weight_pricing.length - 1];
      const extra = Math.max(0, weightKg - maxTier.max_weight);
      const price = pricing.oversized_pricing.base_price + extra * pricing.oversized_pricing.price_per_kg;
      return { price: Math.round(price * 100) / 100, currency: pricing.currency || 'BYN', pricing, parcelsCount: 1, parcels: [weightKg] };
    }
  }
  
  const totalWeight = parseFloat(weight) || 0;
  const MAX_PARCEL_WEIGHT = 50;
  
  // Если вес <= 50 кг - одна посылка
  if (totalWeight <= MAX_PARCEL_WEIGHT) {
    const price = getCourierPriceForSingleParcel(totalWeight);
    return { price, currency: 'BYN', pricing: null, parcelsCount: 1, parcels: [totalWeight] };
  }
  
  // Если вес > 50 кг - максимально загружаем посылки по 50 кг
  const fullParcels = Math.floor(totalWeight / MAX_PARCEL_WEIGHT); // количество полных посылок по 50 кг
  const remainder = totalWeight - (fullParcels * MAX_PARCEL_WEIGHT); // остаток
  
  let totalPrice = 0;
  let parcels = [];
  
  // Добавляем полные посылки по 50 кг
  for (let i = 0; i < fullParcels; i++) {
    totalPrice += getCourierPriceForSingleParcel(MAX_PARCEL_WEIGHT);
    parcels.push(MAX_PARCEL_WEIGHT);
  }
  
  // Добавляем остаток (если есть)
  if (remainder > 0) {
    totalPrice += getCourierPriceForSingleParcel(remainder);
    parcels.push(Math.round(remainder * 100) / 100);
  }
  
  const parcelsCount = parcels.length;
  
  console.log(`[COURIER] Вес ${totalWeight}кг разделен на ${parcelsCount} посылок: ${parcels.join(' кг + ')} кг, итого: ${totalPrice.toFixed(2)} BYN`);
  
  return { 
    price: Math.round(totalPrice * 100) / 100, 
    currency: 'BYN', 
    pricing: null, 
    parcelsCount,
    parcels
  };
}

// ──────────────────────────────────────────────────────────────────────────
// ЗОНИРОВАНИЕ НАСЕЛЁННЫХ ПУНКТОВ — загружается из zones.json
// ──────────────────────────────────────────────────────────────────────────

// Встроенные зоны по умолчанию (fallback на случай ошибки загрузки zones-data и zones.json)
const DEFAULT_ZONES = {
  saturday: [
    'минск', 'брест', 'витебск', 'гомель', 'гродно', 'могилев', 'могилёв',
    'барановичи', 'бобруйск', 'борисов', 'жлобин', 'жодино', 'лида',
    'молодечно', 'мозырь', 'новополоцк', 'орша', 'пинск',
    'полоцк', 'речица', 'светлогорск', 'слоним', 'слуцк', 'солигорск',
    'сморгонь', 'калинковичи'
  ],
  district: [
    'береза', 'берёза', 'берестовица', 'бешенковичи', 'браслав', 'брагин',
    'буда-кошелево', 'буда-кошелёво', 'быхов', 'белоозерск', 'белоозёрск',
    'белыничи', 'ветка', 'верхнедвинск', 'вилейка', 'волковыск', 'воложин',
    'вороново', 'высокое', 'ганцевичи', 'глуск', 'глубокое', 'городок',
    'горки', 'давид-городок', 'добруш', 'докшицы', 'дрибин', 'дрогичин',
    'дубровно', 'дятлово', 'дзержинск', 'ельск', 'жабинка', 'житкович',
    'заславль', 'зельва', 'иваново', 'ивацевичи', 'ивье', 'ивьё', 'каменец',
    'кобрин', 'кировск', 'климовичи', 'кличев', 'клецк', 'копыль', 'кореличи', 'корма',
    'костюковичи', 'краснополье', 'кричев', 'круглое', 'крупки', 'лельчицы',
    'лепель', 'лиозно', 'логойск', 'лоев', 'лунинец', 'любань', 'ляховичи',
    'малорита', 'марьина горка', 'микашевичи', 'миоры', 'мстиславль',
    'мядель', 'наровля', 'несвиж', 'новогрудок', 'новолукомль', 'октябрьский',
    'осиповичи', 'ошмяны', 'петриков', 'поставы', 'пружаны', 'рогачев', 'рогачёв',
    'россоны', 'свислочь', 'сенно', 'скидель', 'смолевичи', 'столбцы',
    'столин', 'старые дороги', 'толочин', 'туров', 'узда', 'ушачи',
    'фаниполь', 'хойники', 'хотимск', 'чашники', 'червень', 'чериков',
    'чечерск', 'шарковщина', 'шклов', 'шумилино', 'щучин', 'березовка', 'берёзовка'
  ]
};

let deliveryZones = { saturday: [], district: [] };
let zonesLoadStatus = 'pending';

// Загружаем зоны из встроенного модуля (для надёжного деплоя на Netlify)
try {
  const { zonesData } = require('./zones-data');
  deliveryZones.saturday = (zonesData.saturday || []).map(s => s.toLowerCase());
  deliveryZones.district = (zonesData.district || []).map(s => s.toLowerCase());
  zonesLoadStatus = 'loaded';
} catch (e) {
  console.warn(`[ZONES] ⚠️ Модуль zones-data недоступен, пробуем zones.json: ${e.message}`);
  // Fallback: пробуем несколько путей к JSON файлу
  const possiblePaths = [
    path.join(__dirname, 'zones.json'),
    path.resolve(__dirname, 'zones.json'),
    path.join(process.cwd(), 'functions', 'zones.json'),
    path.resolve(process.cwd(), 'zones.json')
  ];

  let loaded = false;
  for (const zonesPath of possiblePaths) {
    try {
      const zonesRaw = fs.readFileSync(zonesPath, 'utf8');
      const parsed = JSON.parse(zonesRaw);
      deliveryZones.saturday = (parsed.saturday || []).map(s => s.toLowerCase());
      deliveryZones.district = (parsed.district || []).map(s => s.toLowerCase());
      zonesLoadStatus = 'loaded';
      loaded = true;
      break;
    } catch (pathErr) {
      // Пробуем следующий путь
    }
  }

  if (!loaded) {
    deliveryZones.saturday = [...DEFAULT_ZONES.saturday];
    deliveryZones.district = [...DEFAULT_ZONES.district];
    zonesLoadStatus = 'fallback';
  }
}

// Логируем результат загрузки один раз
console.log(`[ZONES] ✅ Загружено из ${zonesLoadStatus === 'loaded' ? 'модуля/файла' : 'DEFAULT_ZONES (fallback)'}`);
console.log(`[ZONES] Saturday: ${deliveryZones.saturday.length} городов`);
console.log(`[ZONES] District: ${deliveryZones.district.length} городов`);

// Префиксы, однозначно указывающие на сельский тип населённого пункта
// Поддерживаем варианты с точкой («д.») и без точки («д ») — InSales присылает оба формата
const VILLAGE_PREFIXES = /^(д\.?|дер\.?|деревня|аг\.?|агрогородок|пос\.?|поселок|посёлок|хутор|х\.?)\s+/i;

// Шаблон для обнаружения упоминания населённого пункта ВНУТРИ строки адреса.
// Покрывает случаи «д. Деревня», «д Терюха, ул.», «аг. Жуки» и т.п.
// Группа 1 — сам префикс, группа 2 — название населённого пункта (до запятой/точки/конца).
const VILLAGE_IN_ADDRESS_RE = /(?:^|[,;\s])(д\.?\s+|дер\.?\s+|деревня\s+|аг\.?\s+|агрогородок\s+|пос\.?\s+|поселок\s+|посёлок\s+|хутор\s+|х\.?\s+)([а-яёА-ЯЁa-zA-Z][а-яёА-ЯЁ\w\-]+)/i;

/**
 * Ищет в строке адреса покупателя упоминание сельского населённого пункта.
 * Возвращает строку вида «д. Терюха» или null если ничего не найдено.
 *
 * Примеры, которые перехватит функция:
 *   «д. Деревня Терюха, ул. Лесная, 15»  → «д. Терюха»
 *   «аг. Жуки, ул. Центральная, 3»        → «аг. Жуки»
 *   «пос. Колодищи, д.5»                  → «пос. Колодищи»
 *
 * НЕ перехватит (только улица, без населённого пункта):
 *   «ул. Лесная, 15»
 *   «пр-т Независимости, 100»
 */
function extractSettlementFromAddress(address) {
  if (!address || !address.trim()) return null;
  const m = VILLAGE_IN_ADDRESS_RE.exec(address);
  if (!m) return null;
  const prefix = m[1].trim();
  const name   = m[2].trim();
  const result = `${prefix} ${name}`;
  console.log(`[ADDRESS_CHECK] В строке адреса обнаружен населённый пункт: "${result}" (исходник: "${address}")`);
  return result;
}

/**
 * Нормализует название населённого пункта для сравнения:
 * убирает префиксы «г.»/«г », «город», «д.»/«д », «аг.»/«аг » и т.п.,
 * а также суффиксы «обл.», «р-н», «район», «беларусь» и всё после запятой.
 *
 * InSales передаёт адреса в формате:
 *   «г Минск», «г. Минск», «г Столин, Брестская обл.»,
 *   «д Семоновщина, Дрогичинский район, Брестская обл.»
 */
function normalizeSettlementName(raw) {
  return raw.toLowerCase()
    .replace(/[,;].*$/, '')            // всё после первой запятой / точки с запятой
    .replace(/^г\.?\s+/i, '')          // «г.» или «г » (с точкой или без)
    .replace(/^город\s+/i, '')         // «город »
    .replace(/^д\.?\s+/i, '')          // «д.» или «д » (деревня)
    .replace(/^дер\.?\s+/i, '')        // «дер.» или «дер »
    .replace(/^деревня\s+/i, '')       // «деревня »
    .replace(/^аг\.?\s+/i, '')         // «аг.» или «аг » (агрогородок)
    .replace(/^агрогородок\s+/i, '')   // «агрогородок »
    .replace(/^пос\.?\s+/i, '')        // «пос.» или «пос » (поселок)
    .replace(/^поселок\s+/i, '')       // «поселок »
    .replace(/^посёлок\s+/i, '')       // «посёлок »
    .replace(/^с\.?\s+/i, '')          // «с.» или «с » (с точкой или пробелом — не просто «с»)
    .replace(/^х\.?\s+/i, '')          // «х.» или «х » (хутор)
    .replace(/\s+беларусь$/i, '')      // «беларусь» в конце
    .replace(/\s+обл\.?(\s|$)/i, ' ') // «обл.» или «обл»
    .replace(/\s+р-н\.?(\s|$)/i, ' ') // «р-н»
    .replace(/\s+район(\s|$)/i, ' ')   // «район»
    .trim();
}

/**
 * Классифицирует населённый пункт по зонам доставки.
 *
 * Логика:
 *  1. Явный сельский префикс (д., аг., пос.) → village
 *  2. Есть в zones.saturday → saturday (Пн–Сб)
 *  3. Есть в zones.district → district (Пн–Пт)
 *  4. Всё остальное → village (1–2 дня, Пн–Пт)
 *
 * @returns {'saturday'|'district'|'village'}
 */
function classifySettlement(rawName) {
  if (!rawName || !rawName.trim()) return 'district';

  const raw = rawName.trim();

  // Явный сельский тип — сразу village
  if (VILLAGE_PREFIXES.test(raw)) {
    console.log(`[ZONE] "${raw}" → village (сельский префикс)`);
    return 'village';
  }

  const clean = normalizeSettlementName(raw);

  if (deliveryZones.saturday.includes(clean)) {
    console.log(`[ZONE] "${raw}" → saturday (в списке saturday)`);
    return 'saturday';
  }
  if (deliveryZones.district.includes(clean)) {
    console.log(`[ZONE] "${raw}" → district (в списке district)`);
    return 'district';
  }

  // Всё остальное — village (деревни, агрогородки, малые населённые пункты)
  console.log(`[ZONE] "${raw}" → village (не найден в зонах, clean="${clean}")`);
  return 'village';
}

// ──────────────────────────────────────────────────────────────────────────
// РАСЧЁТ ДАТЫ ДОСТАВКИ
// ──────────────────────────────────────────────────────────────────────────

const MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const DAYS_RU   = ['вс','пн','вт','ср','чт','пт','сб'];

/**
 * Государственные праздники Беларуси (нерабочие дни)
 * Формат: 'YYYY-MM-DD' или 'MM-DD' (для ежегодных)
 * 
 * Источники: Трудовой кодекс РБ, ст.147
 * 
 * Если праздник выпадает на субботу/воскресенье — перенос не предусмотрен (официально)
 * Но для логистики добавим ручные переносы при необходимости
 */
const BELARUS_HOLIDAYS = [
  // Фиксированные даты
  '01-01', // 1 января — Новый год
  '01-02', // 2 января — Новый год
  '01-07', // 7 января — Рождество Христово (православное)
  '03-08', // 8 марта — День женщин
  '05-01', // 1 мая — Праздник труда
  '05-09', // 9 мая — День Победы
  '07-03', // 3 июля — День независимости
  '11-07', // 7 ноября — День Октябрьской революции
  '12-25', // 25 декабря — Рождество Христово (католическое)
  
  // Плавающие праздники (рассчитываются отдельно)
  // Пасха (православная) — добавляется динамически
  // Радуница (9 дней после Пасхи) — добавляется динамически
];

/**
 * Рассчитывает дату Пасхи для заданного года (православная, по Александрийской пасхалии)
 * @param {number} year 
 * @returns {Date} дата Пасхи
 */
function getOrthodoxEaster(year) {
  // Алгоритм Гаусса для православной Пасхи
  const a = year % 19;
  const b = year % 4;
  const c = year % 7;
  const d = (19 * a + 15) % 30;
  const e = (2 * b + 4 * c + 6 * d + 6) % 7;
  const f = d + e;
  
  let day, month;
  if (f <= 9) {
    // Март
    day = f + 22; // по старому стилю
    day += 13;    // перевод на новый стиль (XX-XXI вв)
    if (day > 31) {
      day -= 31;
      month = 4; // Апрель
    } else {
      month = 3; // Март
    }
  } else {
    // Апрель
    day = f - 9; // по старому стилю
    day += 13;   // перевод на новый стиль
    if (day > 30) {
      day -= 30;
      month = 5; // Май
    } else {
      month = 4; // Апрель
    }
  }
  
  return new Date(year, month - 1, day);
}

/**
 * Рассчитывает дату Радуницы (9 дней после Пасхи, вторник)
 * @param {number} year 
 * @returns {Date} дата Радуницы
 */
function getRadunitsa(year) {
  const easter = getOrthodoxEaster(year);
  const radunitsa = new Date(easter);
  radunitsa.setDate(easter.getDate() + 9);
  return radunitsa;
}

/**
 * Проверяет, является ли дата выходным днем в Беларуси
 * @param {Date} date 
 * @returns {boolean} true если выходной
 */
function isBelarusHoliday(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${month}-${day}`;
  const year = date.getFullYear();
  
  // Проверка фиксированных праздников
  if (BELARUS_HOLIDAYS.includes(dateStr)) {
    console.log(`[HOLIDAY] ${date.toISOString().split('T')[0]} — государственный праздник`);
    return true;
  }
  
  // Проверка Пасхи
  const easter = getOrthodoxEaster(year);
  if (easter.getDate() === date.getDate() && easter.getMonth() === date.getMonth()) {
    console.log(`[HOLIDAY] ${date.toISOString().split('T')[0]} — Пасха`);
    return true;
  }
  
  // Проверка Радуницы
  const radunitsa = getRadunitsa(year);
  if (radunitsa.getDate() === date.getDate() && radunitsa.getMonth() === date.getMonth()) {
    console.log(`[HOLIDAY] ${date.toISOString().split('T')[0]} — Радуница`);
    return true;
  }
  
  return false;
}

function formatDate(date) {
  return `Ориентировочно ${DAYS_RU[date.getDay()]}, ${date.getDate()} ${MONTHS_RU[date.getMonth()]}`;
}

/**
 * Генерирует форматированный вывод для визуализации сроков доставки.
 * Эмодзи + явное указание срока делает информацию заметной и понятной.
 */
function generateDeliverySvg(dateInfo) {
   // Парсим даты из description
   const dateParts = dateInfo.description.split(' – ');
   const startDate = dateParts[0] || dateInfo.description;
   const endDate = dateParts[1] || null;
   
   // Проверяем, есть ли реальный диапазон (разные даты)
   const isRange = endDate && startDate !== endDate;
   
   // Возвращаем текст с календарным эмодзи (более узнаваемо для сроков)
   if (isRange) {
     return `📅 ${startDate} – ${endDate}`;
   } else {
     return `📅 ${startDate}`;
   }
}

/**
 * Добавляет рабочие дни к дате, пропуская вс (и сб для district/village) и гос. праздники Беларуси.
 */
function addWorkingDays(date, days, skipSaturday) {
  let added = 0;
  const d = new Date(date);
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow === 0) continue;                    // пропускаем вс всегда
    if (skipSaturday && dow === 6) continue;    // пропускаем сб для district/village
    if (isBelarusHoliday(d)) continue;          // пропускаем государственные праздники
    added++;
  }
  return d;
}

/**
 * Определяет UTC смещение (в минутах) на основе кода страны
 * @param {string} countryCode - двухбуквенный код страны (BY, RU и т.д.)
 * @returns {number} смещение в минутах от UTC (отрицательное число)
 */
function getUtcOffsetByCountry(countryCode) {
  const timezoneMap = {
    'BY': -180,  // Беларусь: UTC+3 (зимой), UTC+3 (летом, нет перехода)
    'RU': -180,  // Россия Московская (часть) UTC+3
  };
  return timezoneMap[countryCode?.toUpperCase()] || -180; // По умолчанию UTC+3
}

/**
 * Возвращает объект с датами и описанием доставки.
 * Отсечка: 12:00 — заказы после 12:00 уходят на следующий рабочий день.
 *
 * @param {'saturday'|'district'|'village'} zone
 * @param {number} utcOffsetMinutes - смещение браузера от UTC в минутах (из getTimezoneOffset())
 */
function calcDeliveryDate(zone, utcOffsetMinutes = null) {
  let now = new Date();
  
  // Если получено смещение браузера, пересчитываем время на местное
  if (utcOffsetMinutes !== null && utcOffsetMinutes !== undefined) {
    const serverUtcOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    const browserUtcOffsetMs = utcOffsetMinutes * 60 * 1000;
    const correction = serverUtcOffsetMs - browserUtcOffsetMs;
    now = new Date(now.getTime() + correction);
    console.log(`[DATE] UTC offset браузера: ${utcOffsetMinutes} мин, время скорректировано`);
  } else {
    console.log(`[DATE] UTC offset не получен, используется серверное время`);
  }
  
  const isAfterCutoff = now.getHours() >= 12;
  const currentDayOfWeek = now.getDay();

  // skipSaturday=false только для зоны saturday (Минск и крупные города)
  const skipSaturday = (zone !== 'saturday');

  let baseDate = new Date(now);

  // Определяем дату отправки (baseDate).
  // ВАЖНО: суббота — день ДОСТАВКИ, а не отправки. Отправка только Пн–Пт.
  // Поэтому заказы в пятницу после 12:00, в субботу или воскресенье → отправка в понедельник.

  if (currentDayOfWeek === 6) {
    // Суббота (любое время) → отправка в понедельник (+2 календарных дня)
    baseDate.setDate(baseDate.getDate() + 2);
    console.log(`[DATE] Суббота → отправка в понедельник`);
  } else if (currentDayOfWeek === 0) {
    // Воскресенье (любое время) → отправка в понедельник (+1 календарный день)
    baseDate.setDate(baseDate.getDate() + 1);
    console.log(`[DATE] Воскресенье → отправка в понедельник`);
  } else if (currentDayOfWeek === 5 && isAfterCutoff) {
    // Пятница после 12:00 → отправка в понедельник (+3 календарных дня)
    baseDate.setDate(baseDate.getDate() + 3);
    console.log(`[DATE] Пятница после 12:00 → отправка в понедельник`);
  } else if (isAfterCutoff) {
    // Пн–Чт после 12:00 → отправка на следующий рабочий день (только Пн–Пт, skipSaturday=true)
    baseDate = addWorkingDays(baseDate, 1, true);
    console.log(`[DATE] После 12:00 → отправка на следующий рабочий день`);
  } else {
    // До 12:00 в рабочий день (Пн–Пт) → отправка сегодня (baseDate остаётся)
    console.log(`[DATE] До 12:00, рабочий день → отправка сегодня`);
  }

   if (zone === 'saturday') {
     // Минск, областные, крупные города: +1 день (Пн–Сб)
     const deliveryDate = addWorkingDays(baseDate, 1, false);
     return {
       min_days: 1,
       max_days: 1,
       description: formatDate(deliveryDate),
       note: isAfterCutoff ? 'Заказ после 12:00 уходит на следующий рабочий день' : null
     };
   }

   if (zone === 'district') {
     // Районные города: +1 рабочий день, только Пн–Пт
     const deliveryDate = addWorkingDays(baseDate, 1, true);
     return {
       min_days: 1,
       max_days: 1,
       description: formatDate(deliveryDate),
       note: 'Доставка Пн–Пт, в течение дня • Утром СМС с телефоном водителя'
     };
   }

   // village: 1–2 рабочих дня, только Пн–Пт, время на усмотрение водителя
   const minDate = addWorkingDays(baseDate, 1, true);
   const maxDate = addWorkingDays(baseDate, 2, true);
   return {
     min_days: 1,
     max_days: 2,
     description: `${formatDate(minDate)} – ${formatDate(maxDate)}`,
     note: 'Пн–Пт • Точное время определяет водитель • SMS утром'
   };
}

// ──────────────────────────────────────────────────────────────────────────
// УЛУЧШЕННАЯ ФИЛЬТРАЦИЯ ГОРОДОВ (без дефолтного фолбэка на крупные города)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ищет ПВЗ по названию города.
 * Возвращает пустой массив если ничего не найдено (НЕ дефолтные города).
 */
function findBestCityMatch(inputCity, pickupPoints) {
  if (!inputCity || !inputCity.trim()) {
    return [];
  }

  const normalizedInput = inputCity.toLowerCase().trim();
  
  // Удаляем префиксы и общие слова
  const cleanInput = normalizedInput
    .replace(/^г\.?\s*/i, '')
    .replace(/^город\s+/i, '')
    .replace(/^п\.?\s*/i, '')
    .replace(/^с\.?\s*/i, '')
    .replace(/\s+беларусь$/i, '')
    .replace(/[,;].*$/, '')
    .replace(/\s+обл\.?/i, '')
    .replace(/\s+р-н\.?/i, '')
    .trim();

  const uniqueCities = [...new Set(pickupPoints.map(point => point.city))];
  
  // Точное совпадение (максимальный приоритет)
  const exactMatches = uniqueCities.filter(city => city.toLowerCase() === cleanInput);
  if (exactMatches.length > 0) {
    return pickupPoints.filter(point => exactMatches.includes(point.city));
  }

  // Частичное совпадение слов (высокий приоритет)
  const wordMatches = uniqueCities.filter(city => {
    const cleanCity = city.toLowerCase()
      .replace(/^г\.?\s*/i, '')
      .replace(/^город\s+/i, '');
    return cleanCity === cleanInput ||
           cleanInput.includes(cleanCity) ||
           cleanCity.includes(cleanInput);
  });
  if (wordMatches.length > 0) {
    return pickupPoints.filter(point => wordMatches.includes(point.city));
  }

  // Частичное совпадение символов (средний приоритет)
  const charMatches = uniqueCities.filter(city => {
    const cleanCity = city.toLowerCase()
      .replace(/^г\.?\s*/i, '')
      .replace(/^город\s+/i, '');
    return cleanInput.includes(cleanCity) || cleanCity.includes(cleanInput);
  });
  if (charMatches.length > 0) {
    return pickupPoints.filter(point => charMatches.includes(point.city));
  }

  // Нет совпадений — возвращаем пустой массив (вызывающий код обработает это отдельно)
  return [];
}

/**
 * Расчет стоимости одной посылки для ПВЗ по весу (Дверь-Отделение, Зона 4)
 * Тарифы от 15.12.2025, Автолайт Экспресс, eCommerce Standard
 * Дверь-Отделение = от адреса отправителя до ПВЗ получателя
 */
function getPickupPriceForSingleParcel(weight) {
  const w = parseFloat(weight) || 0;
  // Тарифы Зона 4 (Дверь-Отделение)
  if (w <= 1) return 10.20;
  if (w <= 2) return 10.90;
  if (w <= 3) return 11.80;
  if (w <= 5) return 12.80;
  if (w <= 10) return 15.10;
  if (w <= 15) return 18.40;
  if (w <= 20) return 20.90;
  if (w <= 25) return 23.30;
  if (w <= 30) return 26.60;
  if (w <= 35) return 30.00;
  if (w <= 40) return 32.40;
  if (w <= 45) return 34.80;
  if (w <= 50) return 36.30;
  return 36.30;
}

/**
 * Расчет стоимости доставки в ПВЗ с учетом ограничения по весу
 * Стратегия: максимально загружаем каждую посылку до лимита ПВЗ, остаток - отдельная посылка
 * Пример: 60 кг при лимите 30 кг = 30 кг + 30 кг (2 посылки)
 * Пример: 35 кг при лимите 30 кг = 30 кг + 5 кг (2 посылки)
 * 
 * @param {number} weight - общий вес заказа
 * @param {number} maxWeight - максимальный вес для данного ПВЗ (30 или 50 кг)
 * @returns {object} - цена и количество посылок
 */
function calculatePrice(weight, maxWeight = 50) {
  const totalWeight = parseFloat(weight) || 0;
  const weightLimit = parseFloat(maxWeight) || 50;
  
  // Если вес укладывается в лимит ПВЗ - одна посылка
  if (totalWeight <= weightLimit) {
    const price = getPickupPriceForSingleParcel(totalWeight);
    return { price, parcelsCount: 1, parcels: [totalWeight] };
  }
  
  // Если вес превышает лимит - максимально загружаем посылки до лимита
  const fullParcels = Math.floor(totalWeight / weightLimit); // количество полных посылок
  const remainder = totalWeight - (fullParcels * weightLimit); // остаток
  
  let totalPrice = 0;
  let parcels = [];
  
  // Добавляем полные посылки по максимальному весу
  for (let i = 0; i < fullParcels; i++) {
    totalPrice += getPickupPriceForSingleParcel(weightLimit);
    parcels.push(weightLimit);
  }
  
  // Добавляем остаток (если есть)
  if (remainder > 0) {
    totalPrice += getPickupPriceForSingleParcel(remainder);
    parcels.push(Math.round(remainder * 100) / 100);
  }
  
  const parcelsCount = parcels.length;
  
  console.log(`[PVZ] Вес ${totalWeight}кг, лимит ${weightLimit}кг → ${parcelsCount} посылок: ${parcels.join(' кг + ')} кг, итого: ${totalPrice.toFixed(2)} BYN`);
  
  return { 
    price: Math.round(totalPrice * 100) / 100, 
    parcelsCount,
    parcels
  };
}

/**
 * Округление до целых рублей (без копеек)
 * Математическое округление: < 0.50 вниз, ≥ 0.50 вверх
 * @param {number} value - значение для округления
 * @returns {number} - округленное значение
 */
function roundToWholeRubles(value) {
  return Math.round(value);
}

/**
 * Рассчитывает дополнительные сборы для доставки
 * @param {number} baseDeliveryPrice - базовая стоимость доставки
 * @param {number} orderSum - общая стоимость заказа (товары)
 * @param {boolean} isRural - является ли населенный пункт сельским
 * @param {number} parcelsCount - количество посылок (по умолчанию 1)
 * @returns {object} - объект с детализацией сборов
 */
function calculateAdditionalFees(baseDeliveryPrice, orderSum, isRural, parcelsCount = 1) {
  const orderAmount = parseFloat(orderSum) || 0;
  const basePrice = parseFloat(baseDeliveryPrice) || 0;
  const numParcels = parseInt(parcelsCount) || 1;
  
  // Объявленная ценность: 0,3% от суммы заказа (минимум 0,30 BYN)
  // Платится один раз на весь заказ, независимо от количества посылок
  const declaredValueFee = Math.max(0.30, orderAmount * 0.003);
  
  // Наложенный платеж: 1,5% от (стоимость товара + стоимость доставки), минимум 0,35 BYN
  // Платится один раз на весь заказ
  const codFee = Math.max(0.35, (orderAmount + basePrice) * 0.015);
  
  // Надбавка за сельский населенный пункт (не в основной сети): +9 BYN
  // Платится за каждую посылку
  const ruralSurcharge = isRural ? (9.00 * numParcels) : 0;
  
  // Прогрессивная надбавка для маленьких заказов (скрытая от клиента)
  // Компенсирует стоимость упаковки и обработки
  let smallOrderSurcharge = 0;
  if (orderAmount < 50) {
    smallOrderSurcharge = 10.00; // < 50 BYN: +10 BYN
  } else if (orderAmount < 80) {
    smallOrderSurcharge = 5.00;  // 50-80 BYN: +5 BYN
  }
  // >= 80 BYN: без надбавки
  
  // Итоговая стоимость доставки
  const totalPrice = basePrice + declaredValueFee + codFee + ruralSurcharge + smallOrderSurcharge;
  
  return {
    basePrice: roundToWholeRubles(basePrice),
    declaredValueFee: roundToWholeRubles(declaredValueFee),
    codFee: roundToWholeRubles(codFee),
    ruralSurcharge: roundToWholeRubles(ruralSurcharge),
    smallOrderSurcharge: roundToWholeRubles(smallOrderSurcharge),
    totalPrice: roundToWholeRubles(totalPrice),
    parcelsCount: numParcels
  };
}

/**
 * Пытается определить UTC смещение на основе заголовков запроса
 * Проверяет: CloudFlare, X-Forwarded-For, User-Agent и другие геолокационные подсказки
 */
function detectUtcOffsetFromHeaders(headers) {
  // Cloudflare заголовки
  const cfCountry = headers?.['cf-ipcountry'];
  if (cfCountry) {
    const offset = getUtcOffsetByCountry(cfCountry);
    console.log(`[GEOIP] Cloudflare: ${cfCountry} → UTC offset: ${offset} мин`);
    return offset;
  }
  
  // Netlify Edge Functions может передать геоданные
  const netlifyCountry = headers?.['x-country'] || headers?.['x-nf-country'];
  if (netlifyCountry) {
    const offset = getUtcOffsetByCountry(netlifyCountry);
    console.log(`[GEOIP] Netlify: ${netlifyCountry} → UTC offset: ${offset} мин`);
    return offset;
  }
  
  // Accept-Language может дать подсказку (например: ru-BY, be-BY)
  const acceptLang = headers?.['accept-language'];
  if (acceptLang) {
    if (acceptLang.includes('be') || acceptLang.includes('by')) {
      console.log(`[GEOIP] Accept-Language: Беларусь (по локали)`);
      return getUtcOffsetByCountry('BY');
    }
    if (acceptLang.includes('ru')) {
      console.log(`[GEOIP] Accept-Language: Россия`);
      return getUtcOffsetByCountry('RU');
    }
  }
  
  console.log(`[GEOIP] ⚠ Не удалось определить геолокацию, используется UTC+3`);
  return getUtcOffsetByCountry('BY'); // По умолчанию UTC+3
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Accept-Language, Content-Language, Content-Type',
  'Content-Type': 'application/json',
  // Netlify Edge CDN кешируем на 5 минут (s-maxage),
  // браузер не кеширует (no-store) — чтобы InSales всегда получал свежий расчёт.
  // Netlify Durable Cache также включается через s-maxage.
  'Cache-Control': 'no-store, s-maxage=300',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const requestPath = event.path || '';

  // ──────────────────────────────────────────────────────────────────────────
  // МАРШРУТ: /api/courier-door — внешний способ доставки «До двери»
  // Вызывается InSales при оформлении заказа (передаёт адрес покупателя)
  // ──────────────────────────────────────────────────────────────────────────
  if (requestPath.includes('/courier-door')) {
    try {
      let requestBody = {};
      let order = {};
      if (event.body) {
        const body = JSON.parse(event.body);
        requestBody = body;
        order = body.order || body || {};
      }

      // Проверяем кеш — пинг-запросы не кешируем
      const isPing = requestBody?.action === 'ping' || requestBody?.['X-Keepalive'];
      const cacheKey = isPing ? null : getCacheKey('courier-door', requestBody);
      const cached = getCached(cacheKey);
      if (cached) {
        console.log(`[CACHE] HIT courier-door key="${cacheKey}"`);
        return cached;
      }

      const fullLocalityName = order.shipping_address?.full_locality_name || '';
      const locationCity     = order.shipping_address?.location?.city || '';
      const locationSettl    = order.shipping_address?.location?.settlement || '';
      const shippingCity     = order.shipping_address?.city || '';
      const rawCity = fullLocalityName || locationCity || locationSettl || shippingCity;

      const totalWeight = parseFloat(order.total_weight || 0) || 0.5;
      const orderSum = parseFloat(order.total_price || order.items_price || 0) || 0;
      const courierCalc = calculateCourierPrice(totalWeight);
      const basePrice = courierCalc.price;
      const currency = courierCalc.currency;
      const parcelsCount = courierCalc.parcelsCount || 1;

      console.log(`[COURIER] Запрос: город="${rawCity}", вес=${totalWeight}кг, сумма заказа=${orderSum} BYN`);

      // Город не указан — заглушка
      if (!rawCity || !rawCity.trim()) {
        console.log('[COURIER] Город не указан → возвращаем заглушку');
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify([])
        };
      }

      // Проверяем строку адреса: покупатель мог указать деревню прямо в поле адреса
      // (например, «д. Терюха, ул. Лесная, 15»), хотя в поле населённого пункта выбрал город.
      // Если адрес содержит сельский префикс — переопределяем зону на village.
      const currentAddress = order.shipping_address?.address || '';
      const settlementInAddress = extractSettlementFromAddress(currentAddress);
      let zone;
      if (settlementInAddress) {
        // Адресная строка содержит деревню/посёлок — применяем сельскую зону
        zone = 'village';
        console.log(`[COURIER] Зона переопределена → village из-за адреса: "${currentAddress}"`);
      } else {
        zone = classifySettlement(rawCity);
      }
      const isRural = (zone === 'village');
      
      // Пытаемся получить UTC offset: сначала из body (если фронтенд передал), затем из заголовков
      let utcOffset = requestBody?.utc_offset;
      if (!utcOffset && utcOffset !== 0) {
        utcOffset = detectUtcOffsetFromHeaders(event.headers);
      }
      const dateInfo = calcDeliveryDate(zone, utcOffset);

      // Рассчитываем полную стоимость с учетом всех сборов
      const fees = calculateAdditionalFees(basePrice, orderSum, isRural, parcelsCount);
      const finalPrice = fees.totalPrice;

      console.log(`[COURIER] Зона: ${zone}, сельский: ${isRural}, посылок: ${parcelsCount}, базовая цена: ${basePrice} BYN`);
      console.log(`[COURIER] Сборы - объявл.ценность: ${fees.declaredValueFee}, налож.платеж: ${fees.codFee}, сельская надбавка: ${fees.ruralSurcharge}`);
      console.log(`[COURIER] Итоговая цена: ${finalPrice} BYN, дата: ${dateInfo.description}`);

       // Формируем описание в зависимости от зоны
       // UX: эмодзи = быстрая идентификация, время = ключевое ожидание клиента, без лишней классификации
       const zoneDescriptions = {
         saturday: '🚚 Пн–Пт: 9:00–22:00 • Сб: 9:00–17:00 • Время уточним при подтверждении заказа',
         district: '🚚 Пн–Пт: 9:00–18:00 • Утром пришлём СМС с телефоном водителя',
         village:  '🚚 Пн–Пт: 9:00–18:00 • Точное время согласует водитель • СМС утром'
       };

      const zoneTitles = {
        saturday: 'Курьер до двери',
        district: 'Курьер до двери',
        village:  'Курьер до двери (1–2 дня)'
      };

      // Добавляем информацию о количестве посылок, если их больше одной
      let parcelsInfo = '';
      if (parcelsCount > 1) {
        parcelsInfo = ` • Заказ будет разделён на ${parcelsCount} посылки`;
      }

      // Генерируем SVG-календарь для визуализации сроков доставки
      const deliverySvg = generateDeliverySvg(dateInfo);

      const fullAddr = fullLocalityName || [rawCity, 'Беларусь'].filter(Boolean).join(', ');

      const tariff = {
        tariff_id: `courier_door_${zone}`,
        shipping_company_handle: 'autolight_express',
        price: finalPrice,
        currency,
        title: zoneTitles[zone] + (parcelsCount > 1 ? ` (${parcelsCount} посылки)` : ''),
        description: zoneDescriptions[zone] + parcelsInfo,
        delivery_interval: {
          min_days: dateInfo.min_days,
          max_days: dateInfo.max_days,
          description: dateInfo.description
        },
        shipping_address: {
          full_locality_name: fullAddr,
          address: currentAddress,
          city: rawCity,
          country: 'Беларусь'
        },
        fields_values: [
          { handle: 'shipping_address[full_locality_name]', value: fullAddr },
          { handle: 'shipping_address[address]', value: currentAddress },
          { handle: 'full_locality_name', value: fullAddr },
          { handle: 'city', value: rawCity },
          { handle: 'country', value: 'Беларусь' },
          { handle: 'delivery_zone', value: zone },
          { handle: 'delivery_date', value: dateInfo.description },
          { handle: 'delivery_svg', value: deliverySvg },
          { handle: 'base_price', value: `${fees.basePrice} BYN` },
          { handle: 'declared_value_fee', value: `${fees.declaredValueFee} BYN` },
          { handle: 'cod_fee', value: `${fees.codFee} BYN` },
          { handle: 'rural_surcharge', value: `${fees.ruralSurcharge} BYN` },
          { handle: 'parcels_count', value: parcelsCount.toString() },
          { handle: 'parcels_breakdown', value: courierCalc.parcels ? courierCalc.parcels.join(' кг + ') + ' кг' : `${totalWeight} кг` }
        ]
      };

       // Для деревень добавляем предупреждение отдельным нередактируемым полем
       if (zone === 'village') {
         tariff.fields_values.push({
           handle: 'delivery_note',
           value: '⏰ 1–2 рабочих дня (Пн–Пт) • Время определяет водитель • SMS утром'
         });
       }

      const response = {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify([tariff])
      };
      setCache(cacheKey, response);
      console.log(`[CACHE] SET courier-door key="${cacheKey}"`);
      return response;
    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // МАРШРУТ: /api/courier/calculate — расчёт стоимости курьерской доставки
  // Вызывается виджетом на странице товара
  // ──────────────────────────────────────────────────────────────────────────
  if (requestPath.includes('/courier/calculate') || requestPath.includes('/courier')) {
    try {
      let weight = 0;
      if (event.body) {
        const body = JSON.parse(event.body);
        weight = parseFloat(body.weight || body.total_weight || 0) || 0;
      }
      if (weight <= 0) weight = 0.5; // минимальный вес по умолчанию

      const { price, currency, pricing } = calculateCourierPrice(weight);
      const deliveryDays = (pricing && pricing.delivery_days) || { min: 1, max: 2, description: '1-2 дня' };

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          price,
          currency,
          weight,
          delivery_days: deliveryDays,
          delivery_type: 'courier'
        })
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // МАРШРУТ: /api/pickup-points — список ПВЗ по городу
  // Вызывается виджетом на странице товара
  // ──────────────────────────────────────────────────────────────────────────
  if (requestPath.includes('/pickup-points')) {
    try {
      let city = '';
      let weight = 0;
      let requestBodyPvz = {};
      if (event.body) {
        const body = JSON.parse(event.body);
        requestBodyPvz = body;
        city = body.address?.city || body.city || '';
        weight = parseFloat((body.order && body.order.total_weight) || body.weight || 0) || 0;
      }
      if (weight <= 0) weight = 0.5;

      console.log(`[PICKUP] Запрос: город="${city}", вес=${weight}кг`);

      if (!city || !city.trim()) {
        console.log('[PICKUP] Город не указан → возвращаем пустой список');
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            pickup_points: [],
            hint: 'Укажите населённый пункт, чтобы увидеть пункты выдачи'
          })
        };
      }

      // Проверяем кеш (город + вес — ключевые параметры для ПВЗ)
      const pvzCacheKey = `pickup-points|${city.toLowerCase().trim()}|${parseFloat(weight).toFixed(2)}`;
      const pvzCached = getCached(pvzCacheKey);
      if (pvzCached) {
        console.log(`[CACHE] HIT pickup-points key="${pvzCacheKey}"`);
        return pvzCached;
      }

      const points = city ? findBestCityMatch(city, pickupPoints) : pickupPoints;
      
      // Для виджета на странице товара у нас нет суммы заказа, поэтому используем примерную среднюю сумму
      // или минимальные сборы
      const estimatedOrderSum = 100; // примерная средняя сумма заказа для расчета
      const zone = city ? classifySettlement(city) : 'district';
      const isRural = (zone === 'village');
      
      console.log(`[PICKUP] Найдено ПВЗ: ${points.length}, зона: ${zone}, сельский: ${isRural}`);

      const result = points.map(point => {
        const weightLimit = point.weight_limit || 50;
        const priceCalc = calculatePrice(weight, weightLimit);
        const fees = calculateAdditionalFees(priceCalc.price, estimatedOrderSum, isRural, priceCalc.parcelsCount);
        
        return {
          id: point.id,
          title: point.name,
          address: point.address,
          price: fees.totalPrice,
          currency: 'BYN',
          working_hours: point.working_hours,
          shipping_address: {
            city: point.city,
            address: point.address
          },
          parcels_count: priceCalc.parcelsCount,
          weight_limit: weightLimit
        };
      });

      const pvzResponse = {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(result)
      };
      setCache(pvzCacheKey, pvzResponse);
      console.log(`[CACHE] SET pickup-points key="${pvzCacheKey}"`);
      return pvzResponse;
    } catch (err) {
      console.error(`[PICKUP] Ошибка: ${err.message}`);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  try {
    // Обработка специальных запросов
    if (event.body) {
      const requestBody = JSON.parse(event.body);
      
      // Проверка на пинг/информационный запрос
      if (requestBody.action === 'ping' || requestBody.action === 'getCities' || 
          requestBody.ping === true || requestBody.get_cities === true) {
        
        const uniqueCities = [...new Set(pickupPoints.map(point => point.city))].sort();
        
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            message: 'InSales External Delivery API v2 - Avtolayt Express',
            cities: uniqueCities,
            pickup_points_count: pickupPoints.length,
            cities_count: uniqueCities.length,
            weight_ranges: {
              '5кг': 10.0,
              '10кг': 12.0,
              '20кг': 14.0,
              '30кг': 16.0,
              '35кг': 18.0,
              '40кг': 20.0,
              '55кг': 35.0,
              '90кг': 50.0,
              '120кг': 60.0,
              '149кг': 70.0,
              '200кг': 100.0,
              '250кг': 150.0,
              '250кг+': 200.0
            }
          })
        };
      }

      const order = requestBody?.order || {};

      // Извлекаем город из разных возможных источников
      const fullLocalityName = order.shipping_address?.full_locality_name || '';
      const locationCity = order.shipping_address?.location?.city || '';
      const locationSettlement = order.shipping_address?.location?.settlement || '';
      const shippingCity = order.shipping_address?.city || '';

       // Пытаемся определить город по разным полям
       const city = fullLocalityName || locationCity || locationSettlement || shippingCity;
       const isCityEmpty = !city || !city.trim();

       // Получаем вес заказа и сумму
       const totalWeightStr = order.total_weight || '0';
       const totalWeight = parseFloat(totalWeightStr) || 0;
       const orderSum = parseFloat(order.total_price || order.items_price || 0) || 0;
       
       // Получаем UTC смещение: сначала из body, затем пытаемся определить из заголовков
       let utcOffset = requestBody?.utc_offset;
       if (!utcOffset && utcOffset !== 0) {
         utcOffset = detectUtcOffsetFromHeaders(event.headers);
       }

       console.log(`[API] Запрос ПВЗ: город="${city}", вес=${totalWeight}кг, сумма=${orderSum} BYN, UTC offset=${utcOffset}`);

      if (isCityEmpty) {
        console.log('[API] Город не указан → возвращаем заглушку');
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify([])
        };
      }

      // Фильтрация ПВЗ по городу
      const filteredPoints = findBestCityMatch(city, pickupPoints);

      console.log(`[API] Найдено ПВЗ в городе "${city}": ${filteredPoints.length}`);

       // Если ПВЗ в указанном городе нет — не показываем этот способ доставки (пустой массив)
       if (filteredPoints.length === 0) {
         const zone = classifySettlement(city);
         console.log(`[API] ПВЗ нет в городе "${city}", зона: ${zone} — способ доставки ПВЗ скрыт`);

         // Возвращаем пустой массив — способ доставки не будет отображаться клиенту
         return {
           statusCode: 200,
           headers: CORS_HEADERS,
           body: JSON.stringify([])
         };
       }

       // ПВЗ найдены — определяем зону для расчёта даты
       // ПВЗ есть только в городах → zone всегда district или minsk_oblast
       const pvzZone = classifySettlement(city);
       const isPvzRural = (pvzZone === 'village');
       
       // utcOffset уже определён выше, просто переиспользуем
       const pvzDateInfo = calcDeliveryDate(pvzZone, utcOffset);

       console.log(`[API] ПВЗ найдены, зона: ${pvzZone}, сельский: ${isPvzRural}, доставка: ${pvzDateInfo.description}`);

      // Генерируем SVG для ПВЗ
      const pvzDeliverySvg = generateDeliverySvg(pvzDateInfo);

       const tariffs = filteredPoints.map(point => {
          const weightLimit = point.weight_limit || 50; // По умолчанию 50 кг
          const priceCalc = calculatePrice(totalWeight, weightLimit);
          const fees = calculateAdditionalFees(priceCalc.price, orderSum, isPvzRural, priceCalc.parcelsCount);
          const finalPrice = fees.totalPrice;
          
          const fullAddress = point.delivery_address ||
                             `${point.address}, ${point.city}, Беларусь`;

          // Информация о количестве посылок
          const parcelsNote = priceCalc.parcelsCount > 1 
            ? ` • Заказ разделён на ${priceCalc.parcelsCount} посылки` 
            : '';

          return {
            id: point.id,
            tariff_id: `pvz_${point.id}`,
            shipping_company_handle: 'autolight_express',
            price: finalPrice,
            currency: 'BYN',

            // UX: адрес в заголовке — главное что нужно клиенту
            title: `🏪 ${point.address}` + (priceCalc.parcelsCount > 1 ? ` (${priceCalc.parcelsCount} посылки)` : ''),
            // UX: описание показывает тип пункта и ТК вместо часов работы (часы в shipping_address)
            description: `🚚 Автолайт экспресс • Пункт самовывоза${parcelsNote}`,

          delivery_interval: {
            min_days: pvzDateInfo.min_days,
            max_days: pvzDateInfo.max_days,
            description: pvzDateInfo.description
          },

          shipping_address: {
            full_locality_name: fullAddress,
            address: point.address,
            city: point.city,
            country: 'Беларусь',
            postal_code: '',
            pickup_point_name: point.name,
            pickup_point_hours: point.working_hours
          },

          fields_values: [
            { handle: 'shipping_address[full_locality_name]', value: fullAddress, name: 'Полный адрес доставки' },
            { handle: 'shipping_address[address]', value: point.address, name: 'Адрес доставки' },
            { handle: 'shipping_address_address', value: point.address },
            { handle: 'full_locality_name', value: fullAddress },
            { handle: 'address', value: fullAddress },
            { handle: 'pickup_point_id', value: point.id.toString() },
            { handle: 'pickup_point_name', value: point.name },
            { handle: 'city', value: point.city },
            { handle: 'country', value: 'Беларусь' },
            { handle: 'pickup_point_hours', value: point.working_hours },
            { handle: 'delivery_date', value: pvzDateInfo.description },
            { handle: 'delivery_svg', value: pvzDeliverySvg },
            { handle: 'base_price', value: `${fees.basePrice} BYN` },
            { handle: 'declared_value_fee', value: `${fees.declaredValueFee} BYN` },
            { handle: 'cod_fee', value: `${fees.codFee} BYN` },
            { handle: 'rural_surcharge', value: `${fees.ruralSurcharge} BYN` },
            { handle: 'parcels_count', value: priceCalc.parcelsCount.toString() },
            { handle: 'parcels_breakdown', value: priceCalc.parcels ? priceCalc.parcels.join(' кг + ') + ' кг' : '' }
          ]
        };
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(tariffs)
      };
    }

    // Если нет body или не JSON
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        error: 'Invalid request format',
        errors: ['Request body must be valid JSON'],
        warnings: []
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ 
        error: error.message,
        errors: [error.message],
        warnings: []
      })
    };
  }
};
