export const STORAGE_KEY = "gift-safe-widget-state";
export const GUEST_COOKIE_KEY = "gift_safe_guest_id";
export const MODAL_DELAY_MS = 7000;

export const TEXTS = {
  welcomeEyebrow: "100% выигрыш для новых гостей",
  welcomeTitle: "Забери подарок из сейфа",
  welcomeDescription:
    "Внутри уже ждет твой персональный приз. Без пустых попыток, без проигрышей, только приятный бонус за пару кликов.",
  welcomeButton: "Открыть сейф",
  stageIdle: "Код готов. Нажми и открой сейф.",
  stageLoading: "Подбираем код и готовим подарок...",
  prizeTitle: "Поздравляем, приз уже твой",
  prizeRegisterHint:
    "Зарегистрируйся в новой вкладке и вернись на сайт. Мы автоматически подхватим твой приз из этого браузера.",
  registerButton: "Зарегистрироваться",
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

export function getRuntimeConfig() {
  const baseOrigin = getBaseOrigin();
  const externalConfig = window.GIFT_SAFE_CONFIG || {};

  return {
    apiBaseUrl: externalConfig.apiBaseUrl || `${baseOrigin}/api`,
    assetsBaseUrl: externalConfig.assetsBaseUrl || baseOrigin,
    registerUrl: externalConfig.registerUrl || "/client/new",
    modalDelayMs: externalConfig.modalDelayMs || MODAL_DELAY_MS,
    fabLottieUrl: externalConfig.fabLottieUrl || `${baseOrigin}/assets/lottie/fab-gift.json`,
    prizeVideoBaseUrl: externalConfig.prizeVideoBaseUrl || `${baseOrigin}/assets/prizes`,
    safeVideo: {
      mp4Url: externalConfig.safeVideoMp4 || `${baseOrigin}/assets/safe-open.mp4`,
      webmUrl: externalConfig.safeVideoWebm || "",
      posterUrl: externalConfig.safeVideoPoster || "",
    },
    theme: {
      primary: externalConfig.primaryColor || "#e97cac",
      accent: externalConfig.accentColor || "#f59e0b",
      surface: externalConfig.surfaceColor || "#120425",
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
