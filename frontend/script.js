document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const themeToggle = document.getElementById("themeToggle");
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const authForm = document.getElementById("authForm");
  const nameGroup = document.getElementById("nameGroup");
  const submitBtn = document.getElementById("submitBtn");
  const loginMeta = document.getElementById("loginMeta");
  const modeButtons = document.querySelectorAll(".mode-btn");
  const stocksGrid = document.getElementById("stocksGrid");
  const newsList = document.getElementById("newsList");
  const currencySelect = document.getElementById("currencySelect");
  const searchInput = document.querySelector(".market-search");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("stockpulse-user");
      sessionStorage.clear();
      window.location.href = "auth.html";
    });
  }

  const routeMap = {
    home: "index.html",
    markets: "market.html",
    portfolio: "portfolio.html",
    profile: "profile.html",
    detail: "detail.html",
    pro: "pro.html",
  };

  const setActiveNav = () => {
    const current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const key = el.dataset.nav;
      const href = routeMap[key];
      el.classList.toggle("active", href && href.toLowerCase() === current);
    });
  };

  const go = (key) => {
    const target = routeMap[key];
    if (target) window.location.href = target;
  };

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const key = el.dataset.nav;
      if (routeMap[key]) {
        e.preventDefault();
        go(key);
      }
    });
  });

  setActiveNav();

  const applyTheme = (theme) => {
    body.classList.remove("theme-dark", "theme-light");
    body.classList.add(theme);
    if (themeToggle) themeToggle.textContent = theme === "theme-dark" ? "☼" : "☾";
  };

  applyTheme(localStorage.getItem("stockpulse-theme") || "theme-dark");

  themeToggle?.addEventListener("click", () => {
    const next = body.classList.contains("theme-dark") ? "theme-light" : "theme-dark";
    applyTheme(next);
    localStorage.setItem("stockpulse-theme", next);
  });

  const setMode = (mode) => {
    const isRegister = mode === "register";
    loginTab?.classList.toggle("active", !isRegister);
    registerTab?.classList.toggle("active", isRegister);
    nameGroup?.classList.toggle("d-none", !isRegister);
    loginMeta?.classList.toggle("d-none", isRegister);
    if (submitBtn) submitBtn.textContent = isRegister ? "Create Account" : "Log in";
  };

  loginTab?.addEventListener("click", () => setMode("login"));
  registerTab?.addEventListener("click", () => setMode("register"));
  setMode("login");

  authForm?.addEventListener("submit", (e) => {
    if (!registerTab?.classList.contains("active")) {
      e.preventDefault();
      go("home");
    }
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const showStocks = btn.dataset.mode === "stocks";
      if (stocksGrid && newsList) {
        stocksGrid.classList.toggle("d-none", !showStocks);
        newsList.classList.toggle("d-none", showStocks);
      }
    });
  });

  // ===== MARKET (US only + company search) =====
  const US_UNIVERSE = [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT", name: "Microsoft Corp." },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "AMZN", name: "Amazon Inc." },
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "META", name: "Meta Platforms" },
    { symbol: "NVDA", name: "NVIDIA Corp." },
    { symbol: "JPM", name: "JPMorgan Chase" },
    { symbol: "BAC", name: "Bank of America" },
    { symbol: "JNJ", name: "Johnson & Johnson" },
  ];

  let currentCurrency = (localStorage.getItem("stockpulse-currency") || "USD").toUpperCase();
  let lastItems = [];

  const fmtPrice = (v, c = "USD") => (v == null || Number.isNaN(Number(v)) ? "-" : `${Number(v).toFixed(2)} ${c}`);

  const trendBadge = (pct = 0) => {
    const p = Number(pct || 0);
    return {
      text: `${p >= 0 ? "↗" : "↘"} ${p >= 0 ? "+" : ""}${p.toFixed(2)}%`,
      cls: p >= 0 ? "success" : "danger",
    };
  };

  const renderStocks = (items = [], currency = "USD") => {
    if (!stocksGrid) return;
    if (!items.length) {
      stocksGrid.innerHTML = `<div class="col-12"><div class="market-card">No companies found</div></div>`;
      return;
    }

    stocksGrid.innerHTML = items.map((it) => {
      const b = trendBadge(it.change_pct);
      const symbol = it.symbol || "N/A";
      const name = it.name || symbol;
      return `
        <div class="col-md-6">
          <a href="detail.html?symbol=${encodeURIComponent(symbol)}&currency=${encodeURIComponent(currency)}"
             class="market-card stock-entry text-decoration-none">
            <div class="stock-left">
              <div class="stock-icon dark">${symbol[0] || "•"}</div>
              <div>
                <div class="stock-ticker">${symbol}</div>
                <div class="stock-name">${name}</div>
              </div>
            </div>
            <div class="stock-right">
              <span class="trend-badge ${b.cls}">${b.text}</span>
              <div class="stock-price">${fmtPrice(it.price, currency)}</div>
            </div>
          </a>
        </div>
      `;
    }).join("");
  };

  const applySearchFilter = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    if (!q) {
      renderStocks(lastItems, currentCurrency);
      return;
    }

    const filtered = lastItems.filter((it) => {
      const symbol = String(it.symbol || "").toLowerCase();
      const name = String(it.name || "").toLowerCase();
      return symbol.includes(q) || name.includes(q);
    });

    renderStocks(filtered, currentCurrency);
  };

  const loadUSMarket = async () => {
    if (!stocksGrid || !window.api) return;

    const symbols = US_UNIVERSE.map((x) => x.symbol).join(",");
    const snap = await window.api.getSnapshot({
      country: "US",
      currency: currentCurrency,
      q: symbols,
    });

    // обогащаем именами компаний
    const nameMap = new Map(US_UNIVERSE.map((x) => [x.symbol, x.name]));
    lastItems = (snap.items || []).map((it) => ({
      ...it,
      name: nameMap.get(it.symbol) || it.name || it.symbol,
    }));

    applySearchFilter();
  };

  currencySelect?.addEventListener("change", async (e) => {
    currentCurrency = String(e.target.value || "USD").toUpperCase();
    localStorage.setItem("stockpulse-currency", currentCurrency);
    try {
      await loadUSMarket();
    } catch (err) {
      console.error("currency switch error:", err);
    }
  });

  searchInput?.addEventListener("input", () => {
    applySearchFilter();
  });

  const geoEl = document.getElementById("geoLabel");
  if (geoEl) geoEl.textContent = `United States · ${currentCurrency}`;

  if (currencySelect) currencySelect.value = currentCurrency;

  loadUSMarket().catch(console.error);
});