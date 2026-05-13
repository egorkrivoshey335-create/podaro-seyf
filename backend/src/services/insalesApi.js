import { config } from "../config.js";
import { logger } from "../lib/logger.js";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toBasicAuth(apiKey, password) {
  return Buffer.from(`${apiKey}:${password}`).toString("base64");
}

export class InsalesApi {
  constructor(options = {}) {
    this.domain = options.domain || config.insales.domain;
    this.shopUrl = options.shopUrl || config.insales.shopUrl;
    this.apiKey = options.apiKey || config.insales.apiKey;
    this.password = options.password || config.insales.password;
    this.lastRequestAt = 0;
  }

  isConfigured() {
    return Boolean((this.shopUrl || this.domain) && this.apiKey && this.password);
  }

  getBaseUrl() {
    if (this.shopUrl) {
      return `${this.shopUrl.replace(/\/$/, "")}/admin`;
    }

    return `https://${this.domain}/admin`;
  }

  async request(path, { method = "GET", body } = {}) {
    if (!this.isConfigured()) {
      logger.warn({ path, method }, "insales api is not configured, returning stub");
      return {
        stub: true,
        path,
        method,
        body,
      };
    }

    const headers = {
      Authorization: `Basic ${toBasicAuth(this.apiKey, this.password)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    let lastError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const now = Date.now();
        const wait = Math.max(0, 250 - (now - this.lastRequestAt));
        if (wait > 0) {
          await sleep(wait);
        }

        this.lastRequestAt = Date.now();

        const response = await fetch(`${this.getBaseUrl()}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;

        if (!response.ok) {
          const error = new Error(`InSales request failed with status ${response.status}`);
          error.status = response.status;
          error.data = data;
          throw error;
        }

        return data;
      } catch (error) {
        lastError = error;
        logger.warn(
          {
            path,
            method,
            attempt,
            error: error.message,
          },
          "insales request failed",
        );

        if (attempt < 3) {
          await sleep(250 * 2 ** (attempt - 1));
        }
      }
    }

    throw lastError;
  }

  async addBonusPoints(clientId, amount, reason) {
    return this.request(`/clients/${clientId}/bonus_system_transactions.json`, {
      method: "POST",
      body: {
        bonus_system_transaction: {
          bonus_points: amount,
          description: reason,
        },
      },
    });
  }

  async issueDiscountCode({ code, description, discount, expiredAt, typeId = 1, minPrice }) {
    return this.request("/discount_codes.json", {
      method: "POST",
      body: {
        discount_code: {
          code,
          description,
          act_once: true,
          act_once_for_client: true,
          disabled: false,
          expired_at: expiredAt,
          type_id: typeId,
          discount,
          min_price: minPrice,
        },
      },
    });
  }

  async getDiscountCode(discountId) {
    return this.request(`/discount_codes/${discountId}.json`, {
      method: "GET",
    });
  }

  async deleteDiscountCode(discountId) {
    return this.request(`/discount_codes/${discountId}.json`, {
      method: "DELETE",
    });
  }
}

export const insalesApi = new InsalesApi();
