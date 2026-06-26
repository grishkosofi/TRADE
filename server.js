import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MARKETSTACK_KEY = process.env.MARKETSTACK_API_KEY;
const MARKETSTACK_BASE = "http://api.marketstack.com/v1";

// --- helpers ---
const timeframeDays = { "1D": 1, "1M": 31, "3M": 92, "1Y": 366 };

function dateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function trend(changePct) {
  if (changePct > 0) return "up";
  if (changePct < 0) return "down";
  return "flat";
}

// TODO: можно подключить реальный FX API позже
function convertCurrency(value, from, to) {
  if (value == null) return null;
  if (from === to) return value;
  return value; // пока без конвертации
}

// --- routes ---

// 1) Snapshot for main/news page
app.get("/api/market/snapshot", async (req, res) => {
  try {
    if (!MARKETSTACK_KEY) {
      return res.status(500).json({ error: "Missing MARKETSTACK_API_KEY" });
    }

    const q = (req.query.q || "").toString();
    const country = (req.query.country || "US").toString().toUpperCase();
    const currency = (req.query.currency || "USD").toString().toUpperCase();

    // Если есть q — считаем это symbols/query (для MVP)
    const symbols = q || "AAPL,MSFT,GOOGL,AMZN,TSLA";

    const url = `${MARKETSTACK_BASE}/eod/latest?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(symbols)}&limit=20`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: "Market API failed", status: r.status });
    }

    const raw = await r.json();
    const rows = Array.isArray(raw?.data) ? raw.data : [];

    const items = rows.map((x) => {
      const open = Number(x.open ?? x.previous_close ?? 0);
      const close = Number(x.close ?? 0);
      const changeAbs = +(close - open).toFixed(4);
      const changePct = open ? +(((close - open) / open) * 100).toFixed(4) : 0;

      return {
        symbol: x.symbol,
        name: x.symbol,
        exchange: x.exchange ?? null,
        country_code: country,
        currency,
        price: convertCurrency(close, "USD", currency),
        open: convertCurrency(open, "USD", currency),
        change_abs: convertCurrency(changeAbs, "USD", currency),
        change_pct: changePct,
        trend: trend(changePct),
        date: x.date
      };
    });

    res.json({ country, currency, query: q, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 2) Search by company/country (MVP simplified)
app.get("/api/market/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const currency = (req.query.currency || "USD").toString().toUpperCase();
    if (!q) return res.status(400).json({ error: "q is required" });

    // MVP: пытаемся как symbols
    const url = `${MARKETSTACK_BASE}/eod/latest?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(q)}&limit=20`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "Market API failed", status: r.status });

    const raw = await r.json();
    const rows = Array.isArray(raw?.data) ? raw.data : [];

    const results = rows.map((x) => ({
      symbol: x.symbol,
      name: x.symbol,
      exchange: x.exchange ?? null,
      currency
    }));

    res.json({ q, count: results.length, results });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 3) Stock detail with timeframe for chart page
app.get("/api/market/stock/:symbol", async (req, res) => {
  try {
    if (!MARKETSTACK_KEY) {
      return res.status(500).json({ error: "Missing MARKETSTACK_API_KEY" });
    }

    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe || "1M").toString().toUpperCase();
    const currency = (req.query.currency || "USD").toString().toUpperCase();

    const days = timeframeDays[timeframe] ?? 31;
    const dateFrom = dateDaysAgo(days);

    const url = `${MARKETSTACK_BASE}/eod?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(symbol)}&date_from=${dateFrom}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "Market API failed", status: r.status });

    const raw = await r.json();
    const rows = Array.isArray(raw?.data) ? raw.data : [];

    rows.sort((a, b) => new Date(a.date) - new Date(b.date));

    const history = rows.map((x) => ({
      time: x.date,
      open: convertCurrency(Number(x.open ?? 0), "USD", currency),
      high: convertCurrency(Number(x.high ?? 0), "USD", currency),
      low: convertCurrency(Number(x.low ?? 0), "USD", currency),
      close: convertCurrency(Number(x.close ?? 0), "USD", currency),
      volume: Number(x.volume ?? 0)
    }));

    const first = history[0];
    const last = history[history.length - 1];
    const changePct = first?.close
      ? +(((last.close - first.close) / first.close) * 100).toFixed(4)
      : 0;

    res.json({
      symbol,
      timeframe,
      currency,
      summary: last
        ? {
            last_price: last.close,
            day_high: last.high,
            day_low: last.low,
            volume: last.volume,
            change_pct: changePct,
            trend: trend(changePct)
          }
        : null,
      history
    });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 4) Location fallback by IP
app.get("/api/location", async (_req, res) => {
  try {
    const r = await fetch("http://ip-api.com/json/");
    const data = await r.json();
    res.json({
      country: data?.countryCode || "US",
      city: data?.city || null,
      currency: "USD" // маппинг можно расширить
    });
  } catch {
    res.json({ country: "US", city: null, currency: "USD" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});