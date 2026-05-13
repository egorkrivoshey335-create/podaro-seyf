// keepalive.js — scheduled function для предотвращения cold start
// Пингует основной handler каждые 5 минут, чтобы Lambda-инстанс не засыпал.
//
// Netlify Scheduled Functions требуют указания schedule в netlify.toml:
//   [functions."keepalive"]
//     schedule = "*/5 * * * *"
//
// Docs: https://docs.netlify.com/functions/scheduled-functions/

const https = require('https');

// URL основного API — пингуем оба маршрута чтобы прогреть оба пути кода
const PING_URLS = [
  'https://insales-delivery-api.netlify.app/api/courier-door',
  'https://insales-delivery-api.netlify.app/api/delivery/calculate'
];

// Минимальное тело запроса — как будто пустой заказ
const PING_BODY = JSON.stringify({ action: 'ping' });

function pingUrl(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(PING_BODY),
        'X-Keepalive': '1'
      },
      timeout: 8000
    };

    const t0 = Date.now();
    const req = https.request(options, (res) => {
      res.resume(); // сливаем тело чтобы не блокировать
      res.on('end', () => {
        console.log(`[KEEPALIVE] ${url} → ${res.statusCode} (${Date.now() - t0}ms)`);
        resolve({ url, status: res.statusCode, ms: Date.now() - t0 });
      });
    });

    req.on('error', (e) => {
      console.error(`[KEEPALIVE] Ошибка: ${url} → ${e.message}`);
      resolve({ url, error: e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[KEEPALIVE] Таймаут: ${url}`);
      resolve({ url, error: 'timeout' });
    });

    req.write(PING_BODY);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log('[KEEPALIVE] Scheduled ping started at', new Date().toISOString());

  const results = await Promise.all(PING_URLS.map(pingUrl));

  console.log('[KEEPALIVE] Done:', JSON.stringify(results));

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, results })
  };
};
