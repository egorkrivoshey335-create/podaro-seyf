import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "http://localhost:3000/api");
const TOKEN_KEY = "gift-safe-admin-token";

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(data?.error || data || "Request failed");
  }

  return data;
}

async function requestText(path, { token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || "Request failed");
  }

  return text;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [stats, setStats] = useState(null);
  const [spins, setSpins] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [settings, setSettings] = useState(null);
  const [logs, setLogs] = useState([]);
  const [promoStats, setPromoStats] = useState([]);
  const [selectedSpin, setSelectedSpin] = useState(null);
  const [selectedSpinLoading, setSelectedSpinLoading] = useState(false);
  const [spinNoteStatus, setSpinNoteStatus] = useState("");
  const [promoPrizeCode, setPromoPrizeCode] = useState("promo-10");
  const [promoText, setPromoText] = useState("");
  const [promoUploadStatus, setPromoUploadStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadDashboard = useCallback(async (currentToken) => {
    setLoading(true);
    setError("");

    try {
      const [statsResult, spinsResult, prizesResult, settingsResult, logsResult, promoStatsResult] =
        await Promise.all([
          request("/admin/stats", { token: currentToken }),
          request("/admin/spins", { token: currentToken }),
          request("/admin/prizes", { token: currentToken }),
          request("/admin/settings", { token: currentToken }),
          request("/admin/antifraud-logs", { token: currentToken }),
          request("/admin/promos/stats", { token: currentToken }),
        ]);

      setStats(statsResult);
      setSpins(spinsResult);
      setPrizes(prizesResult);
      setSettings(settingsResult);
      setLogs(logsResult);
      setPromoStats(promoStatsResult);
    } catch (loadError) {
      setError(loadError.message);
      if (/токен|авторизац|unauthorized/i.test(loadError.message)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      let isCancelled = false;

      async function bootstrapDashboard() {
        try {
          const [statsResult, spinsResult, prizesResult, settingsResult, logsResult, promoStatsResult] =
            await Promise.all([
              request("/admin/stats", { token }),
              request("/admin/spins", { token }),
              request("/admin/prizes", { token }),
              request("/admin/settings", { token }),
              request("/admin/antifraud-logs", { token }),
              request("/admin/promos/stats", { token }),
            ]);

          if (isCancelled) {
            return;
          }

          setStats(statsResult);
          setSpins(spinsResult);
          setPrizes(prizesResult);
          setSettings(settingsResult);
          setLogs(logsResult);
          setPromoStats(promoStatsResult);
          setError("");
        } catch (loadError) {
          if (isCancelled) {
            return;
          }

          setError(loadError.message);
          if (/токен|авторизац|unauthorized/i.test(loadError.message)) {
            localStorage.removeItem(TOKEN_KEY);
            setToken("");
          }
        } finally {
          if (!isCancelled) {
            setLoading(false);
          }
        }
      }

      bootstrapDashboard();

      return () => {
        isCancelled = true;
      };
    }

    return undefined;
  }, [token]);

  const topPrizes = useMemo(() => stats?.topPrizes || [], [stats]);
  const prizesByCode = useMemo(
    () => Object.fromEntries(prizes.map((prize) => [prize.code, prize])),
    [prizes],
  );
  const visiblePromoStats = useMemo(
    () => promoStats.filter((item) => prizesByCode[item.prizeCode]?.type === "PROMO_CODE"),
    [promoStats, prizesByCode],
  );

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await request("/admin/login", {
        method: "POST",
        body: { login, password },
      });

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePrizeSave(event, prizeId) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await request(`/admin/prizes/${prizeId}`, {
      token,
      method: "PATCH",
      body: {
        weight: Number(formData.get("weight")),
        active: formData.get("active") === "on",
      },
    });

    loadDashboard(token);
  }

  async function handleSettingsSave(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await request("/admin/settings", {
      token,
      method: "PATCH",
      body: {
        active: formData.get("active") === "on",
        prizeTtlHours: Number(formData.get("prizeTtlHours")),
        guidePdfUrl: formData.get("guidePdfUrl")?.toString().trim() || null,
      },
    });

    loadDashboard(token);
  }

  async function handleSpinStatusChange(spinId, status) {
    await request(`/admin/spins/${spinId}`, {
      token,
      method: "PATCH",
      body: { status },
    });

    if (selectedSpin?.id === spinId) {
      setSelectedSpin((current) => (current ? { ...current, status } : current));
    }

    loadDashboard(token);
  }

  async function handleSpinDelete(spinId) {
    const confirmed = window.confirm(
      "Удалить эту крутку? Это снимет привязку приза к аккаунту и очистит запись для повторного теста.",
    );

    if (!confirmed) {
      return;
    }

    try {
      await request(`/admin/spins/${spinId}`, {
        token,
        method: "DELETE",
      });

      if (selectedSpin?.id === spinId) {
        setSelectedSpin(null);
      }

      setSpinNoteStatus("");
      loadDashboard(token);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleSpinOpen(spinId) {
    setSelectedSpinLoading(true);
    setSpinNoteStatus("");
    try {
      const spin = await request(`/admin/spins/${spinId}`, { token });
      setSelectedSpin(spin);
    } catch (spinError) {
      setError(spinError.message);
    } finally {
      setSelectedSpinLoading(false);
    }
  }

  async function handleSpinNoteSave(event) {
    event.preventDefault();
    if (!selectedSpin) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setSpinNoteStatus("Сохраняем...");

    try {
      const result = await request(`/admin/spins/${selectedSpin.id}`, {
        token,
        method: "PATCH",
        body: {
          adminNote: formData.get("adminNote")?.toString() || "",
        },
      });

      setSelectedSpin(result.spin);
      setSpinNoteStatus("Заметка сохранена");
      loadDashboard(token);
    } catch (saveError) {
      setSpinNoteStatus(saveError.message);
    }
  }

  async function handlePromoUpload(event) {
    event.preventDefault();
    setPromoUploadStatus("");

    try {
      const result = await request("/admin/promos/upload", {
        token,
        method: "POST",
        body: {
          prizeCode: promoPrizeCode,
          text: promoText,
        },
      });

      setPromoText("");
      setPromoUploadStatus(`Загружено кодов: ${result.inserted}`);
      loadDashboard(token);
    } catch (uploadError) {
      setPromoUploadStatus(uploadError.message);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await requestText("/admin/export.csv", { token });
      downloadTextFile("gift-safe-export.csv", csv, "text/csv;charset=utf-8");
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setLoading(false);
    setToken("");
    setSelectedSpin(null);
    setSpinNoteStatus("");
  }

  if (!token) {
    return (
      <main className="auth-layout">
        <form className="auth-card" onSubmit={handleLogin}>
          <span className="badge">Gift Safe Admin</span>
          <h1>Вход в админку</h1>
          <p>Этот экран уже подключен к backend API и использует отдельный пароль администратора.</p>
          <label>
            <span>Логин</span>
            <input value={login} onChange={(event) => setLogin(event.target.value)} />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Входим..." : "Открыть админку"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="badge">Gift Safe Admin</span>
          <h1>Панель управления розыгрышем</h1>
          <p>Быстрый обзор круток, призов, настроек, пула кодов и антифрод-логов.</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => loadDashboard(token)} disabled={loading}>
            Обновить
          </button>
          <button type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Готовим CSV..." : "Экспорт CSV"}
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="stats-grid">
        <StatCard label="Всего круток" value={stats?.totalSpins} />
        <StatCard label="Сегодня" value={stats?.todayCount} />
        <StatCard label="За неделю" value={stats?.weekCount} />
        <StatCard label="За месяц" value={stats?.monthCount} />
      </section>

      <section className="stats-grid">
        <StatCard label="WON" value={stats?.byStatus?.WON} />
        <StatCard label="CLAIMED" value={stats?.byStatus?.CLAIMED} />
        <StatCard label="AWAITING_FULFILL" value={stats?.byStatus?.AWAITING_FULFILL} />
        <StatCard label="FULFILLED" value={stats?.byStatus?.FULFILLED} />
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Топ призов</h2>
            <span>{topPrizes.length} позиций</span>
          </div>
          <div className="simple-list">
            {topPrizes.map((item) => (
              <div className="simple-row" key={item.code}>
                <span>{item.title}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Настройки акции</h2>
            <span>{loading ? "Синхронизация..." : "Готово"}</span>
          </div>
          {settings ? (
            <form className="settings-form" onSubmit={handleSettingsSave}>
              <label className="checkbox-row">
                <input type="checkbox" name="active" defaultChecked={settings.active} />
                <span>Акция активна</span>
              </label>
              <label>
                <span>Срок жизни приза, часы</span>
                <input name="prizeTtlHours" type="number" min="1" max="168" defaultValue={settings.prizeTtlHours} />
              </label>
              <label>
                <span>Ссылка на PDF гайда</span>
                <input
                  name="guidePdfUrl"
                  type="url"
                  defaultValue={settings.guidePdfUrl || ""}
                  placeholder="https://example.com/guide.pdf"
                />
              </label>
              <button type="submit">Сохранить настройки</button>
            </form>
          ) : null}
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Пул промокодов</h2>
            <span>{visiblePromoStats.length} типа</span>
          </div>
          <form className="settings-form" onSubmit={handlePromoUpload}>
            <label>
              <span>Приз</span>
              <select value={promoPrizeCode} onChange={(event) => setPromoPrizeCode(event.target.value)}>
                {prizes.filter((prize) => prize.type === "PROMO_CODE").map((prize) => (
                  <option key={prize.code} value={prize.code}>
                    {prize.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Коды</span>
              <textarea
                value={promoText}
                onChange={(event) => setPromoText(event.target.value)}
                rows="5"
                placeholder="Один код на строку"
              />
            </label>
            <button type="submit">Загрузить коды</button>
            {promoUploadStatus ? <p className="hint-text">{promoUploadStatus}</p> : null}
            <p className="hint-text">
              <code>FREE_SHIPPING</code> теперь работает через внешний discount-hook InSales и не требует кодов.
            </p>
          </form>
          <div className="simple-list">
            {visiblePromoStats.map((item) => (
              <div className="simple-row" key={item.prizeCode}>
                <div>
                  <strong>{item.prizeCode}</strong>
                  <p>Всего: {item.total}</p>
                </div>
                <span>Осталось: {item.available}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Детали крутки</h2>
            <span>{selectedSpinLoading ? "Загружаем..." : selectedSpin ? selectedSpin.id : "Не выбрано"}</span>
          </div>
          {selectedSpin ? (
            <>
              <div className="detail-section">
                <h3>Клиент и выдача</h3>
                <div className="detail-grid">
                  <DetailRow label="Приз" value={selectedSpin.prize?.title} />
                  <DetailRow label="Статус" value={selectedSpin.status} />
                  <DetailRow label="Client ID" value={selectedSpin.client?.id} />
                  <DetailRow label="Email клиента" value={selectedSpin.client?.email} />
                  <DetailRow label="Телефон клиента" value={selectedSpin.client?.phone} />
                  <DetailRow label="Email получателя" value={selectedSpin.recipient?.email} />
                  <DetailRow label="Получатель" value={selectedSpin.recipient?.name} />
                  <DetailRow label="Телефон получателя" value={selectedSpin.recipient?.phone} />
                  <DetailRow label="Адрес" value={selectedSpin.recipient?.address} />
                  <DetailRow label="Promo code" value={selectedSpin.promoCode} />
                  <DetailRow label="Promo external ID" value={selectedSpin.promoExternalId} />
                  <DetailRow label="Free shipping order ID" value={selectedSpin.freeShippingOrderId} />
                </div>
              </div>

              <div className="detail-section">
                <h3>Таймлайн</h3>
                <div className="detail-grid">
                  <DetailRow label="Создано" value={formatDateTime(selectedSpin.createdAt)} />
                  <DetailRow label="Обновлено" value={formatDateTime(selectedSpin.updatedAt)} />
                  <DetailRow label="Claimed at" value={formatDateTime(selectedSpin.claimedAt)} />
                  <DetailRow label="Delivered at" value={formatDateTime(selectedSpin.deliveredAt)} />
                  <DetailRow label="Fulfilled at" value={formatDateTime(selectedSpin.fulfilledAt)} />
                  <DetailRow label="Email sent at" value={formatDateTime(selectedSpin.emailSentAt)} />
                  <DetailRow label="Expires at" value={formatDateTime(selectedSpin.expiresAt)} />
                  <DetailRow label="Free shipping used at" value={formatDateTime(selectedSpin.freeShippingUsedAt)} />
                </div>
              </div>

              <div className="detail-section">
                <h3>Антифрод и техника</h3>
                <div className="detail-grid">
                  <DetailRow label="IP" value={selectedSpin.antifraud?.ip} />
                  <DetailRow label="Fingerprint" value={selectedSpin.antifraud?.fingerprint} />
                  <DetailRow label="Guest ID" value={selectedSpin.antifraud?.guestId} />
                  <DetailRow label="User-Agent" value={selectedSpin.antifraud?.userAgent} />
                  <DetailRow label="Ошибка email" value={selectedSpin.emailError} />
                </div>
              </div>

              <form
                key={`${selectedSpin.id}:${selectedSpin.updatedAt || selectedSpin.adminNote || ""}`}
                className="settings-form detail-note-form"
                onSubmit={handleSpinNoteSave}
              >
                <label>
                  <span>Заметка администратора</span>
                  <textarea
                    name="adminNote"
                    rows="4"
                    defaultValue={selectedSpin.adminNote || ""}
                    placeholder="Внутренний комментарий по крутке, доставке или связи с клиентом"
                  />
                </label>
                <div className="detail-note-actions">
                  <button type="submit">Сохранить заметку</button>
                  {spinNoteStatus ? <p className="hint-text">{spinNoteStatus}</p> : null}
                </div>
              </form>
            </>
          ) : (
            <p className="hint-text">Нажми «Подробнее» в таблице круток, чтобы увидеть полную карточку.</p>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Крутки</h2>
          <span>{spins.length} записей</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Приз</th>
                <th>Статус</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Получатель</th>
                <th>Адрес</th>
                <th>Изменить статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {spins.map((spin) => (
                <tr key={spin.id}>
                  <td>{new Date(spin.createdAt).toLocaleString()}</td>
                  <td>{spin.prize?.title}</td>
                  <td>{spin.status}</td>
                  <td>{spin.client?.email || "—"}</td>
                  <td>{spin.client?.phone || spin.recipient?.phone || "—"}</td>
                  <td>{spin.recipient?.name || "—"}</td>
                  <td>{spin.recipient?.address || "—"}</td>
                  <td>
                    <select value={spin.status} onChange={(event) => handleSpinStatusChange(spin.id, event.target.value)}>
                      <option value="WON">WON</option>
                      <option value="CLAIMED">CLAIMED</option>
                      <option value="AWAITING_FULFILL">AWAITING_FULFILL</option>
                      <option value="FULFILLED">FULFILLED</option>
                      <option value="EXPIRED">EXPIRED</option>
                    </select>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="secondary compact-button" onClick={() => handleSpinOpen(spin.id)}>
                        Подробнее
                      </button>
                      <button
                        type="button"
                        className="danger compact-button"
                        onClick={() => handleSpinDelete(spin.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Призы</h2>
          <span>{prizes.length} элементов</span>
        </div>
        <div className="prize-grid">
          {prizes.map((prize) => (
            <form key={prize.id} className="prize-card" onSubmit={(event) => handlePrizeSave(event, prize.id)}>
              <div className="prize-card-head">
                <strong>{prize.title}</strong>
                <span>{prize.code}</span>
              </div>
              <p>{prize.description}</p>
              <label>
                <span>Вес</span>
                <input name="weight" type="number" min="1" defaultValue={prize.weight} />
              </label>
              <label className="checkbox-row">
                <input name="active" type="checkbox" defaultChecked={prize.active} />
                <span>Активен</span>
              </label>
              <button type="submit">Сохранить</button>
            </form>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Антифрод-логи</h2>
          <span>{logs.length} последних записей</span>
        </div>
        <div className="simple-list">
          {logs.map((log) => (
            <div className="simple-row" key={log.id}>
              <div>
                <strong>{log.reason}</strong>
                <p>{new Date(log.createdAt).toLocaleString()}</p>
              </div>
              <span>{log.ip || log.guestId || "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
