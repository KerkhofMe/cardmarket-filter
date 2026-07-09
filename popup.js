// Popup logic for the Cardmarket Offer Filter.
// Reads/writes settings in chrome.storage.local; the content script listens
// for changes and re-applies filters live.

const STORAGE_KEY = "cmFilterSettings";
let settings = null;
let LANG = "en";

function $(id) {
  return document.getElementById(id);
}

// Look up a translation for the active language, falling back to English and
// finally the key itself so the UI never shows blank text.
function t(key) {
  const table = CM_TRANSLATIONS[LANG] || CM_TRANSLATIONS.en;
  return table[key] ?? CM_TRANSLATIONS.en[key] ?? key;
}

// Replace the text of every element tagged with a data-i18n* attribute using
// the current language.
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}

/* ---------------------------------------------------------------------- */
/* Build dynamic checkbox groups                                          */
/* ---------------------------------------------------------------------- */

function buildChecks(container, items) {
  container.innerHTML = "";
  for (const item of items) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = item.key;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + item.label));
    container.appendChild(label);
  }
}

// Reputation labels are translatable, so each is rendered inside a data-i18n
// span that applyTranslations() keeps in sync with the active language.
function buildReputation() {
  const container = $("reputation");
  container.innerHTML = "";
  for (const item of REPUTATION_ITEMS) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = item.key;
    const span = document.createElement("span");
    span.dataset.i18n = item.i18n;
    span.textContent = t(item.i18n);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" "));
    label.appendChild(span);
    container.appendChild(label);
  }
}

const REPUTATION_ITEMS = [
  { key: "outstanding", i18n: "repOutstanding" },
  { key: "veryGood", i18n: "repVeryGood" },
  { key: "good", i18n: "repGood" },
  { key: "average", i18n: "repAverage" },
  { key: "bad", i18n: "repBad" }
];

/* ---------------------------------------------------------------------- */
/* Load / render                                                          */
/* ---------------------------------------------------------------------- */

function mergeDefaults(stored) {
  return Object.assign({}, CM_DEFAULT_SETTINGS, stored, {
    country: Object.assign({}, CM_DEFAULT_SETTINGS.country, stored.country),
    sellerTypes: Object.assign({}, CM_DEFAULT_SETTINGS.sellerTypes, stored.sellerTypes),
    reputation: Object.assign({}, CM_DEFAULT_SETTINGS.reputation, stored.reputation),
    sellers: Object.assign({}, CM_DEFAULT_SETTINGS.sellers, stored.sellers),
    comment: Object.assign({}, CM_DEFAULT_SETTINGS.comment, stored.comment)
  });
}

function render() {
  $("enabled").checked = settings.enabled;

  document
    .querySelectorAll('input[name="hideMode"]')
    .forEach((r) => (r.checked = r.value === settings.hideMode));

  $("autoLoad").checked = settings.autoLoad !== false;

  document
    .querySelectorAll('input[name="countryMode"]')
    .forEach((r) => (r.checked = r.value === settings.country.mode));
  renderCountrySelection();

  $("professional").checked = settings.sellerTypes.professional !== false;

  document.querySelectorAll("#reputation input").forEach((cb) => {
    cb.checked = settings.reputation[cb.dataset.key] !== false;
  });

  document.querySelectorAll("#conditions input").forEach((cb) => {
    cb.checked = (settings.conditions || []).includes(cb.dataset.key);
  });

  $("minPrice").value = settings.minPrice ?? "";
  $("maxPrice").value = settings.maxPrice ?? "";
  $("minItemCount").value = settings.minItemCount ?? "";
  $("minSales").value = settings.minSales ?? "";

  $("sellerBlock").value = (settings.sellers.block || []).join("\n");
  $("sellerAllow").value = (settings.sellers.allow || []).join("\n");

  $("commentExclude").value = (settings.comment.exclude || []).join("\n");
  $("commentInclude").value = (settings.comment.include || []).join("\n");

  applyEnabledState();
  applyLanguage(LANG);
}

/* ---------------------------------------------------------------------- */
/* Language picker                                                        */
/* ---------------------------------------------------------------------- */

function buildLangOptions() {
  const container = $("langOptions");
  container.innerHTML = "";
  for (const lang of CM_LANGUAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-option";
    btn.dataset.lang = lang.code;
    btn.setAttribute("role", "option");
    const flagWrapper = document.createElement("span");
    flagWrapper.className = "flag";
    flagWrapper.appendChild(createFlagElement(lang.flag));
    const name = document.createElement("span");
    name.textContent = lang.label;
    btn.appendChild(flagWrapper);
    btn.appendChild(name);
    container.appendChild(btn);
  }
}

// Switch the whole popup to the given language and refresh dynamic strings.
function applyLanguage(code) {
  LANG = CM_TRANSLATIONS[code] ? code : "en";
  const active = CM_LANGUAGES.find((l) => l.code === LANG) || CM_LANGUAGES[0];
  const langFlag = $("langFlag");
  langFlag.innerHTML = "";
  langFlag.appendChild(createFlagElement(active.flag));
  applyTranslations();
  updateSummary();
  updateCountryLabel();
  document.querySelectorAll("#langOptions .lang-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.lang === LANG);
  });
}

function closeLangPanel() {
  $("langMs").classList.remove("open");
  $("langPanel").hidden = true;
  $("langToggle").setAttribute("aria-expanded", "false");
}

/* ---------------------------------------------------------------------- */
/* Country multi-select dropdown                                          */
/* ---------------------------------------------------------------------- */

function buildCountryOptions() {
  const container = $("countryOptions");
  container.innerHTML = "";
  for (const country of CM_COUNTRIES) {
    const label = document.createElement("label");
    label.className = "ms-option";
    label.setAttribute("role", "option");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = country.name;
    cb.className = "country-cb";
    cb.dataset.code = country.code;
    const flagWrapper = document.createElement("span");
    flagWrapper.className = "flag";
    flagWrapper.appendChild(createFlagElement(country.code));
    label.appendChild(cb);
    label.appendChild(flagWrapper);
    label.appendChild(document.createTextNode(country.name));
    container.appendChild(label);
  }
}

// Creates a flag element using flag-icons CSS (works on Windows/macOS/Linux).
function createFlagElement(code) {
  const span = document.createElement("span");
  span.className = `fi fi-${code.toLowerCase()}`;
  span.setAttribute("aria-label", code.toUpperCase());
  span.style.display = "inline-block";
  return span;
}

// Fallback for backwards compatibility (creates flag element and returns it).
function flagEmoji(code) {
  return createFlagElement(code);
}

function renderCountrySelection() {
  const selected = (settings.country.list || []).map((s) => s.toLowerCase());
  document.querySelectorAll("#countryOptions .country-cb").forEach((cb) => {
    cb.checked = selected.includes(cb.value.toLowerCase());
  });
  updateCountryLabel();
}

function updateCountryLabel() {
  const checked = Array.from(
    document.querySelectorAll("#countryOptions .country-cb:checked")
  );
  const label = $("countryLabel");
  label.innerHTML = "";
  if (checked.length === 0) {
    label.textContent = t("allCountries");
  } else if (checked.length === 1) {
    label.appendChild(createFlagElement(checked[0].dataset.code));
    label.appendChild(document.createTextNode(" " + checked[0].value));
  } else {
    label.textContent = `${checked.length} ${t("countriesWord")}`;
  }
}

function filterCountryOptions(term) {
  const t = term.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("#countryOptions .ms-option").forEach((opt) => {
    const match = !t || opt.textContent.toLowerCase().includes(t);
    opt.style.display = match ? "" : "none";
    if (match) visible++;
  });
  let empty = document.getElementById("countryEmpty");
  if (visible === 0) {
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "countryEmpty";
      empty.className = "ms-empty";
      empty.textContent = t("noCountryFound");
      $("countryOptions").appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}

function closeCountryPanel() {
  $("countryMs").classList.remove("open");
  $("countryPanel").hidden = true;
  $("countryToggle").setAttribute("aria-expanded", "false");
}

function applyEnabledState() {
  document.body.classList.toggle("off", !$("enabled").checked);
}

// Count how many filter categories are actively constraining results and show
// a short human-readable summary in the header.
function updateSummary() {
  const el = $("activeSummary");
  if (!el) return;

  if (!settings.enabled) {
    el.textContent = t("summaryDisabled");
    return;
  }

  const totalConditions = CM_CONDITIONS.length;
  let count = 0;

  if ((settings.country.list || []).length) count++;
  if (Object.values(settings.sellerTypes).filter((v) => v === false).length) count++;
  if (Object.values(settings.reputation).filter((v) => v === false).length) count++;
  if ((settings.conditions || []).length && settings.conditions.length < totalConditions) count++;
  if (settings.minPrice != null || settings.maxPrice != null) count++;
  if (settings.minItemCount != null) count++;
  if (settings.minSales != null) count++;
  if ((settings.sellers.block || []).length || (settings.sellers.allow || []).length) count++;
  if ((settings.comment.include || []).length || (settings.comment.exclude || []).length) count++;

  el.textContent =
    count === 0
      ? t("summaryNone")
      : count === 1
        ? t("summaryOne")
        : t("summaryMany").replace("{n}", count);
}

/* ---------------------------------------------------------------------- */
/* Collect / save                                                         */
/* ---------------------------------------------------------------------- */

function parseList(str, sep) {
  return str
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function numOrNull(value) {
  if (value === "" || value == null) return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function collect() {
  const hideMode =
    document.querySelector('input[name="hideMode"]:checked')?.value || "hide";
  const countryMode =
    document.querySelector('input[name="countryMode"]:checked')?.value || "block";

  const countryList = Array.from(
    document.querySelectorAll("#countryOptions .country-cb:checked")
  ).map((cb) => cb.value);

  const sellerTypes = {
    private: true,
    commercial: true,
    professional: $("professional").checked,
    powerseller: true
  };

  const reputation = {};
  document.querySelectorAll("#reputation input").forEach((cb) => {
    reputation[cb.dataset.key] = cb.checked;
  });

  const conditions = [];
  document.querySelectorAll("#conditions input").forEach((cb) => {
    if (cb.checked) conditions.push(cb.dataset.key);
  });

  settings = {
    enabled: $("enabled").checked,
    hideMode,
    lang: LANG,
    autoLoad: $("autoLoad").checked,
    country: { mode: countryMode, list: countryList },
    sellerTypes,
    reputation,
    conditions,
    minPrice: numOrNull($("minPrice").value),
    maxPrice: numOrNull($("maxPrice").value),
    minItemCount: numOrNull($("minItemCount").value),
    minSales: numOrNull($("minSales").value),
    sellers: {
      block: parseList($("sellerBlock").value, "\n"),
      allow: parseList($("sellerAllow").value, "\n")
    },
    comment: {
      exclude: parseList($("commentExclude").value, "\n"),
      include: parseList($("commentInclude").value, "\n")
    }
  };
}

let saveTimer = null;
function save() {
  collect();
  chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
    applyEnabledState();
    updateSummary();
    const status = $("status");
    status.textContent = t("saved");
    status.classList.add("show");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => status.classList.remove("show"), 1200);
  });
}

/* ---------------------------------------------------------------------- */
/* Init                                                                   */
/* ---------------------------------------------------------------------- */

function init() {
  buildReputation();
  buildChecks(
    $("conditions"),
    CM_CONDITIONS.map((c) => ({ key: c.code, label: `${c.code} – ${c.label}` }))
  );
  buildCountryOptions();
  buildLangOptions();

  chrome.storage.local.get(STORAGE_KEY, (res) => {
    settings = mergeDefaults(res[STORAGE_KEY] || {});
    LANG = settings.lang || "en";
    render();

    // Auto-save on any change.
    document.body.addEventListener("change", save);
    document.body.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    });

    // Country multi-select dropdown behaviour.
    const ms = $("countryMs");
    $("countryToggle").addEventListener("click", () => {
      const open = ms.classList.toggle("open");
      $("countryPanel").hidden = !open;
      $("countryToggle").setAttribute("aria-expanded", String(open));
      if (open) $("countrySearch").focus();
    });
    $("countrySearch").addEventListener("input", (e) => {
      e.stopPropagation();
      filterCountryOptions(e.target.value);
    });
    $("countryOptions").addEventListener("change", updateCountryLabel);
    document.addEventListener("click", (e) => {
      if (!ms.contains(e.target)) closeCountryPanel();
      if (!$("langMs").contains(e.target)) closeLangPanel();
    });

    // Language picker dropdown behaviour.
    const langMs = $("langMs");
    $("langToggle").addEventListener("click", () => {
      const open = langMs.classList.toggle("open");
      $("langPanel").hidden = !open;
      $("langToggle").setAttribute("aria-expanded", String(open));
    });
    $("langOptions").addEventListener("click", (e) => {
      const btn = e.target.closest(".lang-option");
      if (!btn) return;
      applyLanguage(btn.dataset.lang);
      closeLangPanel();
      save();
    });

    // Quick "Alles / Geen" toggles per checkbox group.
    document.querySelectorAll(".group-actions button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.parentElement.dataset.target;
        const check = btn.dataset.action === "all";
        document
          .querySelectorAll(`#${target} input[type="checkbox"]`)
          .forEach((cb) => (cb.checked = check));
        save();
      });
    });

    $("reset").addEventListener("click", () => {
      if (!confirm(t("resetConfirm"))) return;
      // Keep the chosen UI language; reset only the filters.
      settings = mergeDefaults({ lang: LANG });
      render();
      save();
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
