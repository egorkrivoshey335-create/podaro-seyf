async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(body?.error || "Request failed");
    error.status = response.status;
    error.code = body?.code;
    error.details = body?.details;
    throw error;
  }

  return body;
}

export function createApiClient(runtimeConfig) {
  return {
    spin(payload) {
      return fetchJson(`${runtimeConfig.apiBaseUrl}/spin`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    claim(payload) {
      return fetchJson(`${runtimeConfig.apiBaseUrl}/claim`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async myPrize(clientId) {
      try {
        return await fetchJson(
          `${runtimeConfig.apiBaseUrl}/my-prize?clientId=${encodeURIComponent(clientId)}`,
        );
      } catch (error) {
        if (error.status === 404) {
          return null;
        }

        throw error;
      }
    },
    async debugConfig() {
      try {
        return await fetchJson(`${runtimeConfig.apiBaseUrl}/debug-config`);
      } catch {
        return null;
      }
    },
    deliver(payload) {
      return fetchJson(`${runtimeConfig.apiBaseUrl}/deliver`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  };
}
