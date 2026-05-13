const fs = require('fs');
const path = require('path');

// Функция для загрузки пунктов выдачи из JSON файла
function loadPickupPoints() {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки пунктов выдачи:', error);
    // Возвращаем пустой массив в случае ошибки
    return [];
  }
}

const pickupPoints = loadPickupPoints();

console.log('=== Тест загрузки пунктов выдачи ===');
console.log(`Загружено пунктов: ${pickupPoints.length}`);
console.log('Первый пункт:', pickupPoints[0]);
console.log('Последний пункт:', pickupPoints[pickupPoints.length - 1]);

// Проверка уникальности ID
const ids = pickupPoints.map(p => p.id);
const uniqueIds = new Set(ids);
console.log(`Уникальных ID: ${uniqueIds.size}, Всего пунктов: ${pickupPoints.length}`);

// Проверка городов
const cities = [...new Set(pickupPoints.map(p => p.city))];
console.log(`Городов: ${cities.length}`);
console.log('Города:', cities.slice(0, 5), '...');