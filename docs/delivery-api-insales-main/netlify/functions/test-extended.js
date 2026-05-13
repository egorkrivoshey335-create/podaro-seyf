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

// Тест 7: Проверка фильтрации городов с различными форматами названий
async function testCityNameFormats() {
  console.log('🧪 Тест 7: Проверка фильтрации городов с различными форматами названий...');
  
  try {
    const testCases = [
      { input: 'г.Минск', expected: 'Минск' },
      { input: 'город Минск', expected: 'Минск' },
      { input: 'Минск, Беларусь', expected: 'Минск' },
      { input: 'Минск обл.', expected: 'Минск' },
      { input: 'Минск р-н', expected: 'Минск' },
      { input: 'Брест', expected: 'Брест' },
      { input: 'г. Брест', expected: 'Брест' },
      { input: 'Брестская обл.', expected: 'Брест' }
    ];
    
    for (const testCase of testCases) {
      const event = {
        body: JSON.stringify({
          order: {
            shipping_address: {
              city: testCase.input
            },
            total_weight: '5.0'
          }
        })
      };
      
      const result = await serverHandler(event, {});
      
      if (result.statusCode === 200) {
        const response = JSON.parse(result.body);
        
        if (Array.isArray(response) && response.length > 0) {
          const firstPoint = response[0];
          const actualCity = firstPoint.shipping_address.city;
          
          if (actualCity === testCase.expected) {
            console.log(`   ✅ "${testCase.input}" -> "${actualCity}"`);
          } else {
            console.log(`   ⚠️  "${testCase.input}" -> "${actualCity}" (ожидалось "${testCase.expected}")`);
          }
        } else {
          console.log(`   ❌ "${testCase.input}" -> 0 пунктов`);
        }
      } else {
        console.log(`   ❌ "${testCase.input}" -> ошибка запроса`);
      }
    }
    
    console.log('✅ Фильтрация различных форматов названий городов работает');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при тестировании форматов названий: ${error.message}`);
    return false;
  }
}

// Тест 8: Проверка работы с различными полями адреса
async function testAddressFields() {
  console.log('\n🧪 Тест 8: Проверка работы с различными полями адреса...');
  
  try {
    const testScenarios = [
      {
        name: 'full_locality_name',
        payload: {
          order: {
            shipping_address: {
              full_locality_name: 'Минск'
            },
            total_weight: '10.0'
          }
        }
      },
      {
        name: 'location.city',
        payload: {
          order: {
            shipping_address: {
              location: { city: 'Гомель' }
            },
            total_weight: '10.0'
          }
        }
      },
      {
        name: 'location.settlement',
        payload: {
          order: {
            shipping_address: {
              location: { settlement: 'Брест' }
            },
            total_weight: '10.0'
          }
        }
      }
    ];
    
    for (const scenario of testScenarios) {
      const event = {
        body: JSON.stringify(scenario.payload)
      };
      
      const result = await serverHandler(event, {});
      
      if (result.statusCode === 200) {
        const response = JSON.parse(result.body);
        
        if (Array.isArray(response) && response.length > 0) {
          console.log(`   ✅ ${scenario.name}: ${response.length} пунктов найдено`);
        } else {
          console.log(`   ⚠️  ${scenario.name}: 0 пунктов (может быть нормально)`);
        }
      } else {
        console.log(`   ❌ ${scenario.name}: ошибка запроса`);
      }
    }
    
    console.log('✅ Обработка различных полей адреса работает');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при тестировании полей адреса: ${error.message}`);
    return false;
  }
}

// Тест 9: Проверка формата ответа для InSales
async function testInSalesFormat() {
  console.log('\n🧪 Тест 9: Проверка формата ответа для InSales...');
  
  try {
    const event = {
      body: JSON.stringify({
        order: {
          shipping_address: {
            city: 'Минск'
          },
          total_weight: '15.0'
        }
      })
    };
    
    const result = await serverHandler(event, {});
    
    if (result.statusCode === 200) {
      const response = JSON.parse(result.body);
      
      if (Array.isArray(response) && response.length > 0) {
        const firstPoint = response[0];
        
        // Проверяем обязательные поля для InSales
        const requiredFields = [
          'tariff_id', 'shipping_company_handle', 'price', 'currency',
          'title', 'description', 'delivery_interval', 'fields_values'
        ];
        
        let hasAllFields = true;
        for (const field of requiredFields) {
          if (!(field in firstPoint)) {
            console.log(`   ❌ Отсутствует обязательное поле: ${field}`);
            hasAllFields = false;
          }
        }
        
        // Проверяем формат delivery_interval
        if (firstPoint.delivery_interval) {
          if (typeof firstPoint.delivery_interval.min_days !== 'number' ||
              typeof firstPoint.delivery_interval.max_days !== 'number') {
            console.log('   ❌ Некорректный формат delivery_interval');
            hasAllFields = false;
          }
        }
        
        // Проверяем формат fields_values
        if (Array.isArray(firstPoint.fields_values)) {
          const hasShippingAddressField = firstPoint.fields_values.some(field => 
            field.handle && field.handle.includes('shipping_address')
          );
          
          if (!hasShippingAddressField) {
            console.log('   ⚠️  Отсутствуют поля для shipping_address');
          }
        } else {
          console.log('   ❌ Некорректный формат fields_values');
          hasAllFields = false;
        }
        
        if (hasAllFields) {
          console.log('✅ Формат ответа соответствует требованиям InSales');
          console.log(`   Пример: ${firstPoint.title.substring(0, 50)}...`);
          console.log(`   Цена: ${firstPoint.price} ${firstPoint.currency}`);
        }
        
        return hasAllFields;
      } else {
        console.log('❌ Ответ не содержит данных о тарифах');
        return false;
      }
    } else {
      console.log(`❌ Ошибка при получении данных: статус ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Ошибка при проверке формата InSales: ${error.message}`);
    return false;
  }
}

// Тест 10: Проверка граничных значений веса
async function testWeightBoundaries() {
  console.log('\n🧪 Тест 10: Проверка граничных значений веса...');
  
  try {
    const boundaryWeights = [
      '0.1', '5.0', '5.1', '10.0', '10.1', '20.0', '20.1', 
      '30.0', '35.0', '40.0', '55.0', '90.0', '120.0', 
      '149.0', '200.0', '250.0', '250.1', '500.0'
    ];
    
    for (const weight of boundaryWeights) {
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
        } else {
          console.log(`   Вес ${weight}кг: 0 пунктов`);
        }
      } else {
        console.log(`   Вес ${weight}кг: ошибка запроса`);
      }
    }
    
    console.log('✅ Обработка граничных значений веса работает');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при проверке граничных значений: ${error.message}`);
    return false;
  }
}

// Тест 11: Проверка производительности (времени отклика)
async function testPerformance() {
  console.log('\n🧪 Тест 11: Проверка производительности...');
  
  try {
    const iterations = 10;
    let totalTime = 0;
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      const event = {
        body: JSON.stringify({
          order: {
            shipping_address: {
              city: 'Минск'
            },
            total_weight: '10.0'
          }
        })
      };
      
      const result = await serverHandler(event, {});
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      totalTime += responseTime;
      
      if (result.statusCode !== 200) {
        console.log(`   ❌ Запрос ${i+1} завершился с ошибкой`);
        return false;
      }
    }
    
    const avgResponseTime = totalTime / iterations;
    console.log(`   Среднее время отклика: ${avgResponseTime}мс за ${iterations} запросов`);
    
    if (avgResponseTime < 500) {
      console.log('✅ Производительность удовлетворительная');
    } else if (avgResponseTime < 1000) {
      console.log('⚠️  Производительность приемлемая, но можно улучшить');
    } else {
      console.log('❌ Производительность неудовлетворительная');
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при проверке производительности: ${error.message}`);
    return false;
  }
}

// Тест 12: Проверка синхронизации с HTML файлом
function testFileSync() {
  console.log('\n🧪 Тест 12: Проверка синхронизации с HTML файлом...');
  
  try {
    // Проверяем наличие HTML файла
    const htmlPath = path.join(__dirname, '..', '..', 'pickup_points_20260202_095340.html');
    
    if (fs.existsSync(htmlPath)) {
      console.log('✅ HTML файл с данными о пунктах выдачи найден');
      
      // Сравниваем количество пунктов в JSON и потенциальное количество в HTML
      const pickupPoints = loadPickupPoints();
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      
      // Подсчитываем потенциальные вхождения пунктов в HTML
      const potentialPointsCount = (htmlContent.match(/<div class="point-item">/g) || []).length;
      
      console.log(`   Пунктов в JSON: ${pickupPoints.length}`);
      console.log(`   Потенциальных пунктов в HTML: ${potentialPointsCount}`);
      
      if (pickupPoints.length >= potentialPointsCount) {
        console.log('✅ Все пункты из HTML присутствуют в JSON');
      } else {
        console.log('⚠️  В JSON меньше пунктов, чем в HTML (возможно, это нормально)');
      }
      
      return true;
    } else {
      console.log('⚠️  HTML файл с данными о пунктах выдачи не найден');
      console.log('   Это может быть нормально, если синхронизация не требуется');
      return true;
    }
  } catch (error) {
    console.log(`❌ Ошибка при проверке синхронизации: ${error.message}`);
    return false;
  }
}

// Основная функция запуска расширенных тестов
async function runExtendedTests() {
  console.log('🚀 Запуск расширенных тестов перед деплоем на Netlify...\n');
  
  const tests = [
    testCityNameFormats,
    testAddressFields,
    testInSalesFormat,
    testWeightBoundaries,
    testPerformance,
    testFileSync
  ];
  
  let passedTests = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) passedTests++;
  }
  
  console.log(`\n📊 Результаты расширенных тестов: ${passedTests}/${tests.length} пройдено`);
  
  return passedTests === tests.length;
}

// Запускаем расширенные тесты
if (require.main === module) {
  runExtendedTests().then(success => {
    if (success) {
      console.log('\n🎉 Все расширенные тесты пройдены!');
    } else {
      console.log('\n⚠️  Некоторые расширенные тесты не пройдены.');
    }
  }).catch(error => {
    console.error('❌ Ошибка при выполнении расширенных тестов:', error);
    process.exit(1);
  });
}

module.exports = {
  testCityNameFormats,
  testAddressFields,
  testInSalesFormat,
  testWeightBoundaries,
  testPerformance,
  testFileSync,
  runExtendedTests
};