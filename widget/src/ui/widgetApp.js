import { gsap } from "gsap";

import { TEXTS, getPrizeVisual } from "../config.js";
import { patchWidgetState, writeWidgetState } from "../core/storage.js";
import { playUnlockSequence, resetSafeScene, revealPrizeState, showPrizeState } from "./safeSequence.js";
import { hasSafeVideoSources, playSafeVideo, prepareSafeVideo, resetSafeVideo } from "./safeVideo.js";

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
  }

  mount() {
    this.renderShell();
    this.applyTheme();
    prepareSafeVideo(this.refs.stage, this.runtimeConfig);
    this.refresh();
  }

  destroy() {
    window.clearTimeout(this.autoOpenTimer);
    window.clearInterval(this.countdownTimer);
    gsap.killTweensOf(this.refs?.fab);
    gsap.killTweensOf(this.refs?.panel);
    this.host.remove();
  }

  applyTheme() {
    this.host.style.setProperty("--gs-primary", this.runtimeConfig.theme.primary);
    this.host.style.setProperty("--gs-accent", this.runtimeConfig.theme.accent);
    this.host.style.setProperty("--gs-surface", this.runtimeConfig.theme.surface);
  }

  renderShell() {
    this.shadowRoot.innerHTML = `
      <div class="gs-widget">
        <button class="gs-fab" type="button" hidden data-action="fab"></button>
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
      modal: this.shadowRoot.querySelector(".gs-modal"),
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
      this.resetStage(TEXTS.stageIdle);
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
    this.autoOpenTimer = window.setTimeout(() => {
      if (!this.modalOpen) {
        this.openModal();
      }
    }, this.runtimeConfig.modalDelayMs);
  }

  updateButton() {
    const button = this.refs.fab;

    if (this.scenario === "guest-fresh") {
      button.hidden = false;
      button.className = "gs-fab";
      button.textContent = TEXTS.guestFab;
      this.startFabPulse();
      return;
    }

    if (this.scenario === "guest-pending") {
      button.hidden = false;
      button.className = "gs-fab";
      button.textContent = TEXTS.pendingFab;
      this.startFabPulse();
      return;
    }

    if (this.scenario === "authorized-claim") {
      button.hidden = false;
      button.className = "gs-fab gs-fab--accent";
      const countdown = this.widgetState?.expiresAt ? formatCountdown(this.widgetState.expiresAt) : "";
      button.textContent = countdown
        ? `${TEXTS.claimedFab} ${countdown}`
        : TEXTS.claimedFab;
      this.startFabPulse();
      return;
    }

    button.hidden = true;
  }

  startFabPulse() {
    gsap.killTweensOf(this.refs.fab);
    gsap.fromTo(
      this.refs.fab,
      { y: 0, scale: 1, boxShadow: "0 14px 30px rgba(15, 23, 42, 0.32)" },
      {
        y: -4,
        scale: 1.03,
        boxShadow: "0 18px 36px rgba(124, 58, 237, 0.45)",
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

    this.openModal();
  }

  openModal() {
    if (this.modalOpen) {
      return;
    }

    this.modalOpen = true;
    this.refs.modal.hidden = false;

    gsap.fromTo(
      this.refs.modal,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.22, ease: "power2.out" },
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

    gsap.to(this.refs.panel, {
      y: 24,
      scale: 0.96,
      autoAlpha: 0,
      duration: 0.24,
      ease: "power2.in",
    });

    gsap.to(this.refs.modal, {
      autoAlpha: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => {
        this.modalOpen = false;
        this.refs.modal.hidden = true;
      },
    });
  }

  renderCopy(markup) {
    this.refs.copy.innerHTML = markup;

    this.refs.copy.querySelectorAll("[data-gs-image]").forEach((image) => {
      image.addEventListener("error", () => {
        image.closest(".gs-prize-media")?.setAttribute("data-fallback-only", "true");
      });
    });

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

  getPrizeMedia(prize) {
    const visual = getPrizeVisual(prize);
    const imageUrl = prize?.image ? this.resolveAssetUrl(prize.image) : null;

    return `
      <div class="gs-prize-card">
        <div class="gs-prize-media" style="--gs-card-accent: ${visual.accent}">
          ${imageUrl ? `<img data-gs-image src="${escapeHtml(imageUrl)}" alt="${escapeHtml(prize.title)}" />` : ""}
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
        this.refs.fab.textContent = `${TEXTS.claimedFab} ${countdown}`;
      }
    }, 1000);
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
