// Shared configuration and default settings for the Cardmarket Offer Filter.
// Loaded both in the content script and the popup (via <script> / manifest).

// Card conditions used by Cardmarket, in quality order (best -> worst).
const CM_CONDITIONS = [
  { code: "MT", label: "Mint" },
  { code: "NM", label: "Near Mint" },
  { code: "EX", label: "Excellent" },
  { code: "GD", label: "Good" },
  { code: "LP", label: "Light Played" },
  { code: "PL", label: "Played" },
  { code: "PO", label: "Poor" }
];

// Seller categories that Cardmarket shows in the offer row.
const CM_SELLER_TYPES = [
  { key: "private", label: "Private", keywords: ["private seller", "private"] },
  { key: "commercial", label: "Commercial", keywords: ["commercial seller", "commercial"] },
  { key: "professional", label: "Professional", keywords: ["professional seller", "professional"] },
  { key: "powerseller", label: "Powerseller", keywords: ["powerseller", "power seller"] }
];

// Countries Cardmarket uses for item location (English names, as shown on the
// site) with their ISO 3166-1 alpha-2 code (used to render a flag emoji in the
// multi-select country dropdown in the popup).
const CM_COUNTRIES = [
  { name: "Austria", code: "AT" },
  { name: "Belgium", code: "BE" },
  { name: "Bulgaria", code: "BG" },
  { name: "Croatia", code: "HR" },
  { name: "Cyprus", code: "CY" },
  { name: "Czech Republic", code: "CZ" },
  { name: "Denmark", code: "DK" },
  { name: "Estonia", code: "EE" },
  { name: "Finland", code: "FI" },
  { name: "France", code: "FR" },
  { name: "Germany", code: "DE" },
  { name: "Greece", code: "GR" },
  { name: "Hungary", code: "HU" },
  { name: "Ireland", code: "IE" },
  { name: "Italy", code: "IT" },
  { name: "Japan", code: "JP" },
  { name: "Latvia", code: "LV" },
  { name: "Lithuania", code: "LT" },
  { name: "Luxembourg", code: "LU" },
  { name: "Malta", code: "MT" },
  { name: "Netherlands", code: "NL" },
  { name: "Norway", code: "NO" },
  { name: "Poland", code: "PL" },
  { name: "Portugal", code: "PT" },
  { name: "Romania", code: "RO" },
  { name: "Singapore", code: "SG" },
  { name: "Slovakia", code: "SK" },
  { name: "Slovenia", code: "SI" },
  { name: "Spain", code: "ES" },
  { name: "Sweden", code: "SE" },
  { name: "Switzerland", code: "CH" },
  { name: "United Kingdom", code: "GB" },
  { name: "United States", code: "US" }
];

const CM_DEFAULT_SETTINGS = {
  enabled: true,
  hideMode: "hide", // "hide" | "dim"
  lang: "en", // popup UI language: en | nl | fr | es | de | it
  autoLoad: true, // automatically click "Show more results" until all offers load

  // Country / item location filter.
  country: {
    mode: "block", // "block" = hide listed countries, "allow" = only show listed countries
    list: [] // e.g. ["Germany", "France"]
  },

  // Seller categories to SHOW (true = visible, false = hidden).
  sellerTypes: {
    private: true,
    commercial: true,
    professional: true,
    powerseller: true
  },

  // Reputation / feedback. Cardmarket displays this as a colored badge with a
  // tooltip such as "excellent", "good", "average", "bad". We keep the ones set
  // to true. Empty entries are always shown (reputation unknown from the row).
  reputation: {
    outstanding: true,
    veryGood: true,
    good: true,
    average: true,
    bad: true
  },

  // Card conditions to SHOW (list of condition codes). Empty list = show all.
  conditions: CM_CONDITIONS.map((c) => c.code),

  // Price filters (item price in the page currency, usually EUR).
  minPrice: null,
  maxPrice: null,
  minItemCount: null, // hide offers with fewer than N items available
  minSales: null, // hide sellers with fewer than N completed sales (reputation proxy)

  // Per-seller lists (case-insensitive seller names).
  sellers: {
    block: [], // always hide these sellers
    allow: [] // if non-empty, ONLY these sellers are shown
  },

  // Filter on the seller's product comment / description text.
  comment: {
    include: [], // if non-empty: only show offers whose comment contains one of these
    exclude: [] // hide offers whose comment contains any of these
  }
};

// Selectors for the Cardmarket offer table. Multiple fallbacks are tried in
// order because Cardmarket occasionally changes its markup.
const CM_SELECTORS = {
  rows: [
    ".article-row",
    'div[id^="articleRow"]',
    ".table-body .row"
  ],
  sellerLink: 'a[href*="/Users/"]',
  condition: '.article-condition, [class*="article-condition"], [aria-label*="Condition"]',
  price: ".price-container, .color-primary, .fw-bold",
  itemCount: ".item-count, [class*=\"item-count\"], .amount",
  sellerSalesBadge: ".sell-count",
  comment: '.product-comments, .product-comment, [class*="comment"]',
  // "Show more results" button that lazily loads additional offers.
  showMore: [
    "#loadMoreButton",
    ".load-more button",
    ".load-more a",
    "[id*='loadMore']",
    "button[onclick*='loadMore']"
  ]
};

// Text a "show more / load more" button may contain, in the languages
// Cardmarket shows the site in. Matched case-insensitively as a fallback when
// the CSS selectors above don't hit.
const CM_SHOW_MORE_PHRASES = [
  "show more results",
  "show more",
  "load more",
  "meer resultaten",
  "toon meer",
  "laad meer",
  "plus de r\u00e9sultats",
  "afficher plus",
  "m\u00e1s resultados",
  "mostrar m\u00e1s",
  "mehr ergebnisse",
  "mehr anzeigen",
  "altri risultati",
  "mostra altro"
];

// Export for module-less usage (attach to globalThis so both contexts see it).
if (typeof globalThis !== "undefined") {
  globalThis.CM_CONDITIONS = CM_CONDITIONS;
  globalThis.CM_SELLER_TYPES = CM_SELLER_TYPES;
  globalThis.CM_COUNTRIES = CM_COUNTRIES;
  globalThis.CM_DEFAULT_SETTINGS = CM_DEFAULT_SETTINGS;
  globalThis.CM_SELECTORS = CM_SELECTORS;
  globalThis.CM_SHOW_MORE_PHRASES = CM_SHOW_MORE_PHRASES;
}
