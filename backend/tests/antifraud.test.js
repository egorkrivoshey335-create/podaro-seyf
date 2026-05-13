import test from "node:test";
import assert from "node:assert/strict";

import { canSpin } from "../src/services/antifraud.js";

test("canSpin returns already spun when guest exists", async () => {
  const fakeDb = {
    spin: {
      findUnique: async () => ({ id: "spin_1", prize: { code: "promo-10" } }),
    },
    antifraudLog: {
      create: async () => undefined,
    },
  };

  const result = await canSpin(
    {
      guestId: "guest_1",
      fingerprint: "fingerprint_1",
      ip: "127.0.0.1",
      fingerprintWindowDays: 30,
      ipSpinLimit: 5,
    },
    fakeDb,
  );

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "ALREADY_SPUN");
  assert.equal(result.existingSpin.id, "spin_1");
});
