export const STORAGE_KEY = "gift-safe-widget-state";
export const GUEST_COOKIE_KEY = "gift_safe_guest_id";
export const MODAL_DELAY_MS = 7000;

export const TEXTS = {
  welcomeEyebrow: "100% выигрыш для новых гостей",
  welcomeTitle: "Забери подарок из сейфа",
  welcomeDescription:
    "Внутри уже ждет твой персональный приз. Без пустых попыток, без проигрышей, только приятный бонус за пару кликов.",
  welcomeButton: "Забрать подарок",
  welcomeInfoButton: "Что это ?",
  faqBackButton: "Назад",
  stageIdle: "Код готов. Нажми и открой сейф.",
  stageLoading: "Подбираем код и готовим подарок...",
  prizeTitle: "Поздравляем, приз уже твой",
  prizeRegisterHint:
    "Зарегистрируйся в новой вкладке и вернись на сайт. Мы автоматически подхватим твой приз из этого браузера.",
  registerButton: "Стать своим",
  deliveryTitle: "Осталось подтвердить получение",
  deliveryDescription:
    "Заполни данные, чтобы мы знали, куда отправить подарок или на какой email выдать приз.",
  deliveryButton: "Получить приз",
  successTitle: "Готово",
  expiredTitle: "Приз сгорел",
  expiredDescription: "24 часа закончились. Виджет можно использовать в следующей акции.",
  blockedTitle: "Розыгрыш временно недоступен",
  blockedDescription:
    "Сработала защита от повторных попыток. Если это ошибка, можно проверить данные позже.",
  guestFab: "Забрать подарок",
  pendingFab: "Открыть подарок",
  claimedFab: "Забрать приз",
  readyEmailHint: "Отправим приз на email из профиля и сразу закрепим его за твоим аккаунтом.",
};

export const PRIZE_VISUALS = {
  "promo-10": { badge: "-10%", accent: "#f59e0b" },
  "free-shipping": { badge: "FREE", accent: "#38bdf8" },
  "promo-15": { badge: "-15%", accent: "#fb7185" },
  "bonus-100": { badge: "+100", accent: "#22c55e" },
  "promo-20": { badge: "-20%", accent: "#8b5cf6" },
  guide: { badge: "PDF", accent: "#14b8a6" },
  "bonus-500": { badge: "+500", accent: "#10b981" },
  "orange-paste": { badge: "GIFT", accent: "#f97316" },
  socks: { badge: "GIFT", accent: "#60a5fa" },
  "nose-trimmer": { badge: "VIP", accent: "#f43f5e" },
  "gift-box": { badge: "BOX", accent: "#c084fc" },
  "bonus-1000": { badge: "+1000", accent: "#eab308" },
};

const detectedScriptSrc =
  typeof document !== "undefined"
    ? document.currentScript?.src || Array.from(document.scripts)[document.scripts.length - 1]?.src
    : undefined;

function getBaseOrigin() {
  try {
    return new URL(detectedScriptSrc || window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

function getDebugFlag(externalConfig, externalKey, queryKey) {
  if (typeof externalConfig[externalKey] === "boolean") {
    return externalConfig[externalKey];
  }

  if (typeof window === "undefined") {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get(queryKey);
  return value === "1" || value === "true";
}

function getDebugValue(externalConfig, externalKey, queryKey) {
  if (externalConfig[externalKey]) {
    return String(externalConfig[externalKey]).trim();
  }

  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get(queryKey)?.trim() || "";
}

export function getRuntimeConfig() {
  const baseOrigin = getBaseOrigin();
  const externalConfig = window.GIFT_SAFE_CONFIG || {};

  return {
    apiBaseUrl: externalConfig.apiBaseUrl || `${baseOrigin}/api`,
    assetsBaseUrl: externalConfig.assetsBaseUrl || baseOrigin,
    registerUrl: externalConfig.registerUrl || "/client/new",
    modalDelayMs: externalConfig.modalDelayMs || MODAL_DELAY_MS,
    prizeVideoBaseUrl: externalConfig.prizeVideoBaseUrl || `${baseOrigin}/assets/prizes`,
    blockedVideoUrl: externalConfig.blockedVideoMp4 || `${baseOrigin}/assets/prizes/blocked-state.mp4`,
    safeVideo: {
      mp4Url: externalConfig.safeVideoMp4 || `${baseOrigin}/assets/safe-open.mp4`,
      webmUrl: externalConfig.safeVideoWebm || "",
      posterUrl: externalConfig.safeVideoPoster || "",
    },
    uiAssets: {
      panelBackground:
        externalConfig.panelBackgroundImage || `${baseOrigin}/assets/ui/fon.webp`,
      frame:
        externalConfig.frameImage || `${baseOrigin}/assets/ui/ramka.webp`,
      prizeFrame:
        externalConfig.prizeFrameImage || `${baseOrigin}/assets/ui/ramka-1.webp`,
      blockedFrame:
        externalConfig.blockedFrameImage || `${baseOrigin}/assets/ui/ramka-blocked.webp`,
      flagLeft:
        externalConfig.flagLeftImage || `${baseOrigin}/assets/ui/flag-left.webp`,
      flagRight:
        externalConfig.flagRightImage || `${baseOrigin}/assets/ui/flag-right.webp`,
      primaryButton:
        externalConfig.primaryButtonImage || `${baseOrigin}/assets/ui/knopka-zelenaya.webp`,
      secondaryButton:
        externalConfig.secondaryButtonImage || `${baseOrigin}/assets/ui/knopka-sinyaya.webp`,
      displayFontFamily:
        externalConfig.displayFontFamily || "Rubik Bubbles",
      displayFontStylesheetUrl:
        externalConfig.displayFontStylesheetUrl ||
        "https://fonts.googleapis.com/css2?family=Rubik+Bubbles&display=swap",
      displayFontWoff2:
        externalConfig.displayFontWoff2 || "",
      displayFontWoff:
        externalConfig.displayFontWoff || "",
      displayFontOtf:
        externalConfig.displayFontOtf || "",
    },
    theme: {
      primary: externalConfig.primaryColor || "#e97cac",
      accent: externalConfig.accentColor || "#f59e0b",
      surface: externalConfig.surfaceColor || "#120425",
    },
    debug: {
      forcePrizeCode: getDebugValue(externalConfig, "debugPrizeCode", "gsPrize"),
      allowRepeatSpins: getDebugFlag(externalConfig, "debugAllowRepeatSpins", "gsRepeat"),
      resetState: getDebugFlag(externalConfig, "debugResetState", "gsReset"),
      skipRegisterStep: getDebugFlag(externalConfig, "debugSkipRegisterStep", "gsSkipRegister"),
      forceAuthorized: getDebugFlag(externalConfig, "debugForceAuthorized", "gsForceAuth"),
      clientId: getDebugValue(externalConfig, "debugClientId", "gsClientId"),
      clientEmail: getDebugValue(externalConfig, "debugClientEmail", "gsClientEmail"),
      clientPhone: getDebugValue(externalConfig, "debugClientPhone", "gsClientPhone"),
      clientName: getDebugValue(externalConfig, "debugClientName", "gsClientName"),
    },
  };
}

export function getPrizeVisual(prize) {
  const fallback = { badge: "GIFT", accent: "#f59e0b" };
  if (!prize?.code) {
    return fallback;
  }

  return PRIZE_VISUALS[prize.code] || fallback;
}
