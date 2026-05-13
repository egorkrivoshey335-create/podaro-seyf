# Gift Safe

Первый рабочий срез проекта "Забери подарок из сейфа" для InSales.

Что уже есть:

- `backend/` - API для `spin`, `claim`, `my-prize`, `deliver`, admin-endpoint'ы, пул промокодов, JWT, rate limit, cron-expirer, Prisma + PostgreSQL.
- `widget/` - embeddable виджет на Vite + Vanilla JS + GSAP + shadow DOM.
- `admin/` - простая React-админка со входом, таблицей круток, настройками, призами и антифрод-логами.

## Быстрый старт

1. Установить зависимости:

```bash
npm install
```

2. Поднять PostgreSQL:

```bash
docker compose up -d postgres
```

3. Подготовить базу:

```bash
npm run prisma:generate -w backend
npm run prisma:push -w backend
npm run seed -w backend
```

4. Запустить backend:

```bash
npm run dev:backend
```

5. Отдельно открыть локальный предпросмотр виджета:

```bash
npm run dev:widget
```

6. Отдельно открыть админку:

```bash
npm run dev:admin
```

## Переменные окружения

Смотри `.env.example`.

Базовые значения по умолчанию:

- `PORT=3000`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/gift_safe`
- `ADMIN_LOGIN=admin`
- `ADMIN_PASSWORD=admin123`
- `PROMO_ISSUE_MODE=pool`
- `PROMO_PREFIX=COSMO`
- `INSALES_EXTERNAL_DISCOUNT_TOKEN=...`
- `INSALES_WEBHOOK_TOKEN=...`

Для InSales лучше использовать именно `INSALES_SHOP_URL` на домене `*.myinsales.ru`, потому что admin API удобнее и стабильнее вызывать через него.

## FREE_SHIPPING в InSales

Для приза `FREE_SHIPPING` теперь реализован отдельный серверный сценарий без промокода:

1. После `deliver` приз переводится в состояние "готов к авто-применению".
2. InSales в корзине/checkout вызывает внешний discount-hook:

```text
POST https://ваш-домен/api/insales/external-discounts/free-shipping?token=INSALES_EXTERNAL_DISCOUNT_TOKEN
```

3. Backend получает JSON заказа, смотрит `client.id`, `email`, `phone` и `delivery_price`.
4. Если у клиента есть неиспользованный выигрыш `FREE_SHIPPING`, backend возвращает:

```json
{
  "discount": 350,
  "discount_type": "MONEY",
  "title": "Бесплатная доставка за подарок из сейфа"
}
```

5. После оплаченного заказа InSales должен вызвать webhook:

```text
POST https://ваш-домен/api/insales/webhooks/order-status?token=INSALES_WEBHOOK_TOKEN
```

6. Backend помечает конкретный выигрыш как использованный, и на следующий заказ скидка уже не вернётся.

Важно: InSales снижает не саму строку "Доставка", а итог заказа на сумму `delivery_price`. Для покупателя это выглядит как бесплатная доставка, что и требуется по механике.

## Полезные команды

```bash
npm run test -w backend
npm run smoke -w backend
npm run build -w widget
npm run build -w admin
```

Примеры production-конфигов лежат в:

- `deploy/nginx.gift-safe.conf.example`
- `deploy/podaro-seyf.service.example`

## Как встроить виджет

После production-сборки основной файл лежит в `widget/dist/widget.js`.

Целевой вариант в шаблоне магазина:

```html
<script async src="https://gift.example.ru/widget.js"></script>
```

При необходимости можно переопределить конфиг через глобальный объект:

```html
<script>
  window.GIFT_SAFE_CONFIG = {
    apiBaseUrl: "https://gift.example.ru/api",
    assetsBaseUrl: "https://gift.example.ru",
    registerUrl: "/client/new",
  };
</script>
<script async src="https://gift.example.ru/widget.js"></script>
```

## Что осталось подключить до финального продакшена

- реальные ассеты сейфа, фонов и призов;
- настоящее видео открытия сейфа вместо CSS/GSAP fallback-сцены;
- финальная интеграция с InSales по данным конкретного магазина;
- боевые SMTP-шаблоны и тексты писем;
- production-деплой через Nginx / Docker / HTTPS.
