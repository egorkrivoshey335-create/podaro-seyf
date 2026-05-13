#!/bin/bash

# Скрипт для локального развертывания Delivery API Service
# Автор: MiniMax Agent

set -e

echo "🚀 Развертывание Delivery API Service для InSales"
echo "=================================================="

# Проверка установки Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js версии 16 или выше."
    echo "📥 Скачать можно с: https://nodejs.org/"
    exit 1
fi

# Проверка версии Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Требуется Node.js версии 16 или выше. Текущая версия: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) установлен"

# Создание необходимых папок
echo "📁 Создание директорий..."
mkdir -p logs
mkdir -p data
mkdir -p backups

# Установка зависимостей
echo "📦 Установка зависимостей npm..."
npm install

# Создание файла .env если его нет
if [ ! -f .env ]; then
    echo "⚙️  Создание файла конфигурации .env..."
    cat > .env << EOL
# Конфигурация Delivery API Service
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Настройки базы данных
DATABASE_PATH=./data/pickup-points.db

# Настройки безопасности
CORS_ORIGIN=*

# Настройки API
API_VERSION=v2
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOL
    echo "✅ Файл .env создан"
else
    echo "✅ Файл .env уже существует"
fi

# Проверка доступности порта
PORT=$(grep PORT .env | cut -d'=' -f2)
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Внимание: Порт $PORT уже используется!"
    echo "   Завершите процесс или измените порт в файле .env"
    exit 1
fi

# Создание тестового скрипта
echo "🧪 Создание тестовых скриптов..."
cat > test-api.sh << 'EOL'
#!/bin/bash

API_URL="http://localhost:3000"

echo "🧪 Тестирование Delivery API Service"
echo "==================================="

# Тест health check
echo -n "1. Health Check: "
if curl -s "$API_URL/health" > /dev/null; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

# Тест получения пунктов выдачи
echo -n "2. Pickup Points: "
if curl -s "$API_URL/pickup-points" | grep -q "points"; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

# Тест расчета доставки
echo -n "3. Delivery Calculation: "
response=$(curl -s -X POST "$API_URL/api/delivery/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "order": {
      "total_weight": 2.5,
      "items_price": 150.00
    },
    "address": {
      "city": "Минск",
      "full_locality_name": "г.Минск"
    }
  }')

if echo "$response" | grep -q "price"; then
    echo "✅ OK"
else
    echo "❌ FAILED"
fi

echo ""
echo "📊 Детальные результаты:"
echo "------------------------"
curl -s "$API_URL/health" | jq '.' 2>/dev/null || curl -s "$API_URL/health"

EOL

chmod +x test-api.sh

# Создание скрипта запуска в production
echo "🚀 Создание скрипта запуска..."
cat > start-production.sh << EOL
#!/bin/bash

echo "🚀 Запуск Delivery API Service в production режиме"

# Загрузка конфигурации
export NODE_ENV=production
export LOG_LEVEL=info

# Проверка порта
if lsof -Pi :\$(grep PORT .env | cut -d'=' -f2) -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Порт уже используется!"
    exit 1
fi

# Запуск с перенаправлением логов
nohup npm start > logs/app.log 2>&1 &

echo "✅ Сервис запущен в фоне"
echo "📊 Логи: tail -f logs/app.log"
echo "🌐 Health check: http://localhost:\$(grep PORT .env | cut -d'=' -f2)/health"
echo "📍 API Docs: http://localhost:\$(grep PORT .env | cut -d'=' -f2)/"

EOL

chmod +x start-production.sh

# Создание systemd сервиса (для Linux)
echo "🔧 Создание systemd сервиса..."
sudo tee /etc/systemd/system/delivery-api.service > /dev/null << EOL
[Unit]
Description=Delivery API Service for InSales
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=delivery-api

# Логи
StandardOutput=append:$(pwd)/logs/service.log
StandardError=append:$(pwd)/logs/service-error.log

[Install]
WantedBy=multi-user.target
EOL

# Создание скрипта для полной установки
echo "📋 Создание полного скрипта установки..."
cat > setup-complete.sh << 'EOL'
#!/bin/bash

echo "🏗️  Полная установка Delivery API Service"

# Обновление системных пакетов
echo "📦 Обновление пакетов..."
sudo apt update

# Установка Node.js (если не установлен)
if ! command -v node &> /dev/null; then
    echo "📥 Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Установка PM2 для управления процессами
if ! command -v pm2 &> /dev/null; then
    echo "⚙️  Установка PM2..."
    sudo npm install -g pm2
fi

# Создание скрипта запуска с PM2
echo "🔄 Создание PM2 конфигурации..."
cat > ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'delivery-api',
    script: 'server.js',
    cwd: '$(pwd)',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOL

# Команды для запуска
echo ""
echo "✅ Установка завершена!"
echo ""
echo "🚀 Команды для управления сервисом:"
echo "  - Запуск:         pm2 start ecosystem.config.js"
echo "  - Остановка:      pm2 stop delivery-api"
echo "  - Перезапуск:     pm2 restart delivery-api"
echo "  - Мониторинг:     pm2 monit"
echo "  - Логи:          pm2 logs delivery-api"
echo ""
echo "🔧 Созданные файлы:"
echo "  - ecosystem.config.js  (конфигурация PM2)"
echo "  - start-production.sh  (запуск в production)")
echo "  - test-api.sh         (тестирование API)"
echo ""

EOL

chmod +x setup-complete.sh

# Проверка установки
echo "🔍 Проверка установки..."
npm list --depth=0

echo ""
echo "🎉 Установка завершена!"
echo "========================"
echo ""
echo "📋 Следующие шаги:"
echo "1. Отредактируйте файл .env при необходимости"
echo "2. Запустите тест: ./test-api.sh"
echo "3. Запустите в production: ./start-production.sh"
echo "4. Настройте интеграцию с InSales"
echo ""
echo "🌐 Доступные endpoints:"
echo "  - http://localhost:3000/                    (главная страница)"
echo "  - http://localhost:3000/health             (проверка состояния)"
echo "  - http://localhost:3000/pickup-points      (пункты выдачи)"
echo ""
echo "📚 Документация в файле README.md"
echo ""
echo "🆘 Для помощи:"
echo "  - Логи: tail -f logs/app.log"
echo "  - Тест: ./test-api.sh"
echo "  - Документация: README.md"

EOL

chmod +x start-production.sh

echo ""
echo "🎉 Настройка завершена!"
echo "========================"
echo ""
echo "📁 Созданные файлы:"
echo "  ✅ package.json         (зависимости проекта)"
echo "  ✅ server.js            (основной API сервер)"
echo "  ✅ README.md            (документация)"
echo "  ✅ .gitignore          (игнорируемые файлы)"
echo "  ✅ netlify.toml        (конфигурация Netlify)"
echo "  ✅ Dockerfile          (конфигурация Docker)"
echo "  ✅ vercel.json         (конфигурация Vercel)"
echo "  ✅ .github/workflows/  (автоматический деплой)"
echo "  ✅ SETUP_SUBDOMAIN.md  (инструкция настройки поддомена)"
echo "  ✅ deploy.sh           (скрипт развертывания)"
echo ""
echo "🚀 Для запуска:"
echo "1. Локально:     npm run dev"
echo "2. Production:   ./start-production.sh"
echo "3. Тест API:     ./test-api.sh"
echo ""
echo "📋 Для интеграции с InSales используйте:"
echo "   - Курьерская доставка: POST /api/delivery/calculate"
echo "   - Пункты выдачи:       POST /api/pickup-points"
echo "   - Расчет пункта:       POST /api/pickup-point/calculate"