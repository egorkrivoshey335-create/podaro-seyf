import styles from "./styles/widget.css?inline";

import { getRuntimeConfig } from "./config.js";
import { createApiClient } from "./core/api.js";
import { getFingerprint } from "./core/fingerprint.js";
import { getInsalesClient } from "./core/insales.js";
import { normalizeWidgetState, resolveScenario } from "./core/scenarios.js";
import {
  clearWidgetState,
  getOrCreateGuestId,
  isExpiredState,
  readWidgetState,
  resetGuestId,
  writeWidgetState,
} from "./core/storage.js";
import { WidgetApp } from "./ui/widgetApp.js";

function mergeRuntimeDebug(runtimeConfig, serverDebugConfig) {
  const runtimeDebug = runtimeConfig.debug || {};
  const serverDebug = serverDebugConfig?.enabled ? serverDebugConfig : {};

  return {
    ...runtimeConfig,
    debug: {
      forcePrizeCode: runtimeDebug.forcePrizeCode || serverDebug.forcePrizeCode || "",
      allowRepeatSpins: runtimeDebug.allowRepeatSpins || Boolean(serverDebug.allowRepeatSpins),
      resetState: runtimeDebug.resetState || false,
      skipRegisterStep: runtimeDebug.skipRegisterStep || Boolean(serverDebug.skipRegisterStep),
      forceAuthorized: runtimeDebug.forceAuthorized || Boolean(serverDebug.forceAuthorized),
      clientId: runtimeDebug.clientId || serverDebug.clientId || "debug-client",
      clientEmail: runtimeDebug.clientEmail || serverDebug.clientEmail || "dev@example.com",
      clientPhone: runtimeDebug.clientPhone || serverDebug.clientPhone || "",
      clientName: runtimeDebug.clientName || serverDebug.clientName || "Debug User",
      spinTtlMinutes: Number(serverDebug.spinTtlMinutes || 0),
    },
  };
}

function createDebugClient(runtimeConfig) {
  return {
    id: runtimeConfig.debug.clientId,
    email: runtimeConfig.debug.clientEmail,
    phone: runtimeConfig.debug.clientPhone,
    name: runtimeConfig.debug.clientName,
  };
}

function mountWidget({ runtimeConfig, api, guestId, fingerprintPromise, client, widgetState, scenario }) {
  window.__giftSafeWidgetInstance?.destroy?.();

  const host = document.createElement("div");
  host.id = "gift-safe-widget-host";

  const shadowRoot = host.attachShadow({ mode: "open" });
  document.body.append(host);

  const app = new WidgetApp({
    host,
    shadowRoot,
    runtimeConfig,
    api,
    guestId,
    fingerprintPromise,
    client,
    widgetState,
    scenario,
  });

  app.mount();
  const style = document.createElement("style");
  style.textContent = styles;
  shadowRoot.prepend(style);
  window.__giftSafeWidgetInstance = app;
  return app;
}

async function syncAuthorizedState({ api, guestId, client, widgetState }) {
  try {
    if (widgetState?.spinId && widgetState.status === "WON") {
      try {
        const claim = await api.claim({
          guestId,
          clientId: client.id,
          clientEmail: client.email,
          clientPhone: client.phone,
        });

        const claimedState = {
          ...widgetState,
          ...normalizeWidgetState(claim),
          clientEmail: client.email,
        };

        writeWidgetState(claimedState);
        return claimedState;
      } catch (error) {
        console.warn("[gift-safe] could not claim prize from guest state", error);
      }
    }

    const myPrize = await api.myPrize(client.id);
    if (!myPrize) {
      clearWidgetState();
      return null;
    }

    const syncedState = {
      ...normalizeWidgetState(myPrize),
      clientEmail: client.email,
    };

    writeWidgetState(syncedState);
    return syncedState;
  } catch (error) {
    console.warn("[gift-safe] could not sync authorized state", error);
    return widgetState;
  }
}

export async function initGiftSafeWidget() {
  if (window.__giftSafeWidgetInstance) {
    return window.__giftSafeWidgetInstance;
  }

  if (window.__giftSafeWidgetInitPromise) {
    return window.__giftSafeWidgetInitPromise;
  }

  window.__giftSafeWidgetInitPromise = (async () => {
  if (!document.body) {
      return null;
  }

  const baseRuntimeConfig = getRuntimeConfig();
  const api = createApiClient(baseRuntimeConfig);
  const serverDebugConfig = await api.debugConfig();
  const runtimeConfig = mergeRuntimeDebug(baseRuntimeConfig, serverDebugConfig);

  if (runtimeConfig.debug.resetState) {
    clearWidgetState();
    resetGuestId();
  }

  const guestId = getOrCreateGuestId();
  const fingerprintPromise = getFingerprint();

  let widgetState = readWidgetState();
  if (isExpiredState(widgetState)) {
    clearWidgetState();
    widgetState = null;
  }

  let client = await getInsalesClient();
  if (!client && runtimeConfig.debug.forceAuthorized) {
    client = createDebugClient(runtimeConfig);
  }
  if (client) {
    widgetState = await syncAuthorizedState({
      api,
      guestId,
      client,
      widgetState,
    });
  }

  const scenario = resolveScenario({
    client: runtimeConfig.debug.forceAuthorized && !widgetState ? null : client,
    widgetState,
  });

  if (scenario === "expired") {
    clearWidgetState();
    return null;
  }

  if (scenario === "hidden") {
      return null;
  }

    return mountWidget({
      runtimeConfig,
      api,
      guestId,
      fingerprintPromise,
      client,
      widgetState,
      scenario,
    });
  })();

  try {
    return await window.__giftSafeWidgetInitPromise;
  } finally {
    window.__giftSafeWidgetInitPromise = null;
  }
}

if (!window.__GIFT_SAFE_WIDGET_SKIP_AUTO_INIT__ && !window.__giftSafeWidgetAutoInitScheduled) {
  window.__giftSafeWidgetAutoInitScheduled = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initGiftSafeWidget();
    });
  } else {
    initGiftSafeWidget();
  }
}
