import { PrizeType, SpinStatus } from "@prisma/client";

import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

function normalizeEmail(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function normalizePhone(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") {
      continue;
    }

    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function parseInsalesOrderPayload(payload) {
  const order = payload?.order || payload || {};
  const client = order.client || payload?.client || {};

  return {
    raw: payload,
    order,
    orderId: order.id != null ? String(order.id) : order.number != null ? String(order.number) : null,
    clientId:
      client.id != null ? String(client.id) : order.client_id != null ? String(order.client_id) : null,
    email: normalizeEmail(client.email || order.email || order.client_email),
    phone: normalizePhone(client.phone || order.phone || order.client_phone),
    deliveryPrice: toNumber(
      order.delivery_price,
      order.full_delivery_price,
      order.delivery_info?.price,
      order.delivery_variant?.delivery_price,
      order.delivery_variant?.price,
    ),
    financialStatus: String(order.financial_status || payload?.financial_status || "").toLowerCase(),
  };
}

function buildFreeShippingWhere(orderData) {
  const orFilters = [
    orderData.clientId ? { clientId: orderData.clientId } : null,
    orderData.email ? { clientEmail: orderData.email } : null,
    orderData.phone ? { clientPhone: orderData.phone } : null,
  ].filter(Boolean);

  if (orFilters.length === 0) {
    return null;
  }

  return {
    OR: orFilters,
    status: SpinStatus.FULFILLED,
    freeShippingUsedAt: null,
    expiresAt: {
      gt: new Date(),
    },
    prize: {
      type: PrizeType.FREE_SHIPPING,
    },
  };
}

export async function getFreeShippingDiscountResponse(payload, db) {
  const orderData = parseInsalesOrderPayload(payload);
  const where = buildFreeShippingWhere(orderData);

  if (!where || orderData.deliveryPrice <= 0) {
    return { errors: [] };
  }

  const spin = await db.spin.findFirst({
    where,
    include: {
      prize: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!spin) {
    return { errors: [] };
  }

  logger.info(
    {
      spinId: spin.id,
      orderId: orderData.orderId,
      deliveryPrice: orderData.deliveryPrice,
    },
    "free shipping external discount matched",
  );

  return {
    discount: orderData.deliveryPrice,
    discount_type: "MONEY",
    title: "Бесплатная доставка за подарок из сейфа",
  };
}

export async function markFreeShippingUsedFromOrder(payload, db) {
  const orderData = parseInsalesOrderPayload(payload);
  const where = buildFreeShippingWhere(orderData);

  if (!where) {
    return {
      success: true,
      used: false,
      reason: "CLIENT_NOT_IDENTIFIED",
    };
  }

  if (!["paid", "accepted"].includes(orderData.financialStatus)) {
    return {
      success: true,
      used: false,
      reason: "ORDER_NOT_PAID",
    };
  }

  if (orderData.deliveryPrice <= 0) {
    return {
      success: true,
      used: false,
      reason: "NO_DELIVERY_PRICE",
    };
  }

  const spin = await db.spin.findFirst({
    where,
    include: {
      prize: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!spin) {
    return {
      success: true,
      used: false,
      reason: "SPIN_NOT_FOUND",
    };
  }

  await db.spin.update({
    where: { id: spin.id },
    data: {
      freeShippingUsedAt: new Date(),
      freeShippingOrderId: orderData.orderId,
    },
  });

  logger.info(
    {
      spinId: spin.id,
      orderId: orderData.orderId,
      deliveryPrice: orderData.deliveryPrice,
    },
    "free shipping reward marked as used",
  );

  return {
    success: true,
    used: true,
    spinId: spin.id,
    orderId: orderData.orderId,
  };
}

export function assertInsalesToken(receivedToken, expectedToken, code) {
  if (expectedToken && receivedToken !== expectedToken) {
    throw new AppError(403, code, "Недостаточно прав для этого запроса InSales.");
  }
}
