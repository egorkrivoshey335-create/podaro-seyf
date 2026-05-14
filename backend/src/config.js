import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://localhost:4173,http://localhost:5174,http://localhost:4174,https://gift.example.ru"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/gift_safe",
  allowedOrigins,
  adminLogin: process.env.ADMIN_LOGIN || "admin",
  jwtSecret: process.env.JWT_SECRET || "gift-safe-dev-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "gift-safe-dev-refresh-secret",
  fingerprintWindowDays: Number(process.env.FINGERPRINT_WINDOW_DAYS || 30),
  ipSpinLimit: Number(process.env.IP_SPIN_LIMIT || 5),
  prizeTtlHours: Number(process.env.PRIZE_TTL_HOURS || 24),
  spinRateLimitPerMinute: Number(process.env.SPIN_RATE_LIMIT_PER_MINUTE || 3),
  claimRateLimitPerMinute: Number(process.env.CLAIM_RATE_LIMIT_PER_MINUTE || 10),
  adminLoginRateLimitPerMinute: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_PER_MINUTE || 5),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  insales: {
    apiKey: process.env.INSALES_API_KEY,
    password: process.env.INSALES_PASSWORD,
    domain: process.env.INSALES_DOMAIN,
    shopUrl: process.env.INSALES_SHOP_URL,
    externalDiscountToken: process.env.INSALES_EXTERNAL_DISCOUNT_TOKEN,
    webhookToken: process.env.INSALES_WEBHOOK_TOKEN,
  },
  promoPrefix: process.env.PROMO_PREFIX || "COSMO",
  promoMinOrderPrice: Number(process.env.PROMO_MIN_ORDER_PRICE || 500),
  promoIssueMode: process.env.PROMO_ISSUE_MODE || "pool",
  debug: {
    enabled: process.env.GIFT_SAFE_DEBUG === "true" || process.env.NODE_ENV !== "production",
    forcePrizeCode: process.env.DEV_FORCE_PRIZE_CODE || "",
    allowRepeatSpins: process.env.DEV_ALLOW_REPEAT_SPINS === "true" || process.env.DEV_DISABLE_ANTIFRAUD === "true",
    skipRegisterStep: process.env.DEV_SKIP_REGISTER_STEP === "true",
    forceAuthorized: process.env.DEV_FORCE_AUTHORIZED === "true",
    spinTtlMinutes: Number(process.env.DEV_SPIN_TTL_MINUTES || 0),
    clientId: process.env.DEV_FORCE_CLIENT_ID || "debug-client",
    clientEmail: process.env.DEV_FORCE_CLIENT_EMAIL || "dev@example.com",
    clientPhone: process.env.DEV_FORCE_CLIENT_PHONE || "",
    clientName: process.env.DEV_FORCE_CLIENT_NAME || "Debug User",
  },
};
