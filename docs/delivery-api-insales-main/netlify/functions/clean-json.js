const fs = require('fs');
const path = require('path');

// Функция для загрузки текущих пунктов
function loadPickupPoints() {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    return [];
  }
}

// Функция для сохранения пунктов
function savePickupPoints(pickupPoints) {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    fs.writeFileSync(filePath, JSON.stringify(pickupPoints, null, 2), 'utf8');
    console.log('Файл успешно очищен от полей phone');
  } catch (error) {
    console.error('Ошибка сохранения:', error);
  }
}

// Основная функция очистки
function cleanJSON() {
  const pickupPoints = loadPickupPoints();
  
  // Удаляем поле phone из всех записей
  const cleanedPoints = pickupPoints.map(point => {
    const { phone, ...rest } = point;
    return rest;
  });
  
  savePickupPoints(cleanedPoints);
  console.log(`Очищено ${cleanedPoints.length} записей от поля phone`);
}

// Запускаем очистку
cleanJSON();