import { gsap } from "gsap";
import lottie from "lottie-web/build/player/lottie_svg";

import fabAnimationData from "../assets/fab-gift.json";
import { TEXTS, getPrizeVisual } from "../config.js";
import { patchWidgetState, writeWidgetState } from "../core/storage.js";
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
    question: "Что это за игра?",
    answer:
      "Это приветственный сейф с гарантированным подарком для нового гостя. Нажимаешь кнопку, открываешь сейф и сразу видишь, какой бонус выпал.",
  },
  {
    question: "Какие подарки можно выиграть?",
    answer:
      "Внутри могут быть промокоды, бонусные баллы, бесплатная доставка и отдельные подарки. Конкретный приз зависит от настроек акции.",
  },
  {
    question: "Как получить приз?",
    answer:
      "После открытия подарок закрепляется за этим браузером. Дальше виджет подскажет следующий шаг: зарегистрироваться, подтвердить email или заполнить данные для доставки.",
  },
  {
    question: "Сколько времени действует выигрыш?",
    answer:
      "Обычно приз хранится 24 часа с момента открытия. Таймер и дальнейшие шаги покажутся в виджете автоматически.",
  },
];

function getFaqMarkup() {
  return FAQ_ITEMS.map(
    (item, index) => `
      <details class="gs-faq-item" ${index === 0 ? "open" : ""}>
        <summary>
          <span>${escapeHtml(item.question)}</span>
          <span class="gs-faq-item-icon">+</span>
        </summary>
        <div class="gs-faq-item-body">
          <p>${escapeHtml(item.answer)}</p>
        </div>
      </details>
    `,
  ).join("");
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
    this.refs.panel.classList.toggle("gs-panel--default", mode === "default");

    this.refs.stageWrap.hidden = mode === "faq";
    this.refs.panelFlags.hidden = mode === "default";
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
      this.setPanelMode("default");
      this.showPrizeStage(this.widgetState.prize, "Приз закреплен за этим браузером.");
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

    this.refs.copy.querySelector("[data-action='spin']")?.addEventListener("click", () => this.handleSpin());
    this.refs.copy.querySelector("[data-action='faq-open']")?.addEventListener("click", () => this.openFaq());
    this.refs.copy.querySelector("[data-action='faq-back']")?.addEventListener("click", () => this.closeFaq());
    this.refs.copy
      .querySelector("[data-action='register']")
      ?.addEventListener("click", () => window.open(this.runtimeConfig.registerUrl, "_blank", "noopener"));
    this.refs.copy.querySelector("[data-action='deliver']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleDelivery(event.currentTarget);
    });
    this.refs.copy.querySelector("[data-action='final-close']")?.addEventListener("click", () => {
      this.closeModal();
      this.destroy();
    });

    const finalOffsetY = this.panelMode === "hero" ? -25 : 0;
    gsap.fromTo(
      this.refs.copy.children,
      { y: finalOffsetY + 18, autoAlpha: 0 },
      { y: finalOffsetY, autoAlpha: 1, duration: 0.34, stagger: 0.06, ease: "power2.out" },
    );
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
    this.renderCopy(`
      <div class="gs-faq-view">
        <div class="gs-faq-header">
          <h2>Что это за сейф?</h2>
          <p>Коротко о том, как работает розыгрыш и что ждёт внутри.</p>
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
    this.setPanelMode("default");
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Приз уже найден</span>
        <h2>${TEXTS.prizeTitle}</h2>
        <p>Ты выиграл «${escapeHtml(this.widgetState.prize.title)}». ${TEXTS.prizeRegisterHint}</p>
      </div>
      ${this.getPrizeMedia(this.widgetState.prize)}
      <div class="gs-countdown-box">
        Приз сгорит через <strong data-gs-countdown>${formatCountdown(this.widgetState.expiresAt)}</strong>
      </div>
      <button class="gs-button gs-button--primary" type="button" data-action="register">
        ${TEXTS.registerButton}
      </button>
      <p class="gs-footnote">После регистрации мы сразу покажем форму получения на любой странице сайта.</p>
    `);
  }

  renderDelivery() {
    this.setPanelMode("default");
    const needsAddress = Boolean(this.widgetState?.prize?.requiresAddress);
    const emailValue = escapeHtml(this.client?.email || this.widgetState?.clientEmail || "");
    const prizeType = this.widgetState?.prize?.type;
    const autoEmailHint =
      prizeType === "FREE_SHIPPING"
        ? "После подтверждения бесплатная доставка закрепится за аккаунтом и применится автоматически в следующем заказе."
        : prizeType === "BONUS_POINTS"
          ? "Начислим выигрыш на твой аккаунт и отправим подтверждение на email из профиля."
          : TEXTS.readyEmailHint;

    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Приз закреплен за профилем</span>
        <h2>${TEXTS.deliveryTitle}</h2>
        <p>${TEXTS.deliveryDescription}</p>
      </div>
      ${this.getPrizeMedia(this.widgetState.prize)}
      <div class="gs-countdown-box">
        На подтверждение осталось <strong data-gs-countdown>${formatCountdown(this.widgetState.expiresAt)}</strong>
      </div>
      <form class="gs-form" data-action="deliver">
        ${
          needsAddress
            ? `
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
                <div class="gs-inline-note">
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
        <button class="gs-button gs-button--primary" type="submit">
          ${TEXTS.deliveryButton}
        </button>
      </form>
    `);
  }

  renderSuccess(message, promoCode) {
    this.setPanelMode("default");
    this.refs.fab.hidden = true;
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Финиш</span>
        <h2>${TEXTS.successTitle}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
      ${promoCode ? `<div class="gs-code-box">${escapeHtml(promoCode)}</div>` : ""}
      <button class="gs-button gs-button--secondary" type="button" data-action="final-close">
        Закрыть
      </button>
    `);
  }

  renderBlocked(error) {
    this.setPanelMode("default");
    this.resetStage("Защита остановила повторную попытку.");
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Защита виджета</span>
        <h2>${TEXTS.blockedTitle}</h2>
        <p>${escapeHtml(error?.message || TEXTS.blockedDescription)}</p>
      </div>
      <button class="gs-button gs-button--secondary" type="button" data-action="final-close">
        Понятно
      </button>
    `);
  }

  renderExpired() {
    this.setPanelMode("default");
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
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">Секундочку</span>
        <h2>Сейф подбирает комбинацию</h2>
        <p>${TEXTS.stageLoading}</p>
      </div>
    `);

    try {
      const spinRequest = (async () => {
        const fingerprint = await this.fingerprintPromise;
        return this.api.spin({
          guestId: this.guestId,
          fingerprint,
          userAgent: navigator.userAgent,
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
      };

      writeWidgetState(this.widgetState);

      if (usedVideo) {
        revealPrizeState(this.refs.stage, result.prize, "Сейф открыт. Приз закреплен.");
      } else {
        await playUnlockSequence(this.refs.stage, result.prize, "Сейф открыт. Приз закреплен.");
      }

      this.scenario = "guest-pending";
      this.setPanelMode("default");
      this.updateButton();
      this.renderPrizePending();
    } catch (error) {
      this.renderBlocked(error);
    } finally {
      this.isUnlocking = false;
      this.refs.close.disabled = false;
    }
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
