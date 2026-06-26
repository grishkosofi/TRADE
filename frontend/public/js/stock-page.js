import { getStock } from "./api.js";

let chart;

function trendClass(changePct) {
  if (changePct > 0) return "text-success";
  if (changePct < 0) return "text-danger";
  return "text-secondary";
}

export async function loadStock(symbol, timeframe, currency) {
  const data = await getStock(symbol, timeframe, currency);

  const summary = data.summary || {};
  const priceEl = document.getElementById("price");
  const changeEl = document.getElementById("change");

  priceEl.textContent = summary.last_price ?? "-";
  changeEl.textContent = `${summary.change_pct ?? 0}%`;
  changeEl.className = trendClass(summary.change_pct ?? 0);

  const labels = (data.history || []).map(p => new Date(p.time).toLocaleDateString());
  const prices = (data.history || []).map(p => p.close);

  const up = (summary.change_pct ?? 0) >= 0;
  const lineColor = up ? "#198754" : "#dc3545";

  const ctx = document.getElementById("stockChart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: symbol, data: prices, borderColor: lineColor, tension: 0.2 }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}