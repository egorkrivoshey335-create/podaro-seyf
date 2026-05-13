import prismaClientPkg from "@prisma/client";

import { AppError } from "../lib/errors.js";

const { Prisma } = prismaClientPkg;

export async function reservePromoCode(prizeCode, spinId, tx) {
  const rows = await tx.$queryRaw(
    Prisma.sql`
      SELECT id, code
      FROM "PromoCodePool"
      WHERE "prizeCode" = ${prizeCode} AND "used" = false
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `,
  );

  const row = rows[0];

  if (!row) {
    throw new AppError(409, "PROMO_POOL_EMPTY", `Для приза ${prizeCode} закончились промокоды.`);
  }

  await tx.promoCodePool.update({
    where: { id: row.id },
    data: {
      used: true,
      usedAt: new Date(),
      spinId,
    },
  });

  return row.code;
}

export async function uploadPromoCodes(prizeCode, codes, db) {
  const cleanCodes = Array.from(
    new Set(
      codes
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ).map((code) => ({
    prizeCode,
    code,
  }));

  if (cleanCodes.length === 0) {
    return { inserted: 0 };
  }

  const result = await db.promoCodePool.createMany({
    data: cleanCodes,
    skipDuplicates: true,
  });

  return {
    inserted: result.count,
  };
}

export async function getPromoStats(db) {
  const grouped = await db.promoCodePool.groupBy({
    by: ["prizeCode", "used"],
    _count: {
      _all: true,
    },
  });

  const stats = new Map();

  for (const item of grouped) {
    if (!stats.has(item.prizeCode)) {
      stats.set(item.prizeCode, {
        prizeCode: item.prizeCode,
        total: 0,
        used: 0,
        available: 0,
      });
    }

    const row = stats.get(item.prizeCode);
    row.total += item._count._all;
    if (item.used) {
      row.used += item._count._all;
    } else {
      row.available += item._count._all;
    }
  }

  return Array.from(stats.values()).sort((left, right) => left.prizeCode.localeCompare(right.prizeCode));
}
