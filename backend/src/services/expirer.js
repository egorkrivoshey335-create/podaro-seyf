import cron from "node-cron";
import prismaClientPkg from "@prisma/client";

import { logger } from "../lib/logger.js";
import { insalesApi } from "./insalesApi.js";

const { PrizeType, SpinStatus } = prismaClientPkg;

function wasDiscountCodeUsed(discountCode) {
  return Boolean(discountCode?.worked || discountCode?.used);
}

async function cleanupExpiredDiscountCode(spin) {
  if (!spin.promoExternalId) {
    return;
  }

  if (spin.prize?.type === PrizeType.PROMO_CODE) {
    try {
      const discountCode = await insalesApi.getDiscountCode(spin.promoExternalId);
      if (wasDiscountCodeUsed(discountCode)) {
        return;
      }
    } catch (error) {
      if (error?.status !== 404) {
        logger.warn(
          {
            spinId: spin.id,
            promoExternalId: spin.promoExternalId,
            error: error.message,
          },
          "failed to inspect expired insales discount code before cleanup",
        );
      } else {
        return;
      }
    }
  }

  try {
    await insalesApi.deleteDiscountCode(spin.promoExternalId);
  } catch (error) {
    logger.warn(
      {
        spinId: spin.id,
        promoExternalId: spin.promoExternalId,
        error: error.message,
      },
      "failed to delete expired insales discount code",
    );
  }
}

export async function expireOldSpins(prisma) {
  const expiredSpins = await prisma.spin.findMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
      OR: [
        {
          status: {
            in: [SpinStatus.WON, SpinStatus.CLAIMED],
          },
        },
        {
          status: SpinStatus.FULFILLED,
          prize: {
            type: PrizeType.PROMO_CODE,
          },
        },
      ],
    },
    select: {
      id: true,
      promoExternalId: true,
      prize: {
        select: {
          type: true,
        },
      },
    },
  });

  for (const spin of expiredSpins) {
    await cleanupExpiredDiscountCode(spin);
  }

  if (expiredSpins.length > 0) {
    const result = await prisma.spin.updateMany({
      where: {
        id: {
          in: expiredSpins.map((spin) => spin.id),
        },
      },
      data: {
        status: SpinStatus.EXPIRED,
      },
    });

    logger.info({ expiredCount: result.count }, "expired old spins");
  }
}

export function startExpirer(prisma) {
  const task = cron.schedule("*/10 * * * *", async () => {
    try {
      await expireOldSpins(prisma);
    } catch (error) {
      logger.error({ error }, "failed to expire old spins");
    }
  });

  return task;
}
