import test from "node:test";
import assert from "node:assert/strict";

import { insalesApi } from "../src/services/insalesApi.js";
import { expireOldSpins } from "../src/services/expirer.js";

test("expireOldSpins deletes unused expired promo codes", async () => {
  const originalGetDiscountCode = insalesApi.getDiscountCode;
  const originalDeleteDiscountCode = insalesApi.deleteDiscountCode;
  const deletedDiscountIds = [];
  let expiredSpinIds = [];

  insalesApi.getDiscountCode = async () => ({ worked: false });
  insalesApi.deleteDiscountCode = async (discountId) => {
    deletedDiscountIds.push(discountId);
  };

  try {
    const fakePrisma = {
      spin: {
        findMany: async () => [
          {
            id: "spin_1",
            promoExternalId: "promo_ext_1",
            prize: { type: "PROMO_CODE" },
          },
        ],
        updateMany: async ({ where }) => {
          expiredSpinIds = where.id.in;
          return { count: where.id.in.length };
        },
      },
    };

    await expireOldSpins(fakePrisma);

    assert.deepEqual(deletedDiscountIds, ["promo_ext_1"]);
    assert.deepEqual(expiredSpinIds, ["spin_1"]);
  } finally {
    insalesApi.getDiscountCode = originalGetDiscountCode;
    insalesApi.deleteDiscountCode = originalDeleteDiscountCode;
  }
});

test("expireOldSpins keeps used promo codes in InSales but expires the local spin", async () => {
  const originalGetDiscountCode = insalesApi.getDiscountCode;
  const originalDeleteDiscountCode = insalesApi.deleteDiscountCode;
  let expiredSpinIds = [];

  insalesApi.getDiscountCode = async () => ({ worked: true });
  insalesApi.deleteDiscountCode = async () => {
    throw new Error("deleteDiscountCode should not be called for used promo codes");
  };

  try {
    const fakePrisma = {
      spin: {
        findMany: async () => [
          {
            id: "spin_2",
            promoExternalId: "promo_ext_2",
            prize: { type: "PROMO_CODE" },
          },
        ],
        updateMany: async ({ where }) => {
          expiredSpinIds = where.id.in;
          return { count: where.id.in.length };
        },
      },
    };

    await expireOldSpins(fakePrisma);

    assert.deepEqual(expiredSpinIds, ["spin_2"]);
  } finally {
    insalesApi.getDiscountCode = originalGetDiscountCode;
    insalesApi.deleteDiscountCode = originalDeleteDiscountCode;
  }
});
