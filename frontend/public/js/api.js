const API_BASE = "http://localhost:3000";

export async function getSnapshot({ country = "US", q = "", currency = "USD" } = {}) {
  const params = new URLSearchParams({ country, q, currency });
  const r = await fetch(`${API_BASE}/api/market/snapshot?${params}`);
  if (!r.ok) throw new Error("snapshot error");
  return r.json();
}

export async function searchMarket(q, currency = "USD") {
  const params = new URLSearchParams({ q, currency });
  const r = await fetch(`${API_BASE}/api/market/search?${params}`);
  if (!r.ok) throw new Error("search error");
  return r.json();
}

export async function getStock(symbol, timeframe = "1M", currency = "USD") {
  const params = new URLSearchParams({ timeframe, currency });
  const r = await fetch(`${API_BASE}/api/market/stock/${symbol}?${params}`);
  if (!r.ok) throw new Error("stock error");
  return r.json();
}