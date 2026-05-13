#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Проверяем наличие package.json в корне проекта
const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');

function checkDependencies() {
  console.log('🔍 Проверка зависимостей...\n');
  
  try {
    // Читаем package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Проверяем наличие скриптов тестирования
    if (packageJson.scripts) {
      if (packageJson.scripts.test) {
        console.log('✅ Скрипт "test" найден в package.json');
      } else {
        console.log('⚠️  Скрипт "test" не найден в package.json');
        console.log('   Рекомендуется добавить: "test": "node netlify/functions/run-tests.js"');
      }
      
      if (packageJson.scripts.prebuild) {
        console.log('✅ Скрипт "prebuild" найден в package.json');
      } else {
        console.log('⚠️  Скрипт "prebuild" не найден в package.json');
        console.log('   Рекомендуется добавить: "prebuild": "npm test"');
      }
    } else {
      console.log('⚠️  В package.json отсутствует раздел "scripts"');
    }
    
    // Проверяем наличие зависимостей
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    
    console.log('\n📦 Установленные зависимости:');
    
    // Проверяем наличие необходимых зависимостей для тестирования
    const requiredDeps = [];
    
    if (Object.keys(dependencies).length === 0 && Object.keys(devDependencies).length === 0) {
      console.log('⚠️  Не найдено установленных зависимостей');
      console.log('   Выполняем инициализацию package.json...');
      
      // Создаем минимальный package.json если его нет
      const minimalPackageJson = {
        name: "delivery-api-service",
        version: "1.0.0",
        description: "API service for delivery points",
        main: "server.js",
        scripts: {
          test: "node netlify/functions/run-tests.js"
        },
        keywords: ["delivery", "api", "netlify"],
        author: "Auto-generated",
        license: "MIT"
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackageJson, null, 2));
      console.log('✅ Создан минимальный package.json');
    }
    
    console.log('✅ Проверка зависимостей завершена');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('⚠️  Файл package.json не найден');
      console.log('   Создаем минимальный package.json...');
      
      // Создаем минимальный package.json
      const minimalPackageJson = {
        name: "delivery-api-service",
        version: "1.0.0",
        description: "API service for delivery points",
        main: "server.js",
        scripts: {
          test: "node netlify/functions/run-tests.js"
        },
        keywords: ["delivery", "api", "netlify"],
        author: "Auto-generated",
        license: "MIT"
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackageJson, null, 2));
      console.log('✅ Создан минимальный package.json');
      return true;
    } else {
      console.log(`❌ Ошибка при проверке зависимостей: ${error.message}`);
      return false;
    }
  }
}

function runTests() {
  console.log('\n🧪 Запуск тестов...');
  
  try {
    // Запускаем тесты
    const result = execSync('node run-tests.js', {
      cwd: __dirname,
      stdio: 'inherit',
      encoding: 'utf8'
    });
    
    console.log('✅ Тесты выполнены успешно');
    return true;
  } catch (error) {
    console.log(`❌ Ошибка при выполнении тестов: ${error.status}`);
    return false;
  }
}

function main() {
  console.log('🔧 Подготовка к тестированию перед деплоем...\n');
  
  const depsOk = checkDependencies();
  
  if (depsOk) {
    console.log('\n✅ Подготовка завершена, запускаем тесты...');
    runTests();
  } else {
    console.log('\n❌ Ошибка подготовки, тесты не запущены');
    process.exit(1);
  }
}

// Запускаем основную функцию
if (require.main === module) {
  main();
}