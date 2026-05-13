const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Конфигурация
const CONFIG = {
    PORT: process.env.PORT || 3000,
    DATABASE_PATH: path.join(__dirname, 'data', 'pickup-points.db'),
    LOG_LEVEL: 'info'
};

// === ЗАГРУЗКА ЦЕН ИЗ ВНЕШНИХ ФАЙЛОВ ===

// Цены для курьерской доставки
let COURIER_PRICING = {};
function loadCourierPricing() {
    try {
        const pricingPath = path.join(__dirname, 'courier-pricing.json');
        const pricingData = fs.readFileSync(pricingPath, 'utf8');
        COURIER_PRICING = JSON.parse(pricingData);
        console.log('✅ Цены для курьерской доставки загружены');
        return true;
    } catch (error) {
        console.error('❌ Ошибка загрузки courier-pricing.json:', error.message);
        // Fallback
        COURIER_PRICING = {
            currency: 'BYN',
            delivery_days: { min: 1, max: 2, description: '1-2 дня' },
            weight_pricing: [
                { max_weight: 1, price: 12.90 },
                { max_weight: 2, price: 14.70 },
                { max_weight: 3, price: 16.40 },
                { max_weight: 5, price: 18.20 },
                { max_weight: 10, price: 21.60 },
                { max_weight: 20, price: 28.90 },
                { max_weight: 50, price: 42.80 }
            ]
        };
        return false;
    }
}

// Цены для ПВЗ
let PICKUP_PRICING = {};
function loadPickupPricing() {
    try {
        const pricingPath = path.join(__dirname, 'pickup-pricing.json');
        const pricingData = fs.readFileSync(pricingPath, 'utf8');
        PICKUP_PRICING = JSON.parse(pricingData);
        console.log('✅ Цены для ПВЗ загружены');
        return true;
    } catch (error) {
        console.error('❌ Ошибка загрузки pickup-pricing.json:', error.message);
        // Fallback
        PICKUP_PRICING = {
            currency: 'BYN',
            delivery_days: { min: 1, max: 2, description: '1-2 дня' },
            weight_pricing: [
                { max_weight: 1, price: 5.0 },
                { max_weight: 3, price: 7.0 },
                { max_weight: 5, price: 10.0 },
                { max_weight: 10, price: 15.0 },
                { max_weight: 20, price: 25.0 },
                { max_weight: 50, price: 40.0 }
            ]
        };
        return false;
    }
}

// Перезагрузка всех цен
function reloadAllPricing() {
    console.log('🔄 Перезагрузка всех цен...');
    const courierOk = loadCourierPricing();
    const pickupOk = loadPickupPricing();
    return { courier: courierOk, pickup: pickupOk };
}

// Данные о пунктах выдачи
const PICKUP_POINTS_DATA = [
    {
        id: 1,
        city: "Барановичи",
        address: "г.Барановичи, ул.50 лет БССР, д.31",
        title: "СППС №10201",
        working_hours: "Пн-Сб: с 10:00 до 20:00 обед 14:00 до 14:30",
        type: "pvz",
        latitude: 53.1274,
        longitude: 26.0125,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37516312345"
    },
    {
        id: 2,
        city: "Брест",
        address: "г.Брест, ул. Советской Конституции 18",
        title: "СППС №10101",
        working_hours: "Пн-Пт: с 10:00 до 20:00, обед с 14:00 до 14:30; Сб.: с 11:00 до 17:00",
        type: "pvz",
        latitude: 52.0976,
        longitude: 23.7341,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37516212345"
    },
    {
        id: 3,
        city: "Витебск",
        address: "г.Витебск, ул.Ленинградская, 138А, корп. 5",
        title: "СППС №20101",
        working_hours: "Пн-Пт: с 10:00 до 20:00, обед с 14:00 до 14:30; Сб.: с 11:00 до 17:00",
        type: "pvz",
        latitude: 55.1904,
        longitude: 30.2049,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37521212345"
    },
    {
        id: 4,
        city: "Гомель",
        address: "г.Гомель, ул. 2-я Гражданская д.5",
        title: "СППС №30101",
        working_hours: "Пн-Пт: с 10:00 до 20:00, обед с 14:00 до 14:30; Сб.: с 11:00 до 17:00",
        type: "pvz",
        latitude: 52.4345,
        longitude: 30.9754,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37523212345"
    },
    {
        id: 5,
        city: "Гродно",
        address: "г.Гродно, ул. Горького, 91 (заезд со стороны ул.Курчатова)",
        title: "СППС №40101",
        working_hours: "Пн-Пт: с 10:00 до 20:00, обед с 14:00 до 14:30; Сб.: с 11:00 до 17:00",
        type: "pvz",
        latitude: 53.6884,
        longitude: 23.8258,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37515212345"
    },
    {
        id: 6,
        city: "Минск",
        address: "г.Минск, ул.Ленина, 12",
        title: "СППС №00101",
        working_hours: "Пн-Пт: с 09:00 до 20:00, обед с 13:00 до 14:00; Сб.: с 10:00 до 18:00",
        type: "pvz",
        latitude: 53.9006,
        longitude: 27.5590,
        shipping_company_handle: "Автолайт Экспресс",
        phone: "+37517212345"
    }
];

// === ФУНКЦИИ РАСЧЕТА ДАТЫ ДОСТАВКИ ===

/**
 * Расчет даты доставки на основе времени клиента
 * - До 12:00 (по времени пользователя): доставка на следующий день
 * - После 12:00 (по времени пользователя): доставка через день
 * - Исключаются субботы и воскресенья для деревень и районных городов
 * @param {number} clientHour - Час клиента (0-23)
 * @param {string} deliveryType - Тип доставки (courier, pickup)
 * @param {boolean} isSmallCity - Маленький город/деревня (default true)
 * @returns {object} { date: Date, deliveryDays: number, formattedDate: string }
 */
function calculateDeliveryDate(clientHour = new Date().getHours(), deliveryType = 'courier', isSmallCity = true) {
    const now = new Date();
    let deliveryDate = new Date(now);
    let deliveryDays = 1;

    // Определяем базовое количество дней доставки
    if (clientHour >= 12) {
        // После полудня - доставка через день
        deliveryDate.setDate(deliveryDate.getDate() + 2);
        deliveryDays = 2;
    } else {
        // До полудня - доставка на следующий день
        deliveryDate.setDate(deliveryDate.getDate() + 1);
        deliveryDays = 1;
    }

    // Для маленьких городов и деревень исключаем субботы и воскресенья
    if (isSmallCity) {
        while (deliveryDate.getDay() === 6 || deliveryDate.getDay() === 0) {
            deliveryDate.setDate(deliveryDate.getDate() + 1);
            deliveryDays++;
        }
    }

    return {
        date: deliveryDate,
        deliveryDays: deliveryDays,
        formattedDate: formatDate(deliveryDate),
        isoDate: deliveryDate.toISOString().split('T')[0]
    };
}

/**
 * Форматирование даты для отображения
 * @param {Date} date - Дата для форматирования
 * @returns {string} Отформатированная дата (например: "21 марта, понедельник")
 */
function formatDate(date) {
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const weekdays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const weekday = weekdays[date.getDay()];
    
    return `${day} ${month}, ${weekday}`;
}

/**
 * Определение маленького города по названию
 * @param {string} city - Название города
 * @returns {boolean} true если город маленький, false если крупный
 */
function isSmallCityOrVillage(city) {
    const largeCities = ['Минск', 'Брест', 'Витебск', 'Гомель', 'Гродно', 'Могилёв', 'Полоцк', 'Новополоцк', 'Борисов', 'Бобруйск', 'Орша', 'Жодино'];
    return !largeCities.some(largeCity => city.toLowerCase().includes(largeCity.toLowerCase()));
}

// === ФУНКЦИИ РАСЧЕТА СТОИМОСТИ ===

// Расчет стоимости доставки в ПВЗ
function calculatePickupPrice(totalWeight) {
    const weight = totalWeight || 0;
    const pricing = PICKUP_PRICING;
    
    if (!pricing || !pricing.weight_pricing) {
        return 0;
    }
    
    for (let step of pricing.weight_pricing) {
        if (weight <= step.max_weight) {
            return step.price;
        }
    }
    
    // Для веса больше максимального
    if (pricing.oversized_pricing) {
        const lastStep = pricing.weight_pricing[pricing.weight_pricing.length - 1];
        const extraKg = weight - lastStep.max_weight;
        return pricing.oversized_pricing.base_price + (extraKg * pricing.oversized_pricing.price_per_kg);
    }
    
    const lastStep = pricing.weight_pricing[pricing.weight_pricing.length - 1];
    return lastStep.price + Math.ceil((weight - lastStep.max_weight) / 5) * 5;
}

// Расчет стоимости курьерской доставки
function calculateCourierPrice(totalWeight) {
    const weight = totalWeight || 0;
    const pricing = COURIER_PRICING;
    
    if (!pricing || !pricing.weight_pricing) {
        return { price: 0, currency: 'BYN' };
    }
    
    for (let step of pricing.weight_pricing) {
        if (weight <= step.max_weight) {
            return {
                price: step.price,
                currency: pricing.currency || 'BYN'
            };
        }
    }
    
    // Для веса больше максимального
    if (pricing.oversized_pricing) {
        const lastStep = pricing.weight_pricing[pricing.weight_pricing.length - 1];
        const extraKg = weight - lastStep.max_weight;
        const price = pricing.oversized_pricing.base_price + (extraKg * pricing.oversized_pricing.price_per_kg);
        return {
            price: Math.round(price * 100) / 100,
            currency: pricing.currency || 'BYN'
        };
    }
    
    const lastStep = pricing.weight_pricing[pricing.weight_pricing.length - 1];
    const price = lastStep.price + Math.ceil((weight - lastStep.max_weight) / 5) * 3;
    return {
        price: Math.round(price * 100) / 100,
        currency: pricing.currency || 'BYN'
    };
}

// === API ENDPOINTS ===

// POST /api/courier/calculate - простой расчет курьерской доставки
app.post('/api/courier/calculate', (req, res) => {
    try {
        const { weight } = req.body;
        
        if (weight === undefined || weight === null) {
            return res.status(400).json({
                error: 'Не указан вес (weight)'
            });
        }

        const totalWeight = parseFloat(weight) || 0;
        const calculation = calculateCourierPrice(totalWeight);

        res.json({
            price: calculation.price,
            currency: calculation.currency,
            weight: totalWeight,
            delivery_days: COURIER_PRICING.delivery_days
        });
    } catch (error) {
        console.error('Ошибка расчета курьерской доставки:', error);
        res.status(500).json({
            error: 'Ошибка сервера при расчете доставки'
        });
    }
});

// POST /api/pickup/calculate - расчет стоимости доставки в ПВЗ
app.post('/api/pickup/calculate', (req, res) => {
    try {
        const { weight } = req.body;
        
        if (weight === undefined || weight === null) {
            return res.status(400).json({
                error: 'Не указан вес (weight)'
            });
        }

        const totalWeight = parseFloat(weight) || 0;
        const price = calculatePickupPrice(totalWeight);

        res.json({
            price: price,
            currency: PICKUP_PRICING.currency || 'BYN',
            weight: totalWeight,
            delivery_days: PICKUP_PRICING.delivery_days
        });
    } catch (error) {
        console.error('Ошибка расчета доставки в ПВЗ:', error);
        res.status(500).json({
            error: 'Ошибка сервера при расчете доставки'
        });
    }
});

// POST /api/delivery/calculate - расчет курьерской доставки (InSales формат)
app.post('/api/delivery/calculate', (req, res) => {
    try {
        const { order, clientHour } = req.body;
        
        if (!order) {
            return res.status(400).json({
                errors: ['Отсутствуют данные заказа']
            });
        }

        const totalWeight = order.total_weight || 0;
        const calculation = calculateCourierPrice(totalWeight);
        
        // Получаем город для определения типа населённого пункта
        const city = order.shipping_address?.city || '';
        const isSmall = isSmallCityOrVillage(city);
        
        // Рассчитываем дату доставки
        const deliveryInfo = calculateDeliveryDate(clientHour, 'courier', isSmall);

        const response = [{
            price: calculation.price,
            currency: calculation.currency,
            delivery_days: COURIER_PRICING.delivery_days,
            delivery_date: deliveryInfo.isoDate,
            delivery_date_formatted: deliveryInfo.formattedDate,
            estimated_delivery_days: deliveryInfo.deliveryDays,
            shipping_company_handle: 'autolight_express_courier',
            title: 'Автолайт Экспресс (Курьер)',
            description: `Доставка курьером на адрес. Предполагаемая дата доставки: ${deliveryInfo.formattedDate}`,
            tariff_id: 'courier_delivery',
            delivery_type: 'courier',
            fields_values: [],
            warnings: []
        }];

        res.json(response);
    } catch (error) {
        console.error('Ошибка расчета курьерской доставки:', error);
        res.status(500).json({
            errors: ['Ошибка сервера при расчете доставки']
        });
    }
});

// POST /api/pickup-points - получение списка пунктов выдачи
app.post('/api/pickup-points', (req, res) => {
    try {
        const { order, address, clientHour } = req.body;
        
        let filteredPoints = PICKUP_POINTS_DATA;
        
        if (address && address.city) {
            filteredPoints = PICKUP_POINTS_DATA.filter(point => 
                point.city.toLowerCase().includes(address.city.toLowerCase()) ||
                address.city.toLowerCase().includes(point.city.toLowerCase())
            );
        }
        
        // Рассчитываем дату доставки
        const deliveryInfo = calculateDeliveryDate(clientHour, 'pickup', true);

        const response = filteredPoints.map(point => {
            const totalWeight = order?.total_weight || 0;
            const price = calculatePickupPrice(totalWeight);

            return {
                id: point.id,
                latitude: point.latitude,
                longitude: point.longitude,
                shipping_company_handle: point.shipping_company_handle,
                price: price,
                currency: PICKUP_PRICING.currency || 'BYN',
                title: point.title,
                type: point.type,
                address: point.address,
                description: `${point.city} - ${point.title}. Предполагаемая дата доставки: ${deliveryInfo.formattedDate}`,
                delivery_date: deliveryInfo.isoDate,
                delivery_date_formatted: deliveryInfo.formattedDate,
                estimated_delivery_days: deliveryInfo.deliveryDays,
                phones: [point.phone],
                delivery_interval: PICKUP_PRICING.delivery_days,
                fields_values: [],
                payment_method: ['CASH', 'CARD', 'PREPAID'],
                tariffs: [{
                    id: 'standard_pickup',
                    price: price,
                    title: 'Стандартная доставка',
                    delivery_interval: PICKUP_PRICING.delivery_days,
                    delivery_date: deliveryInfo.isoDate,
                    delivery_date_formatted: deliveryInfo.formattedDate,
                    estimated_delivery_days: deliveryInfo.deliveryDays,
                    fields_values: []
                }]
            };
        });

        res.json(response);
    } catch (error) {
        console.error('Ошибка получения пунктов выдачи:', error);
        res.status(500).json({
            errors: ['Ошибка сервера при получении пунктов выдачи']
        });
    }
});

// POST /api/pickup-point/calculate - расчет стоимости для выбранного пункта
app.post('/api/pickup-point/calculate', (req, res) => {
    try {
        const { point_id, order, clientHour } = req.body;
        
        if (!point_id) {
            return res.status(400).json({
                errors: ['Не указан ID пункта выдачи']
            });
        }

        const point = PICKUP_POINTS_DATA.find(p => p.id == point_id);
        
        if (!point) {
            return res.status(404).json({
                errors: ['Пункт выдачи не найден']
            });
        }

        const totalWeight = order?.total_weight || 0;
        const price = calculatePickupPrice(totalWeight);
        
        // Рассчитываем дату доставки (для ПВЗ всегда исключаем выходные)
        const deliveryInfo = calculateDeliveryDate(clientHour, 'pickup', true);

        const response = {
            price: price,
            currency: PICKUP_PRICING.currency || 'BYN',
            delivery_days: PICKUP_PRICING.delivery_days,
            delivery_date: deliveryInfo.isoDate,
            delivery_date_formatted: deliveryInfo.formattedDate,
            estimated_delivery_days: deliveryInfo.deliveryDays,
            shipping_company_handle: point.shipping_company_handle,
            title: point.title,
            description: `${point.city} - ${point.title}. Предполагаемая дата доставки: ${deliveryInfo.formattedDate}`,
            address: point.address,
            working_hours: point.working_hours,
            fields_values: [],
            tariff_id: 'pickup_delivery',
            payment_method: ['CASH', 'CARD', 'PREPAID']
        };

        res.json(response);
    } catch (error) {
        console.error('Ошибка расчета стоимости пункта выдачи:', error);
        res.status(500).json({
            errors: ['Ошибка сервера при расчете стоимости пункта']
        });
    }
});

// GET /health - проверка состояния сервиса
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Delivery API Service',
        version: '1.3.0',
        timestamp: new Date().toISOString(),
        pickup_points_count: PICKUP_POINTS_DATA.length,
        pricing: {
            courier_loaded: !!COURIER_PRICING.weight_pricing,
            courier_grades: COURIER_PRICING.weight_pricing?.length || 0,
            pickup_loaded: !!PICKUP_PRICING.weight_pricing,
            pickup_grades: PICKUP_PRICING.weight_pricing?.length || 0
        }
    });
});

// POST /admin/reload-pricing - перезагрузка цен без перезапуска
app.post('/admin/reload-pricing', (req, res) => {
    const result = reloadAllPricing();
    res.json({
        success: result.courier && result.pickup,
        message: 'Цены перезагружены',
        timestamp: new Date().toISOString(),
        result: result
    });
});

// GET /pricing - просмотр текущих цен
app.get('/pricing', (req, res) => {
    res.json({
        courier: {
            file: 'courier-pricing.json',
            currency: COURIER_PRICING.currency,
            delivery_days: COURIER_PRICING.delivery_days,
            weight_pricing: COURIER_PRICING.weight_pricing,
            oversized_pricing: COURIER_PRICING.oversized_pricing
        },
        pickup: {
            file: 'pickup-pricing.json',
            currency: PICKUP_PRICING.currency,
            delivery_days: PICKUP_PRICING.delivery_days,
            weight_pricing: PICKUP_PRICING.weight_pricing,
            oversized_pricing: PICKUP_PRICING.oversized_pricing
        }
    });
});

// GET /pickup-points - тестовый endpoint
app.get('/pickup-points', (req, res) => {
    res.json({
        points: PICKUP_POINTS_DATA,
        total: PICKUP_POINTS_DATA.length
    });
});

// Главная страница
app.get('/', (req, res) => {
    res.json({
        service: 'External Delivery API Service for InSales',
        version: '1.3.0',
        endpoints: {
            'POST /api/courier/calculate': 'Расчет курьерской доставки (только вес)',
            'POST /api/pickup/calculate': 'Расчет доставки в ПВЗ (только вес)',
            'POST /api/delivery/calculate': 'Курьерская доставка (InSales формат)',
            'POST /api/pickup-points': 'Список ПВЗ',
            'POST /api/pickup-point/calculate': 'Расчет для конкретного ПВЗ',
            'GET /health': 'Проверка состояния',
            'GET /pricing': 'Текущие цены',
            'POST /admin/reload-pricing': 'Перезагрузка цен'
        },
        pricing_files: ['courier-pricing.json', 'pickup-pricing.json']
    });
});

// Middleware для обработки 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint не найден',
        available_endpoints: [
            'POST /api/courier/calculate',
            'POST /api/pickup/calculate',
            'POST /api/delivery/calculate',
            'POST /api/pickup-points',
            'GET /health',
            'GET /pricing',
            'POST /admin/reload-pricing'
        ]
    });
});

// Middleware для обработки ошибок
app.use((error, req, res, next) => {
    console.error('Непредвиденная ошибка:', error);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Что-то пошло не так'
    });
});

// Загрузка цен при старте
loadCourierPricing();
loadPickupPricing();

// Запуск сервера
app.listen(CONFIG.PORT, () => {
    console.log(`🚀 Delivery API Service запущен на порту ${CONFIG.PORT}`);
    console.log(`📡 Тестовый URL: http://localhost:${CONFIG.PORT}`);
    console.log(`🏥 Health check: http://localhost:${CONFIG.PORT}/health`);
    console.log(`💰 Pricing info: http://localhost:${CONFIG.PORT}/pricing`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершаем сервер...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Получен SIGINT, завершаем сервер...');
    process.exit(0);
});
