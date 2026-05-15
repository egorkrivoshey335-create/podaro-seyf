import { gsap } from "gsap";
import lottie from "lottie-web/build/player/lottie_svg";

import fabAnimationData from "../assets/fab-gift.json";
import { TEXTS, getPrizeVisual } from "../config.js";
import { getInsalesClient } from "../core/insales.js";
import { patchWidgetState, resetGuestId, writeWidgetState } from "../core/storage.js";
import { playUnlockSequence, resetSafeScene, revealPrizeState, showPrizeState } from "./safeSequence.js";
import { hasSafeVideoSources, playSafeVideo, prepareSafeVideo, resetSafeVideo, showSafeVideoPreview } from "./safeVideo.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCountdown(expiresAt) {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function getFabFallbackMarkup() {
  return `
    <svg class="gs-fab-gift" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle class="gs-fab-gift__halo" cx="32" cy="32" r="26" />
      <path
        class="gs-fab-gift__box"
        d="M18 28.5C18 26.567 19.567 25 21.5 25H42.5C44.433 25 46 26.567 46 28.5V42.5C46 44.433 44.433 46 42.5 46H21.5C19.567 46 18 44.433 18 42.5V28.5Z"
      />
      <path class="gs-fab-gift__lid" d="M16 24.5C16 22.567 17.567 21 19.5 21H44.5C46.433 21 48 22.567 48 24.5C48 26.433 46.433 28 44.5 28H19.5C17.567 28 16 26.433 16 24.5Z" />
      <path class="gs-fab-gift__ribbon" d="M30 21H34V46H30V21Z" />
      <path class="gs-fab-gift__ribbon" d="M18 31H46V35H18V31Z" />
      <path class="gs-fab-gift__bow" d="M32 21C32 16.582 35.134 13 39 13C40.657 13 42 14.343 42 16C42 19.866 38.418 23 34 23H32V21Z" />
      <path class="gs-fab-gift__bow" d="M32 21C32 16.582 28.866 13 25 13C23.343 13 22 14.343 22 16C22 19.866 25.582 23 30 23H32V21Z" />
      <path class="gs-fab-gift__spark gs-fab-gift__spark--one" d="M50 15L51.6 18.4L55 20L51.6 21.6L50 25L48.4 21.6L45 20L48.4 18.4L50 15Z" />
      <path class="gs-fab-gift__spark gs-fab-gift__spark--two" d="M16 15L17.2 17.8L20 19L17.2 20.2L16 23L14.8 20.2L12 19L14.8 17.8L16 15Z" />
    </svg>
  `;
}

const FAQ_ITEMS = [
  {
    question: "Что это вообще?",
    answer:
      "Это подарок для новых гостей. Нажми на кнопку, открой сейф и сразу увидишь, что досталось именно тебе.",
  },
  {
    question: "Что можно получить?",
    answer:
      "Внутри могут быть скидка, бесплатная доставка, бонусы к заказу и другие подарки.",
  },
  {
    question: "Как забрать подарок?",
    answer:
      "В зависимости от подарка вам сразу будет понятно, как его получить.",
  },
  {
    question: "Сколько действует подарок?",
    answer:
      "После открытия подарок сохраняется за тобой на 24 часа, чтобы ты успел спокойно им воспользоваться.",
  },
];

function getFaqMarkup() {
  return FAQ_ITEMS.map(
    (item, index) => `
      <div class="gs-faq-item ${index === 0 ? "is-open" : ""}" data-gs-faq-item>
        <button
          class="gs-faq-item-trigger"
          type="button"
          data-action="faq-toggle"
          aria-expanded="${index === 0 ? "true" : "false"}"
        >
          <span>${escapeHtml(item.question)}</span>
          <span class="gs-faq-item-icon">+</span>
        </button>
        <div class="gs-faq-item-body" data-gs-faq-body>
          <div class="gs-faq-item-body-inner">
            <p>${escapeHtml(item.answer)}</p>
          </div>
        </div>
      </div>
    `,
  ).join("");
}

function getPrizeHintText(prize) {
  switch (prize?.type) {
    case "BONUS_POINTS":
      return "Это бонусные баллы, которые начислятся вам на аккаунт и вы сможете воспользоваться ими при покупке.";
    case "PROMO_CODE":
      return "Это персональный промокод. После получения его можно будет применить при оформлении заказа.";
    case "FREE_SHIPPING":
      return "Это бесплатная доставка. Она закрепится за вашим аккаунтом и сработает при следующем заказе.";
    case "GUIDE":
      return "Это полезный гайд, который придет вам после получения приза.";
    default:
      return "Это ваш подарок. После получения мы сразу подскажем, как им воспользоваться.";
  }
}

function getRegisterHintText() {
  return "После регистрации нажми на подарок слева снизу в углу и получи свой приз.";
}

function getDeliveryHintText(prize) {
  switch (prize?.type) {
    case "BONUS_POINTS":
      return "Бонусы начислятся на ваш аккаунт автоматически, и вы сможете воспользоваться ими при покупке.";
    case "FREE_SHIPPING":
      return "Бесплатная доставка закрепится за вашим аккаунтом и применится автоматически при следующем заказе.";
    case "PROMO_CODE":
      return "После подтверждения промокод будет закреплен за вами и станет доступен для использования.";
    case "GUIDE":
      return "После подтверждения мы отправим гайд на email, который привязан к вашему профилю.";
    default:
      return "После подтверждения мы подскажем следующий шаг для получения подарка.";
  }
}

function getBlockedErrorText(error) {
  if (!error) {
    return TEXTS.blockedDescription;
  }

  if (error?.message === "Failed to fetch") {
    return "Не удалось связаться с сервером. Попробуй еще раз через минуту.";
  }

  if (error?.code === "PROMO_ISSUE_FAILED") {
    return "Промокод временно не удалось подготовить. Попробуй открыть сейф еще раз чуть позже.";
  }

  return error?.message || TEXTS.blockedDescription;
}

export class WidgetApp {
  constructor({ host, shadowRoot, runtimeConfig, api, guestId, fingerprintPromise, client, widgetState, scenario }) {
    this.host = host;
    this.shadowRoot = shadowRoot;
    this.runtimeConfig = runtimeConfig;
    this.api = api;
    this.guestId = guestId;
    this.fingerprintPromise = fingerprintPromise;
    this.client = client;
    this.widgetState = widgetState;
    this.scenario = scenario;
    this.autoOpenTimer = null;
    this.countdownTimer = null;
    this.isUnlocking = false;
    this.modalOpen = false;
    this.autoOpenDismissed = false;
    this.hideModalCall = null;
    this.fabLottie = null;
    this.fabLottieTimeout = null;
    this.panelMode = "default";
    this.authSyncInFlight = null;
    this.stopWatchingForAuthorizedReturn = null;
  }

  mount() {
    this.renderShell();
    this.applyTheme();
    prepareSafeVideo(this.refs.stage, this.runtimeConfig);
    this.refresh();
    this.initFabLottie();
  }

  destroy() {
    window.clearTimeout(this.autoOpenTimer);
    window.clearInterval(this.countdownTimer);
    window.clearTimeout(this.fabLottieTimeout);
    gsap.killTweensOf(this.refs?.fab);
    gsap.killTweensOf(this.refs?.panel);
    gsap.killTweensOf(this.refs?.backdrop);
    this.hideModalCall?.kill?.();
    this.hideModalCall = null;
    this.stopWatchingForAuthorizedReturn?.();
    this.stopWatchingForAuthorizedReturn = null;
    try {
      this.fabLottie?.destroy?.();
    } catch {
      // ignore lottie teardown errors
    }
    this.fabLottie = null;
    this.host.remove();
  }

  initFabLottie() {
    if (!this.refs?.fabLottieMount) {
      return;
    }

    const mount = this.refs.fabLottieMount;
    const fallback = this.refs.fabFallback;

    const finalizeFailure = () => {
      try {
        this.fabLottie?.destroy?.();
      } catch {
        // ignore
      }
      this.fabLottie = null;
      mount.hidden = true;
      if (fallback) {
        fallback.hidden = false;
      }
    };

    const start = () => {
      try {
        const animation = lottie.loadAnimation({
          container: mount,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: fabAnimationData,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
            progressiveLoad: false,
          },
        });

        this.fabLottie = animation;

        const handleReady = () => {
          window.clearTimeout(this.fabLottieTimeout);
          this.fabLottieTimeout = null;
          if (mount.querySelector("svg")) {
            mount.hidden = false;
            if (fallback) {
              fallback.hidden = true;
            }
          } else {
            finalizeFailure();
          }
        };

        animation.addEventListener("DOMLoaded", handleReady);
        animation.addEventListener("data_failed", finalizeFailure);
        animation.addEventListener("error", finalizeFailure);

        this.fabLottieTimeout = window.setTimeout(() => {
          if (!mount.querySelector("svg")) {
            console.warn("[gift-safe] Lottie FAB failed to mount in time, falling back to inline SVG");
            finalizeFailure();
          } else {
            mount.hidden = false;
            if (fallback) {
              fallback.hidden = true;
            }
          }
        }, 800);
      } catch (error) {
        console.warn("[gift-safe] Lottie FAB init error", error);
        finalizeFailure();
      }
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(start));
    } else {
      start();
    }
  }

  applyTheme() {
    this.host.style.setProperty("--gs-primary", this.runtimeConfig.theme.primary);
    this.host.style.setProperty("--gs-accent", this.runtimeConfig.theme.accent);
    this.host.style.setProperty("--gs-surface", this.runtimeConfig.theme.surface);
    this.host.style.setProperty(
      "--gs-display-font",
      `"${this.runtimeConfig.uiAssets.displayFontFamily}", "Arial Rounded MT Bold", "Trebuchet MS", "Verdana", sans-serif`,
    );
    this.host.style.setProperty("--gs-ui-panel-bg", `url("${this.runtimeConfig.uiAssets.panelBackground}")`);
    this.host.style.setProperty("--gs-ui-frame", `url("${this.runtimeConfig.uiAssets.frame}")`);
    this.host.style.setProperty("--gs-ui-prize-frame", `url("${this.runtimeConfig.uiAssets.prizeFrame}")`);
    this.host.style.setProperty("--gs-ui-flag-left", `url("${this.runtimeConfig.uiAssets.flagLeft}")`);
    this.host.style.setProperty("--gs-ui-flag-right", `url("${this.runtimeConfig.uiAssets.flagRight}")`);
    this.host.style.setProperty("--gs-ui-button-primary", `url("${this.runtimeConfig.uiAssets.primaryButton}")`);
    this.host.style.setProperty("--gs-ui-button-secondary", `url("${this.runtimeConfig.uiAssets.secondaryButton}")`);
    this.ensureDisplayFontStylesheet();
    this.applyDisplayFontFace();
  }

  ensureDisplayFontStylesheet() {
    const href = this.runtimeConfig.uiAssets.displayFontStylesheetUrl;
    if (!href) {
      return;
    }

    if (!document.head) {
      return;
    }

    if (!document.head.querySelector('[data-gs-font-preconnect="googleapis"]')) {
      const googleApis = document.createElement("link");
      googleApis.rel = "preconnect";
      googleApis.href = "https://fonts.googleapis.com";
      googleApis.setAttribute("data-gs-font-preconnect", "googleapis");
      document.head.append(googleApis);
    }

    if (!document.head.querySelector('[data-gs-font-preconnect="gstatic"]')) {
      const gstatic = document.createElement("link");
      gstatic.rel = "preconnect";
      gstatic.href = "https://fonts.gstatic.com";
      gstatic.crossOrigin = "anonymous";
      gstatic.setAttribute("data-gs-font-preconnect", "gstatic");
      document.head.append(gstatic);
    }

    if (!document.head.querySelector(`[data-gs-display-font-link="${href}"]`)) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = href;
      stylesheet.setAttribute("data-gs-display-font-link", href);
      document.head.append(stylesheet);
    }
  }

  applyDisplayFontFace() {
    const family = this.runtimeConfig.uiAssets.displayFontFamily;
    const sources = [
      this.runtimeConfig.uiAssets.displayFontWoff2
        ? `url("${this.runtimeConfig.uiAssets.displayFontWoff2}") format("woff2")`
        : "",
      this.runtimeConfig.uiAssets.displayFontWoff
        ? `url("${this.runtimeConfig.uiAssets.displayFontWoff}") format("woff")`
        : "",
      this.runtimeConfig.uiAssets.displayFontOtf
        ? `url("${this.runtimeConfig.uiAssets.displayFontOtf}") format("opentype")`
        : "",
    ].filter(Boolean);

    const existing = this.shadowRoot.querySelector("[data-gs-display-font]");
    if (!sources.length) {
      existing?.remove();
      return;
    }

    const rules = `
      @font-face {
        font-family: "${family}";
        src: ${sources.join(", ")};
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
    `;

    if (existing) {
      existing.textContent = rules;
      return;
    }

    const style = document.createElement("style");
    style.setAttribute("data-gs-display-font", "");
    style.textContent = rules;
    this.shadowRoot.append(style);
  }

  renderShell() {
    this.shadowRoot.innerHTML = `
      <div class="gs-widget">
        <button
          class="gs-fab"
          type="button"
          hidden
          data-action="fab"
          aria-label="${TEXTS.guestFab}"
          title="${TEXTS.guestFab}"
        >
          <span class="gs-fab-icon" data-gs-fab-icon aria-hidden="true">
            <span class="gs-fab-lottie" data-gs-fab-lottie hidden></span>
            <span class="gs-fab-fallback" data-gs-fab-fallback>${getFabFallbackMarkup()}</span>
          </span>
          <span class="gs-sr-only" data-gs-fab-label>${TEXTS.guestFab}</span>
        </button>
        <div class="gs-modal" hidden>
          <div class="gs-backdrop" data-action="close"></div>
          <section class="gs-panel" role="dialog" aria-modal="true" aria-label="Подарок из сейфа">
            <div class="gs-panel-flags" aria-hidden="true">
              <div class="gs-flag gs-flag--left">
                <img class="gs-flag-image" src="${escapeHtml(this.runtimeConfig.uiAssets.flagLeft)}" alt="" />
              </div>
              <div class="gs-flag gs-flag--right">
                <img class="gs-flag-image" src="${escapeHtml(this.runtimeConfig.uiAssets.flagRight)}" alt="" />
              </div>
            </div>
            <button class="gs-close" type="button" data-action="close" aria-label="Закрыть">×</button>
            <div class="gs-panel-grid">
              <div class="gs-stage-wrap" data-gs-stage-wrap>
                <div class="gs-stage-frame">
                  <img class="gs-stage-frame-image" src="${escapeHtml(this.runtimeConfig.uiAssets.frame)}" alt="" />
                  <div class="gs-stage-window">
                    <div class="gs-stage" data-gs-stage>
                      <div class="gs-stage-noise"></div>
                      <div class="gs-video-shell" data-gs-video-shell hidden>
                        <video
                          class="gs-stage-video"
                          data-gs-video
                          playsinline
                          preload="metadata"
                          controlslist="nodownload noplaybackrate nofullscreen"
                          disablepictureinpicture
                        ></video>
                      </div>
                      <div class="gs-stage-scene" data-gs-stage-scene>
                        <div class="gs-safe-light" data-gs-safe-light></div>
                        <div class="gs-safe" data-gs-safe>
                          <div class="gs-safe-body"></div>
                          <div class="gs-safe-inside"></div>
                          <div class="gs-safe-door" data-gs-safe-door>
                            <div class="gs-safe-rings">
                              <span class="gs-code-digit" data-gs-digit>0</span>
                              <span class="gs-code-digit" data-gs-digit>0</span>
                              <span class="gs-code-digit" data-gs-digit>0</span>
                            </div>
                            <div class="gs-lock" data-gs-lock></div>
                          </div>
                        </div>
                      </div>
                      <p class="gs-stage-status" data-gs-stage-status>${TEXTS.stageIdle}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div class="gs-copy" data-gs-copy></div>
            </div>
          </section>
        </div>
      </div>
    `;

    this.refs = {
      fab: this.shadowRoot.querySelector(".gs-fab"),
      fabIcon: this.shadowRoot.querySelector("[data-gs-fab-icon]"),
      fabLottieMount: this.shadowRoot.querySelector("[data-gs-fab-lottie]"),
      fabFallback: this.shadowRoot.querySelector("[data-gs-fab-fallback]"),
      fabLabel: this.shadowRoot.querySelector("[data-gs-fab-label]"),
      modal: this.shadowRoot.querySelector(".gs-modal"),
      backdrop: this.shadowRoot.querySelector(".gs-backdrop"),
      panel: this.shadowRoot.querySelector(".gs-panel"),
      panelFlags: this.shadowRoot.querySelector(".gs-panel-flags"),
      close: this.shadowRoot.querySelector(".gs-close"),
      copy: this.shadowRoot.querySelector("[data-gs-copy]"),
      stageWrap: this.shadowRoot.querySelector("[data-gs-stage-wrap]"),
      stageFrameImage: this.shadowRoot.querySelector(".gs-stage-frame-image"),
      stage: this.shadowRoot.querySelector("[data-gs-stage]"),
    };

    this.refs.fab.addEventListener("click", () => this.openFromButton());
    this.shadowRoot.querySelector(".gs-backdrop").addEventListener("click", () => this.closeModal());
    this.refs.close.addEventListener("click", () => this.closeModal());
  }

  setPanelMode(mode) {
    this.panelMode = mode;
    this.refs.panel.classList.toggle("gs-panel--hero", mode === "hero");
    this.refs.panel.classList.toggle("gs-panel--faq", mode === "faq");
    this.refs.panel.classList.toggle("gs-panel--pending", mode === "pending" || mode === "blocked");
    this.refs.panel.classList.toggle("gs-panel--blocked", mode === "blocked");
    this.refs.panel.classList.toggle("gs-panel--default", mode === "default");

    this.refs.stageWrap.hidden = mode === "faq";
    this.refs.panelFlags.hidden = mode === "default";
    this.refs.stageFrameImage.src = mode === "blocked"
      ? this.runtimeConfig.uiAssets.blockedFrame
      : mode === "pending"
        ? this.runtimeConfig.uiAssets.prizeFrame
        : this.runtimeConfig.uiAssets.frame;
  }

  setPanelView(view = "") {
    if (!view) {
      delete this.refs.panel.dataset.gsView;
      return;
    }

    this.refs.panel.dataset.gsView = view;
  }

  animatePanelChrome() {
    const targets = [];
    if (!this.refs.panelFlags.hidden) {
      targets.push(this.refs.panelFlags);
    }
    if (!this.refs.stageWrap.hidden) {
      targets.push(this.refs.stageWrap);
    }

    if (!targets.length) {
      return;
    }

    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: -12 },
      { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.06, ease: "power2.out" },
    );
  }

  transitionPanel(mode, renderNext) {
    const targets = [...this.refs.copy.children];
    if (!this.refs.stageWrap.hidden) {
      targets.unshift(this.refs.stageWrap);
    }

    if (!targets.length) {
      this.setPanelMode(mode);
      renderNext();
      this.animatePanelChrome();
      return;
    }

    gsap.killTweensOf(targets);
    gsap.to(targets, {
      autoAlpha: 0,
      y: -18,
      duration: 0.2,
      stagger: 0.03,
      ease: "power2.in",
      onComplete: () => {
        this.setPanelMode(mode);
        renderNext();
        this.animatePanelChrome();
      },
    });
  }

  resetStage(statusText) {
    resetSafeVideo(this.refs.stage);
    resetSafeScene(this.refs.stage, statusText);
  }

  showPrizeStage(prize, statusText) {
    resetSafeVideo(this.refs.stage);
    showPrizeState(this.refs.stage, prize, statusText);
  }

  refresh() {
    this.updateButton();
    this.syncCountdown();
    window.clearTimeout(this.autoOpenTimer);

    if (this.scenario === "guest-fresh") {
      this.setPanelMode("hero");
      if (!showSafeVideoPreview(this.refs.stage, this.runtimeConfig, TEXTS.stageIdle)) {
        this.resetStage(TEXTS.stageIdle);
      }
      this.renderWelcome();
      this.scheduleAutoOpen();
      return;
    }

    if (this.scenario === "guest-pending") {
      this.renderPrizePending();
      return;
    }

    if (this.scenario === "authorized-claim") {
      this.setPanelMode("default");
      this.showPrizeStage(this.widgetState.prize, "Приз уже готов к получению.");
      this.renderDelivery();
      this.scheduleAutoOpen();
      return;
    }

    if (this.scenario === "expired") {
      this.setPanelMode("default");
      this.renderExpired();
      return;
    }

    this.destroy();
  }

  scheduleAutoOpen() {
    if (this.autoOpenDismissed || window.__giftSafeAutoOpenDismissed) {
      return;
    }

    this.autoOpenTimer = window.setTimeout(() => {
      if (!this.modalOpen && !this.autoOpenDismissed && !window.__giftSafeAutoOpenDismissed) {
        this.openModal();
      }
    }, this.runtimeConfig.modalDelayMs);
  }

  updateButton() {
    const button = this.refs.fab;
    const setFabLabel = (label) => {
      button.setAttribute("aria-label", label);
      button.title = label;
      if (this.refs.fabLabel) {
        this.refs.fabLabel.textContent = label;
      }
    };

    if (this.scenario === "guest-fresh") {
      button.hidden = false;
      button.className = "gs-fab";
      setFabLabel(TEXTS.guestFab);
      this.startFabPulse();
      return;
    }

    if (this.scenario === "guest-pending") {
      button.hidden = false;
      button.className = "gs-fab";
      setFabLabel(TEXTS.pendingFab);
      this.startFabPulse();
      return;
    }

    if (this.scenario === "authorized-claim") {
      button.hidden = false;
      button.className = "gs-fab gs-fab--accent";
      setFabLabel(TEXTS.claimedFab);
      this.startFabPulse();
      return;
    }

    button.hidden = true;
  }

  startFabPulse() {
    gsap.killTweensOf(this.refs.fab);
    gsap.fromTo(
      this.refs.fab,
      { y: 0, scale: 1 },
      {
        y: -4,
        scale: 1.04,
        duration: 1.2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
    );
  }

  openFromButton() {
    if (this.scenario === "hidden") {
      return;
    }

    this.autoOpenDismissed = true;
    window.__giftSafeAutoOpenDismissed = true;
    window.clearTimeout(this.autoOpenTimer);
    this.openModal();
  }

  openModal() {
    if (this.modalOpen) {
      return;
    }

    this.hideModalCall?.kill?.();
    this.hideModalCall = null;
    gsap.killTweensOf(this.refs.panel);
    gsap.killTweensOf(this.refs.backdrop);
    window.clearTimeout(this.autoOpenTimer);
    this.modalOpen = true;
    this.refs.modal.hidden = false;

    gsap.set(this.refs.modal, { autoAlpha: 1 });
    gsap.fromTo(
      this.refs.backdrop,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.28, ease: "power2.out" },
    );

    gsap.fromTo(
      this.refs.panel,
      { y: 28, scale: 0.95, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: "power3.out" },
    );
  }

  closeModal() {
    if (!this.modalOpen || this.isUnlocking) {
      return;
    }

    this.hideModalCall?.kill?.();
    this.hideModalCall = null;
    gsap.killTweensOf(this.refs.panel);
    gsap.killTweensOf(this.refs.backdrop);
    this.autoOpenDismissed = true;
    window.__giftSafeAutoOpenDismissed = true;
    window.clearTimeout(this.autoOpenTimer);

    gsap.to(this.refs.panel, {
      y: 24,
      scale: 0.96,
      autoAlpha: 0,
      duration: 0.24,
      ease: "power2.in",
    });

    gsap.to(this.refs.backdrop, {
      autoAlpha: 0,
      duration: 0.48,
      ease: "power2.in",
    });
    this.hideModalCall = gsap.delayedCall(0.48, () => {
      this.modalOpen = false;
      this.refs.modal.hidden = true;
      this.hideModalCall = null;
    });
  }

  renderCopy(markup) {
    this.refs.copy.innerHTML = markup;
    this.bindPrizeMedia();
    this.setupFaqAccordion();
    this.bindHintOverlay();

    this.refs.copy.querySelector("[data-action='spin']")?.addEventListener("click", () => this.handleSpin());
    this.refs.copy.querySelector("[data-action='faq-open']")?.addEventListener("click", () => this.openFaq());
    this.refs.copy.querySelector("[data-action='faq-back']")?.addEventListener("click", () => this.closeFaq());
    this.refs.copy
      .querySelector("[data-action='delivery-details-open']")
      ?.addEventListener("click", () => this.openDeliveryDetails());
    this.refs.copy
      .querySelector("[data-action='delivery-details-back']")
      ?.addEventListener("click", () => this.closeDeliveryDetails());
    this.refs.copy
      .querySelector("[data-action='register']")
      ?.addEventListener("click", () => this.openRegisterFlow());
    this.refs.copy.querySelector("[data-action='deliver']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleDelivery(event.currentTarget);
    });
    this.refs.copy.querySelector("[data-action='final-close']")?.addEventListener("click", () => {
      this.closeModal();
      this.destroy();
    });

    const finalOffsetY = this.getHeroActionsOffsetY();
    gsap.fromTo(
      this.refs.copy.children,
      { y: finalOffsetY + 18, autoAlpha: 0 },
      { y: finalOffsetY, autoAlpha: 1, duration: 0.34, stagger: 0.06, ease: "power2.out" },
    );
  }

  getHeroActionsOffsetY() {
    if (window.matchMedia?.("(max-width: 640px)").matches) {
      return 0;
    }

    if (this.panelMode === "hero" || this.refs.panel.dataset.gsView === "delivery-main") {
      return -25;
    }

    if (this.panelMode !== "hero") {
      return 0;
    }

    return -25;
  }

  getDebugClient() {
    const debug = this.runtimeConfig.debug || {};
    if (!debug.clientId) {
      return null;
    }

    return {
      id: debug.clientId,
      email: debug.clientEmail || "",
      phone: debug.clientPhone || "",
      name: debug.clientName || "",
    };
  }

  setSpinPendingState(isPending) {
    const actionRow = this.refs.copy.querySelector(".gs-hero-actions");
    if (!actionRow) {
      return;
    }

    actionRow.classList.toggle("is-busy", isPending);
    actionRow.querySelectorAll("button").forEach((button) => {
      button.disabled = isPending;
    });

    gsap.killTweensOf(actionRow);
    gsap.to(actionRow, {
      autoAlpha: isPending ? 0.5 : 1,
      duration: 0.2,
      ease: "power2.out",
    });
  }

  bindHintOverlay() {
    const overlay = this.refs.copy.querySelector("[data-gs-hint-overlay]");
    if (!overlay) {
      return;
    }

    const title = overlay.querySelector("[data-gs-hint-title]");
    const text = overlay.querySelector("[data-gs-hint-text]");
    const card = overlay.querySelector("[data-gs-hint-card]");

    this.refs.copy.querySelectorAll("[data-action='hint-open']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!title || !text || !card) {
          return;
        }

        const targetY = Number(button.dataset.hintOffsetY || 0);
        title.textContent = button.dataset.hintTitle || "";
        text.textContent = button.dataset.hintText || "";
        card.dataset.hintOffsetY = String(targetY);
        overlay.hidden = false;
        gsap.killTweensOf([overlay, card]);
        gsap.set(overlay, { autoAlpha: 1 });
        gsap.fromTo(
          card,
          { autoAlpha: 0, x: 0, y: targetY + 20, scale: 0.96 },
          { autoAlpha: 1, x: 0, y: targetY, scale: 1, duration: 0.24, ease: "power2.out" },
        );
      });
    });

    overlay.querySelectorAll("[data-action='hint-close']").forEach((button) => {
      button.addEventListener("click", () => {
        if (!card) {
          overlay.hidden = true;
          return;
        }

        const targetY = Number(card.dataset.hintOffsetY || 0);
        gsap.killTweensOf([overlay, card]);
        gsap.to(card, {
          autoAlpha: 0,
          x: 0,
          y: targetY + 12,
          scale: 0.97,
          duration: 0.18,
          ease: "power2.in",
          onComplete: () => {
            overlay.hidden = true;
            gsap.set(card, { clearProps: "all" });
          },
        });
      });
    });
  }

  async transitionCopyToNextStep() {
    const targets = [...this.refs.copy.children];
    if (!targets.length) {
      return;
    }

    gsap.killTweensOf(targets);
    await new Promise((resolve) => {
      gsap.to(targets, {
        autoAlpha: 0,
        y: -18,
        duration: 0.24,
        stagger: 0.03,
        ease: "power2.in",
        onComplete: resolve,
      });
    });
  }

  async detectClientAfterSpin() {
    if (this.client?.id) {
      return this.client;
    }

    const liveClient = await getInsalesClient();
    if (liveClient?.id) {
      this.client = liveClient;
      return liveClient;
    }

    if (this.runtimeConfig.debug.skipRegisterStep) {
      const debugClient = this.getDebugClient();
      if (debugClient) {
        this.client = debugClient;
        return debugClient;
      }
    }

    return null;
  }

  showVideoInStage(videoUrl, options = {}) {
    const shell = this.refs.stage.querySelector("[data-gs-video-shell]");
    const video = this.refs.stage.querySelector("[data-gs-video]");
    if (!shell || !video) {
      return false;
    }

    const fallbackVideoUrl = this.runtimeConfig.safeVideo.mp4Url || this.runtimeConfig.safeVideo.webmUrl || "";
    const primaryVideoUrl = videoUrl || fallbackVideoUrl;
    if (!primaryVideoUrl) {
      return false;
    }

    video.poster = "";
    video.loop = options.loop ?? true;
    video.muted = true;
    video.volume = 0;
    video.onended = null;
    video.innerHTML = `
      <source src="${escapeHtml(primaryVideoUrl)}" type="video/mp4" />
      ${fallbackVideoUrl && fallbackVideoUrl !== primaryVideoUrl ? `<source src="${escapeHtml(fallbackVideoUrl)}" type="video/mp4" />` : ""}
    `;

    this.refs.stage.dataset.gsMode = "video";
    shell.hidden = false;

    try {
      video.load();
      video.currentTime = 0;
      if (video.loop === false) {
        video.onended = () => {
          try {
            if (Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = Math.max(0, video.duration - 0.05);
            }
            video.pause();
          } catch {
            // ignore last-frame freeze issues
          }
        };
      }
      video.play().catch(() => {});
    } catch {
      // ignore preview playback issues
    }

    return true;
  }

  showPrizeVideoInStage(prize) {
    this.showVideoInStage(this.resolvePrizeVideoUrl(prize));
  }

  showBlockedVideoInStage() {
    return this.showVideoInStage(this.runtimeConfig.blockedVideoUrl, { loop: false });
  }

  async claimAuthorizedSpin() {
    const claim = await this.api.claim({
      guestId: this.guestId,
      clientId: this.client.id,
      clientEmail: this.client.email,
      clientPhone: this.client.phone,
    });

    this.widgetState = {
      ...this.widgetState,
      spinId: claim.spinId,
      prize: claim.prize,
      expiresAt: claim.expiresAt,
      status: claim.status,
      clientEmail: this.client.email,
    };
    writeWidgetState(this.widgetState);
    return claim;
  }

  async autoDeliverIfPossible() {
    const prize = this.widgetState?.prize;
    if (!this.client || !prize || prize.requiresAddress || !this.client.email) {
      return null;
    }

    const result = await this.api.deliver({
      spinId: this.widgetState.spinId,
      clientId: this.client.id,
      recipientEmail: this.client.email,
    });

    this.widgetState = patchWidgetState({
      status: result.status,
      promoCode: result.promoCode || this.widgetState.promoCode,
      clientEmail: this.client.email,
    });

    return result;
  }

  openRegisterFlow() {
    window.open(this.runtimeConfig.registerUrl, "_blank", "noopener");
    this.watchForAuthorizedReturn();
  }

  watchForAuthorizedReturn() {
    this.stopWatchingForAuthorizedReturn?.();

    const checkForReturn = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      this.syncAuthorizedReturn().catch((error) => {
        console.warn("[gift-safe] could not refresh authorized return", error);
      });
    };

    const handleFocus = () => checkForReturn();
    const handleVisibility = () => checkForReturn();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    this.stopWatchingForAuthorizedReturn = () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }

  async syncAuthorizedReturn() {
    if (this.authSyncInFlight || this.scenario !== "guest-pending" || !this.widgetState?.spinId) {
      return;
    }

    this.authSyncInFlight = (async () => {
      const client = await getInsalesClient();
      if (!client?.id) {
        return;
      }

      this.client = client;
      await this.claimAuthorizedSpin();
      const autoDelivered = await this.autoDeliverIfPossible();
      this.updateButton();

      if (autoDelivered) {
        this.scenario = "hidden";
        window.clearInterval(this.countdownTimer);
        this.renderSuccess(autoDelivered.message, autoDelivered.promoCode);
      } else {
        this.scenario = "authorized-claim";
        this.setPanelMode("default");
        this.renderDelivery();
      }

      this.stopWatchingForAuthorizedReturn?.();
      this.stopWatchingForAuthorizedReturn = null;
    })();

    try {
      await this.authSyncInFlight;
    } finally {
      this.authSyncInFlight = null;
    }
  }

  setupFaqAccordion() {
    const items = Array.from(this.refs.copy.querySelectorAll("[data-gs-faq-item]"));
    if (!items.length) {
      return;
    }

    items.forEach((item) => {
      const trigger = item.querySelector("[data-action='faq-toggle']");
      const body = item.querySelector("[data-gs-faq-body]");
      const icon = item.querySelector(".gs-faq-item-icon");
      const isOpen = item.classList.contains("is-open");

      if (!trigger || !body || !icon) {
        return;
      }

      gsap.killTweensOf([body, icon]);
      gsap.set(body, {
        height: isOpen ? "auto" : 0,
        autoAlpha: isOpen ? 1 : 0,
        overflow: "hidden",
      });
      gsap.set(icon, { rotate: isOpen ? 45 : 0 });

      trigger.addEventListener("click", () => {
        const shouldOpen = !item.classList.contains("is-open");
        items.forEach((otherItem) => {
          this.setFaqItemState(otherItem, otherItem === item ? shouldOpen : false);
        });
      });
    });
  }

  setFaqItemState(item, isOpen) {
    const trigger = item.querySelector("[data-action='faq-toggle']");
    const body = item.querySelector("[data-gs-faq-body]");
    const icon = item.querySelector(".gs-faq-item-icon");

    if (!trigger || !body || !icon) {
      return;
    }

    gsap.killTweensOf([body, icon]);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");

    if (isOpen) {
      item.classList.add("is-open");
      gsap.set(body, { height: "auto", overflow: "hidden" });
      const targetHeight = body.offsetHeight;
      gsap.fromTo(
        body,
        { height: 0, autoAlpha: 0 },
        {
          height: targetHeight,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => gsap.set(body, { height: "auto" }),
        },
      );
      gsap.to(icon, { rotate: 45, duration: 0.24, ease: "power2.out" });
      return;
    }

    const currentHeight = body.offsetHeight;
    item.classList.remove("is-open");
    gsap.fromTo(
      body,
      { height: currentHeight, autoAlpha: 1 },
      {
        height: 0,
        autoAlpha: 0,
        duration: 0.24,
        ease: "power2.inOut",
        onComplete: () => gsap.set(body, { overflow: "hidden" }),
      },
    );
    gsap.to(icon, { rotate: 0, duration: 0.22, ease: "power2.out" });
  }

  openFaq() {
    this.transitionPanel("faq", () => this.renderFaq());
  }

  closeFaq() {
    this.transitionPanel("hero", () => this.renderWelcome());
  }

  bindPrizeMedia() {
    this.refs.copy.querySelectorAll("[data-gs-prize-video]").forEach((node) => {
      if (node.dataset.bound === "true") {
        return;
      }

      node.dataset.bound = "true";

      const fallbackSrc = node.dataset.fallbackSrc;
      const switchToFallback = () => {
        if (!fallbackSrc || node.dataset.usingFallback === "true") {
          return;
        }

        node.dataset.usingFallback = "true";
        node.src = fallbackSrc;
        node.load();
        node.play().catch(() => {});
      };

      node.addEventListener("error", switchToFallback);
      node.play().catch(() => {});
    });
  }

  getPrizeMedia(prize) {
    const visual = getPrizeVisual(prize);
    const prizeVideoUrl = this.resolvePrizeVideoUrl(prize);
    const fallbackVideoUrl = this.runtimeConfig.safeVideo.mp4Url || this.runtimeConfig.safeVideo.webmUrl || "";

    return `
      <div class="gs-prize-card">
        <div class="gs-prize-media" style="--gs-card-accent: ${visual.accent}">
          <video
            class="gs-prize-media-video"
            data-gs-prize-video
            src="${escapeHtml(prizeVideoUrl || fallbackVideoUrl)}"
            ${fallbackVideoUrl ? `data-fallback-src="${escapeHtml(fallbackVideoUrl)}"` : ""}
            aria-label="${escapeHtml(prize.title)}"
            autoplay
            muted
            loop
            playsinline
            preload="metadata"
          ></video>
          <span class="gs-prize-media-badge">${escapeHtml(visual.badge)}</span>
        </div>
        <div class="gs-prize-body">
          <h3>${escapeHtml(prize.title)}</h3>
          <p>${escapeHtml(prize.description)}</p>
        </div>
      </div>
    `;
  }

  renderWelcome() {
    this.setPanelMode("hero");
    this.setPanelView("hero");
    this.renderCopy(`
      <div class="gs-hero-actions">
        <button class="gs-asset-button gs-asset-button--primary" type="button" data-action="spin">
          <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.primaryButton)}" alt="" />
          <span>${TEXTS.welcomeButton}</span>
        </button>
        <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="faq-open">
          <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
          <span>${TEXTS.welcomeInfoButton}</span>
        </button>
      </div>
    `);
  }

  renderFaq() {
    this.setPanelMode("faq");
    this.setPanelView("faq");
    this.renderCopy(`
      <div class="gs-faq-view">
        <div class="gs-faq-header">
          <h2>Что внутри сейфа?</h2>
          <p>Коротко и по-человечески: что это за подарок и как его забрать.</p>
        </div>
        <div class="gs-faq-list">
          ${getFaqMarkup()}
        </div>
        <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="faq-back">
          <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
          <span>${TEXTS.faqBackButton}</span>
        </button>
      </div>
    `);
  }

  renderPrizePending() {
    this.setPanelMode("pending");
    this.setPanelView("pending");
    this.showPrizeVideoInStage(this.widgetState.prize);
    const prizeHintText = getPrizeHintText(this.widgetState.prize);
    const registerHintText = getRegisterHintText();
    this.renderCopy(`
      <div class="gs-prize-pending-view">
        <div class="gs-prize-pending-card">
          <div class="gs-prize-pending-head">
            <span class="gs-prize-pending-label">Твой подарок</span>
            <button
              class="gs-prize-help-button"
              type="button"
              data-action="hint-open"
              data-hint-title="Что это за приз?"
              data-hint-text="${escapeHtml(prizeHintText)}"
            >?</button>
          </div>
          <div class="gs-prize-pending-title">${escapeHtml(this.widgetState.prize.title)}</div>
          <div class="gs-prize-pending-timer">
            <span>Подарок ждёт тебя ещё</span>
            <strong data-gs-countdown>${formatCountdown(this.widgetState.expiresAt)}</strong>
          </div>
        </div>
        <div class="gs-prize-register-row">
          <button class="gs-asset-button gs-asset-button--primary" type="button" data-action="register">
            <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.primaryButton)}" alt="" />
            <span>${TEXTS.registerButton}</span>
          </button>
          <button
            class="gs-prize-help-button gs-prize-help-button--corner"
            type="button"
            data-action="hint-open"
            data-hint-title="Что делать дальше?"
            data-hint-text="${escapeHtml(registerHintText)}"
          >?</button>
        </div>
        <div class="gs-prize-hint-overlay" data-gs-hint-overlay hidden>
          <button class="gs-prize-hint-backdrop" type="button" data-action="hint-close" aria-label="Закрыть подсказку"></button>
          <div class="gs-prize-hint-card" data-gs-hint-card>
            <button class="gs-prize-hint-close" type="button" data-action="hint-close" aria-label="Закрыть">×</button>
            <h3 data-gs-hint-title></h3>
            <p data-gs-hint-text></p>
          </div>
        </div>
      </div>
    `);
  }

  renderDelivery() {
    this.setPanelMode("pending");
    this.showPrizeVideoInStage(this.widgetState.prize);
    const needsAddress = Boolean(this.widgetState?.prize?.requiresAddress);
    const emailValue = escapeHtml(this.client?.email || this.widgetState?.clientEmail || "");
    const prizeType = this.widgetState?.prize?.type;
    const prizeHintText = getPrizeHintText(this.widgetState.prize);
    const deliveryHintText = getDeliveryHintText(this.widgetState.prize);
    const autoEmailHint =
      prizeType === "FREE_SHIPPING"
        ? "После подтверждения бесплатная доставка закрепится за аккаунтом и применится автоматически в следующем заказе."
        : prizeType === "BONUS_POINTS"
          ? "Начислим выигрыш на твой аккаунт и отправим подтверждение на email из профиля."
          : TEXTS.readyEmailHint;

    if (!needsAddress) {
      this.setPanelView("delivery-main");
      this.renderCopy(`
        <div class="gs-prize-pending-view gs-prize-pending-view--delivery-main">
          <form class="gs-form gs-prize-delivery-form gs-prize-delivery-form--compact" data-action="deliver">
            <div class="gs-delivery-actions">
              <div class="gs-delivery-primary-action">
                <button class="gs-asset-button gs-asset-button--primary" type="submit">
                  <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.primaryButton)}" alt="" />
                  <span>${TEXTS.deliveryButton}</span>
                </button>
                <button
                  class="gs-prize-help-button gs-prize-help-button--delivery-inline"
                  type="button"
                  data-action="hint-open"
                  data-hint-title="Что будет дальше?"
                  data-hint-text="${escapeHtml(deliveryHintText)}"
                  data-hint-offset-y="-100"
                >?</button>
              </div>
              <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="delivery-details-open">
                <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
                <span>Подробнее</span>
              </button>
            </div>
          </form>
          <div class="gs-prize-hint-overlay" data-gs-hint-overlay hidden>
            <button class="gs-prize-hint-backdrop" type="button" data-action="hint-close" aria-label="Закрыть подсказку"></button>
            <div class="gs-prize-hint-card" data-gs-hint-card>
              <button class="gs-prize-hint-close" type="button" data-action="hint-close" aria-label="Закрыть">×</button>
              <h3 data-gs-hint-title></h3>
              <p data-gs-hint-text></p>
            </div>
          </div>
        </div>
      `);
      return;
    }

    this.setPanelView("delivery-form");
    this.renderCopy(`
      <div class="gs-prize-pending-view gs-prize-pending-view--delivery-form">
        <div class="gs-prize-pending-card">
          <div class="gs-prize-pending-label">${needsAddress ? "Подарок ждёт отправки" : "Подарок закреплен за профилем"}</div>
          <div class="gs-prize-pending-title">${escapeHtml(this.widgetState.prize.title)}</div>
          <div class="gs-prize-pending-timer">
            <span>На подтверждение осталось</span>
            <strong data-gs-countdown>${formatCountdown(this.widgetState.expiresAt)}</strong>
          </div>
        </div>
        <form class="gs-form gs-prize-delivery-form" data-action="deliver">
          ${
            needsAddress
              ? `
                <div class="gs-prize-info-note">
                  <strong>Куда отправить подарок?</strong>
                  <p>Заполни данные получателя, и мы подготовим отправку приза.</p>
                </div>
                <label>
                  <span>Имя получателя</span>
                  <input name="recipientName" placeholder="Например, Анна" required />
                </label>
                <label>
                  <span>Телефон</span>
                  <input name="recipientPhone" placeholder="+7 999 123 45 67" required />
                </label>
                <label>
                  <span>Адрес доставки</span>
                  <textarea name="recipientAddress" rows="3" placeholder="Город, улица, дом, квартира" required></textarea>
                </label>
              `
              : emailValue
                ? `
                  <div class="gs-prize-info-note">
                    <strong>${emailValue}</strong>
                    <p>${escapeHtml(autoEmailHint)}</p>
                  </div>
                `
                : `
                  <label>
                    <span>Email для выдачи</span>
                    <input name="recipientEmail" type="email" value="${emailValue}" placeholder="you@example.com" required />
                  </label>
                `
          }
          <div class="gs-prize-register-row">
            <button class="gs-asset-button gs-asset-button--primary" type="submit">
              <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.primaryButton)}" alt="" />
              <span>${TEXTS.deliveryButton}</span>
            </button>
            <button
              class="gs-prize-help-button gs-prize-help-button--corner"
              type="button"
              data-action="hint-open"
              data-hint-title="Что будет дальше?"
              data-hint-text="${escapeHtml(needsAddress ? deliveryHintText : prizeHintText)}"
            >?</button>
          </div>
        </form>
        <div class="gs-prize-hint-overlay" data-gs-hint-overlay hidden>
          <button class="gs-prize-hint-backdrop" type="button" data-action="hint-close" aria-label="Закрыть подсказку"></button>
          <div class="gs-prize-hint-card" data-gs-hint-card>
            <button class="gs-prize-hint-close" type="button" data-action="hint-close" aria-label="Закрыть">×</button>
            <h3 data-gs-hint-title></h3>
            <p data-gs-hint-text></p>
          </div>
        </div>
      </div>
    `);
  }

  renderDeliveryDetails() {
    this.setPanelMode("faq");
    this.setPanelView("delivery-details");
    const emailValue = escapeHtml(this.client?.email || this.widgetState?.clientEmail || "");
    const prizeType = this.widgetState?.prize?.type;
    const autoEmailHint =
      prizeType === "FREE_SHIPPING"
        ? "После подтверждения бесплатная доставка закрепится за аккаунтом и применится автоматически в следующем заказе."
        : prizeType === "BONUS_POINTS"
          ? "Начислим выигрыш на твой аккаунт и отправим подтверждение на email из профиля."
          : TEXTS.readyEmailHint;

    this.renderCopy(`
      <div class="gs-prize-pending-view gs-prize-pending-view--delivery-details">
        <div class="gs-prize-pending-card gs-prize-pending-card--delivery-details">
          <div class="gs-prize-pending-label">Подарок закреплен за профилем</div>
          <div class="gs-prize-pending-title">${escapeHtml(this.widgetState.prize.title)}</div>
          <div class="gs-prize-pending-timer">
            <span>На подтверждение осталось</span>
            <strong data-gs-countdown>${formatCountdown(this.widgetState.expiresAt)}</strong>
          </div>
        </div>
        <div class="gs-prize-info-note gs-prize-info-note--delivery-details">
          <strong>${emailValue || "Email из профиля"}</strong>
          <p>${escapeHtml(autoEmailHint)}</p>
        </div>
        <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="delivery-details-back">
          <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
          <span>${TEXTS.faqBackButton}</span>
        </button>
      </div>
    `);
  }

  renderSuccess(message, promoCode) {
    this.setPanelMode("pending");
    this.setPanelView("success");
    this.showPrizeVideoInStage(this.widgetState?.prize);
    this.refs.fab.hidden = true;
    this.renderCopy(`
      <div class="gs-prize-pending-view gs-prize-pending-view--success">
        <div class="gs-prize-pending-card">
          <div class="gs-prize-pending-label">Финиш</div>
          <div class="gs-prize-pending-title">${TEXTS.successTitle}</div>
          <div class="gs-prize-info-note gs-prize-info-note--success">
            <strong>${escapeHtml(message)}</strong>
            ${promoCode ? `<p>Твой код: ${escapeHtml(promoCode)}</p>` : ""}
          </div>
        </div>
        <div class="gs-prize-register-row">
          <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="final-close">
            <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
            <span>Закрыть</span>
          </button>
        </div>
      </div>
    `);
  }

  renderBlocked(error) {
    this.setPanelMode("blocked");
    this.setPanelView("blocked");
    this.refs.fab.hidden = true;
    const blockedText = getBlockedErrorText(error);
    if (!this.showBlockedVideoInStage()) {
      this.resetStage("Розыгрыш временно недоступен.");
    }
    this.renderCopy(`
      <div class="gs-prize-pending-view gs-prize-pending-view--blocked">
        <div class="gs-prize-pending-card">
          <div class="gs-prize-pending-label">Пауза</div>
          <div class="gs-prize-info-note gs-prize-info-note--blocked">
            <strong>Розыгрыш временно недоступен</strong>
            <p>${escapeHtml(blockedText)}</p>
          </div>
        </div>
        <div class="gs-prize-register-row">
          <button class="gs-asset-button gs-asset-button--secondary" type="button" data-action="final-close">
            <img class="gs-asset-button-image" src="${escapeHtml(this.runtimeConfig.uiAssets.secondaryButton)}" alt="" />
            <span>Понятно</span>
          </button>
        </div>
      </div>
    `);
  }

  renderExpired() {
    this.setPanelMode("default");
    this.setPanelView("expired");
    this.refs.fab.hidden = true;
    this.resetStage("Время розыгрыша истекло.");
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Срок закончился</span>
        <h2>${TEXTS.expiredTitle}</h2>
        <p>${TEXTS.expiredDescription}</p>
      </div>
      <button class="gs-button gs-button--secondary" type="button" data-action="final-close">
        Закрыть
      </button>
    `);
  }

  async handleSpin() {
    if (this.isUnlocking) {
      return;
    }

    this.isUnlocking = true;
    this.setPanelMode("hero");
    this.refs.close.disabled = true;

    try {
      if (this.runtimeConfig.debug.allowRepeatSpins) {
        this.guestId = resetGuestId();
      }

      this.setSpinPendingState(true);

      const spinRequest = (async () => {
        const fingerprint = await this.fingerprintPromise;
        return this.api.spin({
          guestId: this.guestId,
          fingerprint,
          userAgent: navigator.userAgent,
          debugPrizeCode: this.runtimeConfig.debug.forcePrizeCode || undefined,
        });
      })().then(
        (result) => ({ ok: true, result }),
        (error) => ({ ok: false, error }),
      );

      let usedVideo = false;
      if (hasSafeVideoSources(this.runtimeConfig)) {
        usedVideo = await playSafeVideo(this.refs.stage, this.runtimeConfig, TEXTS.stageLoading);
      }

      const spinRequestResult = await spinRequest;
      if (!spinRequestResult.ok) {
        throw spinRequestResult.error;
      }

      const result = spinRequestResult.result;

      this.widgetState = {
        spinId: result.spinId,
        prize: result.prize,
        expiresAt: result.expiresAt,
        status: result.status,
        clientEmail: this.client?.email || this.widgetState?.clientEmail || "",
      };

      writeWidgetState(this.widgetState);

      if (usedVideo) {
        revealPrizeState(this.refs.stage, result.prize, "Сейф открыт. Приз закреплен.");
      } else {
        await playUnlockSequence(this.refs.stage, result.prize, "Сейф открыт. Приз закреплен.");
      }

      const effectiveClient = await this.detectClientAfterSpin();

      await this.transitionCopyToNextStep();

      if (effectiveClient) {
        this.client = effectiveClient;
        await this.claimAuthorizedSpin();
        const autoDelivered = await this.autoDeliverIfPossible();
        this.updateButton();

        if (autoDelivered) {
          this.scenario = "hidden";
          window.clearInterval(this.countdownTimer);
          this.renderSuccess(autoDelivered.message, autoDelivered.promoCode);
        } else {
          this.scenario = "authorized-claim";
          this.setPanelMode("default");
          this.renderDelivery();
        }
      } else {
        this.scenario = "guest-pending";
        this.setPanelMode("default");
        this.updateButton();
        this.renderPrizePending();
      }
    } catch (error) {
      await this.transitionCopyToNextStep();
      this.renderBlocked(error);
    } finally {
      this.setSpinPendingState(false);
      this.isUnlocking = false;
      this.refs.close.disabled = false;
    }
  }

  openDeliveryDetails() {
    this.transitionPanel("faq", () => this.renderDeliveryDetails());
  }

  closeDeliveryDetails() {
    this.transitionPanel("pending", () => this.renderDelivery());
  }

  async handleDelivery(form) {
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Сохраняем...";

    try {
      const formData = new FormData(form);
      const payload = {
        spinId: this.widgetState.spinId,
        clientId: this.client.id,
        recipientName: formData.get("recipientName")?.toString().trim() || undefined,
        recipientPhone: formData.get("recipientPhone")?.toString().trim() || undefined,
        recipientAddress: formData.get("recipientAddress")?.toString().trim() || undefined,
        recipientEmail: formData.get("recipientEmail")?.toString().trim() || undefined,
      };

      const result = await this.api.deliver(payload);
      this.widgetState = patchWidgetState({
        status: result.status,
        promoCode: result.promoCode || this.widgetState.promoCode,
      });

      this.scenario = "hidden";
      window.clearInterval(this.countdownTimer);
      this.renderSuccess(result.message, result.promoCode);
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = TEXTS.deliveryButton;
      window.alert(error.message || "Не удалось сохранить данные.");
    }
  }

  syncCountdown() {
    window.clearInterval(this.countdownTimer);

    this.countdownTimer = window.setInterval(() => {
      if (!this.widgetState?.expiresAt) {
        return;
      }

      const countdown = formatCountdown(this.widgetState.expiresAt);
      this.shadowRoot.querySelectorAll("[data-gs-countdown]").forEach((node) => {
        node.textContent = countdown;
      });

      if (countdown === "00:00:00") {
        this.widgetState = patchWidgetState({ status: "EXPIRED" });
        this.scenario = "expired";

        if (this.modalOpen) {
          this.renderExpired();
        } else {
          this.destroy();
        }
      } else if (this.scenario === "authorized-claim") {
        this.refs.fab.setAttribute("aria-label", `${TEXTS.claimedFab} ${countdown}`);
        this.refs.fab.title = `${TEXTS.claimedFab} ${countdown}`;
        if (this.refs.fabLabel) {
          this.refs.fabLabel.textContent = `${TEXTS.claimedFab} ${countdown}`;
        }
      }
    }, 1000);
  }

  resolvePrizeVideoUrl(prize) {
    if (!prize?.code) {
      return "";
    }

    const basePath = this.runtimeConfig.prizeVideoBaseUrl.replace(/\/$/, "");
    return `${basePath}/${prize.code}.mp4`;
  }

  resolveAssetUrl(assetPath) {
    if (!assetPath) {
      return "";
    }

    if (/^https?:\/\//i.test(assetPath)) {
      return assetPath;
    }

    return `${this.runtimeConfig.assetsBaseUrl}${assetPath.startsWith("/") ? "" : "/"}${assetPath}`;
  }
}
