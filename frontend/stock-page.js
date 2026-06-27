import { getStock } from "./api.js";

let chart;

function trendClass(changePct) {
  if (changePct > 0) return "trend-badge success";
  if (changePct < 0) return "trend-badge danger";
  return "trend-badge";
}

function formatNumber(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function updateStats(data) {
  const summary = data.summary || {};
  const history = data.history || [];
  const last = history[history.length - 1] || null;

  const priceEl = document.getElementById("price");
  const changeEl = document.getElementById("change");

  if (priceEl) {
    priceEl.textContent =
        summary.last_price != null
            ? `${formatNumber(summary.last_price)} ${data.currency || ""}`
            : "-";
  }

  if (changeEl) {
    const pct = Number(summary.change_pct ?? 0);
    const arrow = pct > 0 ? "↗" : pct < 0 ? "↘" : "→";
    const sign = pct > 0 ? "+" : "";
    changeEl.textContent = `${arrow} ${sign}${pct.toFixed(2)}%`;
    changeEl.className = trendClass(pct);
  }

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("statVolume", formatNumber(summary.volume));
  setText("statOpen", last ? formatNumber(last.open) : "-");
  setText("statClose", last ? formatNumber(last.close) : "-");
  setText("statDayHigh", summary.day_high != null ? formatNumber(summary.day_high) : "-");
  setText("statMarketCap", "-");
  setText("statPeRatio", "-");
}

function normalizeHistory(history = []) {
  // 1) фильтруем мусор
  const clean = history.filter(
      (p) =>
          p &&
          p.time &&
          Number.isFinite(Number(p.open)) &&
          Number.isFinite(Number(p.high)) &&
          Number.isFinite(Number(p.low)) &&
          Number.isFinite(Number(p.close))
  );

  // 2) сортируем по времени
  clean.sort((a, b) => new Date(a.time) - new Date(b.time));

  // 3) убираем дубли одной и той же даты (они часто и дают наложение)
  const byDay = new Map();
  for (const p of clean) {
    const dayKey = new Date(p.time).toISOString().slice(0, 10);
    byDay.set(dayKey, p); // оставляем последнюю свечу дня
  }

  return Array.from(byDay.values()).sort((a, b) => new Date(a.time) - new Date(b.time));
}

function renderCandles(history, symbol) {
  const canvas = document.getElementById("stockChart");
  if (!canvas) return;

  const normalized = normalizeHistory(history);

  const candles = normalized.map((p) => ({
    x: new Date(p.time),
    o: Number(p.open),
    h: Number(p.high),
    l: Number(p.low),
    c: Number(p.close),
  }));

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: symbol,
          data: candles,

          // ключевой фикс ширины свечей
          barPercentage: 0.55,
          categoryPercentage: 0.72,

          borderColor: {
            up: "#22c55e",
            down: "#ef4444",
            unchanged: "#94a3b8",
          },
          color: {
            up: "rgba(34,197,94,0.85)",
            down: "rgba(239,68,68,0.85)",
            unchanged: "rgba(148,163,184,0.85)",
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "time",
          offset: true,
          time: { unit: "day" },
          grid: { display: false },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
        y: {
          position: "right",
          grid: { color: "rgba(148,163,184,0.18)" },
          ticks: { maxTicksLimit: 6 },
        },
      },
    },
  });
}

export async function loadStock(symbol, timeframe, currency) {
  const data = await getStock(symbol, timeframe, currency);
  updateStats(data);
  renderCandles(data.history || [], symbol);
}