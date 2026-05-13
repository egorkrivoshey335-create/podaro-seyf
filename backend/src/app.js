import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { adminLoginRateLimiter, claimRateLimiter, spinRateLimiter } from "./middleware/rateLimit.js";
import {
  assertInsalesToken,
  getFreeShippingDiscountResponse,
  markFreeShippingUsedFromOrder,
} from "./services/externalDiscounts.js";
import {
  claimSpin,
  deliverPrize,
  ensureSettings,
  exportSpinsCsv,
  fulfillSpin,
  getClientPrize,
  getPromoPoolStats,
  getSpinById,
  getStats,
  listAntifraudLogs,
  listPrizes,
  listSpins,
  serializePrize,
  serializeSpin,
  startSpin,
  updatePrize,
  updateSpin,
  uploadPromoCodeBatch,
} from "./services/spinService.js";

const app = express();
const insalesXmlBodyParser = express.text({
  type: ["application/xml", "text/xml", "*/xml"],
  limit: "1mb",
});

const spinStatusSchema = z.enum(["WON", "CLAIMED", "AWAITING_FULFILL", "FULFILLED", "EXPIRED"]);

function parsePayload(schema, payload) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Некоторые поля заполнены неверно.", result.error.flatten());
  }

  return result.data;
}

function getRequestIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.ip || undefined;
}

function signAdminToken(login) {
  return jwt.sign({ sub: login, role: "admin" }, config.jwtSecret, {
    expiresIn: "1h",
  });
}

function signAdminRefreshToken(login) {
  return jwt.sign({ sub: login, role: "admin", type: "refresh" }, config.jwtRefreshSecret, {
    expiresIn: "7d",
  });
}

function requireAdmin(request, _response, next) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Нужна авторизация администратора.");
    }

    request.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Токен администратора невалиден."));
  }
}

function parseOptionalDate(value) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new AppError(403, "CORS_BLOCKED", "Этот домен не разрешен для API."));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use((request, _response, next) => {
  logger.info(
    {
      method: request.method,
      path: request.path,
      ip: getRequestIp(request),
    },
    "incoming request",
  );
  next();
});

app.get("/api/health", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({
    status: "ok",
    db: "ok",
    uptime: Math.round(process.uptime()),
  });
});

app.post("/api/spin", spinRateLimiter, async (request, response) => {
  const payload = parsePayload(
    z.object({
      guestId: z.string().trim().min(10).max(100),
      fingerprint: z.string().trim().max(255).optional(),
      userAgent: z.string().trim().max(500).optional(),
    }),
    request.body,
  );

  const result = await startSpin(
    {
      ...payload,
      ip: getRequestIp(request),
    },
    prisma,
  );

  response.json({
    spinId: result.spin.id,
    prize: serializePrize(result.spin.prize),
    expiresAt: result.spin.expiresAt,
    status: result.spin.status,
    alreadySpun: result.alreadySpun,
  });
});

app.post("/api/claim", claimRateLimiter, async (request, response) => {
  const payload = parsePayload(
    z.object({
      guestId: z.string().trim().min(10).max(100),
      clientId: z.union([z.string(), z.number()]).transform((value) => String(value)),
      clientEmail: z.string().trim().email().optional(),
      clientPhone: z.string().trim().max(50).optional(),
    }),
    request.body,
  );

  const spin = await claimSpin(payload, prisma);

  response.json({
    success: true,
    spinId: spin.id,
    prize: serializePrize(spin.prize),
    requiresAddress: spin.prize.requiresAddress,
    expiresAt: spin.expiresAt,
    status: spin.status,
  });
});

app.get("/api/my-prize", async (request, response) => {
  const payload = parsePayload(
    z.object({
      clientId: z.string().trim().min(1),
    }),
    request.query,
  );

  const spin = await getClientPrize(payload.clientId, prisma);

  if (!spin) {
    response.status(404).json({
      error: "Для этого клиента активный приз не найден.",
      code: "PRIZE_NOT_FOUND",
    });
    return;
  }

  response.json({
    success: true,
    spinId: spin.id,
    prize: serializePrize(spin.prize),
    expiresAt: spin.expiresAt,
    status: spin.status,
    promoCode: spin.promoCode,
    recipientEmail: spin.recipientEmail,
    clientEmail: spin.clientEmail,
  });
});

app.post("/api/deliver", async (request, response) => {
  const payload = parsePayload(
    z.object({
      spinId: z.string().trim().min(1),
      clientId: z.union([z.string(), z.number()]).transform((value) => String(value)),
      recipientName: z.string().trim().max(100).optional(),
      recipientPhone: z.string().trim().max(50).optional(),
      recipientAddress: z.string().trim().max(300).optional(),
      recipientEmail: z.string().trim().email().optional(),
    }),
    request.body,
  );

  const result = await deliverPrize(payload, prisma);

  response.json({
    success: true,
    status: result.spin.status,
    message: result.message,
    promoCode: result.spin.promoCode,
  });
});

app.post("/api/insales/external-discounts/free-shipping", insalesXmlBodyParser, async (request, response) => {
  const token = request.query.token || request.headers["x-insales-token"];
  assertInsalesToken(token, config.insales.externalDiscountToken, "INSALES_DISCOUNT_FORBIDDEN");

  const discountResponse = await getFreeShippingDiscountResponse(request.body, prisma);
  response.json(discountResponse);
});

app.post("/api/insales/webhooks/order-status", insalesXmlBodyParser, async (request, response) => {
  const token = request.query.token || request.headers["x-insales-token"];
  assertInsalesToken(token, config.insales.webhookToken, "INSALES_WEBHOOK_FORBIDDEN");

  const result = await markFreeShippingUsedFromOrder(request.body, prisma);
  response.json(result);
});

app.post("/api/admin/login", adminLoginRateLimiter, async (request, response) => {
  const payload = parsePayload(
    z.object({
      login: z.string().trim().min(1),
      password: z.string().min(1),
    }),
    request.body,
  );

  const admin = await prisma.admin.findUnique({
    where: { login: payload.login },
  });

  if (!admin) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль.");
  }

  const isValidPassword = await bcrypt.compare(payload.password, admin.passwordHash);
  if (!isValidPassword) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль.");
  }

  response.json({
    token: signAdminToken(payload.login),
    refreshToken: signAdminRefreshToken(payload.login),
    expiresIn: 3600,
    refreshExpiresIn: 604800,
  });
});

app.post("/api/admin/refresh", async (request, response) => {
  const payload = parsePayload(
    z.object({
      refreshToken: z.string().min(1),
    }),
    request.body,
  );

  try {
    const decoded = jwt.verify(payload.refreshToken, config.jwtRefreshSecret);

    if (decoded.type !== "refresh") {
      throw new Error("invalid refresh token type");
    }

    response.json({
      token: signAdminToken(decoded.sub),
      expiresIn: 3600,
    });
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token невалиден.");
  }
});

app.get("/api/admin/me", requireAdmin, async (request, response) => {
  response.json({
    login: request.admin.sub,
    role: request.admin.role,
  });
});

app.get("/api/admin/spins", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      status: spinStatusSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      prize: z.string().trim().optional(),
      page: z.coerce.number().min(1).optional(),
      q: z.string().trim().max(100).optional(),
      limit: z.coerce.number().min(1).max(500).optional(),
    }),
    request.query,
  );

  const spins = await listSpins(
    {
      status: payload.status,
      from: parseOptionalDate(payload.from),
      to: parseOptionalDate(payload.to),
      prize: payload.prize,
      page: payload.page,
      query: payload.q,
      limit: payload.limit,
    },
    prisma,
  );

  response.json(spins.map((spin) => serializeSpin(spin)));
});

app.get("/api/admin/spins/:id", requireAdmin, async (request, response) => {
  const spin = await getSpinById(request.params.id, prisma);
  response.json(serializeSpin(spin));
});

app.patch("/api/admin/spins/:id", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      status: spinStatusSchema.optional(),
      adminNote: z.string().trim().max(1000).optional(),
    }),
    request.body,
  );

  const spin = await updateSpin(request.params.id, payload, prisma);

  response.json({
    success: true,
    spin: serializeSpin(spin),
  });
});

app.post("/api/admin/spins/:id/fulfill", requireAdmin, async (request, response) => {
  const spin = await fulfillSpin(request.params.id, prisma);
  response.json({
    success: true,
    spin: serializeSpin(spin),
  });
});

app.get("/api/admin/stats", requireAdmin, async (_request, response) => {
  const stats = await getStats(prisma);
  response.json(stats);
});

app.get("/api/admin/prizes", requireAdmin, async (_request, response) => {
  const prizes = await listPrizes(prisma);
  response.json(prizes);
});

app.patch("/api/admin/prizes/:id", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      weight: z.number().int().positive().optional(),
      active: z.boolean().optional(),
    }),
    request.body,
  );

  const prize = await updatePrize(request.params.id, payload, prisma);
  response.json(prize);
});

app.post("/api/admin/promos/upload", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      prizeCode: z.string().trim().min(1),
      text: z.string().trim().min(1),
    }),
    request.body,
  );

  const codes = payload.text
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);

  const result = await uploadPromoCodeBatch(payload.prizeCode, codes, prisma);

  response.json({
    success: true,
    ...result,
  });
});

app.get("/api/admin/promos/stats", requireAdmin, async (_request, response) => {
  const stats = await getPromoPoolStats(prisma);
  response.json(stats);
});

app.get("/api/admin/settings", requireAdmin, async (_request, response) => {
  const settings = await ensureSettings(prisma);
  response.json(settings);
});

app.patch("/api/admin/settings", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      active: z.boolean().optional(),
      prizeTtlHours: z.number().int().min(1).max(168).optional(),
      guidePdfUrl: z.string().trim().url().nullable().optional(),
    }),
    request.body,
  );

  const settings = await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      active: payload.active,
      prizeTtlHours: payload.prizeTtlHours,
      guidePdfUrl: payload.guidePdfUrl,
    },
  });

  response.json(settings);
});

app.get("/api/admin/antifraud-logs", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    request.query,
  );

  const logs = await listAntifraudLogs(
    {
      from: parseOptionalDate(payload.from),
      to: parseOptionalDate(payload.to),
    },
    prisma,
  );

  response.json(logs);
});

app.get("/api/admin/export.csv", requireAdmin, async (request, response) => {
  const payload = parsePayload(
    z.object({
      status: spinStatusSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      prize: z.string().trim().optional(),
    }),
    request.query,
  );

  const csv = await exportSpinsCsv(
    {
      status: payload.status,
      from: parseOptionalDate(payload.from),
      to: parseOptionalDate(payload.to),
      prize: payload.prize,
    },
    prisma,
  );

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="spins-export.csv"');
  response.send(csv);
});

app.use((request, response) => {
  response.status(404).json({
    error: "Маршрут не найден.",
    code: "NOT_FOUND",
    path: request.path,
  });
});

app.use((error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  logger.error({ error }, "unhandled error");
  response.status(500).json({
    error: "Internal error",
    code: "INTERNAL",
  });
});

export { app };
