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

function currencyByCountry(code = "US") {
  const map = {
    US: "USD",
    GB: "GBP",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    NL: "EUR",
    BE: "EUR",
    JP: "JPY",
    KZ: "KZT",
    CA: "CAD",
    AU: "AUD",
    CH: "CHF",
    CN: "CNY",
    IN: "INR",
  };
  return map[code] || "USD";
}

// --- FX ---
const fxCache = new Map(); // USD_EUR -> { rate, ts }
const FX_TTL_MS = 10 * 60 * 1000;

async function getFxRate(from, to) {
  if (from === to) return 1;

  const key = `${from}_${to}`;
  const now = Date.now();
  const cached = fxCache.get(key);
  if (cached && now - cached.ts < FX_TTL_MS) return cached.rate;

  // frankfurter: base -> to
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FX API failed: ${r.status}`);

  const raw = await r.json();
  const rate = Number(raw?.rates?.[to]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid FX rate");
  }

  fxCache.set(key, { rate, ts: now });
  return rate;
}

// ВАЖНО: fallback, чтобы не падал snapshot/stock если FX недоступен
async function convertCurrency(value, from, to) {
  if (value == null) return null;
  if (from === to) return Number(value);

  try {
    const rate = await getFxRate(from, to);
    return +(Number(value) * rate).toFixed(6);
  } catch {
    return Number(value); // fallback без конвертации
  }
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
    const symbols = q || "AAPL,MSFT,GOOGL,AMZN,TSLA";

    const url = `${MARKETSTACK_BASE}/eod/latest?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(symbols)}&limit=20`;
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: "Market API failed", status: r.status });
    }

    const raw = await r.json();
    if (raw?.error) {
      return res.status(502).json({ error: "Market API error", details: raw.error });
    }

    const rows = Array.isArray(raw?.data) ? raw.data : [];

    const items = await Promise.all(
        rows.map(async (x) => {
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
            price: await convertCurrency(close, "USD", currency),
            open: await convertCurrency(open, "USD", currency),
            change_abs: await convertCurrency(changeAbs, "USD", currency),
            change_pct: changePct,
            trend: trend(changePct),
            date: x.date,
          };
        })
    );

    res.json({ country, currency, query: q, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 2) Search (MVP)
app.get("/api/market/search", async (req, res) => {
  try {
    if (!MARKETSTACK_KEY) {
      return res.status(500).json({ error: "Missing MARKETSTACK_API_KEY" });
    }

    const q = (req.query.q || "").toString().trim();
    const currency = (req.query.currency || "USD").toString().toUpperCase();
    if (!q) return res.status(400).json({ error: "q is required" });

    const url = `${MARKETSTACK_BASE}/eod/latest?access_key=${MARKETSTACK_KEY}&symbols=${encodeURIComponent(q)}&limit=20`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "Market API failed", status: r.status });

    const raw = await r.json();
    if (raw?.error) {
      return res.status(502).json({ error: "Market API error", details: raw.error });
    }

    const rows = Array.isArray(raw?.data) ? raw.data : [];
    const results = rows.map((x) => ({
      symbol: x.symbol,
      name: x.symbol,
      exchange: x.exchange ?? null,
      currency,
    }));

    res.json({ q, count: results.length, results });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 3) Stock detail (EOD)
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
    if (raw?.error) {
      return res.status(502).json({ error: "Market API error", details: raw.error });
    }

    const rows = Array.isArray(raw?.data) ? raw.data : [];
    rows.sort((a, b) => new Date(a.date) - new Date(b.date));

    const history = await Promise.all(
        rows.map(async (x) => ({
          time: x.date,
          open: await convertCurrency(Number(x.open ?? 0), "USD", currency),
          high: await convertCurrency(Number(x.high ?? 0), "USD", currency),
          low: await convertCurrency(Number(x.low ?? 0), "USD", currency),
          close: await convertCurrency(Number(x.close ?? 0), "USD", currency),
          volume: Number(x.volume ?? 0),
        }))
    );

    const first = history[0];
    const last = history[history.length - 1];
    const changePct =
        first?.close && last?.close ? +(((last.close - first.close) / first.close) * 100).toFixed(4) : 0;

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
            trend: trend(changePct),
          }
          : null,
      history,
    });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 4) Intraday (Twelve Data)
app.get("/api/market/intraday/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval || "15min").toString();
    const outputsize = Number(req.query.outputsize || 64);
    const currency = (req.query.currency || "USD").toString().toUpperCase();

    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) return res.status(500).json({ error: "Missing TWELVEDATA_API_KEY" });

    const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&apikey=${key}`;

    const r = await fetch(url);
    const raw = await r.json();

    if (!r.ok || raw?.status === "error") {
      return res.status(502).json({ error: "Intraday API failed", details: raw });
    }

    const values = Array.isArray(raw.values) ? raw.values : [];
    values.reverse();

    const history = await Promise.all(
        values.map(async (v) => ({
          time: v.datetime,
          open: await convertCurrency(Number(v.open), "USD", currency),
          high: await convertCurrency(Number(v.high), "USD", currency),
          low: await convertCurrency(Number(v.low), "USD", currency),
          close: await convertCurrency(Number(v.close), "USD", currency),
          volume: Number(v.volume ?? 0),
        }))
    );

    res.json({ symbol, interval, currency, history });
  } catch (e) {
    res.status(500).json({ error: "Unexpected error", details: String(e) });
  }
});

// 5) Location by IP
app.get("/api/location", async (_req, res) => {
  try {
    const r = await fetch("http://ip-api.com/json/");
    const data = await r.json();

    const country = (data?.countryCode || "US").toUpperCase();
    res.json({
      country,
      city: data?.city || null,
      currency: currencyByCountry(country),
    });
  } catch {
    res.json({ country: "US", city: null, currency: "USD" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});