#!/usr/bin/env node

const { runAllTests } = require('./test-local');
const { runExtendedTests } = require('./test-extended');

// Основная функция для запуска всех тестов
async function runDeploymentTests() {
  console.log('🚀 Запуск полного набора тестов перед деплоем на Netlify...\n');
  
  console.log('=========================================');
  console.log('         БАЗОВЫЕ ТЕСТЫ');
  console.log('=========================================\n');
  
  const basicTestsPassed = await runAllTests();
  
  console.log('\n=========================================');
  console.log('       РАСШИРЕННЫЕ ТЕСТЫ');
  console.log('=========================================\n');
  
  const extendedTestsPassed = await runExtendedTests();
  
  console.log('\n=========================================');
  console.log('         ИТОГОВЫЙ РЕЗУЛЬТАТ');
  console.log('=========================================\n');
  
  if (basicTestsPassed && extendedTestsPassed) {
    console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
    console.log('✅ Можно безопасно выполнять деплой на Netlify');
    process.exit(0);
  } else {
    console.log('❌ НЕКОТОРЫЕ ТЕСТЫ НЕ ПРОЙДЕНЫ!');
    console.log('❌ Не рекомендуется выполнять деплой на Netlify');
    process.exit(1);
  }
}

// Запускаем все тесты
runDeploymentTests().catch(error => {
  console.error('❌ Критическая ошибка при выполнении тестов:', error);
  process.exit(1);
});