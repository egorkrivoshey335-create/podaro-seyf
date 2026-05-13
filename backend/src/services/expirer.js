import cron from "node-cron";
import prismaClientPkg from "@prisma/client";

import { logger } from "../lib/logger.js";
import { insalesApi } from "./insalesApi.js";

const { SpinStatus } = prismaClientPkg;

export function startExpirer(prisma) {
  const task = cron.schedule("*/10 * * * *", async () => {
    try {
      const expiredSpins = await prisma.spin.findMany({
        where: {
          status: {
            in: [SpinStatus.WON, SpinStatus.CLAIMED],
          },
          expiresAt: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          promoExternalId: true,
        },
      });

      for (const spin of expiredSpins) {
        if (spin.promoExternalId) {
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
    } catch (error) {
      logger.error({ error }, "failed to expire old spins");
    }
  });

  return task;
}
