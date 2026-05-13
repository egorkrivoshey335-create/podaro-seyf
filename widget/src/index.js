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
  writeWidgetState,
} from "./core/storage.js";
import { WidgetApp } from "./ui/widgetApp.js";

function mountWidget({ runtimeConfig, api, guestId, fingerprintPromise, client, widgetState, scenario }) {
  window.__giftSafeWidgetInstance?.destroy?.();

  const host = document.createElement("div");
  host.id = "gift-safe-widget-host";

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  shadowRoot.append(style);

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
  if (!document.body) {
    return null;
  }

  const runtimeConfig = getRuntimeConfig();
  const api = createApiClient(runtimeConfig);
  const guestId = getOrCreateGuestId();
  const fingerprintPromise = getFingerprint();

  let widgetState = readWidgetState();
  if (isExpiredState(widgetState)) {
    clearWidgetState();
    widgetState = null;
  }

  const client = await getInsalesClient();
  if (client) {
    widgetState = await syncAuthorizedState({
      api,
      guestId,
      client,
      widgetState,
    });
  }

  const scenario = resolveScenario({
    client,
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
}

if (!window.__GIFT_SAFE_WIDGET_SKIP_AUTO_INIT__) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initGiftSafeWidget();
    });
  } else {
    initGiftSafeWidget();
  }
}
