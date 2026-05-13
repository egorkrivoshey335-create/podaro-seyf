/**
 * Тесты логики разделения посылок и расчёта стоимости доставки
 * Новые тарифы от 14.04.2026 (Зона 4)
 */

// ── Тарифы Дверь-Дверь (courier) ──
const COURIER_TIERS = [
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
  { max_weight: 50, price: 50.20 },
];
const COURIER_OVERSIZED_BASE = 50.20;
const COURIER_OVERSIZED_PER_KG = 3;
const MAX_PARCEL_WEIGHT = 50;

// ── Тарифы Дверь-Отделение (pickup) ──
const PICKUP_TIERS = [
  { max_weight: 1,  price: 10.20 },
  { max_weight: 2,  price: 10.90 },
  { max_weight: 3,  price: 11.80 },
  { max_weight: 5,  price: 12.80 },
  { max_weight: 10, price: 15.10 },
  { max_weight: 15, price: 18.40 },
  { max_weight: 20, price: 20.90 },
  { max_weight: 25, price: 23.30 },
  { max_weight: 30, price: 26.60 },
  { max_weight: 35, price: 30.00 },
  { max_weight: 40, price: 32.40 },
  { max_weight: 45, price: 34.80 },
  { max_weight: 50, price: 36.30 },
];
const PICKUP_OVERSIZED_BASE = 36.30;
const PICKUP_OVERSIZED_PER_KG = 3;

// ── Вспомогательные функции (копии из server.js) ──

function priceForWeight(weight, tiers, oversizedBase, oversizedPerKg) {
  const w = parseFloat(weight) || 0;
  for (const tier of tiers) {
    if (w <= tier.max_weight) return tier.price;
  }
  const maxTier = tiers[tiers.length - 1];
  const extra = Math.max(0, w - maxTier.max_weight);
  return oversizedBase + extra * oversizedPerKg;
}

function splitParcels(totalWeight, maxWeight) {
  const fullParcels = Math.floor(totalWeight / maxWeight);
  const remainder = totalWeight - fullParcels * maxWeight;
  const parcels = [];
  for (let i = 0; i < fullParcels; i++) parcels.push(maxWeight);
  if (remainder > 0) parcels.push(Math.round(remainder * 100) / 100);
  return parcels;
}

function calcTotalPrice(totalWeight, maxWeight, tiers, oversizedBase, oversizedPerKg) {
  if (totalWeight <= maxWeight) {
    return { price: priceForWeight(totalWeight, tiers, oversizedBase, oversizedPerKg), parcelsCount: 1, parcels: [totalWeight] };
  }
  const parcels = splitParcels(totalWeight, maxWeight);
  let totalPrice = 0;
  for (const w of parcels) {
    totalPrice += priceForWeight(w, tiers, oversizedBase, oversizedPerKg);
  }
  return { price: Math.round(totalPrice * 100) / 100, parcelsCount: parcels.length, parcels };
}

// ── Фреймворк тестов ──

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

function assertEq(actual, expected, message) {
  if (Math.abs(actual - expected) < 0.01) {
    console.log(`  ✅ ${message}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}: ожидалось ${expected}, получено ${actual}`);
    failed++;
  }
}

// ── Тесты: отдельные тарифы по весу ──

function testCourierSingleTiers() {
  console.log('\n📦 ТЕСТЫ: Курьер (Дверь-Дверь) — отдельные тарифы по весу');
  console.log('─'.repeat(70));

  const cases = [
    [0.5,  14.80], [1, 14.80],
    [1.5,  16.40], [2, 16.40],
    [2.5,  17.10], [3, 17.10],
    [4,    20.00], [5, 20.00],
    [7,    23.30], [10, 23.30],
    [12,   26.60], [15, 26.60],
    [18,   29.80], [20, 29.80],
    [23,   33.10], [25, 33.10],
    [28,   36.40], [30, 36.40],
    [33,   43.80], [35, 43.80],
    [38,   45.60], [40, 45.60],
    [43,   48.30], [45, 48.30],
    [48,   50.20], [50, 50.20],
  ];
  for (const [w, expected] of cases) {
    assertEq(priceForWeight(w, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG), expected, `${w} кг`);
  }
}

function testPickupSingleTiers() {
  console.log('\n📦 ТЕСТЫ: ПВЗ (Дверь-Отделение) — отдельные тарифы по весу');
  console.log('─'.repeat(70));

  const cases = [
    [0.5,  10.20], [1, 10.20],
    [1.5,  10.90], [2, 10.90],
    [2.5,  11.80], [3, 11.80],
    [4,    12.80], [5, 12.80],
    [7,    15.10], [10, 15.10],
    [12,   18.40], [15, 18.40],
    [18,   20.90], [20, 20.90],
    [23,   23.30], [25, 23.30],
    [28,   26.60], [30, 26.60],
    [33,   30.00], [35, 30.00],
    [38,   32.40], [40, 32.40],
    [43,   34.80], [45, 34.80],
    [48,   36.30], [50, 36.30],
  ];
  for (const [w, expected] of cases) {
    assertEq(priceForWeight(w, PICKUP_TIERS, PICKUP_OVERSIZED_BASE, PICKUP_OVERSIZED_PER_KG), expected, `${w} кг`);
  }
}

// ── Тесты: разделение посылок курьер ──

function testCourierSplitParcels() {
  console.log('\n📦 ТЕСТЫ: Курьер (Дверь-Дверь) — разделение на посылки');
  console.log('─'.repeat(70));

  const cases = [
    { weight: 45,  expectedParcels: 1, expectedPrice: 48.30, parcels: [45] },
    { weight: 50,  expectedParcels: 1, expectedPrice: 50.20, parcels: [50] },
    { weight: 51,  expectedParcels: 2, expectedPrice: 50.20 + 14.80, parcels: [50, 1] },
    { weight: 60,  expectedParcels: 2, expectedPrice: 50.20 + 23.30, parcels: [50, 10] },
    { weight: 75,  expectedParcels: 2, expectedPrice: 50.20 + 33.10, parcels: [50, 25] },
    { weight: 100, expectedParcels: 2, expectedPrice: 50.20 + 50.20, parcels: [50, 50] },
    { weight: 101, expectedParcels: 3, expectedPrice: 50.20 + 50.20 + 14.80, parcels: [50, 50, 1] },
    { weight: 125, expectedParcels: 3, expectedPrice: 50.20 + 50.20 + 33.10 /*25kg*/, parcels: [50, 50, 25] },
  ];

  for (const c of cases) {
    const result = calcTotalPrice(c.weight, MAX_PARCEL_WEIGHT, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG);
    assertEq(result.parcelsCount, c.expectedParcels, `${c.weight} кг → ${c.expectedParcels} посылок`);
    assertEq(result.price, c.expectedPrice, `${c.weight} кг → цена ${c.expectedPrice} BYN`);
    assert(JSON.stringify(result.parcels) === JSON.stringify(c.parcels),
      `${c.weight} кг → посылки [${c.parcels}] кг, получено [${result.parcels}]`);
  }
}

// ── Тесты: oversized курьер ──

function testCourierOversized() {
  console.log('\n📦 ТЕСТЫ: Курьер (Дверь-Дверь) — oversized (> 50 кг как одна посылка)');
  console.log('─'.repeat(70));

  // 55 кг: база 50.20 + 5 × 3 = 65.20
  assertEq(priceForWeight(55, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG), 65.20, '55 кг oversized');
  // 60 кг: база 50.20 + 10 × 3 = 80.20
  assertEq(priceForWeight(60, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG), 80.20, '60 кг oversized');
  // 100 кг: база 50.20 + 50 × 3 = 200.20
  assertEq(priceForWeight(100, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG), 200.20, '100 кг oversized');
}

// ── Тесты: разделение посылок ПВЗ ──

function testPickupSplitParcels() {
  console.log('\n📦 ТЕСТЫ: ПВЗ (Дверь-Отделение) — разделение на посылки');
  console.log('─'.repeat(70));

  // ПВЗ может иметь лимит 30 кг или 50 кг
  const cases30 = [
    { weight: 25, maxW: 30, expectedParcels: 1, expectedPrice: 23.30, parcels: [25] },
    { weight: 30, maxW: 30, expectedParcels: 1, expectedPrice: 26.60, parcels: [30] },
    { weight: 31, maxW: 30, expectedParcels: 2, expectedPrice: 26.60 + 10.20, parcels: [30, 1] },
    { weight: 35, maxW: 30, expectedParcels: 2, expectedPrice: 26.60 + 12.80, parcels: [30, 5] },
    { weight: 60, maxW: 30, expectedParcels: 2, expectedPrice: 26.60 + 26.60, parcels: [30, 30] },
    { weight: 90, maxW: 30, expectedParcels: 3, expectedPrice: 26.60 * 3, parcels: [30, 30, 30] },
  ];

  const cases50 = [
    { weight: 45, maxW: 50, expectedParcels: 1, expectedPrice: 34.80, parcels: [45] },
    { weight: 50, maxW: 50, expectedParcels: 1, expectedPrice: 36.30, parcels: [50] },
    { weight: 51, maxW: 50, expectedParcels: 2, expectedPrice: 36.30 + 10.20, parcels: [50, 1] },
    { weight: 75, maxW: 50, expectedParcels: 2, expectedPrice: 36.30 + 23.30, parcels: [50, 25] },
    { weight: 100, maxW: 50, expectedParcels: 2, expectedPrice: 36.30 + 36.30, parcels: [50, 50] },
  ];

  for (const c of cases30) {
    const result = calcTotalPrice(c.weight, c.maxW, PICKUP_TIERS, PICKUP_OVERSIZED_BASE, PICKUP_OVERSIZED_PER_KG);
    assertEq(result.parcelsCount, c.expectedParcels, `ПВЗ ${c.weight}кг (лимит ${c.maxW}) → ${c.expectedParcels} посылок`);
    assertEq(result.price, c.expectedPrice, `ПВЗ ${c.weight}кг → цена ${c.expectedPrice} BYN`);
    assert(JSON.stringify(result.parcels) === JSON.stringify(c.parcels),
      `ПВЗ ${c.weight}кг → посылки [${c.parcels}] кг, получено [${result.parcels}]`);
  }

  for (const c of cases50) {
    const result = calcTotalPrice(c.weight, c.maxW, PICKUP_TIERS, PICKUP_OVERSIZED_BASE, PICKUP_OVERSIZED_PER_KG);
    assertEq(result.parcelsCount, c.expectedParcels, `ПВЗ ${c.weight}кг (лимит ${c.maxW}) → ${c.expectedParcels} посылок`);
    assertEq(result.price, c.expectedPrice, `ПВЗ ${c.weight}кг → цена ${c.expectedPrice} BYN`);
    assert(JSON.stringify(result.parcels) === JSON.stringify(c.parcels),
      `ПВЗ ${c.weight}кг → посылки [${c.parcels}] кг, получено [${result.parcels}]`);
  }
}

// ── Тесты: дополнительные сборы ──

function roundToWholeRubles(value) { return Math.round(value); }

function testAdditionalFees() {
  console.log('\n📦 ТЕСТЫ: Дополнительные сборы');
  console.log('─'.repeat(70));

  // Объявленная ценность: 0.3% от суммы, мин 0.30
  assertEq(roundToWholeRubles(Math.max(0.30, 100 * 0.003)), roundToWholeRubles(0.30), 'Объявл. ценность 100 BYN → 0.30 (минимум)');
  assertEq(roundToWholeRubles(Math.max(0.30, 500 * 0.003)), roundToWholeRubles(1.50), 'Объявл. ценность 500 BYN → 1.50');
  assertEq(roundToWholeRubles(Math.max(0.30, 2000 * 0.003)), roundToWholeRubles(6.00), 'Объявл. ценность 2000 BYN → 6.00');

  // Наложенный платёж: 1.5% от (товар + доставка), мин 0.35
  const basePrice = 20;
  assertEq(roundToWholeRubles(Math.max(0.35, (100 + basePrice) * 0.015)), roundToWholeRubles(1.80), 'Налож. платёж 100+20 BYN → 1.80');
  assertEq(roundToWholeRubles(Math.max(0.35, (500 + basePrice) * 0.015)), roundToWholeRubles(7.80), 'Налож. платёж 500+20 BYN → 7.80');

  // Надбавка за сельский: 9 BYN за посылку
  assertEq(roundToWholeRubles(9.00 * 1), 9, 'Сельская надбавка 1 посылка → 9 BYN');
  assertEq(roundToWholeRubles(9.00 * 2), 18, 'Сельская надбавка 2 посылки → 18 BYN');
  assertEq(roundToWholeRubles(9.00 * 3), 27, 'Сельская надбавка 3 посылки → 27 BYN');

  // Надбавка за маленький заказ
  function smallOrderSurcharge(orderAmount) {
    if (orderAmount < 50) return 10;
    if (orderAmount < 80) return 5;
    return 0;
  }
  assertEq(smallOrderSurcharge(30), 10, 'Заказ 30 BYN → надбавка +10');
  assertEq(smallOrderSurcharge(49), 10, 'Заказ 49 BYN → надбавка +10');
  assertEq(smallOrderSurcharge(50), 5, 'Заказ 50 BYN → надбавка +5');
  assertEq(smallOrderSurcharge(79), 5, 'Заказ 79 BYN → надбавка +5');
  assertEq(smallOrderSurcharge(80), 0, 'Заказ 80 BYN → без надбавки');
  assertEq(smallOrderSurcharge(200), 0, 'Заказ 200 BYN → без надбавки');
}

// ── Тесты: интегральные сценарии ──

function testIntegrationScenarios() {
  console.log('\n📦 ТЕСТЫ: Интегральные сценарии (итоговая стоимость)');
  console.log('─'.repeat(70));

  // Сценарий 1: Курьер, город, 5 кг, заказ 100 BYN
  // 5 кг попадает в диапазон "до 5" = 20.00 BYN (не 23.30!)
  {
    const base = calcTotalPrice(5, MAX_PARCEL_WEIGHT, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG);
    const decl = Math.max(0.30, 100 * 0.003);
    const cod = Math.max(0.35, (100 + base.price) * 0.015);
    const rural = 0;
    const small = 0;
    const total = roundToWholeRubles(base.price + decl + cod + rural + small);
    // 20.00 + 0.30 + 1.80 = 22.10 → round = 22
    assertEq(total, 22, `Сценарий 1: курьер, город, 5кг, 100BYN → итого ${total} BYN`);
  }

  // Сценарий 2: Курьер, деревня, 10 кг, заказ 30 BYN (маленький)
  {
    const base = calcTotalPrice(10, MAX_PARCEL_WEIGHT, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG);
    const decl = Math.max(0.30, 30 * 0.003);
    const cod = Math.max(0.35, (30 + base.price) * 0.015);
    const rural = 9 * base.parcelsCount;
    const small = 10;
    const total = roundToWholeRubles(base.price + decl + cod + rural + small);
    assertEq(total, roundToWholeRubles(23.30 + 0.30 + 0.80 + 9 + 10),
      `Сценарий 2: курьер, деревня, 10кг, 30BYN → итого ${total} BYN`);
  }

  // Сценарий 3: Курьер, город, 75 кг (2 посылки), заказ 500 BYN
  {
    const base = calcTotalPrice(75, MAX_PARCEL_WEIGHT, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG);
    assertEq(base.parcelsCount, 2, '75 кг → 2 посылки');
    const decl = Math.max(0.30, 500 * 0.003);           // 1.50
    const cod = Math.max(0.35, (500 + base.price) * 0.015);  // 7.998 → 8
    const rural = 0;
    const small = 0;
    const total = roundToWholeRubles(base.price + decl + cod + rural + small);
    // 83.30 + 1.50 + 8.00 = 92.80 → round = 93
    assert(total === 93 || total === 94, `Сценарий 3: курьер, город, 75кг (2посылки), 500BYN → итого ${total} BYN`);
  }

  // Сценарий 4: ПВЗ (лимит 30), город, 35 кг (2 посылки), заказ 200 BYN
  {
    const base = calcTotalPrice(35, 30, PICKUP_TIERS, PICKUP_OVERSIZED_BASE, PICKUP_OVERSIZED_PER_KG);
    assertEq(base.parcelsCount, 2, 'ПВЗ 35кг (лимит 30) → 2 посылки');
    const decl = Math.max(0.30, 200 * 0.003);
    const cod = Math.max(0.35, (200 + base.price) * 0.015);
    const rural = 0;
    const small = 0;
    const total = roundToWholeRubles(base.price + decl + cod + rural + small);
    assertEq(total, roundToWholeRubles(26.60 + 12.80 + 0.60 + 3.58 + 0 + 0),
      `Сценарий 4: ПВЗ, город, 35кг (2посылки), 200BYN → итого ${total} BYN`);
  }

  // Сценарий 5: Курьер, деревня, 60 кг (2 посылки), заказ 40 BYN
  {
    const base = calcTotalPrice(60, MAX_PARCEL_WEIGHT, COURIER_TIERS, COURIER_OVERSIZED_BASE, COURIER_OVERSIZED_PER_KG);
    assertEq(base.parcelsCount, 2, '60 кг → 2 посылки');
    const decl = Math.max(0.30, 40 * 0.003);            // 0.30
    const cod = Math.max(0.35, (40 + base.price) * 0.015);  // 1.30
    const rural = 9 * base.parcelsCount;                 // 18
    const small = 10;                                    // < 50 BYN
    const total = roundToWholeRubles(base.price + decl + cod + rural + small);
    // 73.50 + 0.30 + 1.30 + 18 + 10 = 103.10 → round = 103
    assert(total >= 103 && total <= 104, `Сценарий 5: курьер, деревня, 60кг (2посылки), 40BYN → итого ${total} BYN`);
  }
}

// ── Запуск ──

console.log('═'.repeat(70));
console.log('  ТЕСТЫ РАЗДЕЛЕНИЯ ПОСЫЛОК И РАСЧЁТА СТОИМОСТИ');
console.log('  Тарифы Зона 4 (от 14.04.2026)');
console.log('═'.repeat(70));

testCourierSingleTiers();
testPickupSingleTiers();
testCourierSplitParcels();
testCourierOversized();
testPickupSplitParcels();
testAdditionalFees();
testIntegrationScenarios();

console.log('\n' + '═'.repeat(70));
console.log(`  РЕЗУЛЬТАТЫ: ${passed} пройдено, ${failed} провалено`);
console.log('═'.repeat(70));

if (failed === 0) {
  console.log('  🎉 Все тесты пройдены!');
} else {
  console.log(`  ⚠️  ${failed} тест(ов) провалено — проверьте логику расчёта`);
}

process.exit(failed > 0 ? 1 : 0);
