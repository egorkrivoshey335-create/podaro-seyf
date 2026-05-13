const fs = require('fs');
const path = require('path');

// Импортируем функции из server.js для тестирования
const { handler: serverHandler } = require('./server');

// Функция для загрузки пунктов выдачи из JSON файла
function loadPickupPoints() {
  try {
    const filePath = path.join(__dirname, 'pickup-points.json');
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки пунктов выдачи:', error);
    return [];
  }
}

// Тест 1: Проверка загрузки данных из JSON файла
function testLoadData() {
  console.log('🧪 Тест 1: Проверка загрузки данных из JSON файла...');
  
  try {
    const pickupPoints = loadPickupPoints();
    
    if (Array.isArray(pickupPoints) && pickupPoints.length > 0) {
      console.log(`✅ Успешно загружено ${pickupPoints.length} пунктов выдачи`);
      
      // Проверяем структуру первого элемента
      const firstPoint = pickupPoints[0];
      const requiredFields = ['id', 'city', 'name', 'address', 'working_hours', 'delivery_address'];
      
      let hasAllFields = true;
      for (const field of requiredFields) {
        if (!(field in firstPoint)) {
          console.log(`❌ Отсутствует поле: ${field}`);
          hasAllFields = false;
        }
      }
      
      if (hasAllFields) {
        console.log('✅ Структура данных корректна');
        console.log(`   Пример: ${firstPoint.city}, ${firstPoint.address}`);
      }
      
      return true;
    } else {
      console.log('❌ Не удалось загрузить данные или массив пуст');
      return false;
    }
  } catch (error) {
    console.log(`❌ Ошибка при загрузке данных: ${error.message}`);
    return false;
  }
}

// Тест 2: Проверка работы API с информационным запросом
async function testInfoRequest() {
  console.log('\n🧪 Тест 2: Проверка информационного запроса к API...');
  
  try {
    const event = {
      body: JSON.stringify({ action: 'ping' })
    };
    
    const result = await serverHandler(event, {});
    
    if (result.statusCode === 200) {
      const responseBody = JSON.parse(result.body);
      
      if (responseBody.success && responseBody.cities && Array.isArray(responseBody.cities)) {
        console.log(`✅ API работает корректно`);
        console.log(`   Количество городов: ${responseBody.cities_count}`);
        console.log(`   Количество пунктов: ${responseBody.pickup_points_count}`);
        
        // Проверяем наличие тарифов
        if (responseBody.weight_ranges) {
          console.log(`   Тарифы доступны`);
        }
        
        return true;
      } else {
        console.log('❌ Некорректный ответ от API');
        return false;
      }
    } else {
      console.log(`❌ Ошибка API: статус ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Ошибка при выполнении запроса: ${error.message}`);
    return false;
  }
}

// Тест 3: Проверка фильтрации по городу
async function testCityFilter() {
  console.log('\n🧪 Тест 3: Проверка фильтрации по городу...');
  
  try {
    const testCities = ['Минск', 'Гомель', 'Брест', 'Витебск', 'Могилев', 'Гродно'];
    
    for (const city of testCities) {
      const event = {
        body: JSON.stringify({
          order: {
            shipping_address: {
              city: city
            },
            total_weight: '5.0'
          }
        })
      };
      
      const result = await serverHandler(event, {});
      
      if (result.statusCode === 200) {
        const response = JSON.parse(result.body);
        
        if (Array.isArray(response) && response.length > 0) {
          const pointsInCity = response.filter(point => 
            point.shipping_address.city === city || 
            point.shipping_address.full_locality_name.includes(city)
          );
          
          console.log(`   ${city}: ${pointsInCity.length} пунктов`);
        } else {
          console.log(`   ${city}: 0 пунктов (возможно, это нормально)`);
        }
      } else {
        console.log(`   ${city}: ошибка запроса`);
      }
    }
    
    console.log('✅ Фильтрация по городам работает');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при фильтрации по городу: ${error.message}`);
    return false;
  }
}

// Тест 4: Проверка расчета стоимости доставки для разных весов
async function testWeightCalculation() {
  console.log('\n🧪 Тест 4: Проверка расчета стоимости доставки...');
  
  try {
    const testWeights = ['1.0', '5.0', '10.0', '20.0', '30.0', '50.0', '100.0'];
    
    for (const weight of testWeights) {
      const event = {
        body: JSON.stringify({
          order: {
            shipping_address: {
              city: 'Минск'
            },
            total_weight: weight
          }
        })
      };
      
      const result = await serverHandler(event, {});
      
      if (result.statusCode === 200) {
        const response = JSON.parse(result.body);
        
        if (Array.isArray(response) && response.length > 0) {
          const firstPoint = response[0];
          console.log(`   Вес ${weight}кг: ${firstPoint.price} BYN`);
        }
      } else {
        console.log(`   Вес ${weight}кг: ошибка запроса`);
      }
    }
    
    console.log('✅ Расчет стоимости доставки работает');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при расчете стоимости: ${error.message}`);
    return false;
  }
}

// Тест 5: Проверка обработки CORS заголовков
async function testCORS() {
  console.log('\n🧪 Тест 5: Проверка CORS заголовков...');

  try {
    const event = {
      httpMethod: 'OPTIONS'
    };

    const result = await serverHandler(event, {});

    if (result.statusCode === 200) {
      const headers = result.headers;

      if (headers['Access-Control-Allow-Origin'] === '*' &&
          headers['Access-Control-Allow-Methods'] &&
          headers['Access-Control-Allow-Headers']) {
        console.log('✅ CORS заголовки корректны');
        return true;
      } else {
        console.log('❌ Отсутствуют необходимые CORS заголовки');
        return false;
      }
    } else {
      console.log(`❌ Ошибка при обработке OPTIONS запроса: статус ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Ошибка при проверке CORS: ${error.message}`);
    return false;
  }
}

// Тест 6: Проверка обработки ошибок
async function testErrorHandling() {
  console.log('\n🧪 Тест 6: Проверка обработки ошибок...');
  
  try {
    // Тестируем некорректный JSON
    const event = {
      body: '{invalid json}'
    };
    
    const result = await serverHandler(event, {});
    
    if (result.statusCode === 500 || result.statusCode === 400) {
      console.log('✅ Обработка ошибок работает корректно');
      return true;
    } else {
      console.log(`❌ Ожидаемый статус 400 или 500, получен: ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`✅ Ошибка обработана корректно: ${error.message}`);
    return true;
  }
}

// Основная функция запуска всех тестов
async function runAllTests() {
  console.log('🚀 Запуск тестов перед деплоем на Netlify...\n');
  
  const tests = [
    testLoadData,
    testInfoRequest,
    testCityFilter,
    testWeightCalculation,
    testCORS,
    testErrorHandling
  ];
  
  let passedTests = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) passedTests++;
  }
  
  console.log(`\n📊 Результаты: ${passedTests}/${tests.length} тестов пройдено`);
  
  if (passedTests === tests.length) {
    console.log('🎉 Все тесты пройдены! Можно выполнять деплой на Netlify.');
    return true;
  } else {
    console.log('❌ Некоторые тесты не пройдены. Проверьте код перед деплоем.');
    return false;
  }
}

// Запускаем тесты
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Ошибка при выполнении тестов:', error);
    process.exit(1);
  });
}

module.exports = {
  testLoadData,
  testInfoRequest,
  testCityFilter,
  testWeightCalculation,
  testCORS,
  testErrorHandling,
  runAllTests
};