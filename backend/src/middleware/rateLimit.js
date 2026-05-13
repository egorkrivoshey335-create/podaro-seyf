import { rateLimit } from "express-rate-limit";

import { config } from "../config.js";

function createJsonLimiter({ windowMs, limit, code, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (request, response) => {
      response.status(429).json({
        error: message,
        code,
        retryAfter: Math.ceil(windowMs / 1000),
        path: request.path,
      });
    },
  });
}

export const spinRateLimiter = createJsonLimiter({
  windowMs: 60 * 1000,
  limit: config.spinRateLimitPerMinute,
  code: "SPIN_RATE_LIMIT",
  message: "Слишком много попыток розыгрыша. Попробуй чуть позже.",
});

export const claimRateLimiter = createJsonLimiter({
  windowMs: 60 * 1000,
  limit: config.claimRateLimitPerMinute,
  code: "CLAIM_RATE_LIMIT",
  message: "Слишком много попыток подтверждения. Попробуй чуть позже.",
});

export const adminLoginRateLimiter = createJsonLimiter({
  windowMs: 60 * 1000,
  limit: config.adminLoginRateLimitPerMinute,
  code: "ADMIN_LOGIN_RATE_LIMIT",
  message: "Слишком много попыток входа. Попробуй позже.",
  skipSuccessfulRequests: true,
});
