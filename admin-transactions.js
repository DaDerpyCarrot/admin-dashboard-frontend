"use strict";

window.AdminLedger = (() => {
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const integer = value => typeof value === "string" && /^\d{1,30}$/.test(value);
  const format = value => new Intl.NumberFormat().format(BigInt(value));

  function init({ request, isSessionCurrent = () => true }) {
    const accordion = document.getElementById("adminTransactionsAccordion");
    const panel = document.getElementById("adminLedgerPanel");
    if (!accordion || !panel) return null;
    const get = id => document.getElementById(id);
    const summary = get("adminLedgerSummary"), ownerLabel = get("adminLedgerPlayerId");
    const status = get("adminLedgerStatus"), list = get("adminLedgerList"), count = get("adminLedgerCount");
    const refresh = get("adminLedgerRefresh"), more = get("adminLedgerMore"), apply = get("adminLedgerApply");
    const form = get("adminLedgerFilters"), filterNote = get("adminLedgerFilterNote");
    const inputs = Object.fromEntries([...form.querySelectorAll("[data-ledger-field]")].map(input => [input.dataset.ledgerField, input]));
    let selectedId = "", playerReady = false, busy = false, loaded = false, version = 0;
    let controller = null, rows = [], currencies = [], nextCursor = null, lastLoaded = 0;
    let applied = {}, appliedDraft = draft();

    function sessionCurrent() { try { return isSessionCurrent() === true; } catch (_) { return false; } }
    function draft() { return Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])); }
    function dirty() { return JSON.stringify(draft()) !== JSON.stringify(appliedDraft); }
    function setStatus(message, state = "idle") { status.textContent = message; status.dataset.state = state; }
    function controls() {
      const allowed = playerReady && sessionCurrent();
      panel.setAttribute("aria-busy", String(busy));
      list.setAttribute("aria-busy", String(busy));
      refresh.disabled = !allowed || busy;
      refresh.textContent = busy ? "Reading ledger…" : "Refresh ledger";
      apply.disabled = !allowed || busy;
      Object.values(inputs).forEach(input => { input.disabled = !allowed || busy; });
      more.hidden = !nextCursor;
      more.disabled = !allowed || busy || dirty();
      filterNote.dataset.dirty = String(dirty());
      filterNote.textContent = dirty() ? "Filter changes are not applied yet. Use Apply filters or Refresh ledger."
        : "Dates use this browser's local time. Search uses IDs, not item names.";
    }
    function render() {
      const value = inputs.currency.value;
      inputs.currency.replaceChildren(element("option", "", "All currencies"));
      inputs.currency.firstChild.value = "";
      [...new Set([...currencies, value].filter(Boolean))].forEach(code => {
        const option = element("option", "", code); option.value = code; inputs.currency.append(option);
      });
      inputs.currency.value = value;
      summary.textContent = busy ? "Loading…" : loaded ? `${rows.length} shown${nextCursor ? " · more" : ""}`
        : status.dataset.state === "error" ? "Unavailable" : "Not loaded";
      count.textContent = loaded ? `${rows.length} captured purchase${rows.length === 1 ? "" : "s"} shown for these filters${nextCursor ? "; more are available." : "."}` : "No history loaded";
      list.replaceChildren();
      if (!rows.length) {
        list.append(element("li", "admin-ledger-empty", busy ? "Reading this player's captured purchases…"
          : loaded ? "No captured purchases match these filters. This does not prove there were no purchases; older events may still need importing or capture setup."
          : "Purchase history has not loaded yet."));
      }
      rows.forEach(row => {
        const card = element("li", "admin-ledger-row");
        const head = element("div", "admin-ledger-row-head");
        const title = element("div");
        title.append(element("h4", "", row.itemName || row.itemId));
        title.append(element("p", "", `Item ID: ${row.itemId}`));
        title.append(element("p", "", `Catalog: ${row.catalogVersion || "Default / unversioned"}`));
        if (!row.itemName) title.append(element("p", "", "Name unavailable; the item ID is retained."));
        head.append(title, element("span", "admin-ledger-badge", "Recorded purchase"));
        const facts = element("dl", "admin-ledger-facts");
        const when = element("div"), cost = element("div"), reference = element("div", "admin-ledger-reference");
        const date = new Date(row.occurredAt);
        const time = element("time", "", date.toLocaleString()); time.dateTime = date.toISOString();
        const dateValue = element("dd"); dateValue.append(time);
        when.append(element("dt", "", "Purchase date · your local time"), dateValue);
        const total = element("dd");
        total.append(element("strong", "admin-ledger-cost", `${format(row.total)} ${row.currency}`),
          element("p", "", `Quantity ${format(row.quantity)} · ${format(row.unitPrice)} ${row.currency} each`));
        cost.append(element("dt", "", "Game-currency cost"), total);
        reference.append(element("dt", "", "Purchase ID"), element("dd", "", row.purchaseId));
        facts.append(when, cost, reference); card.append(head, facts); list.append(card);
      });
      controls();
    }
    function abort() { version++; controller?.abort(); controller = null; busy = false; }
    function reset(playFabId, message, state = "idle") {
      abort(); selectedId = playFabId; playerReady = false; loaded = false;
      rows = []; nextCursor = null; currencies = []; lastLoaded = 0; applied = {};
      Object.entries(inputs).forEach(([key, input]) => { input.value = key === "limit" ? "20" : ""; });
      appliedDraft = draft();
      ownerLabel.textContent = playFabId || "No player selected";
      setStatus(message, state); render();
    }
    function select(playFabId) {
      const id = String(playFabId || "").trim().toUpperCase();
      reset(id, id ? "Waiting for this player's profile…" : "Select a player, then open Transactions to inspect their captured purchases.");
    }
    function dispose() { select(""); }
    function checkSession() {
      if (sessionCurrent()) return true;
      reset("", "The administrator session changed or ended. Sign in again to view transaction history.", "error");
      return false;
    }
    function current(readVersion, owner) {
      if (version !== readVersion || selectedId !== owner) return false;
      return checkSession();
    }
    function utcDate(value, after) {
      if (!value) return "";
      if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw new Error("Choose a valid filter date.");
      const date = new Date(value + "T00:00:00");
      const civil = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!Number.isFinite(date.getTime()) || civil !== value) throw new Error("Choose a valid filter date.");
      if (after) date.setDate(date.getDate() + 1);
      return date.toISOString();
    }
    function readFilters() {
      const value = draft();
      if (value.from && value.through && value.from > value.through) throw new Error("The end date must not precede the start date.");
      if (!["20", "50"].includes(value.limit)) throw new Error("Choose 20 or 50 rows per load.");
      if (value.currency && !/^[A-Z0-9_-]{1,8}$/.test(value.currency)) throw new Error("Choose a valid currency code.");
      if (value.q.length > 100 || /[\x00-\x1f\x7f]/.test(value.q)) throw new Error("Use an item/purchase search of at most 100 characters.");
      const query = { limit: value.limit };
      if (value.currency) query.currency = value.currency;
      if (value.from) query.from = utcDate(value.from, false);
      if (value.through) query.before = utcDate(value.through, true);
      if (value.q.trim()) query.q = value.q.trim();
      return { query, raw: value };
    }
    function normalize(data, owner) {
      if (data?.ok !== true || data.playerId !== owner || data.readOnly !== true
        || data.coverage?.type !== "legacy_virtual_currency_purchase" || !Array.isArray(data.transactions)
        || data.transactions.length > 50 || !Array.isArray(data.currencies)
        || (data.nextCursor !== null && (typeof data.nextCursor !== "string" || !data.nextCursor || data.nextCursor.length > 4096))
        || !Number.isFinite(Date.parse(data.fetchedAt))) {
        throw new Error("Unexpected ledger response. Check the selected player and backend deployment; no new history was displayed.");
      }
      for (const row of data.transactions) {
        if (!row || typeof row.id !== "string" || !/^[0-9]{1,19}$/.test(row.id)
          || typeof row.itemId !== "string" || !row.itemId || row.itemId.length > 256
          || typeof row.purchaseId !== "string" || !row.purchaseId || row.purchaseId.length > 128
          || typeof row.catalogVersion !== "string" || row.catalogVersion.length > 128
          || !(row.itemName === null || typeof row.itemName === "string" && row.itemName.length <= 200)
          || !["current_catalog", "item_id_only"].includes(row.labelSource)
          || typeof row.currency !== "string" || !/^[A-Z0-9_-]{1,8}$/.test(row.currency)
          || !integer(row.unitPrice) || !integer(row.quantity) || !integer(row.total) || BigInt(row.quantity) < 1n
          || BigInt(row.unitPrice) * BigInt(row.quantity) !== BigInt(row.total)
          || typeof row.occurredAt !== "string" || !Number.isFinite(Date.parse(row.occurredAt))
          || row.status !== "recorded_purchase" || row.eventType !== "legacy_virtual_currency_purchase") {
          throw new Error("The backend returned an invalid purchase record; no new history was displayed.");
        }
      }
      if (!data.currencies.every(code => typeof code === "string" && /^[A-Z0-9_-]{1,8}$/.test(code))) throw new Error("Unexpected currency list.");
      return data;
    }
    async function load(append = false) {
      if (!checkSession() || !playerReady || !selectedId || busy || (append && (!nextCursor || dirty()))) return;
      if (!append) {
        try { const filter = readFilters(); applied = filter.query; appliedDraft = filter.raw; }
        catch (error) { setStatus(error.message + " Previous results were not changed.", "error"); render(); return; }
      }
      abort(); const readVersion = version, owner = selectedId;
      controller = new AbortController(); const requestController = controller;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; requestController.abort(); }, 30000);
      busy = true;
      if (!append) { loaded = false; rows = []; nextCursor = null; }
      setStatus("Reading this player's captured purchase records…", "loading"); render();
      try {
        const query = new URLSearchParams(applied);
        if (append) query.set("cursor", nextCursor);
        const result = await request(`/admin/player/${encodeURIComponent(owner)}/transactions?${query}`, {
          signal: requestController.signal, cache: "no-store"
        });
        if (!current(readVersion, owner)) return;
        if (timedOut) throw new Error("Ledger read timed out. Please refresh to retry.");
        const data = normalize(result, owner);
        rows = append ? [...new Map([...rows, ...data.transactions].map(row => [row.id, row])).values()] : data.transactions;
        currencies = data.currencies; nextCursor = data.nextCursor; loaded = true; lastLoaded = Date.now();
        setStatus(`Captured history checked ${new Date(data.fetchedAt).toLocaleString()}. `
          + (nextCursor ? "More records are available." : "End of the captured records for these filters.")
          + (data.catalogNamesUnavailable ? " Some catalog names are unavailable; purchase IDs and costs are retained." : ""), "ready");
      } catch (error) {
        if (!current(readVersion, owner)) return;
        const missing = /404|not valid JSON/i.test(error.message || "");
        setStatus(timedOut || error.name === "AbortError" ? "Ledger read timed out. Please refresh to retry."
          : missing ? "Admin transaction endpoint unavailable. Deploy the backend update first, then refresh."
          : `Transactions unavailable: ${error.message || "Please retry."} No purchase or balance was changed.`, "error");
      } finally {
        clearTimeout(timer);
        if (current(readVersion, owner)) { controller = null; busy = false; render(); }
      }
    }
    function ready(playFabId) {
      if (String(playFabId).trim().toUpperCase() !== selectedId || !checkSession()) return;
      playerReady = true;
      setStatus("Open Transactions or use Refresh ledger to read this player's captured purchases."); render();
      if (accordion.open) void load();
    }
    function unavailable(playFabId) {
      if (String(playFabId).trim().toUpperCase() !== selectedId) return;
      reset(selectedId, "This player's profile could not be loaded. Reload the player before checking transactions.", "error");
    }
    accordion.addEventListener("toggle", () => {
      if (accordion.open && playerReady && !busy && (!loaded || Date.now() - lastLoaded > 60000 && !dirty())) void load();
    });
    form.addEventListener("submit", event => { event.preventDefault(); void load(); });
    form.addEventListener("input", controls); form.addEventListener("change", controls);
    refresh.addEventListener("click", () => { void load(); });
    more.addEventListener("click", () => { void load(true); });
    document.addEventListener("visibilitychange", () => { if (selectedId && !sessionCurrent()) checkSession(); });
    render();
    return { select, ready, unavailable, dispose };
  }
  return { init };
})();
