const fs = require('fs');
const path = require('path');

// Функция для парсинга HTML файла и извлечения пунктов выдачи
function parsePickupPointsFromHTML(htmlContent) {
  const pickupPoints = [];
  
  // Регулярное выражение для извлечения информации о каждом пункте
  const pointRegex = /<div class="point-item">[\s\S]*?<div class="point-number">([^<]+)<\/div>[\s\S]*?<div class="city">📍 ([^<]+)<\/div>[\s\S]*?<div class="address">🏠 ([^<]+)<\/div>[\s\S]*?<div class="working-hours">⏰ ([^<]+)<\/div>[\s\S]*?<div class="point-type">📋 ([^<]+)<\/div>/g;
  
  let match;
  while ((match = pointRegex.exec(htmlContent)) !== null) {
    const [, name, city, address, workingHours, pointType] = match;
    
    // Извлекаем ID из названия
    const idMatch = name.match(/№(\d+)/);
    const id = idMatch ? parseInt(idMatch[1]) : 0;
    
    // Определяем телефон на основе города
    let phone = '';
    const phoneMap = {
      'Барановичи': '+375-163-00-00-00',
      'Береза': '+375-164-00-00-00',
      'Бобруйск': '+375-225-00-00-00',
      'Борисов': '+375-177-00-00-00',
      'Брест': '+375-162-00-00-00',
      'Витебск': '+375-212-00-00-00',
      'Волковыск': '+375-151-00-00-00',
      'Гомель': '+375-232-00-00-00',
      'Горки': '+375-223-00-00-00',
      'Гродно': '+375-152-00-00-00',
      'Жлобин': '+375-233-00-00-00',
      'Жодино': '+375-175-00-00-00',
      'Ивацевичи': '+375-164-00-00-00',
      'Калинковичи': '+375-234-00-00-00',
      'Кобрин': '+375-164-00-00-00',
      'Кричев': '+375-224-00-00-00',
      'Лепель': '+375-213-00-00-00',
      'Лида': '+375-154-00-00-00',
      'Минск': '+375-17-000-00-00',
      'Могилев': '+375-222-00-00-00',
      'Мозырь': '+375-236-00-00-00',
      'Молодечно': '+375-176-00-00-00',
      'Новогрудок': '+375-159-00-00-00',
      'Новополоцк': '+375-214-00-00-00',
      'Орша': '+375-216-00-00-00',
      'Осиповичи': '+375-223-00-00-00',
      'Пинск': '+375-165-00-00-00',
      'Полоцк': '+375-214-00-00-00',
      'Речица': '+375-234-00-00-00',
      'Светлогорск': '+375-234-00-00-00',
      'Слоним': '+375-156-00-00-00',
      'Слуцк': '+375-179-00-00-00',
      'Сморгонь': '+375-159-00-00-00',
      'Солигорск': '+375-174-00-00-00'
    };
    
    phone = phoneMap[city] || '+375-XX-XXX-XX-XX';
    
    // Формируем адрес для доставки
    const deliveryAddress = `${address}, Беларусь`;
    
    pickupPoints.push({
      id,
      city,
      name,
      address,
      working_hours: workingHours,
      phone,
      delivery_address: deliveryAddress
    });
  }
  
  return pickupPoints;
}

// Функция для загрузки текущих пунктов из JSON файла
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

// Функция для сохранения пунктов в JSON файл
function savePickupPoints(pickupPoints) {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    fs.writeFileSync(filePath, JSON.stringify(pickupPoints, null, 2), 'utf8');
    console.log(`Сохранено ${pickupPoints.length} пунктов выдачи в файл`);
  } catch (error) {
    console.error('Ошибка сохранения пунктов:', error);
  }
}

// Основная функция обновления
function updatePickupPoints() {
  try {
    // Читаем HTML файл
    const htmlPath = path.join(__dirname, '..', '..', 'pickup_points_20260202_095340.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Парсим HTML
    const newPickupPoints = parsePickupPointsFromHTML(htmlContent);
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
      
      console.log('Файл успешно обновлен!');
    } else {
      console.log('Новых пунктов не найдено. Файл в актуальном состоянии.');
    }
    
  } catch (error) {
    console.error('Ошибка при обновлении пунктов:', error);
  }
}

// Запускаем обновление
if (require.main === module) {
  updatePickupPoints();
}

module.exports = {
  parsePickupPointsFromHTML,
  loadCurrentPickupPoints,
  savePickupPoints,
  updatePickupPoints
};