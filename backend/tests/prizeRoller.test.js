import test from "node:test";
import assert from "node:assert/strict";

import { config } from "../src/config.js";
import { rollPrize } from "../src/services/prizeRoller.js";
import { generateManagedPromoCode, resolvePrizeForSpin } from "../src/services/spinService.js";

test("rollPrize throws when there are no active prizes", () => {
  assert.throws(() => rollPrize([]), /No active prizes available/);
});

test("rollPrize roughly follows configured weights", () => {
  const prizes = [
    { code: "a", active: true, weight: 700 },
    { code: "b", active: true, weight: 300 },
  ];

  const results = { a: 0, b: 0 };
  const iterations = 25_000;

  for (let index = 0; index < iterations; index += 1) {
    const prize = rollPrize(prizes);
    results[prize.code] += 1;
  }

  const ratioA = results.a / iterations;
  const ratioB = results.b / iterations;

  assert.ok(Math.abs(ratioA - 0.7) < 0.03, `Expected ratio for a near 0.7, got ${ratioA}`);
  assert.ok(Math.abs(ratioB - 0.3) < 0.03, `Expected ratio for b near 0.3, got ${ratioB}`);
});

test("resolvePrizeForSpin returns the forced active prize in debug mode", () => {
  const prizes = [
    { code: "promo-10", active: true, weight: 100 },
    { code: "promo-20", active: true, weight: 100 },
  ];

  const result = resolvePrizeForSpin(prizes, { debugPrizeCode: "promo-20" });
  assert.equal(result.code, "promo-20");
});

test("generateManagedPromoCode uses configured prefix and numeric suffix", () => {
  const code = generateManagedPromoCode();
  const expectedPrefix = `${config.promoPrefix}-`;

  assert.ok(code.startsWith(expectedPrefix));
  assert.match(code.slice(expectedPrefix.length), /^\d{8}$/);
});
