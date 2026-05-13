import test from "node:test";
import assert from "node:assert/strict";

import {
  getFreeShippingDiscountResponse,
  markFreeShippingUsedFromOrder,
  parseInsalesOrderPayload,
} from "../src/services/externalDiscounts.js";

test("parseInsalesOrderPayload extracts client and delivery fields", () => {
  const result = parseInsalesOrderPayload({
    order: {
      id: 123,
      financial_status: "pending",
      delivery_price: 350,
      client: {
        id: 77,
        email: "User@Example.com",
        phone: "+79990000000",
      },
    },
  });

  assert.equal(result.orderId, "123");
  assert.equal(result.clientId, "77");
  assert.equal(result.email, "user@example.com");
  assert.equal(result.phone, "+79990000000");
  assert.equal(result.deliveryPrice, 350);
  assert.equal(result.financialStatus, "pending");
});

test("getFreeShippingDiscountResponse returns money discount for matching active prize", async () => {
  const fakeDb = {
    spin: {
      findFirst: async () => ({
        id: "spin_free_1",
        prize: {
          type: "FREE_SHIPPING",
        },
      }),
    },
  };

  const result = await getFreeShippingDiscountResponse(
    {
      order: {
        id: 555,
        financial_status: "pending",
        delivery_price: 490,
        client: {
          id: 1001,
          email: "winner@example.com",
        },
      },
    },
    fakeDb,
  );

  assert.deepEqual(result, {
    discount: 490,
    discount_type: "MONEY",
    title: "Бесплатная доставка за подарок из сейфа",
  });
});

test("markFreeShippingUsedFromOrder stores order id after paid order", async () => {
  let updatePayload = null;

  const fakeDb = {
    spin: {
      findFirst: async () => ({
        id: "spin_free_2",
        prize: {
          type: "FREE_SHIPPING",
        },
      }),
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
    },
  };

  const result = await markFreeShippingUsedFromOrder(
    {
      order: {
        id: 999,
        financial_status: "paid",
        delivery_price: 250,
        client: {
          id: 501,
          email: "winner@example.com",
        },
      },
    },
    fakeDb,
  );

  assert.equal(result.success, true);
  assert.equal(result.used, true);
  assert.equal(result.spinId, "spin_free_2");
  assert.equal(result.orderId, "999");
  assert.equal(updatePayload.where.id, "spin_free_2");
  assert.equal(updatePayload.data.freeShippingOrderId, "999");
  assert.ok(updatePayload.data.freeShippingUsedAt instanceof Date);
});
