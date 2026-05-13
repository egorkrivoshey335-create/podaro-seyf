import test from "node:test";
import assert from "node:assert/strict";

import { claimSpin } from "../src/services/spinService.js";

function createBaseSpin() {
  return {
    id: "spin_1",
    guestId: "guest_1",
    status: "WON",
    expiresAt: new Date(Date.now() + 60_000),
    claimedAt: null,
    clientEmail: null,
    clientPhone: null,
    prize: {
      code: "promo-10",
      title: "Промокод на скидку 10%",
      description: "desc",
      image: "/assets/prizes/promo-10.webp",
      type: "PROMO_CODE",
      requiresAddress: false,
      payload: { discount: 10 },
    },
  };
}

test("claimSpin rejects duplicate client binding", async () => {
  const fakeDb = {
    spin: {
      findUnique: async () => createBaseSpin(),
      findFirst: async () => ({ id: "spin_2" }),
      update: async () => {
        throw new Error("should not update when duplicate exists");
      },
    },
    antifraudLog: {
      create: async () => undefined,
    },
  };

  await assert.rejects(
    () =>
      claimSpin(
        {
          guestId: "guest_1",
          clientId: "123",
          clientEmail: "test@example.com",
          clientPhone: "+79990000000",
        },
        fakeDb,
      ),
    (error) => error.code === "CLIENT_ALREADY_CLAIMED",
  );
});

test("claimSpin stores client binding and changes status to CLAIMED", async () => {
  const updatedSpin = {
    ...createBaseSpin(),
    status: "CLAIMED",
    clientId: "123",
    clientEmail: "test@example.com",
    clientPhone: "+79990000000",
    claimedAt: new Date(),
  };

  const fakeDb = {
    spin: {
      findUnique: async () => createBaseSpin(),
      findFirst: async () => null,
      update: async () => updatedSpin,
    },
    antifraudLog: {
      create: async () => undefined,
    },
  };

  const result = await claimSpin(
    {
      guestId: "guest_1",
      clientId: "123",
      clientEmail: "test@example.com",
      clientPhone: "+79990000000",
    },
    fakeDb,
  );

  assert.equal(result.status, "CLAIMED");
  assert.equal(result.clientId, "123");
});
