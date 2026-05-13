import { GUEST_COOKIE_KEY, STORAGE_KEY } from "../config.js";

function createUuid() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function readCookie(name) {
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : undefined;
}

function writeCookie(name, value) {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expiresAt}; path=/; SameSite=Lax`;
}

export function getOrCreateGuestId() {
  const fromStorage = localStorage.getItem("gift-safe-guest-id");
  const fromCookie = readCookie(GUEST_COOKIE_KEY);
  const guestId = fromStorage || fromCookie || createUuid();

  localStorage.setItem("gift-safe-guest-id", guestId);
  writeCookie(GUEST_COOKIE_KEY, guestId);
  return guestId;
}

export function readWidgetState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    return rawState ? JSON.parse(rawState) : null;
  } catch {
    return null;
  }
}

export function writeWidgetState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearWidgetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function patchWidgetState(partialState) {
  const currentState = readWidgetState() || {};
  const nextState = {
    ...currentState,
    ...partialState,
  };

  writeWidgetState(nextState);
  return nextState;
}

export function isExpiredState(state) {
  return Boolean(state?.expiresAt && new Date(state.expiresAt).getTime() <= Date.now());
}
