// Cardmarket Offer Filter - content script.
// Reads the user's filter settings from chrome.storage and hides/dims offer
// rows that do not match. Re-applies on DOM changes (pagination, ajax loads).

(function () {
  "use strict";

  const STORAGE_KEY = "cmFilterSettings";
  const DEBUG = false; // set true to log extracted data to the console

  let settings = null;

  /* -------------------------------------------------------------------- */
  /* Helpers                                                              */
  /* -------------------------------------------------------------------- */

  function log(...args) {
    if (DEBUG) console.log("[CM-Filter]", ...args);
  }

  function normalize(str) {
    return (str || "").toString().trim().toLowerCase();
  }

  // First element matching any of the given selectors within `root`.
  function queryFirst(root, selectors) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Returns the row elements of the offer table, using fallbacks.
  function findRows() {
    for (const sel of CM_SELECTORS.rows) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length) {
        // Only keep rows that actually contain a seller link (real offers).
        const rows = Array.from(nodes).filter((n) =>
          n.querySelector(CM_SELECTORS.sellerLink)
        );
        if (rows.length) return rows;
      }
    }
    return [];
  }

  // Scans title / aria-label / tooltip attributes of a row for a keyword.
  function findTitleContaining(row, keywords) {
    const els = row.querySelectorAll(
      "[title], [aria-label], [data-original-title], [data-bs-original-title]"
    );
    for (const el of els) {
      const value = (
        el.getAttribute("title") ||
        el.getAttribute("data-original-title") ||
        el.getAttribute("data-bs-original-title") ||
        el.getAttribute("aria-label") ||
        ""
      ).trim();
      const lower = value.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) return value;
      }
    }
    return "";
  }

  // Parses a European-formatted price string like "1.234,56 €" -> 1234.56.
  function parsePrice(text) {
    if (!text) return null;
    const match = text.match(/(\d[\d.,]*)/);
    if (!match) return null;
    let s = match[1];
    if (s.includes(".") && s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* -------------------------------------------------------------------- */
  /* Extraction                                                           */
  /* -------------------------------------------------------------------- */

  function extract(row) {
    const data = {
      seller: "",
      country: "",
      sellerType: "",
      reputation: "",
      condition: "",
      price: null,
      itemCount: null,
      salesCount: null,
      comment: ""
    };

    // Seller name.
    const sellerLink = row.querySelector(CM_SELECTORS.sellerLink);
    if (sellerLink) {
      data.seller = sellerLink.textContent.trim();
      if (!data.seller) {
        const m = sellerLink.getAttribute("href").match(/\/Users\/([^/?#]+)/);
        if (m) data.seller = decodeURIComponent(m[1]);
      }
    }

    // Item location / country from a tooltip.
    const locText =
      findTitleContaining(row, ["item location", "location", "ships from"]) || "";
    if (locText) {
      data.country = locText.includes(":")
        ? locText.split(":").pop().trim()
        : locText.trim();
    }

    // Seller type.
    for (const t of CM_SELLER_TYPES) {
      if (findTitleContaining(row, t.keywords)) {
        data.sellerType = t.key;
        break;
      }
    }

    // Reputation (tooltip keywords).
    const repText = findTitleContaining(row, [
      "outstanding",
      "very good",
      "good",
      "average",
      "bad"
    ]);
    if (repText) data.reputation = normalize(repText);

    // Condition badge. Prefer the `condition-XX` class (most robust), then text.
    const condEl = queryFirst(row, CM_SELECTORS.condition.split(", "));
    if (condEl) {
      const classMatch = (condEl.className || "").match(
        /condition-(mt|nm|ex|gd|lp|pl|po)/i
      );
      if (classMatch) {
        data.condition = classMatch[1].toUpperCase();
      } else {
        const raw = (condEl.textContent || condEl.getAttribute("aria-label") || "").trim();
        const codes = CM_CONDITIONS.map((c) => c.code);
        const found = codes.find((c) => raw.toUpperCase().includes(c));
        data.condition = found || raw.toUpperCase();
      }
    }

    // Price.
    const priceEl = queryFirst(row, CM_SELECTORS.price.split(", "));
    data.price = parsePrice(priceEl ? priceEl.textContent : row.textContent);

    // Item count.
    const countEl = queryFirst(row, CM_SELECTORS.itemCount.split(", "));
    if (countEl) {
      const n = parseInt(countEl.textContent.replace(/\D/g, ""), 10);
      if (!isNaN(n)) data.itemCount = n;
    }

    // Seller sales count (reputation proxy from the sell-count badge).
    const salesEl = row.querySelector(CM_SELECTORS.sellerSalesBadge);
    if (salesEl) {
      const n = parseInt(salesEl.textContent.replace(/\D/g, ""), 10);
      if (!isNaN(n)) data.salesCount = n;
    }

    // Seller product comment / description text.
    const commentEl = queryFirst(row, CM_SELECTORS.comment.split(", "));
    if (commentEl) data.comment = commentEl.textContent.trim();

    return data;
  }

  /* -------------------------------------------------------------------- */
  /* Filtering                                                            */
  /* -------------------------------------------------------------------- */

  function shouldHide(data) {
    const s = settings;

    // Seller allow/block lists.
    const seller = normalize(data.seller);
    const allow = (s.sellers.allow || []).map(normalize).filter(Boolean);
    const block = (s.sellers.block || []).map(normalize).filter(Boolean);
    if (seller) {
      if (allow.length && !allow.includes(seller)) return true;
      if (block.includes(seller)) return true;
    }

    // Country / item location.
    const countryList = (s.country.list || []).map(normalize).filter(Boolean);
    if (countryList.length && data.country) {
      const c = normalize(data.country);
      const inList = countryList.some((x) => c.includes(x) || x.includes(c));
      if (s.country.mode === "allow" && !inList) return true;
      if (s.country.mode === "block" && inList) return true;
    }

    // Seller type.
    if (data.sellerType && s.sellerTypes[data.sellerType] === false) return true;

    // Reputation.
    if (data.reputation) {
      const repMap = {
        outstanding: "outstanding",
        "very good": "veryGood",
        good: "good",
        average: "average",
        bad: "bad"
      };
      const key = repMap[data.reputation];
      if (key && s.reputation[key] === false) return true;
    }

    // Condition.
    const condList = s.conditions || [];
    if (condList.length && data.condition) {
      if (!condList.includes(data.condition)) return true;
    }

    // Price.
    if (data.price != null) {
      if (s.minPrice != null && data.price < s.minPrice) return true;
      if (s.maxPrice != null && data.price > s.maxPrice) return true;
    }

    // Item count.
    if (s.minItemCount != null && data.itemCount != null) {
      if (data.itemCount < s.minItemCount) return true;
    }

    // Minimum seller sales (treat missing badge as 0 = new/low-volume seller).
    if (s.minSales != null) {
      if ((data.salesCount || 0) < s.minSales) return true;
    }

    // Product comment text filter.
    const comment = normalize(data.comment);
    const cInclude = (s.comment.include || []).map(normalize).filter(Boolean);
    const cExclude = (s.comment.exclude || []).map(normalize).filter(Boolean);
    if (cInclude.length) {
      // Only show offers whose comment contains one of the include terms.
      if (!cInclude.some((w) => comment.includes(w))) return true;
    }
    if (cExclude.length && comment) {
      if (cExclude.some((w) => comment.includes(w))) return true;
    }

    return false;
  }

  function setRowHidden(row, hidden) {
    row.classList.remove("cmf-hidden", "cmf-dimmed");
    if (!hidden) return;
    row.classList.add(settings.hideMode === "dim" ? "cmf-dimmed" : "cmf-hidden");
  }

  function showAll() {
    document
      .querySelectorAll(".cmf-hidden, .cmf-dimmed")
      .forEach((el) => el.classList.remove("cmf-hidden", "cmf-dimmed"));
    updateBadge(0, 0);
  }

  let scheduled = false;
  function applyFilters() {
    if (!settings) return;
    if (!settings.enabled) {
      showAll();
      return;
    }
    const rows = findRows();
    let hidden = 0;
    for (const row of rows) {
      const data = extract(row);
      const hide = shouldHide(data);
      if (DEBUG) log(data, hide ? "-> HIDDEN" : "");
      setRowHidden(row, hide);
      if (hide) hidden++;
    }
    updateBadge(hidden, rows.length);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyFilters();
    });
  }

  /* -------------------------------------------------------------------- */
  /* Auto "Show more results"                                             */
  /* -------------------------------------------------------------------- */

  const MAX_AUTOLOAD_CLICKS = 60;
  let autoLoadClicks = 0;
  let autoLoadTimer = null;
  let lastAutoClick = 0;

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  // Finds a visible, enabled "show more / load more" button, first by CSS
  // selector and then by button/link text in any supported language.
  function findShowMore() {
    for (const sel of CM_SELECTORS.showMore) {
      const el = document.querySelector(sel);
      if (el && !el.disabled && isVisible(el)) return el;
    }
    const candidates = document.querySelectorAll(
      "button, a, [role='button'], .btn"
    );
    for (const el of candidates) {
      if (el.disabled) continue;
      const txt = normalize(el.textContent);
      if (!txt) continue;
      if (CM_SHOW_MORE_PHRASES.some((p) => txt.includes(p)) && isVisible(el)) {
        return el;
      }
    }
    return null;
  }

  // Clicks the button at most once per tick, throttled, until it disappears or
  // the safety cap is reached.
  function autoLoadStep() {
    if (!settings) {
      console.log("[CM-AutoLoad] settings not loaded yet");
      return;
    }
    if (!settings.enabled) {
      console.log("[CM-AutoLoad] filter disabled");
      return;
    }
    if (settings.autoLoad === false) {
      console.log("[CM-AutoLoad] auto-load is turned off");
      return;
    }
    if (autoLoadClicks >= MAX_AUTOLOAD_CLICKS) {
      console.log("[CM-AutoLoad] max clicks reached (", MAX_AUTOLOAD_CLICKS, ")");
      return;
    }
    const now = Date.now();
    if (now - lastAutoClick < 700) return;
    const btn = findShowMore();
    if (btn) {
      lastAutoClick = now;
      autoLoadClicks++;
      console.log("[CM-AutoLoad] clicking show more button (#" + autoLoadClicks + ")", btn);
      btn.click();
      updateAutoLoadBadge();
    } else if (autoLoadClicks === 0) {
      // Only log once on first try
      console.log("[CM-AutoLoad] button not found - will keep trying");
    }
  }

  function updateAutoLoadBadge() {
    if (autoLoadClicks === 0) return;
    let badge = document.getElementById("cmf-autoload-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "cmf-autoload-badge";
      badge.style.cssText = "position:fixed;bottom:20px;right:20px;background:#28a745;color:white;padding:8px 12px;border-radius:4px;font:12px sans-serif;z-index:99999;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
      document.body.appendChild(badge);
    }
    badge.textContent = `Auto-loading... (${autoLoadClicks} clicks)`;
    // Remove after 2 seconds of no activity
    clearTimeout(badge._timer);
    badge._timer = setTimeout(() => badge.remove(), 2000);
  }

  function startAutoLoad() {
    if (autoLoadTimer) return;
    console.log("[CM-AutoLoad] starting auto-load timer (checks every 800ms)");
    autoLoadTimer = setInterval(autoLoadStep, 800);
    // Try immediately once
    setTimeout(autoLoadStep, 100);
  }

  /* -------------------------------------------------------------------- */
  /* On-page badge                                                        */
  /* -------------------------------------------------------------------- */

  function updateBadge(hidden, total) {
    let badge = document.getElementById("cmf-badge");
    if (hidden <= 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "cmf-badge";
      document.body.appendChild(badge);
    }
    badge.textContent = `Cardmarket Filter: ${hidden}/${total} verborgen`;
  }

  /* -------------------------------------------------------------------- */
  /* Init                                                                 */
  /* -------------------------------------------------------------------- */

  function loadSettings(cb) {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const stored = res[STORAGE_KEY] || {};
      settings = Object.assign({}, CM_DEFAULT_SETTINGS, stored, {
        country: Object.assign({}, CM_DEFAULT_SETTINGS.country, stored.country),
        sellerTypes: Object.assign(
          {},
          CM_DEFAULT_SETTINGS.sellerTypes,
          stored.sellerTypes
        ),
        reputation: Object.assign(
          {},
          CM_DEFAULT_SETTINGS.reputation,
          stored.reputation
        ),
        sellers: Object.assign({}, CM_DEFAULT_SETTINGS.sellers, stored.sellers),
        comment: Object.assign({}, CM_DEFAULT_SETTINGS.comment, stored.comment)
      });
      cb && cb();
    });
  }

  function observe() {
    const target = document.body;
    if (!target) return;
    const observer = new MutationObserver((mutations) => {
      // Ignore our own class changes to avoid loops.
      const relevant = mutations.some(
        (m) =>
          m.type === "childList" &&
          (m.addedNodes.length || m.removedNodes.length)
      );
      if (relevant) scheduleApply();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      loadSettings(applyFilters);
    }
  });

  loadSettings(() => {
    applyFilters();
    observe();
    startAutoLoad();
  });
})();
