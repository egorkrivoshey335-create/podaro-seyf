export async function getFingerprint() {
  try {
    const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
    const agent = await FingerprintJS.load();
    const result = await agent.get();
    return result.visitorId;
  } catch (error) {
    console.warn("[gift-safe] fingerprint unavailable", error);
    return undefined;
  }
}
