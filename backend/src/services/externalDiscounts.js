import prismaClientPkg from "@prisma/client";
import { XMLParser } from "fast-xml-parser";

import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const { PrizeType, SpinStatus } = prismaClientPkg;
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
});

function unwrapValue(value) {
  if (Array.isArray(value)) {
    return unwrapValue(value[0]);
  }

  if (value && typeof value === "object") {
    if ("#text" in value) {
      return unwrapValue(value["#text"]);
    }
  }

  return value;
}

function pickFirst(...values) {
  for (const value of values) {
    const unwrapped = unwrapValue(value);
    if (unwrapped != null && unwrapped !== "") {
      return unwrapped;
    }
  }

  return null;
}

function normalizeInsalesPayload(payload) {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return {};
    }

    if (trimmed.startsWith("<")) {
      return xmlParser.parse(trimmed);
    }

    return {};
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(payload)) {
    return normalizeInsalesPayload(payload.toString("utf8"));
  }

  return payload || {};
}

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
  const normalizedPayload = normalizeInsalesPayload(payload);
  const order = normalizedPayload?.order || normalizedPayload || {};
  const client = order.client || normalizedPayload?.client || {};

  return {
    raw: normalizedPayload,
    order,
    orderId: pickFirst(order.id, order.number) != null ? String(pickFirst(order.id, order.number)) : null,
    clientId:
      pickFirst(client.id, order.client_id, normalizedPayload?.client_id) != null
        ? String(pickFirst(client.id, order.client_id, normalizedPayload?.client_id))
        : null,
    email: normalizeEmail(pickFirst(client.email, order.email, order.client_email)),
    phone: normalizePhone(pickFirst(client.phone, order.phone, order.client_phone)),
    deliveryPrice: toNumber(
      order.delivery_price,
      order.full_delivery_price,
      order.delivery_info?.price,
      order.delivery_variant?.delivery_price,
      order.delivery_variant?.price,
    ),
    financialStatus: String(pickFirst(order.financial_status, normalizedPayload?.financial_status) || "").toLowerCase(),
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
