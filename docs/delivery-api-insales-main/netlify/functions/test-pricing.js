// Тестовый скрипт для проверки расчетов доставки

// Имитируем функции из server.js
function getCourierPriceForSingleParcel(weight) {
  const w = parseFloat(weight) || 0;
  if (w <= 1) return 12.90;
  if (w <= 2) return 14.70;
  if (w <= 3) return 16.40;
  if (w <= 5) return 18.20;
  if (w <= 10) return 21.60;
  if (w <= 15) return 25.40;
  if (w <= 20) return 28.90;
  if (w <= 25) return 32.10;
  if (w <= 30) return 33.80;
  if (w <= 35) return 36.10;
  if (w <= 40) return 38.50;
  if (w <= 45) return 40.60;
  if (w <= 50) return 42.80;
  return 42.80;
}

function calculateCourierPrice(weight) {
  const totalWeight = parseFloat(weight) || 0;
  const MAX_PARCEL_WEIGHT = 50;
  
  if (totalWeight <= MAX_PARCEL_WEIGHT) {
    const price = getCourierPriceForSingleParcel(totalWeight);
    return { price, parcelsCount: 1, parcels: [totalWeight] };
  }
  
  // Максимально загружаем посылки по 50 кг
  const fullParcels = Math.floor(totalWeight / MAX_PARCEL_WEIGHT);
  const remainder = totalWeight - (fullParcels * MAX_PARCEL_WEIGHT);
  
  let totalPrice = 0;
  let parcels = [];
  
  for (let i = 0; i < fullParcels; i++) {
    totalPrice += getCourierPriceForSingleParcel(MAX_PARCEL_WEIGHT);
    parcels.push(MAX_PARCEL_WEIGHT);
  }
  
  if (remainder > 0) {
    totalPrice += getCourierPriceForSingleParcel(remainder);
    parcels.push(Math.round(remainder * 100) / 100);
  }
  
  return { 
    price: Math.round(totalPrice * 100) / 100, 
    parcelsCount: parcels.length,
    parcels
  };
}

function getPickupPriceForSingleParcel(weight) {
  const w = parseFloat(weight) || 0;
  // Тарифы Зона 4 (Дверь-Отделение)
  if (w <= 1) return 9.90;
  if (w <= 2) return 10.60;
  if (w <= 3) return 11.70;
  if (w <= 5) return 12.70;
  if (w <= 10) return 14.80;
  if (w <= 15) return 15.70;
  if (w <= 20) return 16.60;
  if (w <= 25) return 17.70;
  if (w <= 30) return 19.80;
  if (w <= 35) return 22.40;
  if (w <= 40) return 25.60;
  if (w <= 45) return 27.60;
  if (w <= 50) return 29.50;
  return 29.50;
}

function calculatePickupPrice(weight, maxWeight = 50) {
  const totalWeight = parseFloat(weight) || 0;
  const weightLimit = parseFloat(maxWeight) || 50;
  
  if (totalWeight <= weightLimit) {
    const price = getPickupPriceForSingleParcel(totalWeight);
    return { price, parcelsCount: 1, parcels: [totalWeight] };
  }
  
  // Максимально загружаем посылки до лимита
  const fullParcels = Math.floor(totalWeight / weightLimit);
  const remainder = totalWeight - (fullParcels * weightLimit);
  
  let totalPrice = 0;
  let parcels = [];
  
  for (let i = 0; i < fullParcels; i++) {
    totalPrice += getPickupPriceForSingleParcel(weightLimit);
    parcels.push(weightLimit);
  }
  
  if (remainder > 0) {
    totalPrice += getPickupPriceForSingleParcel(remainder);
    parcels.push(Math.round(remainder * 100) / 100);
  }
  
  return { 
    price: Math.round(totalPrice * 100) / 100, 
    parcelsCount: parcels.length,
    parcels
  };
}

function roundToWholeRubles(value) {
  return Math.round(value);
}

function calculateAdditionalFees(baseDeliveryPrice, orderSum, isRural, parcelsCount = 1) {
  const orderAmount = parseFloat(orderSum) || 0;
  const basePrice = parseFloat(baseDeliveryPrice) || 0;
  const numParcels = parseInt(parcelsCount) || 1;
  
  const declaredValueFee = Math.max(0.30, orderAmount * 0.003);
  const codFee = Math.max(0.35, (orderAmount + basePrice) * 0.015);
  const ruralSurcharge = isRural ? (5.00 * numParcels) : 0;
  
  // Прогрессивная надбавка для маленьких заказов
  let smallOrderSurcharge = 0;
  if (orderAmount < 50) {
    smallOrderSurcharge = 10.00;
  } else if (orderAmount < 80) {
    smallOrderSurcharge = 5.00;
  }
  
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

// Тестовые сценарии
console.log('='.repeat(80));
console.log('ТЕСТИРОВАНИЕ РАСЧЕТОВ ДОСТАВКИ');
console.log('='.repeat(80));

// Тест 1: Легкий заказ (город, 5 кг, 100 руб)
console.log('\n📦 ТЕСТ 1: Легкий заказ в город');
console.log('-'.repeat(80));
const test1Courier = calculateCourierPrice(5);
const test1Fees = calculateAdditionalFees(test1Courier.price, 100, false, test1Courier.parcelsCount);
console.log(`Вес: 5 кг, Сумма: 100 BYN, Город (не сельский)`);
console.log(`Курьер: базовая ${test1Courier.price} BYN, посылок: ${test1Courier.parcelsCount}`);
console.log(`Сборы: объявл.ценность ${test1Fees.declaredValueFee}, налож.платеж ${test1Fees.codFee}, сельская ${test1Fees.ruralSurcharge}`);
console.log(`ИТОГО: ${test1Fees.totalPrice} BYN`);

const test1Pvz = calculatePickupPrice(5, 30);
const test1PvzFees = calculateAdditionalFees(test1Pvz.price, 100, false, test1Pvz.parcelsCount);
console.log(`ПВЗ (лимит 30 кг): базовая ${test1Pvz.price} BYN, посылок: ${test1Pvz.parcelsCount}`);
console.log(`ИТОГО ПВЗ: ${test1PvzFees.totalPrice} BYN`);

// Тест 2: Тяжелый заказ (город, 60 кг, 500 руб)
console.log('\n📦 ТЕСТ 2: Тяжелый заказ в город (60 кг - больше 50 кг)');
console.log('-'.repeat(80));
const test2Courier = calculateCourierPrice(60);
const test2Fees = calculateAdditionalFees(test2Courier.price, 500, false, test2Courier.parcelsCount);
console.log(`Вес: 60 кг, Сумма: 500 BYN, Город (не сельский)`);
console.log(`Курьер: базовая ${test2Courier.price} BYN, посылок: ${test2Courier.parcelsCount}, разбивка: ${test2Courier.parcels.join(' кг + ')} кг`);
console.log(`Сборы: объявл.ценность ${test2Fees.declaredValueFee}, налож.платеж ${test2Fees.codFee}, сельская ${test2Fees.ruralSurcharge}`);
console.log(`ИТОГО: ${test2Fees.totalPrice} BYN`);

// Тест 3: ПВЗ с превышением лимита 30 кг
console.log('\n📦 ТЕСТ 3: Заказ 35 кг в ПВЗ с лимитом 30 кг');
console.log('-'.repeat(80));
const test3Pvz = calculatePickupPrice(35, 30);
const test3PvzFees = calculateAdditionalFees(test3Pvz.price, 200, false, test3Pvz.parcelsCount);
console.log(`Вес: 35 кг, Сумма: 200 BYN, ПВЗ лимит: 30 кг`);
console.log(`ПВЗ: базовая ${test3Pvz.price} BYN, посылок: ${test3Pvz.parcelsCount}, разбивка: ${test3Pvz.parcels.join(' кг + ')} кг`);
console.log(`Сборы: объявл.ценность ${test3PvzFees.declaredValueFee}, налож.платеж ${test3PvzFees.codFee}, сельская ${test3PvzFees.ruralSurcharge}`);
console.log(`ИТОГО: ${test3PvzFees.totalPrice} BYN`);

// Тест 4: Деревня (легкий заказ)
console.log('\n📦 ТЕСТ 4: Легкий заказ в деревню (сельская надбавка)');
console.log('-'.repeat(80));
const test4Courier = calculateCourierPrice(10);
const test4Fees = calculateAdditionalFees(test4Courier.price, 150, true, test4Courier.parcelsCount);
console.log(`Вес: 10 кг, Сумма: 150 BYN, Деревня (сельская надбавка +5 BYN)`);
console.log(`Курьер: базовая ${test4Courier.price} BYN, посылок: ${test4Courier.parcelsCount}`);
console.log(`Сборы: объявл.ценность ${test4Fees.declaredValueFee}, налож.платеж ${test4Fees.codFee}, сельская ${test4Fees.ruralSurcharge}`);
console.log(`ИТОГО: ${test4Fees.totalPrice} BYN`);

// Тест 5: Деревня с тяжелым заказом (несколько посылок)
console.log('\n📦 ТЕСТ 5: Тяжелый заказ в деревню (60 кг, несколько посылок)');
console.log('-'.repeat(80));
const test5Courier = calculateCourierPrice(60);
const test5Fees = calculateAdditionalFees(test5Courier.price, 500, true, test5Courier.parcelsCount);
console.log(`Вес: 60 кг, Сумма: 500 BYN, Деревня (надбавка +5 BYN за КАЖДУЮ посылку)`);
console.log(`Курьер: базовая ${test5Courier.price} BYN, посылок: ${test5Courier.parcelsCount}, разбивка: ${test5Courier.parcels.join(' кг + ')} кг`);
console.log(`Сборы: объявл.ценность ${test5Fees.declaredValueFee}, налож.платеж ${test5Fees.codFee}, сельская ${test5Fees.ruralSurcharge} (${test5Courier.parcelsCount} посылок × 5 BYN)`);
console.log(`ИТОГО: ${test5Fees.totalPrice} BYN`);

// Тест 6: 75 кг (проверка логики 50 + 25)
console.log('\n📦 ТЕСТ 6: Заказ 75 кг (должно быть 50 + 25)');
console.log('-'.repeat(80));
const test6Courier = calculateCourierPrice(75);
const test6Fees = calculateAdditionalFees(test6Courier.price, 600, false, test6Courier.parcelsCount);
console.log(`Вес: 75 кг, Сумма: 600 BYN, Город`);
console.log(`Курьер: базовая ${test6Courier.price} BYN, посылок: ${test6Courier.parcelsCount}, разбивка: ${test6Courier.parcels.join(' кг + ')} кг`);
console.log(`Сборы: объявл.ценность ${test6Fees.declaredValueFee}, налож.платеж ${test6Fees.codFee}, сельская ${test6Fees.ruralSurcharge}`);
console.log(`ИТОГО: ${test6Fees.totalPrice} BYN`);

// Тест 7: ПВЗ 60 кг с лимитом 30 кг (должно быть 30 + 30)
console.log('\n📦 ТЕСТ 7: ПВЗ 60 кг с лимитом 30 кг (должно быть 30 + 30)');
console.log('-'.repeat(80));
const test7Pvz = calculatePickupPrice(60, 30);
const test7PvzFees = calculateAdditionalFees(test7Pvz.price, 400, false, test7Pvz.parcelsCount);
console.log(`Вес: 60 кг, Сумма: 400 BYN, ПВЗ лимит: 30 кг`);
console.log(`ПВЗ: базовая ${test7Pvz.price} BYN, посылок: ${test7Pvz.parcelsCount}, разбивка: ${test7Pvz.parcels.join(' кг + ')} кг`);
console.log(`Сборы: объявл.ценность ${test7PvzFees.declaredValueFee}, налож.платеж ${test7PvzFees.codFee}, сельская ${test7PvzFees.ruralSurcharge}`);
console.log(`ИТОГО: ${test7PvzFees.totalPrice} BYN`);

// Тест 8: Маленький заказ 40 BYN (надбавка +10 BYN)
console.log('\n📦 ТЕСТ 8: Маленький заказ 40 BYN (надбавка +10 BYN)');
console.log('-'.repeat(80));
const test8Courier = calculateCourierPrice(2);
const test8Fees = calculateAdditionalFees(test8Courier.price, 40, false, test8Courier.parcelsCount);
console.log(`Вес: 2 кг, Сумма: 40 BYN, Город`);
console.log(`Курьер: базовая ${test8Courier.price} BYN, посылок: ${test8Courier.parcelsCount}`);
console.log(`Сборы: объявл.ценность ${test8Fees.declaredValueFee}, налож.платеж ${test8Fees.codFee}, сельская ${test8Fees.ruralSurcharge}, маленький заказ ${test8Fees.smallOrderSurcharge}`);
console.log(`ИТОГО: ${test8Fees.totalPrice} BYN`);
console.log(`💡 Надбавка за маленький заказ < 50 BYN = +10 BYN`);

// Тест 9: Средний заказ 70 BYN (надбавка +5 BYN)
console.log('\n📦 ТЕСТ 9: Средний заказ 70 BYN (надбавка +5 BYN)');
console.log('-'.repeat(80));
const test9Courier = calculateCourierPrice(3);
const test9Fees = calculateAdditionalFees(test9Courier.price, 70, false, test9Courier.parcelsCount);
console.log(`Вес: 3 кг, Сумма: 70 BYN, Город`);
console.log(`Курьер: базовая ${test9Courier.price} BYN, посылок: ${test9Courier.parcelsCount}`);
console.log(`Сборы: объявл.ценность ${test9Fees.declaredValueFee}, налож.платеж ${test9Fees.codFee}, сельская ${test9Fees.ruralSurcharge}, маленький заказ ${test9Fees.smallOrderSurcharge}`);
console.log(`ИТОГО: ${test9Fees.totalPrice} BYN`);
console.log(`💡 Надбавка за заказ 50-80 BYN = +5 BYN`);

// Тест 10: Нормальный заказ 100 BYN (без надбавки)
console.log('\n📦 ТЕСТ 10: Нормальный заказ 100 BYN (без надбавки за размер)');
console.log('-'.repeat(80));
const test10Courier = calculateCourierPrice(5);
const test10Fees = calculateAdditionalFees(test10Courier.price, 100, false, test10Courier.parcelsCount);
console.log(`Вес: 5 кг, Сумма: 100 BYN, Город`);
console.log(`Курьер: базовая ${test10Courier.price} BYN, посылок: ${test10Courier.parcelsCount}`);
console.log(`Сборы: объявл.ценность ${test10Fees.declaredValueFee}, налож.платеж ${test10Fees.codFee}, сельская ${test10Fees.ruralSurcharge}, маленький заказ ${test10Fees.smallOrderSurcharge}`);
console.log(`ИТОГО: ${test10Fees.totalPrice} BYN`);
console.log(`💡 Заказ >= 80 BYN - без надбавки за размер заказа`);

console.log('\n' + '='.repeat(80));
console.log('ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
console.log('='.repeat(80));
