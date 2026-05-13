window.__GIFT_SAFE_WIDGET_SKIP_AUTO_INIT__ = true;

if (!window.GIFT_SAFE_CONFIG) {
  window.GIFT_SAFE_CONFIG = {
    apiBaseUrl: "http://localhost:3000/api",
    assetsBaseUrl: "http://localhost:5173",
    modalDelayMs: 1500,
    fabLottieUrl: "http://localhost:5173/assets/lottie/fab-gift.json",
    prizeVideoBaseUrl: "http://localhost:5173/assets/prizes",
    safeVideoMp4: "http://localhost:5173/assets/safe-open.mp4",
  };
}

const { initGiftSafeWidget } = await import("./index.js");

initGiftSafeWidget();
