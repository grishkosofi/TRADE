import { getStock, getIntraday } from "./api.js";

let chart;

// Плагин: жестко ограничиваем ширину свечи в пикселях
const thinCandlesPlugin = {
  id: "thinCandlesPlugin",
  afterDatasetDraw(chart, args) {
    const meta = chart.getDatasetMeta(args.index);
    const maxW = 8; // регулируй 6..10
    meta.data.forEach((el) => {
      if (el && typeof el.width === "number") {
        el.width = Math.min(el.width, maxW);
      }
    });
  },
};

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
  const rows = history
      .filter((p) => p?.time)
      .map((p) => {
        const t = new Date(p.time).getTime();
        return {
          t,
          o: Number(p.open),
          h: Number(p.high),
          l: Number(p.low),
          c: Number(p.close),
        };
      })
      .filter(
          (p) =>
              Number.isFinite(p.t) &&
              Number.isFinite(p.o) &&
              Number.isFinite(p.h) &&
              Number.isFinite(p.l) &&
              Number.isFinite(p.c)
      )
      .sort((a, b) => a.t - b.t);

  // дедуп по timestamp
  const byTs = new Map();
  for (const r of rows) byTs.set(r.t, r);

  return Array.from(byTs.values()).sort((a, b) => a.t - b.t);
}

function renderCandles(history, symbol, timeframe = "1M") {
  const canvas = document.getElementById("stockChart");
  if (!canvas) return;

  const normalized = normalizeHistory(history);
  const candles = normalized.map((p) => ({
    x: p.t, // number timestamp лучше для timeseries
    o: p.o,
    h: p.h,
    l: p.l,
    c: p.c,
  }));

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: symbol,
          data: candles,
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
          barPercentage: timeframe === "1D" ? 0.22 : 0.35,
          categoryPercentage: timeframe === "1D" ? 0.30 : 0.45,
        },
      ],
    },
    plugins: [thinCandlesPlugin],
    options: {
      parsing: false,
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          type: "timeseries",
          time: { unit: timeframe === "1D" ? "hour" : "day" },
          grid: { display: false },
          ticks: { maxTicksLimit: 8, autoSkip: true, maxRotation: 0 },
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
  if (timeframe === "1D") {
    const intra = await getIntraday(symbol, "15min", 64);

    // подгоняем формат под renderCandles/updateStats
    const history = intra.history || [];
    const last = history[history.length - 1];
    const first = history[0];
    const changePct = first?.close ? ((last.close - first.close) / first.close) * 100 : 0;

    const data = {
      symbol,
      currency,
      history,
      summary: {
        last_price: last?.close ?? null,
        day_high: last?.high ?? null,
        day_low: last?.low ?? null,
        volume: last?.volume ?? null,
        change_pct: changePct,
      },
    };

    updateStats(data);
    renderCandles(history, symbol, "1D");
    return;
  }

  const data = await getStock(symbol, timeframe, currency);
  updateStats(data);
  renderCandles(data.history || [], symbol, timeframe);
}