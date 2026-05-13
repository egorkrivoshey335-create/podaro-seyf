# Тестирование перед деплоем на Netlify

## Описание

Этот раздел содержит тесты для проверки работоспособности API перед деплоем на Netlify. Тесты проверяют:

1. Загрузку данных из JSON файлов (ПВЗ и цены)
2. Работу API с различными типами запросов
3. Расчет стоимости для курьерской доставки и ПВЗ
4. Фильтрацию по городам
5. Обработку CORS заголовков
6. Обработку ошибок
7. Формат ответа для InSales

## 📁 Структура тестов

### Файлы тестов

| Файл | Описание | Приоритет |
|------|----------|-----------|
| `test-local.js` | Базовые тесты | Обязательно |
| `test-extended.js` | Расширенные тесты | Рекомендуется |
| `run-tests.js` | Запуск всех тестов | - |
| `prepare-and-test.js` | Подготовка и тестирование | CI/CD |

## 🚀 Запуск тестов

### Локальный запуск всех тестов

```bash
cd netlify/functions
node run-tests.js
```

### Запуск базовых тестов

```bash
cd netlify/functions
node test-local.js
```

### Запуск расширенных тестов

```bash
cd netlify/functions
node test-extended.js
```

### Скрипты для разных ОС

```bash
# Windows
run-tests.bat

# Linux/Mac
./run-tests.sh
```

## 📋 Что проверяют тесты

### Базовые тесты (test-local.js)

#### 1. Загрузка данных
- ✅ Загрузка пунктов выдачи из JSON
- ✅ Загрузка цен курьерской доставки
- ✅ Загрузка цен ПВЗ
- ✅ Проверка структуры данных

#### 2. API информация
- ✅ Проверка пинга
- ✅ Получение списка городов
- ✅ Проверка версии API

#### 3. Расчет стоимости
- ✅ Курьерская доставка (разные веса)
- ✅ Доставка в ПВЗ (разные веса)
- ✅ Граничные значения веса

#### 4. CORS
- ✅ Обработка OPTIONS запросов
- ✅ Наличие заголовков CORS

#### 5. Обработка ошибок
- ✅ Некорректный JSON
- ✅ Отсутствие обязательных полей
- ✅ Неверный формат запроса

### Расширенные тесты (test-extended.js)

#### 1. Фильтрация городов
- ✅ Точное совпадение
- ✅ Частичное совпадение
- ✅ Разные форматы названий (г. Минск, Минск, город Минск)
- ✅ Города с ошибками

#### 2. Форматы адресов
- ✅ Полный адрес
- ✅ Только город
- ✅ С префиксами (г., город)
- ✅ С области и районом

#### 3. Производительность
- ✅ Время ответа API
- ✅ Время расчета для множества ПВЗ
- ✅ Нагрузочное тестирование

#### 4. Граничные значения
- ✅ Вес = 0
- ✅ Вес < 0
- ✅ Очень большой вес (> 250 кг)
- ✅ Некорректный тип веса

## 🔧 Создание новых тестов

### Пример теста

```javascript
// test-example.js
const { handler } = require('./server');

async function testCourierPricing() {
  console.log('🧪 Тест: Расчет курьерской доставки...');
  
  const event = {
    httpMethod: 'POST',
    path: '/courier',
    body: JSON.stringify({ weight: 2.5 })
  };
  
  const result = await handler(event, {});
  
  if (result.statusCode === 200) {
    const body = JSON.parse(result.body);
    
    if (body.price === 14.70 && body.currency === 'BYN') {
      console.log('✅ Цена расчитана корректно');
      return true;
    } else {
      console.log(`❌ Некорректная цена: ${body.price}`);
      return false;
    }
  } else {
    console.log(`❌ Ошибка API: ${result.statusCode}`);
    return false;
  }
}

// Запуск
if (require.main === module) {
  testCourierPricing().catch(console.error);
}

module.exports = { testCourierPricing };
```

## 📊 Интерпретация результатов

### Вывод тестов

```
🚀 Запуск тестов...

🧪 Тест 1: Загрузка данных...
✅ ПВЗ загружены: 6 пунктов
✅ Цены курьерской доставки загружены
✅ Цены ПВЗ загружены

🧪 Тест 2: API информация...
✅ Версия API: 2.2.0
✅ Городов: 6

🧪 Тест 3: Расчет курьерской доставки...
✅ Вес 1кг: 12.90 BYN
✅ Вес 2.5кг: 14.70 BYN
✅ Вес 10кг: 21.60 BYN

📊 Результаты: 6/6 тестов пройдено
🎉 Все тесты пройдены! Можно деплоить.
```

### Уровни прохождения

| Уровень | Описание | Действие |
|---------|----------|----------|
| 🟢 Зеленый | Все обязательные тесты пройдены | Деплой разрешен |
| 🟡 Желтый | Есть предупреждения | Деплой возможен, но проверьте |
| 🔴 Красный | Обязательные тесты не пройдены | Деплой запрещен |

## 🔗 Интеграция с CI/CD

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: cd netlify/functions && node run-tests.js
```

### Netlify

```toml
# netlify.toml
[build]
  command = "cd netlify/functions && node run-tests.js && cd ../.."

[context.deploy-preview]
  command = "cd netlify/functions && node run-tests.js"
```

### GitLab CI

```yaml
test:
  stage: test
  image: node:16
  script:
    - npm install
    - cd netlify/functions
    - node run-tests.js
  only:
    - merge_requests
    - master
```

## 🆘 Устранение проблем

### Тест не проходит: "Цены не загружены"

**Причина:** Отсутствуют или повреждены JSON файлы цен

**Решение:**
```bash
# Проверить наличие файлов
ls -la *.json

# Проверить валидность JSON
node -e "JSON.parse(require('fs').readFileSync('courier-pricing.json'))"
node -e "JSON.parse(require('fs').readFileSync('pickup-pricing.json'))"

# Пересоздать файлы из примеров
```

### Тест не проходит: "CORS ошибка"

**Причина:** Неправильная обработка OPTIONS запроса

**Решение:**
```javascript
// Проверьте handler
if (event.httpMethod === 'OPTIONS') {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: ''
  };
}
```

### Тест не проходит: "Некорректный расчет цены"

**Причина:** Изменилась структура файла цен

**Решение:**
1. Проверьте формат `weight_pricing` (должен быть массивом)
2. Проверьте типы данных (max_weight - число, price - число)
3. Убедитесь, что массив отсортирован по max_weight

## 📝 Чек-лист перед деплоем

- [ ] Все JSON файлы валидны
- [ ] Базовые тесты пройдены
- [ ] Расширенные тесты пройдены (рекомендуется)
- [ ] CORS работает корректно
- [ ] Цены соответствуют ожидаемым
- [ ] ПВЗ загружаются корректно
- [ ] Нет ошибок в консоли

## 📞 Поддержка

Если тесты не проходят:

1. Проверьте версию Node.js (16+)
2. Удалите `node_modules` и установите заново
3. Проверьте все JSON файлы на валидность
4. Запустите тесты по отдельности для выявления проблемы
5. Проверьте логи ошибок
