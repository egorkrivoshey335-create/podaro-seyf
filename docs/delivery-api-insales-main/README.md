# Delivery API Service для InSales

Внешний API сервис для интеграции с InSales, предоставляющий:
- **Пункты выдачи заказов** с адресами и временем работы
- **Курьерская доставка** на адрес получателя
- **Расчет стоимости** в зависимости от веса товара
- **Управление ценами через JSON файлы** без перезапуска сервера

## 📁 Структура проекта

```
delivery-api-insales/
├── server.js                    # Основной сервер (Express)
├── courier-pricing.json         # Цены для курьерской доставки
├── pickup-pricing.json          # Цены для доставки в ПВЗ
├── pickup-points.json           # Данные о пунктах выдачи
├── netlify/
│   └── functions/
│       ├── server.js            # Netlify Functions версия
│       ├── courier-pricing.json # Цены курьерской доставки
│       ├── pickup-pricing.json  # Цены ПВЗ
│       └── ...
└── package.json
```

## 🚀 Быстрый запуск

### Локальный запуск

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Запуск в продакшене
npm start
```

### Проверка работы

```bash
# Проверка состояния сервиса
curl http://localhost:3000/health

# Просмотр текущих цен
curl http://localhost:3000/pricing

# Расчет курьерской доставки (простой)
curl -X POST http://localhost:3000/api/courier/calculate \
  -H "Content-Type: application/json" \
  -d '{"weight": 2.5}'

# Расчет доставки в ПВЗ (простой)
curl -X POST http://localhost:3000/api/pickup/calculate \
  -H "Content-Type: application/json" \
  -d '{"weight": 2.5}'
```

## 📡 API Endpoints

### Курьерская доставка

#### POST /api/courier/calculate
Простой расчет курьерской доставки **только по весу**.

**Входные данные:**
```json
{
  "weight": 2.5
}
```

**Ответ:**
```json
{
  "price": 14.70,
  "currency": "BYN",
  "weight": 2.5,
  "delivery_days": {
    "min": 1,
    "max": 2,
    "description": "1-2 дня"
  }
}
```

#### POST /api/delivery/calculate
Расчет курьерской доставки в формате InSales.

**Входные данные:**
```json
{
  "order": {
    "total_weight": 2.5
  }
}
```

**Ответ:**
```json
[
  {
    "price": 14.70,
    "currency": "BYN",
    "delivery_days": {
      "min": 1,
      "max": 2,
      "description": "1-2 дня"
    },
    "shipping_company_handle": "autolight_express_courier",
    "title": "Автолайт Экспресс (Курьер)",
    "description": "Доставка курьером на адрес",
    "tariff_id": "courier_delivery",
    "delivery_type": "courier"
  }
]
```

### Доставка в ПВЗ

#### POST /api/pickup/calculate
Расчет стоимости доставки в ПВЗ **только по весу**.

**Входные данные:**
```json
{
  "weight": 2.5
}
```

**Ответ:**
```json
{
  "price": 7.0,
  "currency": "BYN",
  "weight": 2.5,
  "delivery_days": {
    "min": 1,
    "max": 2,
    "description": "1-2 дня"
  }
}
```

#### POST /api/pickup-points
Получение списка пунктов выдачи с расчетом стоимости.

**Входные данные:**
```json
{
  "order": {
    "total_weight": 1.5
  },
  "address": {
    "city": "Минск"
  }
}
```

**Ответ:**
```json
[
  {
    "id": 6,
    "latitude": 53.9006,
    "longitude": 27.5590,
    "shipping_company_handle": "Автолайт Экспресс",
    "price": 5.0,
    "title": "СППС №00101",
    "type": "pvz",
    "address": "г.Минск, ул.Ленина, 12",
    "description": "Минск - СППС №00101",
    "phones": ["+37517212345"],
    "delivery_interval": {
      "min": 1,
      "max": 2,
      "description": "1-2 дня"
    }
  }
]
```

### Сервисные endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /health` | Проверка состояния сервиса |
| `GET /pricing` | Просмотр текущих цен (курьер + ПВЗ) |
| `GET /pickup-points` | Список всех ПВЗ |
| `POST /admin/reload-pricing` | Перезагрузка цен без перезапуска |

## 💰 Управление ценами

Цены хранятся в **отдельных JSON файлах** и могут быть изменены без перезапуска сервера.

### Файлы цен

| Файл | Описание | Тип доставки |
|------|----------|--------------|
| `courier-pricing.json` | Цены курьерской доставки | Дверь-дверь |
| `pickup-pricing.json` | Цены доставки в ПВЗ | Самовывоз |

### Структура файла цен

```json
{
  "description": "Цены для курьерской доставки",
  "currency": "BYN",
  "delivery_days": {
    "min": 1,
    "max": 2,
    "description": "1-2 дня"
  },
  "weight_pricing": [
    { "max_weight": 1, "price": 12.90 },
    { "max_weight": 2, "price": 14.70 },
    { "max_weight": 3, "price": 16.40 },
    { "max_weight": 5, "price": 18.20 },
    { "max_weight": 10, "price": 21.60 },
    { "max_weight": 20, "price": 28.90 },
    { "max_weight": 50, "price": 42.80 }
  ],
  "oversized_pricing": {
    "base_price": 42.80,
    "price_per_kg": 0.85
  }
}
```

### Перезагрузка цен без перезапуска

После изменения файлов цен:

```bash
# Через API
curl -X POST http://localhost:3000/admin/reload-pricing

# Или просто перезапустите сервер
```

### Текущие цены по умолчанию

#### Курьерская доставка (courier-pricing.json)
```
до 1 кг  → 12.90 BYN
до 2 кг  → 14.70 BYN
до 3 кг  → 16.40 BYN
до 5 кг  → 18.20 BYN
до 10 кг → 21.60 BYN
до 15 кг → 25.40 BYN
до 20 кг → 28.90 BYN
до 25 кг → 32.10 BYN
до 30 кг → 33.80 BYN
до 35 кг → 36.10 BYN
до 40 кг → 38.50 BYN
до 45 кг → 40.60 BYN
до 50 кг → 42.80 BYN
```

#### Доставка в ПВЗ (pickup-pricing.json)
```
до 1 кг  → 5.00 BYN
до 3 кг  → 7.00 BYN
до 5 кг  → 10.00 BYN
до 10 кг → 15.00 BYN
до 20 кг → 25.00 BYN
до 50 кг → 40.00 BYN
```

## 🔧 Интеграция с InSales

### Создание внешнего способа доставки

#### 1. Курьерская доставка

**Настройки → Способы доставки → Добавить → Внешний способ**

- **Название:** Автолайт Экспресс (Курьер)
- **Тип:** Внешний способ доставки
- **URL API:** `https://your-domain.hostfly.by/api/delivery/calculate`
- **Версия API:** v2

#### 2. Доставка в ПВЗ

**Настройки → Способы доставки → Добавить → Пункты выдачи**

- **Название:** Автолайт Экспресс (ПВЗ)
- **Источник ПВЗ:** Внешний API
- **URL списка ПВЗ:** `https://your-domain.hostfly.by/api/pickup-points`
- **URL информации о ПВЗ:** `https://your-domain.hostfly.by/api/pickup-point/calculate`

### JavaScript интеграция (для виджета в карточке товара)

```javascript
// Расчет курьерской доставки
async function calculateCourierDelivery(weight) {
  const response = await fetch('https://your-api.com/api/courier/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight: weight })
  });
  return await response.json();
}

// Пример использования
const deliveryInfo = await calculateCourierDelivery(2.5);
console.log(`Стоимость: ${deliveryInfo.price} ${deliveryInfo.currency}`);
// Вывод: Стоимость: 14.7 BYN
```

## 🌐 Деплой

### Netlify (рекомендуется)

1. Форкните репозиторий на GitHub
2. Подключите к Netlify
3. Настройте переменные окружения (если нужно)
4. Задеплойте

Файлы для Netlify находятся в `netlify/functions/`.

### VPS / Облачный хостинг

```bash
# Клонирование
git clone https://github.com/your-repo/delivery-api-insales.git
cd delivery-api-insales

# Установка
npm install --production

# Запуск
npm start

# Или через PM2
pm2 start server.js --name delivery-api
```

## 🧪 Тестирование

### Запуск тестов

```bash
# Перейти в директорию с тестами
cd netlify/functions

# Запуск всех тестов
node run-tests.js

# Или по отдельности
node test-local.js
node test-extended.js
```

### Тестовые запросы

```bash
# 1. Проверка API
curl http://localhost:3000/health

# 2. Расчет курьерской (вес 2.5 кг → 14.70 BYN)
curl -X POST http://localhost:3000/api/courier/calculate \
  -H "Content-Type: application/json" \
  -d '{"weight": 2.5}'

# 3. Расчет ПВЗ (вес 2.5 кг → 7.00 BYN)
curl -X POST http://localhost:3000/api/pickup/calculate \
  -H "Content-Type: application/json" \
  -d '{"weight": 2.5}'

# 4. Получение списка ПВЗ
curl -X POST http://localhost:3000/api/pickup-points \
  -H "Content-Type: application/json" \
  -d '{"order": {"total_weight": 1.5}, "address": {"city": "Минск"}}'
```

## 📝 История изменений

### v1.3.0 (текущая)
- Вынесены цены в отдельные JSON файлы
- Добавлена перезагрузка цен без перезапуска
- Упрощен API для расчета (только вес)
- Добавлен отдельный endpoint для ПВЗ

### v1.2.0
- Добавлена курьерская доставка
- Расширена градация цен по весу

### v1.1.0
- Добавлена поддержка Netlify Functions
- Добавлены тесты

### v1.0.0
- Базовая версия с ПВЗ

## 📄 Лицензия

MIT License - свободное использование и модификация.
