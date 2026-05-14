import { gsap } from "gsap";

function getDigits(root) {
  return Array.from(root.querySelectorAll("[data-gs-digit]"));
}

function setDigits(root, digits) {
  getDigits(root).forEach((node, index) => {
    node.textContent = digits[index] ?? "0";
  });
}

function setStatus(root, statusText) {
  const status = root.querySelector("[data-gs-stage-status]");
  if (status && statusText) {
    status.textContent = statusText;
  }
}

function applyPrizeState(root, prize, statusText) {
  setDigits(root, ["7", "2", "4"]);
  setStatus(root, statusText);
}

export function resetSafeScene(root, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const light = root.querySelector("[data-gs-safe-light]");

  gsap.set(door, { rotateY: 0, rotateZ: 0 });
  gsap.set(light, { autoAlpha: 0.15, scale: 0.9 });
  setDigits(root, ["0", "0", "0"]);
  setStatus(root, statusText);
}

export function showPrizeState(root, prize, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const light = root.querySelector("[data-gs-safe-light]");

  applyPrizeState(root, prize, statusText);

  gsap.set(door, { rotateY: -105, rotateZ: -3 });
  gsap.set(light, { autoAlpha: 0.95, scale: 1.15 });
}

export function revealPrizeState(root, prize, statusText) {
  const light = root.querySelector("[data-gs-safe-light]");

  applyPrizeState(root, prize, statusText);
  gsap.fromTo(
    light,
    { autoAlpha: 0.45, scale: 1 },
    { autoAlpha: 0.98, scale: 1.16, duration: 0.4, ease: "power2.out" },
  );
  return gsap.to(light, {
    autoAlpha: 1,
    scale: 1.18,
    duration: 0.42,
    ease: "power2.out",
  });
}

export function playUnlockSequence(root, prize, statusText) {
  const door = root.querySelector("[data-gs-safe-door]");
  const lock = root.querySelector("[data-gs-lock]");
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
        "-=0.15",
      );
  });
}
