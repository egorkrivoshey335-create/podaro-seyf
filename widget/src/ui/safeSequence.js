import { gsap } from "gsap";

import { getPrizeVisual } from "../config.js";

function getDigits(root) {
  return Array.from(root.querySelectorAll("[data-gs-digit]"));
}

function setDigits(root, digits) {
  getDigits(root).forEach((node, index) => {
    node.textContent = digits[index] ?? "0";
  });
}

function setBadge(root, prize) {
  const badge = root.querySelector("[data-gs-prize-badge]");
  const visual = getPrizeVisual(prize);

  if (!badge) {
    return;
  }

  badge.style.setProperty("--gs-badge-accent", visual.accent);
  badge.innerHTML = `
    <span class="gs-prize-badge-label">${visual.badge}</span>
    <span class="gs-prize-badge-title">${prize?.title || "Подарок"}</span>
  `;
}

function setStatus(root, statusText) {
  const status = root.querySelector("[data-gs-stage-status]");
  if (status && statusText) {
    status.textContent = statusText;
  }
}

function applyPrizeState(root, prize, statusText) {
  setBadge(root, prize);
  setDigits(root, ["7", "2", "4"]);
  setStatus(root, statusText);
}

export function resetSafeScene(root, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const badge = root.querySelector("[data-gs-prize-badge]");
  const light = root.querySelector("[data-gs-safe-light]");

  gsap.set(door, { rotateY: 0, rotateZ: 0 });
  gsap.set(badge, { autoAlpha: 0, y: 18, scale: 0.86 });
  gsap.set(light, { autoAlpha: 0.15, scale: 0.9 });
  setDigits(root, ["0", "0", "0"]);
  setStatus(root, statusText);
}

export function showPrizeState(root, prize, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const badge = root.querySelector("[data-gs-prize-badge]");
  const light = root.querySelector("[data-gs-safe-light]");

  applyPrizeState(root, prize, statusText);

  gsap.set(door, { rotateY: -105, rotateZ: -3 });
  gsap.set(badge, { autoAlpha: 1, y: 0, scale: 1 });
  gsap.set(light, { autoAlpha: 0.95, scale: 1.15 });
}

export function revealPrizeState(root, prize, statusText) {
  const badge = root.querySelector("[data-gs-prize-badge]");
  const light = root.querySelector("[data-gs-safe-light]");

  applyPrizeState(root, prize, statusText);
  gsap.set(badge, { autoAlpha: 0, y: 22, scale: 0.88 });
  gsap.fromTo(
    light,
    { autoAlpha: 0.45, scale: 1 },
    { autoAlpha: 0.98, scale: 1.16, duration: 0.4, ease: "power2.out" },
  );
  return gsap.to(badge, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.42,
    ease: "power2.out",
  });
}

export function playUnlockSequence(root, prize, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const lock = root.querySelector("[data-gs-lock]");
  const badge = root.querySelector("[data-gs-prize-badge]");
  const light = root.querySelector("[data-gs-safe-light]");

  applyPrizeState(root, prize, statusText);

  const scrambleDigits = getDigits(root);
  const finalDigits = String(Math.floor(Math.random() * 900) + 100).split("");
  const scrambleTimer = window.setInterval(() => {
    scrambleDigits.forEach((node) => {
      node.textContent = String(Math.floor(Math.random() * 10));
    });
  }, 70);

  return new Promise((resolve) => {
    const timeline = gsap.timeline({
      onComplete: () => {
        window.clearInterval(scrambleTimer);
        setDigits(root, finalDigits);
        resolve();
      },
    });

    timeline
      .set(badge, { autoAlpha: 0, y: 22, scale: 0.82 })
      .to(lock, {
        rotate: 540,
        scale: 1.08,
        duration: 1.1,
        ease: "power2.inOut",
      })
      .to(
        root.querySelector("[data-gs-safe]"),
        {
          x: 4,
          yoyo: true,
          repeat: 5,
          duration: 0.08,
          ease: "power1.inOut",
        },
        "-=0.5",
      )
      .to(light, { autoAlpha: 0.95, scale: 1.12, duration: 0.45, ease: "power2.out" }, "-=0.1")
      .to(
        door,
        {
          rotateY: -105,
          rotateZ: -3,
          duration: 0.95,
          ease: "power3.inOut",
          transformOrigin: "left center",
        },
        "-=0.05",
      )
      .to(
        badge,
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          ease: "back.out(1.6)",
        },
        "-=0.15",
      );
  });
}
