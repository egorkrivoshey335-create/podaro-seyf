# 🎁 ТЗ: Виджет «Забери подарок из сейфа» для интернет-магазина на InSales

> **Это техническое задание для разработчика (тебя, Cursor + GPT-5).**
> Прочитай его полностью, не торопись писать код. В конце есть блок «ВОПРОСЫ ПЕРЕД СТАРТОМ» — задай их заказчику и дождись ответов, прежде чем что-то генерировать.
>
> **ОБЯЗАТЕЛЬНО:** для любой актуальной документации по библиотекам, фреймворкам и API (Express, Prisma, Vite, React, Tailwind, FingerprintJS, Nodemailer и др.) используй **MCP context7**. Не выдумывай сигнатуры API из головы, не используй устаревшие версии — всегда сверяйся через context7. Это критично.
>
> Для документации **InSales API** заказчик предоставит её сам (отрывки или ссылки). Базовая точка входа: `https://api.insales.ru/`. Не пытайся угадать эндпоинты InSales — если чего-то не хватает, спрашивай у заказчика.

---

## 1. Бизнес-контекст (зачем это нужно)

Магазин работает на платформе **InSales** (SaaS-конструктор интернет-магазинов с шаблонной системой Liquid). Цель — увеличить конверсию посетителя в зарегистрированного клиента через геймификацию.

**Механика для пользователя:**
1. Гость заходит на сайт.
2. Через 7 секунд всплывает модалка «Забери подарок из сейфа».
3. Он нажимает «Открыть сейф» → запускается заранее заготовленное **видео открытия сейфа** (со звуком, без интерфейса плеера) → видео доигрывает до конца и замирает на последнем кадре.
4. Поверх последнего кадра появляется приз (картинка + название).
5. Чтобы забрать — нужно зарегистрироваться (открывается штатная страница регистрации InSales в новой вкладке).
6. После регистрации, при возврате на сайт, виджет автоматически узнаёт клиента, привязывает к нему ранее выигранный приз и предлагает ввести данные для получения.
7. У клиента 24 часа, чтобы забрать — иначе приз сгорает.

**Главная фишка:** 100% выигрыш — каждый получает что-то.

---

## 2. Что важно понять про InSales (платформа-приёмник)

InSales — это **закрытая SaaS-платформа**. Мы НЕ имеем прямого доступа к её серверу. Что мы можем:

1. **Вставить `<script>`** в шаблон магазина (одну строку). Этот скрипт грузится с **нашего собственного сервера на отдельном поддомене** (`gift.example.ru`).
2. **С фронта получить данные авторизованного клиента** через JSON-эндпоинт самой платформы:
   ```js
   fetch('/client_account/contacts.json', { credentials: 'include' })
   ```
   Возвращает `{id, name, email, phone, ...}` если клиент залогинен, иначе ошибку. Это работает на любой странице магазина.
3. **С нашего бэкенда обращаться к InSales Admin API** (`https://api.insales.ru/`) по HTTP Basic Auth с API-ключом магазина — для начисления бонусов, выдачи промокодов и т.п. Заказчик предоставит документацию по нужным эндпоинтам.

**Всё хранение данных, логика, антифрод, админка — на нашей стороне.** InSales только источник данных о клиенте и приёмник команд через API.

---

## 3. Архитектура решения (с высоты птичьего полёта)

```
┌──────────────────────────┐         ┌──────────────────────────────────┐
│ Магазин на InSales       │         │ Наш сервер (gift.example.ru)     │
│ (mystore.ru)             │         │ ─────────────────────────────    │
│                          │         │                                  │
│ В шаблон вставлено:      │ ───────►│ Nginx (HTTPS):                   │
│ <script async            │  GET    │   /widget.js → статика виджета   │
│   src="https://          │         │   /assets/*  → видео, картинки   │
│   gift.example.ru/       │         │   /api/*     → backend (Node.js) │
│   widget.js"></script>   │         │   /admin     → SPA админки       │
│                          │         │                                  │
│ /client_account/         │         │ Backend (Node.js + Express):     │
│   contacts.json          │◄────────│   - крутка / claim / deliver     │
│   (берём данные клиента) │  POST   │   - антифрод                     │
│                          │         │   - интеграция с InSales API     │
│                          │  ──────►│   - админка (JWT)                │
│                          │         │                                  │
└──────────────────────────┘         │ PostgreSQL (хранение)            │
                                     │ Redis (опц., rate-limit)         │
                                     │                                  │
                                     │ Исходящие:                       │
                                     │   - InSales Admin API            │
                                     │   - SMTP (письма с призами)      │
                                     └──────────────────────────────────┘
```

---

## 4. Ключевые подходы и принципы (это важно понять до кода)

### 4.1 Идентификация гостя — через `guestId`, не через email

**Проблема:** гость крутит сейф ДО регистрации. Как потом понять, что это тот же человек, который зарегистрировался?

**Решение:** при первом визите генерируем `guestId` (UUID v4) и сохраняем его одновременно в:
- `localStorage` (основное)
- `cookie` с истечением 365 дней (резерв на случай очистки localStorage)

Этот `guestId` уходит в наш бэкенд при крутке. После регистрации клиент возвращается на сайт → виджет читает `guestId` из локального хранилища → отправляет в `/api/claim` вместе с `clientId` (полученным из `/client_account/contacts.json`) → бэкенд связывает Spin и клиента.

**Email НЕ просим у гостя.** Это лишний барьер. Связка идёт через `guestId`.

### 4.2 Антифрод — многослойный, но не паранойя

Слой 1 — **guestId** (cookie + localStorage). Отсечёт 90% обычных людей.
Слой 2 — **fingerprint браузера** (FingerprintJS open-source). Подделать сложно.
Слой 3 — **IP-лимит**: не более 5 круток с одного IP за 24 часа (мягкий, чтобы офисы не страдали).
Слой 4 — **при регистрации**: проверяем, что этот email/телефон/clientId ещё не получал приз.

Все блокировки логируем в таблицу `AntifraudLog` — заказчик хочет видеть это в админке.

### 4.3 Логика выбора приза — ТОЛЬКО на сервере

Веса призов **никогда не отдаются на фронт**. Иначе через DevTools накрутят себе джекпот.

Фронт только запускает видео и показывает то, что сказал сервер.

### 4.4 Видео сейфа вместо Lottie (важное изменение!)

Заказчик подготовил **готовое видео открытия сейфа** (mp4/webm) со звуком. Используем его, а НЕ Lottie.

Требования к воспроизведению:
- Включить звук (`muted=false`), но из-за политики автоплея в браузерах **видео запускается только по клику пользователя** на кнопку «Открыть сейф» — это легитимный жест, autoplay со звуком разрешён.
- Скрыть весь UI плеера: `controls={false}`, `disablePictureInPicture`, `controlsList="nodownload noplaybackrate nofullscreen"`.
- Запретить взаимодействие (`pointer-events: none` на самом video, контейнер ловит клики).
- После окончания (`onended`) — кадр замирает на последнем (это произойдёт само, без `loop`).
- Сверху последнего кадра плавно появляется блок с призом (fade-in 400ms).
- Видео грузится с нашего поддомена `gift.example.ru/assets/safe-open.mp4`.
- Обеспечить два формата: `.mp4` (H.264) и `.webm` (VP9) — для совместимости.
- На мобильных — атрибут `playsinline` обязателен (иначе iOS откроет полноэкранно).

```html
<video
  id="safe-video"
  src="https://gift.example.ru/assets/safe-open.mp4"
  preload="auto"
  playsinline
  disablePictureInPicture
  controlsList="nodownload noplaybackrate nofullscreen"
  style="pointer-events: none; width: 100%;"
></video>
```

```js
const video = document.getElementById('safe-video');
video.muted = false;
video.currentTime = 0;
await video.play();
video.addEventListener('ended', () => {
  showPrize(prizeData); // плавно показываем приз поверх
}, { once: true });
```

### 4.5 Виджет = одна строка `<script>` в шаблоне InSales

Заказчик не хочет лезть в шаблоны InSales каждый раз. Вставка — один раз:

```html
<script async src="https://gift.example.ru/widget.js"></script>
```

Всё остальное (CSS, видео, картинки призов, обращения к API) — скрипт подтягивает сам с нашего поддомена. Любые правки делаем у себя, заказчику ничего перевыкатывать не надо.

---

## 5. Технологический стек

**Перед использованием любой библиотеки — сверься с context7 на актуальную версию и API!**

### Backend
- **Node.js 20+** (LTS)
- **Express 4.x** — фреймворк
- **Prisma 5.x** — ORM + миграции
- **PostgreSQL 15+** — основная БД
- **Zod** — валидация входящих данных
- **bcrypt** — хеши паролей админов
- **jsonwebtoken** — JWT для админки
- **express-rate-limit** — rate limit
- **pino** + **pino-pretty** — логирование
- **Nodemailer** — отправка email
- **node-cron** — крон для пометки EXPIRED призов

### Widget (внедряется в магазин)
- **Vanilla JS (ES2020+)** — без фреймворков (легковесность)
- **Vite** — сборка в один `widget.js` + `widget.css`
- **@fingerprintjs/fingerprintjs** (open-source v4) — отпечаток браузера
- Размер итогового бандла: **< 80 KB gzip** (видео и картинки — лениво, по требованию)

### Admin Panel
- **React 18** + **Vite**
- **TailwindCSS 3** + **shadcn/ui** (опционально, для готовых компонентов)
- **React Router 6**
- **TanStack Query (React Query) v5**
- **Axios** для API

### Infrastructure
- **Docker** + **docker-compose**
- **Nginx** — reverse proxy, статика, HTTPS
- **Let's Encrypt** (certbot) или **Cloudflare** — SSL
- Деплой на VPS заказчика (Ubuntu 22.04+, поддомен `gift.example.ru`)

---

## 6. Структура проекта

```
gift-safe/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── public/
│   │   │   │   ├── spin.js          # POST /api/spin
│   │   │   │   ├── claim.js         # POST /api/claim
│   │   │   │   ├── deliver.js       # POST /api/deliver
│   │   │   │   └── prize.js         # GET  /api/my-prize
│   │   │   └── admin/
│   │   │       ├── auth.js          # POST /api/admin/login
│   │   │       ├── spins.js         # GET/PATCH /api/admin/spins
│   │   │       ├── prizes.js        # GET/PATCH /api/admin/prizes
│   │   │       ├── stats.js         # GET /api/admin/stats
│   │   │       ├── settings.js      # GET/PATCH /api/admin/settings
│   │   │       ├── promos.js        # POST /api/admin/promos/upload
│   │   │       └── export.js        # GET /api/admin/export.csv
│   │   ├── services/
│   │   │   ├── prizeRoller.js       # выбор приза по весам
│   │   │   ├── antifraud.js         # проверки
│   │   │   ├── insalesApi.js        # клиент к InSales Admin API
│   │   │   ├── notifier.js          # email (Nodemailer)
│   │   │   ├── promoPool.js         # выдача кодов из пула
│   │   │   └── expirer.js           # крон, помечающий EXPIRED
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT-гард
│   │   │   ├── rateLimit.js
│   │   │   ├── cors.js
│   │   │   └── errorHandler.js
│   │   ├── lib/
│   │   │   ├── prisma.js
│   │   │   └── logger.js
│   │   ├── validators/              # Zod-схемы
│   │   ├── seeds/
│   │   │   ├── prizes.js            # 12 призов
│   │   │   └── admin.js             # дефолтный админ
│   │   └── app.js
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   │   ├── roller.test.js           # тест распределения
│   │   └── antifraud.test.js
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
│
├── widget/
│   ├── src/
│   │   ├── index.js                 # entry, init()
│   │   ├── core/
│   │   │   ├── storage.js           # guestId, localStorage, cookie
│   │   │   ├── fingerprint.js
│   │   │   ├── api.js               # запросы к нашему backend
│   │   │   ├── insales.js           # запросы к /client_account/contacts.json
│   │   │   └── scenarios.js         # 4 сценария поведения
│   │   ├── ui/
│   │   │   ├── modal.js             # рендер модалки
│   │   │   ├── safeVideo.js         # управление видео
│   │   │   ├── prizeView.js         # показ приза
│   │   │   ├── deliveryForm.js      # форма получения
│   │   │   ├── floatingButton.js    # плавающая кнопка + таймер
│   │   │   └── templates.js         # HTML-шаблоны
│   │   ├── styles/
│   │   │   └── widget.css
│   │   └── config.js                # тексты, цвета, эндпоинты
│   ├── public/
│   │   └── assets/
│   │       ├── safe-open.mp4
│   │       ├── safe-open.webm
│   │       ├── safe-poster.jpg      # постер до запуска
│   │       └── prizes/              # 12 webp файлов (заказчик предоставит)
│   ├── vite.config.js
│   └── package.json
│
├── admin/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Spins.jsx
│   │   │   ├── SpinDetail.jsx
│   │   │   ├── Prizes.jsx
│   │   │   ├── Promos.jsx           # загрузка пула промокодов
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   ├── api/
│   │   └── App.jsx
│   ├── vite.config.js
│   └── package.json
│
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 7. Схема базы данных (Prisma)

```prisma
model Guest {
  id          String   @id @default(uuid())
  fingerprint String?
  ip          String?
  userAgent   String?
  createdAt   DateTime @default(now())
  spins       Spin[]
}

model Spin {
  id          String   @id @default(uuid())
  guestId     String
  guest       Guest    @relation(fields: [guestId], references: [id])
  prizeId     String
  prize       Prize    @relation(fields: [prizeId], references: [id])

  ip          String?
  fingerprint String?
  createdAt   DateTime @default(now())

  clientId        String?  @unique
  clientEmail     String?
  clientPhone     String?

  recipientName    String?
  recipientPhone   String?
  recipientAddress String?
  recipientEmail   String?

  status      SpinStatus @default(WON)
  claimedAt   DateTime?
  deliveredAt DateTime?
  fulfilledAt DateTime?
  expiresAt   DateTime

  promoCode   String?
  adminNote   String?

  @@index([guestId])
  @@index([fingerprint])
  @@index([ip, createdAt])
  @@index([status])
}

enum SpinStatus {
  WON
  CLAIMED
  AWAITING_FULFILL
  FULFILLED
  EXPIRED
}

model Prize {
  id              String    @id @default(uuid())
  code            String    @unique
  title           String
  description     String
  image           String
  weight          Int       // веса * 10 для целочисленности
  type            PrizeType
  payload         Json?     // {discount: 10} / {bonusAmount: 100} / ...
  active          Boolean   @default(true)
  requiresAddress Boolean   @default(false)
  spins           Spin[]
}

enum PrizeType {
  PROMO_CODE
  FREE_SHIPPING
  BONUS_POINTS
  GUIDE
  PHYSICAL
  GIFT_BOX
}

model PromoCodePool {
  id        String   @id @default(uuid())
  prizeCode String   // 'promo-10' / 'promo-15' / ...
  code      String   @unique
  used      Boolean  @default(false)
  usedAt    DateTime?
  spinId    String?
  createdAt DateTime @default(now())

  @@index([prizeCode, used])
}

model Admin {
  id           String   @id @default(uuid())
  login        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model AntifraudLog {
  id          String   @id @default(uuid())
  reason      String   // IP_LIMIT / FINGERPRINT_REPEAT / EMAIL_DUPLICATE
  ip          String?
  fingerprint String?
  guestId     String?
  meta        Json?
  createdAt   DateTime @default(now())
}

model Settings {
  id              String   @id @default("singleton")
  active          Boolean  @default(true)
  prizeTtlHours   Int      @default(24)
  updatedAt       DateTime @updatedAt
}
```

---

## 8. Призы (сид-данные)

| code | title | weight (×10) | type | requiresAddress | payload |
|------|-------|--------------|------|-----------------|---------|
| promo-10 | Промокод на скидку 10% | 350 | PROMO_CODE | false | `{discount:10}` |
| free-shipping | Бесплатная доставка | 250 | FREE_SHIPPING | false | — |
| promo-15 | Промокод на скидку 15% | 150 | PROMO_CODE | false | `{discount:15}` |
| bonus-100 | 100 бонусов на счёт | 100 | BONUS_POINTS | false | `{amount:100}` |
| promo-20 | Промокод на скидку 20% | 60 | PROMO_CODE | false | `{discount:20}` |
| guide | Гайд от наших экспертов | 40 | GUIDE | false | `{pdfUrl:"..."}` |
| bonus-500 | 500 бонусов на счёт | 20 | BONUS_POINTS | false | `{amount:500}` |
| orange-paste | Оранжевая паста | 10 | PHYSICAL | true | — |
| socks | Носочки (1 шт) | 10 | PHYSICAL | true | — |
| nose-trimmer | Триммер для носа 001 | 5 | PHYSICAL | true | — |
| gift-box | Подарочный бокс | 5 | GIFT_BOX | true | — |
| bonus-1000 | 1000 бонусов (джекпот!) | 5 | BONUS_POINTS | false | `{amount:1000}` |

Сумма весов = 1000.

---

## 9. API эндпоинты

### 9.1 Публичные (для виджета)

#### `POST /api/spin`
**Body:** `{ guestId: string, fingerprint: string, userAgent: string }`
**Логика:**
1. Антифрод-проверка.
2. Если guestId уже крутил — вернуть прошлый приз (`alreadySpun: true`).
3. Если fingerprint уже крутил за 30 дней — `429 + reason: FINGERPRINT_REPEAT`.
4. Если IP > 5 круток за 24ч — `429 + reason: IP_LIMIT`.
5. Иначе: rollPrize → создать Spin (status=WON, expiresAt=+24ч). Если PROMO/FREE_SHIPPING — взять код из пула.

**Response 200:**
```json
{
  "prize": { "code": "promo-10", "title": "...", "description": "...", "image": "/assets/prizes/promo-10.webp" },
  "spinId": "uuid",
  "expiresAt": "2024-03-13T14:23:00Z",
  "alreadySpun": false
}
```

#### `POST /api/claim`
**Body:** `{ guestId, clientId, clientEmail, clientPhone }`
**Логика:**
1. Найти Spin по `guestId` со статусом WON.
2. Если не найден или expired → `404 / 410`.
3. Проверить, что `clientId`/`clientEmail`/`clientPhone` не привязаны к другому Spin.
4. Обновить Spin: clientId, status=CLAIMED, claimedAt=now.

**Response:** `{ success: true, prize, requiresAddress, expiresAt }`

#### `GET /api/my-prize?clientId=...`
Возвращает текущий приз клиента + статус. Использует виджет на любой странице после авторизации.

#### `POST /api/deliver`
**Body:** `{ spinId, clientId, recipientName?, recipientPhone?, recipientAddress?, recipientEmail? }`
Валидация полей зависит от типа приза.
**Логика:**
- Сохранить данные, status=AWAITING_FULFILL.
- BONUS_POINTS → вызвать InSales API на начисление → status=FULFILLED.
- PROMO_CODE / FREE_SHIPPING → отправить email с кодом → status=FULFILLED.
- GUIDE → отправить email с PDF → status=FULFILLED.
- PHYSICAL / GIFT_BOX → остаётся AWAITING_FULFILL для админа.

**Response:** `{ success: true, status: "FULFILLED" | "AWAITING_FULFILL", message: "..." }`

### 9.2 Админ-эндпоинты (под JWT)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/admin/login` | `{login, password}` → `{token, expiresIn}` |
| GET | `/api/admin/me` | проверка токена |
| GET | `/api/admin/spins?status=&from=&to=&prize=&page=&q=` | список с фильтрами и поиском (по email/телефону) |
| GET | `/api/admin/spins/:id` | детали |
| PATCH | `/api/admin/spins/:id` | сменить статус, добавить заметку |
| POST | `/api/admin/spins/:id/fulfill` | пометить отправленным |
| GET | `/api/admin/stats?period=day\|week\|month` | сводка |
| GET | `/api/admin/prizes` | список призов |
| PATCH | `/api/admin/prizes/:id` | менять weight, active |
| POST | `/api/admin/promos/upload` | загрузка пула промокодов (CSV или текст: один код на строку, + указание prizeCode) |
| GET | `/api/admin/promos/stats` | сколько кодов осталось по каждому призу |
| GET | `/api/admin/settings` | текущие настройки |
| PATCH | `/api/admin/settings` | вкл/выкл акции, изменить TTL |
| GET | `/api/admin/antifraud-logs?from=&to=` | журнал блокировок |
| GET | `/api/admin/export.csv?status=...` | выгрузка для службы доставки |

---

## 10. Антифрод — детальная логика

```js
// services/antifraud.js
export async function canSpin({ guestId, fingerprint, ip }, prisma) {
  // 1) Этот guestId уже крутил → возвращаем его приз
  const byGuest = await prisma.spin.findFirst({ where: { guestId } });
  if (byGuest) {
    return { allowed: false, reason: 'ALREADY_SPUN', existingSpin: byGuest };
  }

  // 2) Тот же fingerprint крутил за последние 30 дней
  if (fingerprint) {
    const fp = await prisma.spin.findFirst({
      where: { fingerprint, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } }
    });
    if (fp) {
      await prisma.antifraudLog.create({
        data: { reason: 'FINGERPRINT_REPEAT', fingerprint, ip, guestId }
      });
      return { allowed: false, reason: 'FINGERPRINT_REPEAT', existingSpin: fp };
    }
  }

  // 3) IP-лимит: 5 круток за 24 часа
  if (ip) {
    const cnt = await prisma.spin.count({
      where: { ip, createdAt: { gte: new Date(Date.now() - 864e5) } }
    });
    if (cnt >= 5) {
      await prisma.antifraudLog.create({
        data: { reason: 'IP_LIMIT', ip, fingerprint, guestId }
      });
      return { allowed: false, reason: 'IP_LIMIT' };
    }
  }

  return { allowed: true };
}
```

**При `/api/claim` дополнительно:** проверяем, что `clientId`, `clientEmail`, `clientPhone` не использовались в другом Spin (не считая собственного с тем же guestId).

---

## 11. Roller (выбор приза по весам)

```js
// services/prizeRoller.js
export function rollPrize(prizes) {
  const active = prizes.filter(p => p.active);
  if (active.length === 0) throw new Error('No active prizes');
  const total = active.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of active) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return active[active.length - 1];
}
```

**Тест:** прогнать 100 000 круток, проверить что отклонение от ожидаемых вероятностей < 2%.

---

## 12. Поведение виджета — 4 сценария

При загрузке `widget.js` выполняется:
```js
1. const guestId = getOrCreateGuestId();
2. const fingerprint = await getFingerprint();
3. const insalesClient = await getInsalesClient(); // null если гость
4. const localPrize = readLocalPrizeMeta(); // что мы знаем о его прошлой крутке
5. routeScenario({ insalesClient, localPrize });
```

### Сценарий 1 — Гость, ещё не крутил
- Через **7 секунд** (setTimeout) показать модалку.
- Параллельно отрисовать **плавающую кнопку** «🎁 Забери подарок» (низ справа, пульсирует).
- Закрытие модалки → кнопка остаётся, по клику снова открывает.

### Сценарий 2 — Гость, уже крутил (есть запись в localStorage / на бэке)
- Модалка автоматически НЕ всплывает.
- Кнопка «🎁 Забери подарок» — пульсирует.
- По клику открывается модалка БЕЗ механики крутки. Сразу: «Ты выиграл [приз]! Зарегистрируйся, чтобы забрать. Сгорит через ⏰ 23:45:12».
- Кнопка «Зарегистрироваться» открывает `/client/new` **в новой вкладке** (`window.open(url, '_blank')`).
- Когда таймер `expiresAt` истёк — кнопка и модалка исчезают, в localStorage ставим флаг `expired`.

### Сценарий 3 — Авторизованный клиент с непривязанным призом
- При инициализации видим `insalesClient` + есть `guestId` с привязанным призом.
- Делаем `POST /api/claim` (если ещё не делали).
- Через **7 секунд** показываем модалку: «🎉 Твой приз — [название]. Введи данные для получения».
- Внутри модалки — таймер до сгорания + форма получателя (поля по типу приза).
- Плавающая кнопка меняется на: «🎁 Забери приз ⏰ 23:45:12» (пульсирует ярче, accent-цвет).
- После сабмита формы → «Спасибо!» → модалка и кнопка исчезают навсегда (флаг `delivered=true` в localStorage).

### Сценарий 4 — Авторизованный клиент без приза (или уже всё получил)
- Виджет молчит. Никаких модалок и кнопок.

### Состояния в localStorage
```js
{
  guestId: 'uuid',
  spinId: 'uuid',
  prize: { code, title, image },
  expiresAt: '2024-...',
  status: 'WON' | 'CLAIMED' | 'DELIVERED' | 'EXPIRED'
}
```
**Важно:** localStorage — это только КЭШ для UX. Истина всегда на сервере. При несовпадении — верим серверу.

---

## 13. Воспроизведение видео сейфа

См. раздел 4.4. Ключевые моменты:

```html
<div class="gs-video-wrap" aria-hidden="true">
  <video
    id="gs-safe-video"
    preload="auto"
    playsinline
    disablePictureInPicture
    controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
    style="pointer-events:none;width:100%;display:block;"
  >
    <source src="https://gift.example.ru/assets/safe-open.webm" type="video/webm" />
    <source src="https://gift.example.ru/assets/safe-open.mp4" type="video/mp4" />
  </video>
</div>
```

```js
// safeVideo.js
export async function playSafeVideo(onEnded) {
  const v = document.getElementById('gs-safe-video');
  v.muted = false;
  v.currentTime = 0;
  try {
    await v.play();
  } catch (err) {
    // если автоплей со звуком заблокирован — fallback на muted
    v.muted = true;
    await v.play();
  }
  v.addEventListener('ended', () => {
    // последний кадр уже виден, видео паузнуто на нём
    onEnded();
  }, { once: true });
}
```

**Состояния модалки во время воспроизведения:**
- Скрываем кнопки управления (только видео).
- Показываем мини-надпись внизу «🔐 Подбираем код…» (опционально).
- Запрещаем закрыть модалку (крестик disable) пока видео идёт.
- После `ended` — fade-in блока с призом поверх видео (приз остаётся на фоне последнего кадра).

---

## 14. UI / Тексты модалки (продакшен-копирайт)

**Шаг 1 — приветствие гостя:**
> 🎁 **Забери подарок из сейфа!**
> Внутри ждёт твой персональный приз. Гарантированный — у нас выигрывают все 💯
> [ Открыть сейф ]

**Шаг 2 — во время видео:**
> 🔐 Подбираем код…

**Шаг 3 — приз показан:**
> 🎉 **Поздравляем!**
> Тебе выпал: **[название]**
> [картинка приза]
> Чтобы забрать — зарегистрируйся за 30 секунд
> ⏰ Приз сгорит через 23:59:48
> [ Зарегистрироваться ]

**Шаг 4а — авторизован, физический приз:**
> 🎁 **Куда отправить твой подарок?**
> [Имя получателя] [Телефон] [Адрес]
> [ Получить подарок ]

**Шаг 4б — авторизован, промокод/бонусы:**
> ✨ **Готово, осталось чуть-чуть!**
> Отправим приз на email из профиля: ivan@mail.ru
> Хочешь на другой? [Email]
> [ Получить приз ]

**Шаг 5 — финал, промокод:**
> 🥳 **Готово!**
> Промокод **GIFT-10-XYZ123** уже у тебя на почте.
> Используй его при следующем заказе.
> [ Закрыть и пойти за покупками ]

**Шаг 5 — финал, физика:**
> 🥳 **Принято!**
> Отправим подарок в течение 1–3 рабочих дней. Трек придёт на почту.
> [ Спасибо! ]

**Сгорело:**
> 😔 Эх, приз сгорел...
> Но впереди ждут новые акции — заглядывай!

Все тексты вынеси в `widget/src/config.js` (объект `TEXTS`), чтобы потом легко править.

---

## 15. Безопасность (чек-лист)

- [ ] **CORS** — только `ALLOWED_ORIGIN` из `.env` (домен магазина). Префлайт настроен.
- [ ] **HTTPS** обязателен. HTTP-запросы редиректятся.
- [ ] **Rate limit** на `/api/spin`: 3/мин с IP, на `/api/claim`: 10/мин, на `/api/admin/login`: 5/мин.
- [ ] **JWT**: access 1ч, refresh 7д. Секреты в `.env`.
- [ ] **bcrypt** rounds=10 для паролей.
- [ ] **Zod-валидация** всех входящих body / query.
- [ ] **Sanitize** строковых полей (имя, адрес) — никакого HTML.
- [ ] **Helmet** middleware для безопасных заголовков.
- [ ] **Никаких stack trace** наружу. Production error handler возвращает `{error: "Internal error", code: "INTERNAL"}`.
- [ ] Логи — Pino, ротация через logrotate или Pino-roll.
- [ ] Веса призов **никогда** не уходят на фронт.
- [ ] `clientId` из InSales всегда нормализуется к строке перед сравнением.

---

## 16. Интеграция с InSales

> ⚠️ **Документацию по конкретным эндпоинтам InSales API заказчик предоставит отдельно.** Не угадывай — спрашивай.
>
> Базовая точка: `https://api.insales.ru/`
> Авторизация: HTTP Basic Auth (api_key + password магазина).

**Что нужно реализовать (после получения доков):**
1. **Начисление бонусов клиенту** — для приза BONUS_POINTS. Метод `POST /admin/clients/:id/bonus_points.json` (уточнить у заказчика).
2. **Создание / выдача промокода** — рекомендованный путь: пул заранее загруженных кодов (через админку), без онлайн-генерации. Если нужно онлайн — уточнить эндпоинт.
3. **Получение данных клиента с фронта** — `GET /client_account/contacts.json` (прямо с фронта виджета, через credentials: include). Это публичный endpoint самой витрины.

**Файл `services/insalesApi.js`** — единый клиент с методами:
```js
class InsalesApi {
  async addBonusPoints(clientId, amount, reason) { ... }
  async issueDiscountCode(prizeCode) { ... } // если используем онлайн-генерацию
  // ... другие методы по мере необходимости
}
```

Все вызовы — через try/catch, с retry (3 попытки, экспоненциальная задержка), всё логируется.

**`.env` для интеграции:**
```
INSALES_API_KEY=xxx
INSALES_PASSWORD=xxx
INSALES_DOMAIN=mystore.myinsales.ru
ALLOWED_ORIGIN=https://mystore.ru
```

---

## 17. Email-уведомления (Nodemailer)

Шаблоны (HTML + plain-text):
1. `promo-code.html` — с промокодом и инструкцией применения.
2. `free-shipping.html` — с кодом бесплатной доставки.
3. `guide.html` — с ссылкой на PDF (или вложением).
4. `physical-confirmation.html` — подтверждение приёма заказа на физический приз.

SMTP-настройки в `.env`:
```
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Магазин <noreply@mystore.ru>"
```

**Логирование:** каждое отправленное письмо → запись в БД (опционально, отдельная таблица `EmailLog`).

---

## 18. Админка — экраны

### 18.1 Login
Простая форма: логин + пароль → JWT в localStorage → редирект на Dashboard.

### 18.2 Dashboard
- Карточки: круток сегодня / за неделю / за месяц.
- Воронка: показов модалки → круток → регистраций → ввод адреса → fulfilled.
- График круток за 30 дней.
- Топ-5 призов по выпадениям.
- Сколько активных WON / CLAIMED / AWAITING_FULFILL.

### 18.3 Spins (таблица)
Колонки: Дата | Приз | Статус | Email клиента | Телефон | Имя получателя | Адрес | IP | Действия.
Фильтры: статус, дата (от/до), приз, поиск по email/телефону.
Пагинация (50 на страницу).
Клик по строке → SpinDetail.

### 18.4 SpinDetail (карточка крутки)
Полная инфа в формате (см. раздел 19) + кнопки действий.

### 18.5 Prizes (настройка)
Таблица с возможностью inline-редактирования веса и переключения активности.

### 18.6 Promos (пул промокодов)
- Загрузка через textarea (один код на строку) или CSV.
- Привязка пула к prizeCode (например, 1000 кодов для `promo-10`).
- Статистика: всего / выдано / осталось.
- Алерт «Осталось < 50 кодов» в Dashboard.

### 18.7 Settings
- Toggle «Акция активна».
- Срок жизни приза (часы), по умолчанию 24.
- Ссылка на PDF гайда (для приза `guide`).
- Тексты модалки (опционально, на этапе MVP можно через `config.js`).

### 18.8 Антифрод-логи
Таблица всех блокировок с фильтрами по reason / дате.

---

## 19. Карточка крутки в админке (SpinDetail)

```
Spin #abc123-def
─────────────────────────────────────────────
🎁 Приз: Триммер для носа 001
📅 Крутил: 12.03.2024 14:23
⏰ Сгорает: 13.03.2024 14:23
📊 Статус: AWAITING_FULFILL → FULFILLED [▼]

👤 Клиент в InSales (привязан 12.03.2024 14:30):
  ID:     78234
  Email:  ivan@mail.ru
  Телефон: +7 999 123 45 67
  [Открыть в InSales ↗]

📦 Получатель (введено 12.03.2024 14:35):
  Имя:     Иван Петров
  Телефон: +7 999 123 45 67
  Адрес:   г. Москва, ул. Ленина, 1, кв. 5
  Email:   ivan@mail.ru

🎟 Промокод (если применимо): GIFT-10-A1B2C3

🔐 Антифрод:
  IP:          95.213.x.x
  Fingerprint: a3f4b2c1...
  Guest ID:    e5d2-1234-...
  User Agent:  Mozilla/5.0 ...

📜 История статусов:
  WON              12.03 14:23
  CLAIMED          12.03 14:30
  AWAITING_FULFILL 12.03 14:35

📝 Заметка администратора:
  [textarea + кнопка Сохранить]

🛠 Действия:
  [Пометить отправленным] [Начислить бонусы вручную] [Экспорт строки CSV]
```

---

## 20. Деплой

### docker-compose.yml (структура)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    env_file: .env

  backend:
    build: ./backend
    env_file: .env
    depends_on: [postgres]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./widget/dist:/var/www/widget:ro
      - ./widget/public/assets:/var/www/assets:ro
      - ./admin/dist:/var/www/admin:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on: [backend]

volumes:
  pgdata:
```

### nginx.conf (наброски)
- Редирект 80→443.
- `/widget.js` → `/var/www/widget/widget.js` (cache 1h, immutable для версионированных бандлов).
- `/widget.css` → аналогично.
- `/assets/*` → `/var/www/assets` (cache 7d, immutable).
- `/api/*` → `proxy_pass http://backend:3000`.
- `/admin` и `/admin/*` → `try_files $uri /admin/index.html` (SPA).
- `gzip` + `brotli` для всего.

### SSL
Cloudflare Origin Cert (проще) ИЛИ Let's Encrypt через certbot (внутри отдельного контейнера или на хосте).

---

## 21. План разработки (этапы)

### Этап 1 — Бэкенд: фундамент (2 дня)
- Init Node + Express + Prisma + PostgreSQL.
- Схема БД, миграции, сидинг призов и админа.
- `/api/spin` + roller + антифрод (без InSales).
- Тесты на распределение и антифрод.

### Этап 2 — Бэкенд: claim/deliver (1 день)
- `/api/claim`, `/api/my-prize`, `/api/deliver`.
- Заглушки InSales API (только логирование).
- Крон `expirer.js` каждые 10 мин — помечает EXPIRED.

### Этап 3 — Виджет (3–4 дня)
- guestId, fingerprint, базовые запросы.
- Модалка + видео сейфа + показ приза.
- 4 сценария поведения.
- Плавающая кнопка с таймером.
- Адаптив (мобильный + десктоп).

### Этап 4 — Админка (2–3 дня)
- Login + JWT.
- Все экраны.
- Загрузка пула промокодов.
- Экспорт CSV.

### Этап 5 — Интеграция с InSales (1–2 дня после получения доков)
- Реальные методы в `insalesApi.js`.
- Nodemailer + шаблоны.
- End-to-end тест на dev-магазине.

### Этап 6 — Деплой и шлифовка (1–2 дня)
- docker-compose, Nginx, HTTPS.
- Логирование, healthcheck.
- Мобильное QA.
- Нагрузочный тест (100 одновременных круток).

**Итого:** ~10–14 рабочих дней.

---

## 22. Чек-лист качества перед сдачей

- [ ] Виджет грузится `async`, не блокирует магазин.
- [ ] `widget.js` < 80 KB gzip (без видео и картинок).
- [ ] Адаптив: iOS Safari, Android Chrome, десктопные браузеры.
- [ ] Видео играет со звуком после клика, без UI плеера, замирает на последнем кадре.
- [ ] Кнопка «Открыть сейф» защищена от двойного клика.
- [ ] Таймер 24ч синхронизирован с серверным `expiresAt`.
- [ ] Крон автоматически переводит просроченные → EXPIRED.
- [ ] Антифрод: повторная попытка крутки → видит свой прошлый приз.
- [ ] CORS жёстко настроен.
- [ ] Логи не светят stack trace в production.
- [ ] В админке нельзя удалить FULFILLED запись (для аудита).
- [ ] Картинки призов webp < 50 KB каждая.
- [ ] Видео < 5 MB, оптимизировано (CRF 23–28 для H.264).
- [ ] Письма доходят и не падают в спам (SPF, DKIM настроены на стороне SMTP).
- [ ] README.md описывает: установку, переменные окружения, команды миграции, деплой, как заказчику обновить виджет.

---

## 23. Что заказчик предоставит (содержит подвешенные вопросы — обязательно задать!)

> 🟡 **Cursor: перед началом кодирования задай заказчику эти вопросы и дождись ответов.**

### 23.1 Доступы и инфраструктура
1. **VPS:** SSH-доступ, IP сервера, ОС.
2. **Поддомен:** какое имя? (`gift.example.ru` или другое) — нужно завести A-запись.
3. **SSL:** Cloudflare или Let's Encrypt?
4. **Магазин InSales:** домен, доступ к шаблонам (для вставки `<script>`).
5. **InSales API:** api_key, password, домен `mystore.myinsales.ru`.
   - SMTP-хост, порт, логин, пароль, отправитель (`SMTP_FROM`).
   - Или ключи внешнего сервиса (SendGrid / Postmark / Unisender / Mailgun).

### 23.2 Документация InSales API
> ⚠️ Самое важное. Без этого этап интеграции не запустится.

7. **Документация по эндпоинтам**, которые мы будем дёргать:
   - Начисление бонусов клиенту (`POST /admin/clients/:id/bonus_points.json` — точный путь и формат body).
   - Создание/выдача промокода (если решим генерировать онлайн, а не из пула).
   - Получение клиента (если на витрине `/client_account/contacts.json` чем-то ограничен).
   - Любые специфические заголовки, лимиты, формат ошибок.
8. **Тестовый клиент в InSales** (логин/пароль) — чтобы можно было тестировать сценарий «авторизованный клиент» end-to-end.
9. **Структура ответа `/client_account/contacts.json`** в этом конкретном магазине (поля могут отличаться от темы к теме). Пришли пример JSON-ответа.

### 23.3 Контент
10. **Видео сейфа:**
    - Файлы `safe-open.mp4` и `safe-open.webm` (если есть только один формат — конвертируем).
    - Длительность видео (важно для UX, чтобы не было долгого ожидания > 6 секунд).
    - Постер-кадр (jpg/webp) — что показывать до запуска видео.
11. **Картинки призов** — 12 webp-файлов с прозрачным фоном, 400×400, < 50 KB каждый. Имена файлов — строго по таблице из раздела 8 (`promo-10.webp`, `orange-paste.webp` и т.д.).
12. **PDF гайда** для приза `guide` — файл и финальный текст письма с ним.
13. **Текст писем** (черновики или готовые):
    - Письмо с промокодом.
    - Письмо с кодом бесплатной доставки.
    - Письмо с гайдом.
    - Подтверждение приёма заказа на физический приз.
14. **Логотип магазина** (PNG/SVG, прозрачный фон) — для шапки модалки и писем.
15. **Цветовая палитра** магазина (основной цвет, акцент) — чтобы виджет выглядел нативно.

### 23.4 Бизнес-решения
16. **Промокоды:** пул заранее (рекомендую) или генерация онлайн через InSales API?
    - Если пул — кто и как его создаёт в InSales? Нам нужны строковые коды + указание в InSales, к какой группе скидок они относятся.
17. **Лимит акции:** должна ли акция автоматически выключаться при N круток (например, 10 000)?
18. **Срок жизни приза:** 24 часа подходит, или другое?
19. **IP-лимит:** 5 круток / 24ч с одного IP — устраивает? (Может быть мало для большой семьи или офиса.)
20. **Fingerprint-окно:** блокировать при повторе fingerprint в течение 30 дней — ок?
21. **Что делать с физическими призами после AWAITING_FULFILL?** Кто их отправляет — сам заказчик через CDEK/Почту? Нужна ли интеграция со службой доставки или просто экспорт CSV?
22. **Бонусы InSales** — как они называются в магазине (бонусы, баллы, рубли)?
23. **A/B-тест:** нужен ли на старте или это улучшение «потом»?

### 23.5 Админка
24. **Логин и пароль** первого админа (или сгенерируем и пришлём).
25. **Email для алертов** (например, «Осталось < 50 промокодов» или «Сервер упал»).
26. **Нужна ли роль «модератор»** (только просмотр) или достаточно одной роли «админ»?

---

## 24. Подход разработчика (как ты, Cursor, должен думать)

> Это раздел про **философию работы**, а не про код. Прочитай и держи в голове.

### 24.1 Не торопись
Прежде чем писать код:
1. Прочитай ТЗ полностью, дважды.
2. Задай ВСЕ вопросы из раздела 23. Дождись ответов.
3. Составь план первого этапа, согласуй с заказчиком.
4. Только потом — код.

### 24.2 Используй MCP context7 для каждой библиотеки
Когда подключаешь любую зависимость — Express middleware, Prisma фичу, React Query хук, Tailwind утилиту, Vite плагин, Nodemailer transport — **сначала открой актуальную документацию через context7**. API библиотек меняется, не пиши по памяти.

### 24.3 Начинай с минимального вертикального среза
Не делай сразу весь backend, потом весь widget, потом всю админку. Сделай:
1. Минимальный `/api/spin` (без антифрода, рандомный приз).
2. Минимальный виджет, который умеет крутить и показывать приз.
3. Прогоняешь end-to-end — работает?
4. Затем наращиваешь функциональность слой за слоем.

Так ты быстро поймаешь архитектурные ошибки.

### 24.4 Тесты только на критичную логику
Не нужно покрывать всё. Обязательны юнит-тесты на:
- `prizeRoller` — распределение по весам.
- `antifraud.canSpin` — все ветки.
- `claim` endpoint — конфликты дублирования.

Остальное — ручное тестирование по чек-листу.

### 24.5 Защищайся от граничных случаев
Особое внимание:
- **Гонки:** два запроса `/api/spin` от одного guestId почти одновременно (используй транзакции Prisma + уникальный индекс на `(guestId, status=WON)`, чтобы не возникло двух WON-записей).
- **Истёкший приз:** проверять `expiresAt < now` в каждом endpoint, не только в кроне.
- **Браузер запретил автоплей со звуком:** сделать fallback на `muted=true`.
- **`/client_account/contacts.json` вернул 200, но без id:** считать гостем.
- **Клиент очистил localStorage между круткой и регистрацией:** мы потеряем связь. Это допустимая потеря (кейс редкий). Не пытайся это починить через email-сбор — лишний барьер.
- **Двойной клик «Открыть сейф»:** disable кнопки сразу при клике + флаг `spinning=true`.
- **Промокод выдан, но сетевая ошибка отправки email:** код уже забронирован в БД (`used=true, spinId=...`). Нужен экран в админке «Письма не отправлены — переотправить».

### 24.6 Логируй разумно
Каждый запрос на `/api/spin`, `/api/claim`, `/api/deliver` → строка в логе с уровнем info (guestId, IP, результат). Ошибки — error с stack. В production — JSON-формат через Pino, чтобы потом в Loki/Grafana разобрать.

### 24.7 Документируй на ходу
В `README.md` сразу пиши:
- Как поднять локально (3 команды максимум).
- Как накатить миграции.
- Как засеять призы.
- Как создать первого админа.
- Как собрать widget для production.
- Как обновить виджет на проде.
- Что лежит в `.env`.

### 24.8 Если что-то непонятно — спрашивай
Любая неоднозначность в ТЗ — стоп, вопрос заказчику. Не выдумывай. Лучше уточнить пять раз, чем переписывать всё после.

---

## 25. Критичные технические нюансы (легко забыть)

1. **Видео в iOS Safari:** обязательно `playsinline`, иначе откроется fullscreen-плеер с системным интерфейсом → вся идея провалена.
2. **Видео и автоплей:** браузер разрешит звук только после **жеста пользователя**. Запуск видео должен быть строго внутри обработчика клика (не в `setTimeout` после клика, а синхронно).
3. **Cookies от поддомена:** `/client_account/contacts.json` запрашиваем с того же домена, где открыт магазин. Тут проблем нет (виджет работает в контексте магазина). А вот наш `/api/*` на `gift.example.ru` — кросс-доменный, нужен правильный CORS + `credentials: 'include'` если будем слать куки (нам не нужно — мы шлём guestId в body).
4. **`crypto.randomUUID()`** есть только в современных браузерах (Safari 15.4+, Chrome 92+). Для подстраховки — fallback на полифилл (5 строк).
5. **FingerprintJS open-source v4** — не идеален, легко обходится в инкогнито. Это нормально, мы и не претендуем на 100% защиту. Главный барьер — guestId + email уникальность.
6. **InSales API rate limits:** уточнить в документации. Для бонусов — не делать > 5 RPS, добавить очередь если нужно.
7. **Часовые пояса:** все даты в БД в UTC. На фронте конвертируем через `Intl.DateTimeFormat` с локалью пользователя.
8. **Prisma миграции в Docker:** при первом старте контейнера запускать `npx prisma migrate deploy` + `node src/seeds/run.js`. Сделать через entrypoint-скрипт.
9. **Health check:** `GET /api/health` → `{status: 'ok', db: 'ok', uptime: 12345}`. Использовать в Docker healthcheck и в мониторинге.
10. **CSP заголовок:** если магазин на InSales отдаёт строгий CSP, наш виджет может не загрузиться. Заранее проверить — заказчик пусть откроет DevTools на сайте магазина и посмотрит заголовок `Content-Security-Policy`. Если нужно — попросить добавить наш домен в `script-src`.

---

## 26. Структура README.md (что должно быть)

```markdown
# Gift Safe — виджет «Забери подарок»

## Stack
Node.js, Express, Prisma, PostgreSQL, React, Vite, Docker.

## Локальный запуск
1. cp .env.example .env
2. docker-compose up -d postgres
3. cd backend && npm i && npx prisma migrate dev && npm run seed
4. npm run dev (запустит backend на :3000)
5. cd ../widget && npm i && npm run dev (виджет на :5173)
6. cd ../admin && npm i && npm run dev (админка на :5174)

## Production deploy
docker-compose up -d --build

## Команды
- npm run seed:prizes — засеять призы
- npm run seed:admin — создать первого админа (логин/пароль из .env)
- npm run promos:upload < file.txt — загрузить пул промокодов

## ENV
[табличка со всеми переменными и описанием]

## Как обновить виджет на проде
1. cd widget && npm run build
2. docker-compose restart nginx (виджет лежит в volume nginx)
   ИЛИ
3. docker-compose up -d --build nginx

## Как заказчику вставить виджет
В шаблон InSales перед </body>:
<script async src="https://gift.example.ru/widget.js"></script>

## Контакты
[разработчик]
```

---

## 27. Финальное напутствие

Цель — рабочий продакшен-виджет за 2–3 недели, который:
- 🟢 Не ломает основной сайт (грузится async, ошибки изолированы).
- 🟢 Не теряет данные пользователей (транзакции, валидация).
- 🟢 Защищён от халявщиков на ~95% (многослойный антифрод).
- 🟢 Даёт владельцу полный контроль через админку.
- 🟢 Работает на телефоне так же красиво, как на десктопе.
- 🟢 Заказчик сам может обновлять промокоды и менять веса призов без программиста.

**Качество > скорости.** Если понимаешь, что какой-то этап «горит», но при этом видишь, что без рефакторинга развалится — лучше потратить лишний день, чем выкатить сырое.

**Спрашивай.** Серьёзно. Любая неясность — вопрос. Лучше пять вопросов в начале, чем переделка в конце.

Поехали 🚀

---

# 🟡 ВОПРОСЫ ПЕРЕД СТАРТОМ (для заказчика)

Скопируй и пройдись по списку, отметь ответы по каждому пункту:

### Доступы
- [ ] SSH-доступ к серверу, IP, ОС?
- [ ] Какой поддомен использовать? (`gift.____.ru`)
- [ ] SSL — Cloudflare или Let's Encrypt?
- [ ] Домен магазина на InSales?
- [ ] Доступ к шаблонам InSales (для вставки `<script>`)?
- [ ] InSales API: api_key, password, домен `*.myinsales.ru`?
- [ ] SMTP-доступ или ключ почтового сервиса?

### Документация InSales (без этого никак)
- [ ] Документация по эндпоинту начисления бонусов?
- [ ] Документация по созданию промокодов (если онлайн-генерация)?
- [ ] Пример JSON-ответа `/client_account/contacts.json` из ВАШЕГО магазина?
- [ ] Тестовый клиент (логин/пароль) для end-to-end?

### Контент
- [ ] Видео сейфа (mp4 + webm), длительность, постер?
- [ ] 12 картинок призов (webp, прозрачные)?
- [ ] PDF гайда?
- [ ] Тексты писем (промокод / доставка / гайд / подтверждение)?
- [ ] Логотип магазина?
- [ ] Цветовая палитра (основной + акцент)?

### Решения
- [ ] Промокоды: пул заранее или онлайн-генерация?
- [ ] Лимит акции (например, до 10 000 круток) — нужен?
- [ ] Срок жизни приза 24ч устраивает?
- [ ] IP-лимит 5/24ч устраивает?
- [ ] Fingerprint-окно 30 дней устраивает?
- [ ] Кто отправляет физические призы? Нужна интеграция с СДЭК/Почтой?
- [ ] Как в магазине называются «бонусы»?

### Админка
- [ ] Логин и пароль первого админа?
- [ ] Email для системных алертов?
- [ ] Нужна роль «модератор» (только просмотр)?

---

**Когда получу ответы — начну с Этапа 1 (бэкенд-фундамент).**