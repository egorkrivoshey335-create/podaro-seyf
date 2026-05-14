import prismaClientPkg from "@prisma/client";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { canSpin } from "./antifraud.js";
import { insalesApi } from "./insalesApi.js";
import { sendGuideEmail, sendPhysicalConfirmationEmail, sendPromoCodeEmail } from "./notifier.js";
import { getPromoStats, reservePromoCode, uploadPromoCodes } from "./promoPool.js";
import { rollPrize } from "./prizeRoller.js";

const { Prisma, PrizeType, SpinStatus } = prismaClientPkg;

const PUBLIC_PRIZE_FIELDS = {
  code: true,
  title: true,
  description: true,
  image: true,
  type: true,
  requiresAddress: true,
};

const INTERNAL_PRIZE_FIELDS = {
  ...PUBLIC_PRIZE_FIELDS,
  payload: true,
};

const INTERNAL_SPIN_INCLUDE = {
  prize: {
    select: INTERNAL_PRIZE_FIELDS,
  },
};

export function sanitizeText(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.replace(/<[^>]*>/g, "").trim().slice(0, 500) || undefined;
}

export function serializePrize(prize) {
  if (!prize) {
    return null;
  }

  return {
    code: prize.code,
    title: prize.title,
    description: prize.description,
    image: prize.image,
    type: prize.type,
    requiresAddress: prize.requiresAddress,
  };
}

export function serializeSpin(spin) {
  return {
    id: spin.id,
    spinId: spin.id,
    status: spin.status,
    createdAt: spin.createdAt,
    updatedAt: spin.updatedAt,
    expiresAt: spin.expiresAt,
    claimedAt: spin.claimedAt,
    fulfilledAt: spin.fulfilledAt,
    deliveredAt: spin.deliveredAt,
    promoCode: spin.promoCode,
    promoExternalId: spin.promoExternalId,
    freeShippingUsedAt: spin.freeShippingUsedAt,
    freeShippingOrderId: spin.freeShippingOrderId,
    adminNote: spin.adminNote,
    emailSentAt: spin.emailSentAt,
    emailError: spin.emailError,
    prize: serializePrize(spin.prize),
    client: {
      id: spin.clientId,
      email: spin.clientEmail,
      phone: spin.clientPhone,
    },
    recipient: {
      name: spin.recipientName,
      phone: spin.recipientPhone,
      address: spin.recipientAddress,
      email: spin.recipientEmail,
    },
    antifraud: {
      guestId: spin.guestId,
      ip: spin.ip,
      fingerprint: spin.fingerprint,
      userAgent: spin.userAgent,
    },
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function ensureSettings(db) {
  return db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      active: true,
      prizeTtlHours: config.prizeTtlHours,
      guidePdfUrl: null,
    },
  });
}

export async function expireSpinIfNeeded(spin, db) {
  if (!spin || spin.status === SpinStatus.EXPIRED) {
    return spin;
  }

  if (![SpinStatus.WON, SpinStatus.CLAIMED].includes(spin.status)) {
    return spin;
  }

  if (new Date(spin.expiresAt).getTime() > Date.now()) {
    return spin;
  }

  return db.spin.update({
    where: { id: spin.id },
    data: { status: SpinStatus.EXPIRED },
    include: INTERNAL_SPIN_INCLUDE,
  });
}

function buildDuplicateFilters({ clientId, clientEmail, clientPhone }) {
  return [
    clientId ? { clientId } : null,
    clientEmail ? { clientEmail } : null,
    clientPhone ? { clientPhone } : null,
  ].filter(Boolean);
}

function formatInsalesDate(dateValue) {
  return new Date(dateValue).toISOString().split("T")[0];
}

function generateManagedPromoCode(prizeCode) {
  const cleaned = prizeCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${config.promoPrefix}-${cleaned}-${randomPart}`;
}

async function attachPromoToSpin(spin, db) {
  if (spin.prize.type === PrizeType.PROMO_CODE && config.promoIssueMode === "insales_api") {
    try {
      const generatedCode = generateManagedPromoCode(spin.prize.code);
      const discount = Number(spin.prize.payload?.discount || 0);

      const insalesDiscount = await insalesApi.issueDiscountCode({
        code: generatedCode,
        description: `Gift Safe — ${spin.prize.title} (24 часа)`,
        discount,
        expiredAt: formatInsalesDate(spin.expiresAt),
        typeId: 1,
        minPrice: config.promoMinOrderPrice,
      });

      return db.spin.update({
        where: { id: spin.id },
        data: {
          promoCode: insalesDiscount?.code || generatedCode,
          promoExternalId: insalesDiscount?.id != null ? String(insalesDiscount.id) : null,
        },
        include: INTERNAL_SPIN_INCLUDE,
      });
    } catch (error) {
      logger.warn(
        {
          spinId: spin.id,
          prizeCode: spin.prize.code,
          error: error.message,
        },
        "failed to issue promo through insales, falling back to local promo pool",
      );
    }
  }

  if (spin.prize.type === PrizeType.PROMO_CODE) {
    return db.$transaction(async (tx) => {
      const promoCode = await reservePromoCode(spin.prize.code, spin.id, tx);

      return tx.spin.update({
        where: { id: spin.id },
        data: {
          promoCode,
        },
        include: INTERNAL_SPIN_INCLUDE,
      });
    });
  }

  return spin;
}

function buildSpinFilters(filters) {
  const where = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = filters.from;
    }
    if (filters.to) {
      where.createdAt.lte = filters.to;
    }
  }

  if (filters.prize) {
    where.prize = {
      code: filters.prize,
    };
  }

  if (filters.query) {
    where.OR = [
      { clientEmail: { contains: filters.query, mode: "insensitive" } },
      { clientPhone: { contains: filters.query, mode: "insensitive" } },
      { recipientPhone: { contains: filters.query, mode: "insensitive" } },
      { recipientName: { contains: filters.query, mode: "insensitive" } },
    ];
  }

  return where;
}

async function fulfillSpinByPrizeType(spin, settings) {
  const recipientEmail = spin.recipientEmail || spin.clientEmail;

  switch (spin.prize.type) {
    case PrizeType.BONUS_POINTS: {
      const amount = Number(spin.prize.payload?.amount || 0);
      await insalesApi.addBonusPoints(spin.clientId, amount, `Gift Safe: ${spin.prize.title}`);
      return {
        status: SpinStatus.FULFILLED,
        message: `${amount} бонусов отправлены в InSales.`,
      };
    }
    case PrizeType.PROMO_CODE:
    case PrizeType.FREE_SHIPPING: {
      if (!recipientEmail) {
        throw new AppError(400, "EMAIL_REQUIRED", "Нужен email для отправки промокода.");
      }

      if (spin.prize.type === PrizeType.PROMO_CODE) {
        await sendPromoCodeEmail({
          to: recipientEmail,
          code: spin.promoCode,
          title: spin.prize.title,
        });

        return {
          status: SpinStatus.FULFILLED,
          emailSentAt: new Date(),
          message: `Промокод отправлен на ${recipientEmail}.`,
        };
      }

      return {
        status: SpinStatus.FULFILLED,
        emailSentAt: null,
        message: "Бесплатная доставка привязана к аккаунту и применится автоматически при следующем заказе.",
      };
    }
    case PrizeType.GUIDE: {
      if (!recipientEmail) {
        throw new AppError(400, "EMAIL_REQUIRED", "Нужен email для отправки гайда.");
      }

      const pdfUrl = settings.guidePdfUrl || spin.prize.payload?.pdfUrl;
      if (!pdfUrl) {
        throw new AppError(409, "GUIDE_NOT_CONFIGURED", "Для гайда пока не задан PDF URL.");
      }

      await sendGuideEmail({
        to: recipientEmail,
        title: spin.prize.title,
        pdfUrl,
      });

      return {
        status: SpinStatus.FULFILLED,
        emailSentAt: new Date(),
        message: `Гайд отправлен на ${recipientEmail}.`,
      };
    }
    case PrizeType.PHYSICAL:
    case PrizeType.GIFT_BOX:
    default: {
      if (recipientEmail) {
        await sendPhysicalConfirmationEmail({
          to: recipientEmail,
          title: spin.prize.title,
        });
      }

      return {
        status: SpinStatus.AWAITING_FULFILL,
        message: "Данные получателя сохранены. Дальше подарок обрабатывается в админке.",
      };
    }
  }
}

export function resolvePrizeForSpin(prizes, input) {
  const forcedPrizeCode = config.debug.enabled
    ? sanitizeText(input.debugPrizeCode) || sanitizeText(config.debug.forcePrizeCode)
    : undefined;

  if (forcedPrizeCode) {
    const forcedPrize = prizes.find((prize) => prize.code === forcedPrizeCode && prize.active);
    if (!forcedPrize) {
      throw new AppError(400, "DEBUG_PRIZE_NOT_FOUND", `Приз ${forcedPrizeCode} не найден или выключен.`);
    }

    return forcedPrize;
  }

  return rollPrize(prizes);
}

export async function startSpin(input, db) {
  const settings = await ensureSettings(db);

  if (!settings.active) {
    throw new AppError(403, "PROMO_INACTIVE", "Акция сейчас не активна.");
  }

  if (!config.debug.allowRepeatSpins) {
    const antiFraudResult = await canSpin(
      {
        guestId: input.guestId,
        fingerprint: input.fingerprint,
        ip: input.ip,
        fingerprintWindowDays: config.fingerprintWindowDays,
        ipSpinLimit: config.ipSpinLimit,
      },
      db,
    );

    if (!antiFraudResult.allowed && antiFraudResult.reason === "ALREADY_SPUN") {
      const maybeExpired = await expireSpinIfNeeded(antiFraudResult.existingSpin, db);

      if (maybeExpired.status === SpinStatus.EXPIRED) {
        throw new AppError(410, "PRIZE_EXPIRED", "Время получения приза уже закончилось.");
      }

      return {
        spin: maybeExpired,
        alreadySpun: true,
      };
    }

    if (!antiFraudResult.allowed) {
      throw new AppError(429, antiFraudResult.reason, "Повторная попытка розыгрыша заблокирована.");
    }
  }

  const prizes = await db.prize.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      image: true,
      weight: true,
      active: true,
      type: true,
      requiresAddress: true,
      payload: true,
    },
  });

  if (prizes.length === 0) {
    throw new AppError(500, "NO_PRIZES", "Нет активных призов.");
  }

  const pickedPrize = resolvePrizeForSpin(prizes, input);
  const ttlMs = config.debug.enabled && config.debug.spinTtlMinutes > 0
    ? config.debug.spinTtlMinutes * 60 * 1000
    : settings.prizeTtlHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    let spin = await db.$transaction(async (tx) => {
      await tx.guest.upsert({
        where: { id: input.guestId },
        update: {
          fingerprint: input.fingerprint || null,
          ip: input.ip || null,
          userAgent: input.userAgent || null,
        },
        create: {
          id: input.guestId,
          fingerprint: input.fingerprint || null,
          ip: input.ip || null,
          userAgent: input.userAgent || null,
        },
      });

      const createdSpin = await tx.spin.create({
        data: {
          guestId: input.guestId,
          prizeId: pickedPrize.id,
          fingerprint: input.fingerprint || null,
          ip: input.ip || null,
          userAgent: input.userAgent || null,
          expiresAt,
        },
        include: INTERNAL_SPIN_INCLUDE,
      });
      return createdSpin;
    });

    spin = await attachPromoToSpin(spin, db);

    return {
      spin,
      alreadySpun: false,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingSpin = await db.spin.findUnique({
        where: { guestId: input.guestId },
        include: INTERNAL_SPIN_INCLUDE,
      });

      if (existingSpin) {
        return {
          spin: existingSpin,
          alreadySpun: true,
        };
      }
    }

    throw error;
  }
}

export async function claimSpin(input, db) {
  const spin = await db.spin.findUnique({
    where: { guestId: input.guestId },
    include: INTERNAL_SPIN_INCLUDE,
  });

  if (!spin) {
    throw new AppError(404, "SPIN_NOT_FOUND", "Розыгрыш для этого браузера не найден.");
  }

  const maybeExpired = await expireSpinIfNeeded(spin, db);
  if (maybeExpired.status === SpinStatus.EXPIRED) {
    throw new AppError(410, "PRIZE_EXPIRED", "Приз уже сгорел.");
  }

  const normalizedClientId = String(input.clientId);
  const normalizedEmail = sanitizeText(input.clientEmail)?.toLowerCase();
  const normalizedPhone = sanitizeText(input.clientPhone);

  const duplicateFilters = buildDuplicateFilters({
    clientId: normalizedClientId,
    clientEmail: normalizedEmail,
    clientPhone: normalizedPhone,
  });

  if (duplicateFilters.length > 0) {
    const duplicateSpin = await db.spin.findFirst({
      where: {
        id: { not: spin.id },
        OR: duplicateFilters,
      },
    });

    if (duplicateSpin) {
      await db.antifraudLog.create({
        data: {
          reason: "CLIENT_DUPLICATE",
          guestId: spin.guestId,
          meta: {
            duplicateSpinId: duplicateSpin.id,
            clientId: normalizedClientId,
            clientEmail: normalizedEmail,
            clientPhone: normalizedPhone,
          },
        },
      });

      throw new AppError(409, "CLIENT_ALREADY_CLAIMED", "Этот клиент уже забирал другой приз.");
    }
  }

  return db.spin.update({
    where: { id: spin.id },
    data: {
      clientId: normalizedClientId,
      clientEmail: normalizedEmail || spin.clientEmail,
      clientPhone: normalizedPhone || spin.clientPhone,
      status: SpinStatus.CLAIMED,
      claimedAt: spin.claimedAt || new Date(),
    },
    include: INTERNAL_SPIN_INCLUDE,
  });
}

export async function getClientPrize(clientId, db) {
  const spin = await db.spin.findFirst({
    where: { clientId: String(clientId) },
    include: INTERNAL_SPIN_INCLUDE,
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!spin) {
    return null;
  }

  const maybeExpired = await expireSpinIfNeeded(spin, db);
  if (maybeExpired.status === SpinStatus.EXPIRED) {
    return null;
  }

  return maybeExpired;
}

export async function deliverPrize(input, db) {
  const spin = await db.spin.findFirst({
    where: {
      id: input.spinId,
      clientId: String(input.clientId),
    },
    include: INTERNAL_SPIN_INCLUDE,
  });

  if (!spin) {
    throw new AppError(404, "SPIN_NOT_FOUND", "Приз для этого клиента не найден.");
  }

  const maybeExpired = await expireSpinIfNeeded(spin, db);
  if (maybeExpired.status === SpinStatus.EXPIRED) {
    throw new AppError(410, "PRIZE_EXPIRED", "Срок действия приза истек.");
  }

  const settings = await ensureSettings(db);
  const recipientName = sanitizeText(input.recipientName);
  const recipientPhone = sanitizeText(input.recipientPhone);
  const recipientAddress = sanitizeText(input.recipientAddress);
  const recipientEmail = sanitizeText(input.recipientEmail)?.toLowerCase();

  if (maybeExpired.prize.requiresAddress) {
    if (!recipientName || !recipientPhone || !recipientAddress) {
      throw new AppError(
        400,
        "ADDRESS_REQUIRED",
        "Для физического приза нужны имя, телефон и адрес получателя.",
      );
    }
  } else if (!recipientEmail && !maybeExpired.clientEmail) {
    throw new AppError(400, "EMAIL_REQUIRED", "Укажи email, куда можно отправить приз.");
  }

  const preparedSpin = await db.spin.update({
    where: { id: maybeExpired.id },
    data: {
      recipientName: recipientName || maybeExpired.recipientName,
      recipientPhone: recipientPhone || maybeExpired.recipientPhone,
      recipientAddress: recipientAddress || maybeExpired.recipientAddress,
      recipientEmail: recipientEmail || maybeExpired.recipientEmail || maybeExpired.clientEmail,
      deliveredAt: new Date(),
    },
    include: INTERNAL_SPIN_INCLUDE,
  });

  let fulfillment;

  try {
    fulfillment = await fulfillSpinByPrizeType(preparedSpin, settings);
  } catch (error) {
    await db.spin.update({
      where: { id: preparedSpin.id },
      data: {
        emailError: error.message,
      },
    });
    throw error;
  }

  const updatedSpin = await db.spin.update({
    where: { id: preparedSpin.id },
    data: {
      status: fulfillment.status,
      fulfilledAt: fulfillment.status === SpinStatus.FULFILLED ? new Date() : preparedSpin.fulfilledAt,
      emailSentAt: fulfillment.emailSentAt,
      emailError: null,
    },
    include: INTERNAL_SPIN_INCLUDE,
  });

  return {
    spin: updatedSpin,
    message: fulfillment.message,
  };
}

export async function listSpins(filters, db) {
  const limit = Number(filters.limit || 50);
  const page = Number(filters.page || 1);
  const where = buildSpinFilters(filters);

  return db.spin.findMany({
    where,
    include: {
      prize: {
        select: PUBLIC_PRIZE_FIELDS,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export async function getSpinById(id, db) {
  const spin = await db.spin.findUnique({
    where: { id },
    include: INTERNAL_SPIN_INCLUDE,
  });

  if (!spin) {
    throw new AppError(404, "SPIN_NOT_FOUND", "Крутка не найдена.");
  }

  return spin;
}

export async function listPrizes(db) {
  return db.prize.findMany({
    orderBy: {
      weight: "desc",
    },
  });
}

export async function updatePrize(id, input, db) {
  return db.prize.update({
    where: { id },
    data: {
      weight: input.weight ?? undefined,
      active: typeof input.active === "boolean" ? input.active : undefined,
    },
  });
}

export async function updateSpin(id, input, db) {
  return db.spin.update({
    where: { id },
    data: {
      status: input.status ?? undefined,
      adminNote: input.adminNote ?? undefined,
      fulfilledAt: input.status === SpinStatus.FULFILLED ? new Date() : undefined,
    },
    include: INTERNAL_SPIN_INCLUDE,
  });
}

export async function fulfillSpin(id, db) {
  return db.spin.update({
    where: { id },
    data: {
      status: SpinStatus.FULFILLED,
      fulfilledAt: new Date(),
    },
    include: INTERNAL_SPIN_INCLUDE,
  });
}

export async function getStats(db) {
  const now = Date.now();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000);
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [spins, todayCount, weekCount, monthCount] = await Promise.all([
    db.spin.findMany({
      include: {
        prize: {
          select: {
            title: true,
            code: true,
          },
        },
      },
    }),
    db.spin.count({ where: { createdAt: { gte: dayStart } } }),
    db.spin.count({ where: { createdAt: { gte: weekStart } } }),
    db.spin.count({ where: { createdAt: { gte: monthStart } } }),
  ]);

  const totals = spins.reduce(
    (acc, spin) => {
      acc.total += 1;
      acc.byStatus[spin.status] = (acc.byStatus[spin.status] || 0) + 1;
      acc.byPrize[spin.prize.code] = {
        title: spin.prize.title,
        count: (acc.byPrize[spin.prize.code]?.count || 0) + 1,
      };
      return acc;
    },
    {
      total: 0,
      byStatus: {},
      byPrize: {},
    },
  );

  const topPrizes = Object.entries(totals.byPrize)
    .map(([code, value]) => ({
      code,
      title: value.title,
      count: value.count,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  return {
    totalSpins: totals.total,
    todayCount,
    weekCount,
    monthCount,
    byStatus: totals.byStatus,
    topPrizes,
  };
}

export async function listAntifraudLogs(filters, db) {
  const where = {};

  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = filters.from;
    }
    if (filters.to) {
      where.createdAt.lte = filters.to;
    }
  }

  return db.antifraudLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });
}

export async function uploadPromoCodeBatch(prizeCode, codes, db) {
  return uploadPromoCodes(prizeCode, codes, db);
}

export async function getPromoPoolStats(db) {
  return getPromoStats(db);
}

export async function exportSpinsCsv(filters, db) {
  const spins = await db.spin.findMany({
    where: buildSpinFilters(filters),
    include: {
      prize: {
        select: PUBLIC_PRIZE_FIELDS,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const header = [
    "createdAt",
    "prize",
    "status",
    "clientEmail",
    "clientPhone",
    "recipientName",
    "recipientPhone",
    "recipientAddress",
    "promoCode",
    "ip",
  ];

  const rows = spins.map((spin) => [
    spin.createdAt.toISOString(),
    spin.prize.title,
    spin.status,
    spin.clientEmail || "",
    spin.clientPhone || "",
    spin.recipientName || "",
    spin.recipientPhone || "",
    spin.recipientAddress || "",
    spin.promoCode || "",
    spin.ip || "",
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}
