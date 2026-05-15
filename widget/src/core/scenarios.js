import { isExpiredState } from "./storage.js";

export function resolveScenario({ client, widgetState }) {
  if (isExpiredState(widgetState) || widgetState?.status === "EXPIRED") {
    return "expired";
  }

  if (["FULFILLED", "DELIVERED", "AWAITING_FULFILL"].includes(widgetState?.status)) {
    return "hidden";
  }

  if (!widgetState?.spinId) {
    return "guest-fresh";
  }

  if (!client && widgetState?.spinId) {
    return "guest-pending";
  }

  if (client && widgetState?.spinId && !["FULFILLED", "DELIVERED"].includes(widgetState.status)) {
    return "authorized-claim";
  }

  return "hidden";
}

export function normalizeWidgetState(payload) {
  if (!payload) {
    return null;
  }

  return {
    spinId: payload.spinId,
    prize: payload.prize,
    expiresAt: payload.expiresAt,
    status: payload.status,
    promoCode: payload.promoCode,
    recipientEmail: payload.recipientEmail,
    clientEmail: payload.clientEmail,
  };
}
