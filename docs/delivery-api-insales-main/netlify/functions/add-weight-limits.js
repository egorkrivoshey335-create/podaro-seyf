// Скрипт для добавления поля weight_limit к ПВЗ
const fs = require('fs');
const path = require('path');

// ПВЗ с ограничением 50 кг (или без ограничения, "согласно ГУ")
// Это ПВЗ, которые работают только Пн-Пт или Пн-Сб 09:30-11:00 (меньшие часы работы)
const pvzWith50kgLimit = [
  50101, // Борисов
  50301, // Солигорск  
  60101, // Жлобин
  40201, // Лида
  10201, // Барановичи 10201
  20201, // Витебск 20201
  30201, // Гродно 30201
  40101, // Орша 40101
  // Добавьте остальные ID из списка, где указано "согласно ГУ*"
];

// Читаем существующие данные
const pickupPointsPath = path.join(__dirname, 'pickup-points.json');
const pickupPoints = JSON.parse(fs.readFileSync(pickupPointsPath, 'utf8'));

// Добавляем weight_limit
const updatedPoints = pickupPoints.map(point => {
  // Если ПВЗ в списке с 50 кг - ставим 50, иначе 30
  const weightLimit = pvzWith50kgLimit.includes(point.id) ? 50 : 30;
  
  return {
    ...point,
    weight_limit: weightLimit
  };
});

// Сохраняем обновленные данные
fs.writeFileSync(pickupPointsPath, JSON.stringify(updatedPoints, null, 2), 'utf8');
console.log(`✅ Добавлено поле weight_limit для ${updatedPoints.length} ПВЗ`);
console.log(`   - 30 кг: ${updatedPoints.filter(p => p.weight_limit === 30).length} ПВЗ`);
console.log(`   - 50 кг: ${updatedPoints.filter(p => p.weight_limit === 50).length} ПВЗ`);

// Обновляем pickup-points-data.js
const dataJsPath = path.join(__dirname, 'pickup-points-data.js');
const dataJsContent = `// Данные пунктов выдачи - встроены для надежного деплоя на Netlify
const pickupPointsData = ${JSON.stringify(updatedPoints, null, 2)};

module.exports = { pickupPointsData };
`;

fs.writeFileSync(dataJsPath, dataJsContent, 'utf8');
console.log(`✅ Обновлен файл pickup-points-data.js`);
