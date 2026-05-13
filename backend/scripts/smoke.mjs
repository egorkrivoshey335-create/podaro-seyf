import assert from "node:assert/strict";

import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const server = app.listen(0, async () => {
  try {
    const { port } = server.address();
    const seed = Date.now();
    const guestId = `guest-smoke-${seed}`;
    const clientId = `client-smoke-${seed}`;
    const clientEmail = `smoke+${seed}@example.com`;
    const clientPhone = `+7999${String(seed).slice(-7)}`;
    const freeShippingClientId = `client-ship-${seed}`;
    const freeShippingEmail = `free-shipping+${seed}@example.com`;
    const freeShippingPhone = `+7888${String(seed).slice(-7)}`;

    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    const health = await healthResponse.json();

    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: {
        guidePdfUrl: "https://example.com/guide.pdf",
      },
      create: {
        id: "singleton",
        active: true,
        prizeTtlHours: 24,
        guidePdfUrl: "https://example.com/guide.pdf",
      },
    });

    const spinResponse = await fetch(`http://127.0.0.1:${port}/api/spin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guestId,
        fingerprint: `fp-smoke-${Date.now()}`,
        userAgent: "cursor-smoke",
      }),
    });

    const spin = await spinResponse.json();
    const claimResponse = await fetch(`http://127.0.0.1:${port}/api/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guestId,
        clientId,
        clientEmail,
        clientPhone,
      }),
    });
    const claim = await claimResponse.json();

    const myPrizeResponse = await fetch(
      `http://127.0.0.1:${port}/api/my-prize?clientId=${encodeURIComponent(clientId)}`,
    );
    const myPrize = await myPrizeResponse.json();

    const deliverPayload = spin.prize.requiresAddress
      ? {
          spinId: spin.spinId,
          clientId,
          recipientName: "Smoke Test",
          recipientPhone: clientPhone,
          recipientAddress: "Москва, ул. Тестовая, 1",
          recipientEmail: clientEmail,
        }
      : {
          spinId: spin.spinId,
          clientId,
          recipientEmail: clientEmail,
        };

    const deliverResponse = await fetch(`http://127.0.0.1:${port}/api/deliver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deliverPayload),
    });
    const deliver = await deliverResponse.json();

    const freeShippingPrize = await prisma.prize.findUnique({
      where: { code: "free-shipping" },
    });
    assert.ok(freeShippingPrize, "Free shipping prize must exist in database");

    const freeGuestId = `guest-ship-${Date.now()}`;
    await prisma.guest.upsert({
      where: { id: freeGuestId },
      update: {},
      create: {
        id: freeGuestId,
        ip: "127.0.0.1",
        fingerprint: `fp-ship-${Date.now()}`,
        userAgent: "cursor-smoke",
      },
    });

    const freeShippingSpin = await prisma.spin.create({
      data: {
        guestId: freeGuestId,
        prizeId: freeShippingPrize.id,
        status: "FULFILLED",
        clientId: freeShippingClientId,
        clientEmail: freeShippingEmail,
        clientPhone: freeShippingPhone,
        recipientEmail: freeShippingEmail,
        claimedAt: new Date(),
        deliveredAt: new Date(),
        fulfilledAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const discountPayload = {
      order: {
        id: `order-${Date.now()}`,
        financial_status: "pending",
        delivery_price: 350,
        client: {
          id: freeShippingClientId,
          email: freeShippingEmail,
          phone: freeShippingPhone,
        },
      },
    };

    const externalDiscountResponse = await fetch(
      `http://127.0.0.1:${port}/api/insales/external-discounts/free-shipping`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(discountPayload),
      },
    );
    const externalDiscount = await externalDiscountResponse.json();

    const orderStatusResponse = await fetch(`http://127.0.0.1:${port}/api/insales/webhooks/order-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          ...discountPayload.order,
          financial_status: "paid",
        },
      }),
    });
    const orderStatus = await orderStatusResponse.json();

    const externalDiscountAfterUseResponse = await fetch(
      `http://127.0.0.1:${port}/api/insales/external-discounts/free-shipping`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(discountPayload),
      },
    );
    const externalDiscountAfterUse = await externalDiscountAfterUseResponse.json();

    assert.equal(health.status, "ok");
    assert.equal(spinResponse.ok, true, `spin failed: ${JSON.stringify(spin)}`);
    assert.equal(claimResponse.ok, true, `claim failed: ${JSON.stringify(claim)}`);
    assert.equal(myPrizeResponse.ok, true, `my-prize failed: ${JSON.stringify(myPrize)}`);
    assert.equal(deliverResponse.ok, true, `deliver failed: ${JSON.stringify(deliver)}`);
    assert.equal(externalDiscountResponse.ok, true, `external discount failed: ${JSON.stringify(externalDiscount)}`);
    assert.equal(orderStatusResponse.ok, true, `order webhook failed: ${JSON.stringify(orderStatus)}`);
    assert.equal(externalDiscountAfterUseResponse.ok, true, `external discount after use failed: ${JSON.stringify(externalDiscountAfterUse)}`);
    assert.equal(externalDiscount.discount, 350);
    assert.equal(externalDiscount.discount_type, "MONEY");
    assert.equal(orderStatus.used, true);
    assert.equal(orderStatus.orderId, discountPayload.order.id);
    assert.deepEqual(externalDiscountAfterUse, { errors: [] });

    console.log(
      JSON.stringify(
        {
          health,
          spin,
          claim,
          myPrize,
          deliver,
          freeShippingSpinId: freeShippingSpin.id,
          externalDiscount,
          orderStatus,
          externalDiscountAfterUse,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    server.close();
  }
});
