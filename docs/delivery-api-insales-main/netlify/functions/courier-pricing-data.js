// courier-pricing-data.js — встроенный модуль для надёжного деплоя на Netlify
// Данные синхронизированы с courier-pricing.json. При изменении тарифов — обновить и этот файл.

const courierPricingData = {
  description: "Цены для курьерской доставки (дверь-дверь)",
  currency: "BYN",
  delivery_days: {
    min: 1,
    max: 2,
    description: "1-2 дня"
  },
  weight_pricing: [
    { max_weight: 1,  price: 14.80 },
    { max_weight: 2,  price: 16.40 },
    { max_weight: 3,  price: 17.10 },
    { max_weight: 5,  price: 20.00 },
    { max_weight: 10, price: 23.30 },
    { max_weight: 15, price: 26.60 },
    { max_weight: 20, price: 29.80 },
    { max_weight: 25, price: 33.10 },
    { max_weight: 30, price: 36.40 },
    { max_weight: 35, price: 43.80 },
    { max_weight: 40, price: 45.60 },
    { max_weight: 45, price: 48.30 },
    { max_weight: 50, price: 50.20 }
  ],
  oversized_pricing: {
    base_price: 50.20,
    price_per_kg: 3
  }
};

module.exports = { courierPricingData };
