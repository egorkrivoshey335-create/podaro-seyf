#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== Синхронизация пунктов выдачи ===');

// Функция для парсинга HTML файла
function parseHTMLFile(htmlPath) {
  try {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const pickupPoints = [];
    
    // Регулярное выражение для извлечения информации о каждом пункте
    const pointRegex = /<div class="point-item">[\s\S]*?<div class="point-number">([^<]+)<\/div>[\s\S]*?<div class="city">📍 ([^<]+)<\/div>[\s\S]*?<div class="address">🏠 ([^<]+)<\/div>[\s\S]*?<div class="working-hours">⏰ ([^<]+)<\/div>[\s\S]*?<div class="point-type">📋 ([^<]+)<\/div>/g;
    
    let match;
    while ((match = pointRegex.exec(htmlContent)) !== null) {
      const [, name, city, address, workingHours, pointType] = match;
      
      // Извлекаем ID из названия
      const idMatch = name.match(/№(\d+)/);
      const id = idMatch ? parseInt(idMatch[1]) : 0;
      
      // Формируем адрес для доставки
      const deliveryAddress = `${address}, Беларусь`;
      
      pickupPoints.push({
        id,
        city,
        name,
        address,
        working_hours: workingHours,
        delivery_address: deliveryAddress
      });
    }
    
    return pickupPoints;
  } catch (error) {
    console.error('Ошибка парсинга HTML файла:', error);
    return [];
  }
}

// Функция для загрузки текущих пунктов
function loadCurrentPickupPoints() {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки текущих пунктов:', error);
    return [];
  }
}

// Функция для сохранения пунктов
function savePickupPoints(pickupPoints) {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    fs.writeFileSync(filePath, JSON.stringify(pickupPoints, null, 2), 'utf8');
    console.log(`Сохранено ${pickupPoints.length} пунктов в файл`);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
  }
}

// Основная функция синхронизации
function syncPickupPoints() {
  try {
    // Путь к HTML файлу
    const htmlPath = path.join(__dirname, '..', '..', 'pickup_points_20260202_095340.html');
    
    // Проверяем существование HTML файла
    if (!fs.existsSync(htmlPath)) {
      console.error('HTML файл не найден:', htmlPath);
      return;
    }
    
    // Парсим HTML
    const newPickupPoints = parseHTMLFile(htmlPath);
    console.log(`Найдено ${newPickupPoints.length} пунктов в HTML файле`);
    
    // Загружаем текущие пункты
    const currentPickupPoints = loadCurrentPickupPoints();
    console.log(`Текущее количество пунктов: ${currentPickupPoints.length}`);
    
    // Сравниваем и находим новые пункты
    const currentIds = new Set(currentPickupPoints.map(p => p.id));
    const newPoints = newPickupPoints.filter(p => !currentIds.has(p.id));
    
    if (newPoints.length > 0) {
      console.log(`Найдено ${newPoints.length} новых пунктов:`);
      newPoints.forEach(point => {
        console.log(`- ${point.name} (${point.city})`);
      });
      
      // Добавляем новые пункты к текущим
      const updatedPickupPoints = [...currentPickupPoints, ...newPoints];
      
      // Сортируем по ID
      updatedPickupPoints.sort((a, b) => a.id - b.id);
      
      // Сохраняем обновленный файл
      savePickupPoints(updatedPickupPoints);
      
      console.log('✅ Файл успешно обновлен!');
    } else {
      console.log('✅ Новых пунктов не найдено. Файл в актуальном состоянии.');
      // Выводим статистику по текущим пунктам
      const cities = [...new Set(currentPickupPoints.map(p => p.city))];
      console.log(`📊 Статистика: ${currentPickupPoints.length} пунктов в ${cities.length} городах`);
    }
    
  } catch (error) {
    console.error('Ошибка при синхронизации:', error);
  }
}

// Запускаем синхронизацию
syncPickupPoints();