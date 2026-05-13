# 🚀 Инструкция по развертыванию на GitHub

## Часть 1: Создание репозитория GitHub

### Шаг 1: Создание нового репозитория

1. **Войдите в GitHub** по адресу https://github.com
2. **Нажмите "+"** в правом верхнем углу → "New repository"
3. **Заполните информацию**:
   - **Repository name**: `delivery-api-insales`
   - **Description**: `External delivery API service for InSales with pickup points and weight-based pricing`
   - **Visibility**: выберите "Public" (для бесплатного GitHub Pages)
   - **⚠️ НЕ ставьте галочку** "Add a README file", "Add .gitignore", "Choose a license" (у нас уже есть эти файлы)
4. **Нажмите "Create repository"**

### Шаг 2: Загрузка файлов в репозиторий

#### Вариант A: Через веб-интерфейс GitHub

1. **На странице созданного репозитория** нажмите "uploading an existing file"
2. **Перетащите все файлы** из папки `delivery-api-service` в область загрузки
3. **В поле "Commit message"** введите: `Initial commit - Delivery API Service for InSales`
4. **Нажмите "Commit changes"**

#### Вариант B: Через Git CLI (если установлен)

```bash
# Клонируйте репозиторий
git clone https://github.com/ваш-username/delivery-api-insales.git
cd delivery-api-insales

# Скопируйте все файлы из папки delivery-api-service в корень клонированного репозитория
# (кроме самой папки delivery-api-service)

# Добавьте файлы в Git
git add .
git commit -m "Initial commit - Delivery API Service for InSales"
git push origin main
```

## Часть 2: Настройка GitHub Pages

### Включение GitHub Pages

1. **Перейдите в настройки репозитория**: Settings → Pages
2. **Источник деплоя**: выберите "Deploy from a branch"
3. **Branch**: выберите "main" и папку "/ (root)"
4. **Нажмите "Save"**

### Проверка развертывания

GitHub автоматически создаст сайт по адресу:
**`https://ваш-username.github.io/delivery-api-insales`**

В течение нескольких минут вы увидите:
- ✅ Your site is published at: `https://ваш-username.github.io/delivery-api-insales`

## Часть 3: Настройка поддомена на hostfly.by

### Создание CNAME записи

1. **В панели hostfly.by** перейдите в "Управление доменом"
2. **Расширенный DNS редактор**
3. **Добавьте CNAME запись**:
   - **Имя**: `delivery-api` (без точки)
   - **Значение**: `ваш-username.github.io`
   - **TTL**: 3600

4. **В GitHub Pages настройках**:
   - Settings → Pages → Custom domain: `delivery-api.ваш-домен.ru`
   - Включите "Enforce HTTPS"

## Часть 4: Тестирование API

### Проверка работы сервиса

После развертывания ваш API будет доступен по адресу:
**`https://delivery-api.ваш-домен.ru`**

#### Тестовые запросы:

```bash
# 1. Проверка состояния
curl https://delivery-api.ваш-домен.ru/health

# 2. Получение пунктов выдачи
curl https://delivery-api.ваш-домен.ru/pickup-points

# 3. Расчет доставки курьером
curl -X POST https://delivery-api.ваш-домен.ru/api/delivery/calculate \
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
  }'
```

## Часть 5: Интеграция с InSales

### Шаг 1: Создание внешнего способа доставки

1. **Войдите в панель администратора InSales**
2. **Настройки → Способы доставки**
3. **Нажмите "Добавить способ доставки"**
4. **Выберите "Внешний способ доставки"**

### Шаг 2: Настройка курьерской доставки

**Параметры для курьерской доставки:**

```xml
<delivery_variant>
  <title>Автолайт Экспресс (Курьер)</title>
  <type>DeliveryVariant::External</type>
  <url>https://delivery-api.ваш-домен.ru/api/delivery/calculate</url>
  <api_version>v2</api_version>
  <description>Курьерская доставка по Беларуси Автолайт Экспресс</description>
  <position>1</position>
  <delivery_locations_attributes type="array">
    <delivery_location>
      <country>BY</country>
    </delivery_location>
  </delivery_locations_attributes>
  <charge_up_to>0</charge_up_to>
  <customer_pickup>false</customer_pickup>
</delivery_variant>
```

### Шаг 3: Настройка доставки в пункты выдачи

**Параметры для пунктов выдачи:**

```xml
<delivery_variant>
  <title>Автолайт Экспресс (Пункты выдачи)</title>
  <type>DeliveryVariant::PickUp</type>
  <description>Доставка в пункты выдачи Автолайт Экспресс</description>
  <position>2</position>
  <pick_up_sources_attributes type="array">
    <pick_up_source>
      <title>Пункты выдачи Автолайт Экспресс</title>
      <http_method>POST</http_method>
      <url>https://delivery-api.ваш-домен.ru/api/pickup-points</url>
      <point_info_url>https://delivery-api.ваш-домен.ru/api/pickup-point/calculate</point_info_url>
    </pick_up_source>
  </pick_up_sources_attributes>
  <delivery_locations_attributes type="array">
    <delivery_location>
      <country>BY</country>
    </delivery_location>
  </delivery_locations_attributes>
  <charge_up_to>0</charge_up_to>
  <customer_pickup>true</customer_pickup>
</delivery_variant>
```

### Шаг 4: Настройка через API InSales

Если хотите создать через API, используйте этот код:

```python
import requests

# Настройки API InSales
API_URL = "https://ваш-магазин.insales.ru"
API_TOKEN = "ваш-api-токен"

# Создание курьерской доставки
courier_data = {
    "delivery_variant": {
        "title": "Автолайт Экспресс (Курьер)",
        "type": "DeliveryVariant::External",
        "url": "https://delivery-api.ваш-домен.ru/api/delivery/calculate",
        "api_version": "v2",
        "description": "Курьерская доставка по Беларуси",
        "delivery_locations_attributes": [
            {"country": "BY"}
        ]
    }
}

response = requests.post(
    f"{API_URL}/admin/delivery_variants.json",
    json=courier_data,
    headers={
        "X-InSales-Account-Id": "ID-аккаунта",
        "X-InSales-Api-Key": API_TOKEN
    }
)

# Создание доставки в пункты выдачи
pickup_data = {
    "delivery_variant": {
        "title": "Автолайт Экспресс (ПВЗ)",
        "type": "DeliveryVariant::PickUp",
        "description": "Доставка в пункты выдачи",
        "pick_up_sources_attributes": [
            {
                "title": "ПВЗ Автолайт",
                "http_method": "POST",
                "url": "https://delivery-api.ваш-домен.ru/api/pickup-points",
                "point_info_url": "https://delivery-api.ваш-домен.ru/api/pickup-point/calculate"
            }
        ],
        "delivery_locations_attributes": [
            {"country": "BY"}
        ]
    }
}

response = requests.post(
    f"{API_URL}/admin/delivery_variants.json",
    json=pickup_data,
    headers={
        "X-InSales-Account-Id": "ID-аккаунта",
        "X-InSales-Api-Key": API_TOKEN
    }
)
```

## Часть 6: Автоматический деплой (GitHub Actions)

### Настройка автоматического деплоя

1. **Перейдите в Settings** вашего репозитория
2. **Secrets and variables** → **Actions**
3. **Добавьте Secrets** (опционально):
   - `NETLIFY_AUTH_TOKEN` (если используете Netlify)
   - `NETLIFY_SITE_ID` (ID вашего сайта Netlify)

### Workflow файл

Уже создан файл `.github/workflows/deploy.yml` который будет:
- Автоматически деплоить при каждом push в main
- Создавать GitHub Pages версию
- (Опционально) деплоить на Netlify

## Часть 7: Мониторинг и обслуживание

### Проверка работы

```bash
# Ежедневная проверка health endpoint
curl -f https://delivery-api.ваш-домен.ru/health || echo "Сервис недоступен"

# Проверка времени ответа
curl -w "@curl-format.txt" -o /dev/null -s https://delivery-api.ваш-домен.ru/health
```

### Логирование

Все запросы логируются и доступны через GitHub Actions или в консоли при локальном запуске.

## 🆘 Устранение неполадок

### Проблема: GitHub Pages не работает
**Решение:**
1. Проверьте, что репозиторий публичный
2. Убедитесь, что GitHub Pages включен в настройках
3. Подождите до 10 минут после изменения настроек

### Проблема: Поддомен не работает
**Решение:**
1. Проверьте CNAME запись: должна указывать на `ваш-username.github.io`
2. Убедитесь, что Custom domain настроен в GitHub Pages
3. Подождите до 48 часов для распространения DNS

### Проблема: API возвращает ошибки
**Решение:**
1. Проверьте логи GitHub Actions
2. Убедитесь, что все файлы загружены в репозиторий
3. Проверьте, что сервис доступен по базовому URL GitHub Pages

## ✅ Чек-лист завершения

- [ ] Репозиторий создан на GitHub
- [ ] Файлы загружены в репозиторий
- [ ] GitHub Pages настроен и работает
- [ ] Поддомен на hostfly.by настроен
- [ ] API сервис доступен по адресу поддомена
- [ ] Тестовые запросы проходят успешно
- [ ] Способы доставки созданы в InSales
- [ ] Интеграция протестирована в корзине

---

**🎉 Поздравляем! Ваш API сервис доставки готов к работе с InSales!**

Для получения помощи обращайтесь к документации README.md или создавайте issues в репозитории GitHub.