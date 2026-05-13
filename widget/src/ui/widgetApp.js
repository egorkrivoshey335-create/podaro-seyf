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
            <button class="gs-close" type="button" data-action="close" aria-label="Закрыть">×</button>
            <div class="gs-panel-grid">
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
                <div class="gs-prize-badge" data-gs-prize-badge></div>
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
      close: this.shadowRoot.querySelector(".gs-close"),
      copy: this.shadowRoot.querySelector("[data-gs-copy]"),
      stage: this.shadowRoot.querySelector("[data-gs-stage]"),
    };

    this.refs.fab.addEventListener("click", () => this.openFromButton());
    this.shadowRoot.querySelector(".gs-backdrop").addEventListener("click", () => this.closeModal());
    this.refs.close.addEventListener("click", () => this.closeModal());
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
      if (!showSafeVideoPreview(this.refs.stage, this.runtimeConfig, TEXTS.stageIdle)) {
        this.resetStage(TEXTS.stageIdle);
      }
      this.renderWelcome();
      this.scheduleAutoOpen();
      return;
    }

    if (this.scenario === "guest-pending") {
      this.showPrizeStage(this.widgetState.prize, "Приз закреплен за этим браузером.");
      this.renderPrizePending();
      return;
    }

    if (this.scenario === "authorized-claim") {
      this.showPrizeStage(this.widgetState.prize, "Приз уже готов к получению.");
      this.renderDelivery();
      this.scheduleAutoOpen();
      return;
    }

    if (this.scenario === "expired") {
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

    gsap.fromTo(
      this.refs.copy.children,
      { y: 18, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.34, stagger: 0.06, ease: "power2.out" },
    );
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
    this.renderCopy(`
      <div class="gs-copy-block">
        <span class="gs-kicker">${TEXTS.welcomeEyebrow}</span>
        <h2>${TEXTS.welcomeTitle}</h2>
        <p>${TEXTS.welcomeDescription}</p>
      </div>
      <div class="gs-chip-row">
        <span>Промокоды</span>
        <span>Бонусы</span>
        <span>Физические подарки</span>
        <span>Бесплатная доставка</span>
      </div>
      <button class="gs-button gs-button--primary" type="button" data-action="spin">
        ${TEXTS.welcomeButton}
      </button>
      <p class="gs-footnote">После открытия подарок закрепится за этим браузером на 24 часа.</p>
    `);
  }

  renderPrizePending() {
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
