function getRefs(root) {
  return {
    shell: root.querySelector("[data-gs-video-shell]"),
    video: root.querySelector("[data-gs-video]"),
    status: root.querySelector("[data-gs-stage-status]"),
  };
}

function waitForVideoEvent(video, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("SAFE_VIDEO_TIMEOUT"));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timeoutId);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      video.removeEventListener("stalled", handleError);
      video.removeEventListener("abort", handleError);
    }

    function handleEnded() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error("SAFE_VIDEO_FAILED"));
    }

    video.addEventListener("ended", handleEnded, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.addEventListener("stalled", handleError, { once: true });
    video.addEventListener("abort", handleError, { once: true });
  });
}

export function hasSafeVideoSources(runtimeConfig) {
  return Boolean(runtimeConfig?.safeVideo?.mp4Url || runtimeConfig?.safeVideo?.webmUrl);
}

export function prepareSafeVideo(root, runtimeConfig) {
  const { video } = getRefs(root);
  if (!video) {
    return;
  }

  const { mp4Url, webmUrl, posterUrl } = runtimeConfig.safeVideo;
  const signature = JSON.stringify({ mp4Url, webmUrl, posterUrl });
  if (video.dataset.signature === signature) {
    return;
  }

  video.dataset.signature = signature;
  video.poster = posterUrl || "";
  video.controls = false;
  video.disablePictureInPicture = true;
  video.playsInline = true;
  video.innerHTML = `
    ${webmUrl ? `<source src="${webmUrl}" type="video/webm" />` : ""}
    ${mp4Url ? `<source src="${mp4Url}" type="video/mp4" />` : ""}
  `;
  video.load();
}

export function resetSafeVideo(root) {
  const { shell, video } = getRefs(root);
  root.dataset.gsMode = "scene";

  if (!video) {
    return;
  }

  try {
    video.pause();
    video.currentTime = 0;
  } catch {
    // Ignore reset errors; fallback scene remains usable.
  }

  video.muted = true;
  video.volume = 0;

  if (shell) {
    shell.hidden = true;
  }
}

export async function playSafeVideo(root, runtimeConfig, statusText) {
  if (!hasSafeVideoSources(runtimeConfig)) {
    return false;
  }

  prepareSafeVideo(root, runtimeConfig);

  const { shell, video, status } = getRefs(root);
  if (!video) {
    return false;
  }

  if (status && statusText) {
    status.textContent = statusText;
  }

  root.dataset.gsMode = "video";
  if (shell) {
    shell.hidden = false;
  }

  try {
    video.pause();
    video.currentTime = 0;
    video.muted = false;
    video.volume = 1;
    video.load();

    const playAttempt = video.play();
    if (playAttempt?.catch) {
      await playAttempt;
    }

    const timeoutMs = Number.isFinite(video.duration) && video.duration > 0
      ? Math.ceil(video.duration * 1000) + 5000
      : 15000;

    await waitForVideoEvent(video, timeoutMs);

    try {
      video.pause();
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.max(video.duration - 0.05, 0);
      }
    } catch {
      // Keep the last rendered frame if direct seeking is not allowed.
    }

    return true;
  } catch (error) {
    console.warn("[gift-safe] safe video fallback engaged", error);
    resetSafeVideo(root);
    return false;
  }
}
