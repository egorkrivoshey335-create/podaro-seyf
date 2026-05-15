import test from "node:test";
import assert from "node:assert/strict";

import { insalesApi } from "../src/services/insalesApi.js";
import { deleteSpin } from "../src/services/spinService.js";

test("deleteSpin removes the spin, clears promo pool binding, and deletes managed promo code", async () => {
  const originalDeleteDiscountCode = insalesApi.deleteDiscountCode;
  const deletedDiscountIds = [];
  const poolResetCalls = [];
  const deletedSpinIds = [];

  insalesApi.deleteDiscountCode = async (discountId) => {
    deletedDiscountIds.push(discountId);
  };

  try {
    const spin = {
      id: "spin_1",
      promoExternalId: "promo_ext_1",
      prize: { type: "PROMO_CODE" },
    };

    const fakeDb = {
      spin: {
        findUnique: async () => spin,
      },
      $transaction: async (callback) =>
        callback({
          promoCodePool: {
            updateMany: async (payload) => {
              poolResetCalls.push(payload);
              return { count: 1 };
            },
          },
          spin: {
            delete: async ({ where }) => {
              deletedSpinIds.push(where.id);
              return spin;
            },
          },
        }),
    };

    const result = await deleteSpin("spin_1", fakeDb);

    assert.equal(result.id, "spin_1");
    assert.deepEqual(deletedDiscountIds, ["promo_ext_1"]);
    assert.deepEqual(poolResetCalls, [
      {
        where: { spinId: "spin_1" },
        data: {
          used: false,
          usedAt: null,
          spinId: null,
        },
      },
    ]);
    assert.deepEqual(deletedSpinIds, ["spin_1"]);
  } finally {
    insalesApi.deleteDiscountCode = originalDeleteDiscountCode;
  }
});

test("deleteSpin throws when the spin does not exist", async () => {
  const fakeDb = {
    spin: {
      findUnique: async () => null,
    },
  };

  await assert.rejects(
    () => deleteSpin("missing_spin", fakeDb),
    (error) => error.code === "SPIN_NOT_FOUND",
  );
});
