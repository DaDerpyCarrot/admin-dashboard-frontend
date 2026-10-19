(() => {
  "use strict";
  const NAMES = ["TotalXP", "JobsCompleted", "JobsAttempted", "WorkQualityTotal", "WorkQualityJobs"];
  const MAX = 2147483647;
  const AVATARS = new Set(["avatar_roadbuilder", "avatar_maplecrew", "avatar_asphaltace", "avatar_pavepaws", "avatar_brickbuddy", "avatar_surveyor", "avatar_forewoman", "avatar_uniform_white_khaki", "avatar_uniform_white_khaki_male"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const empty = () => ({ value: null, source: "missing" });
  const summaryKey = key => NAMES.some(name => `Profile${name}`.toLowerCase() === String(key).toLowerCase());
  const trainingKey = key => /^Tutorial_/i.test(key) || /^HasCompletedTutorial$/i.test(key);
  const handlesClientKey = key => summaryKey(key) || trainingKey(key) || ["bio", "ProfileAboutMe", "ProfileAvatar"].includes(key);
  const raw = value => object(value) && own(value, "Value") ? value.Value : value;

  // Same whole-point XP curve as the player profile and ContractRewardRules version 6.
  function levelFor(total) {
    if (!Number.isInteger(total) || total < 0 || total > MAX) return null;
    let level = 1, current = total;
    const cost = value => [0, 50, 100, 200, 350][value] ?? 500 + (value - 5) * 100;
    let needed = cost(level);
    while (current >= needed) { current -= needed; needed = cost(++level); }
    return { level, current, needed };
  }

  function number(value, source) {
    const parsed = source === "summary" ? typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN : value;
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX ? { value: parsed, source } : { value: null, source: "invalid" };
  }

  function buildModel(statistics, userData) {
    const validStats = Array.isArray(statistics), validData = object(userData);
    const stats = validStats ? statistics : [], data = validData ? userData : {};
    const legacy = {}, summary = {}, fields = {}, warnings = [];
    if (!validStats) warnings.push("The main statistics response was unavailable or malformed.");
    if (!validData) warnings.push("The Player Data response was unavailable or malformed.");
    NAMES.forEach(name => {
      const found = stats.filter(item => item?.StatisticName === name);
      legacy[name] = found.length === 1 ? number(found[0].Value, "statistics") : found.length > 1 ? { value: null, source: "invalid" } : empty();
      summary[name] = own(data, `Profile${name}`) ? number(raw(data[`Profile${name}`]), "summary") : empty();
      fields[name] = legacy[name].source === "missing" ? summary[name] : legacy[name];
    });
    const pair = (first, second) => {
      const source = legacy[first].source === "missing" && legacy[second].source === "missing" ? summary : legacy;
      return { a: source[first].value, b: source[second].value, source: source[first].source === source[second].source ? source[first].source : "missing" };
    };
    const completion = pair("JobsCompleted", "JobsAttempted"), quality = pair("WorkQualityTotal", "WorkQualityJobs");
    if (Object.values(fields).some(field => field.source === "summary")) warnings.push("Public profile summaries are being used as labeled fallbacks and may lag behind the game.");
    if (Object.values(fields).some(field => field.source === "invalid")) warnings.push("An invalid saved value was withheld.");
    if (completion.a !== null && completion.b !== null && completion.a > completion.b) warnings.push("Recorded job totals are inconsistent; completion rate is unavailable.");
    if (quality.a !== null && quality.b !== null && quality.a > quality.b * 100) warnings.push("Recorded quality totals are inconsistent; average work quality is unavailable.");
    return { fields, completion, quality, warnings, any: Object.values(fields).some(field => field.value !== null), legacy, summary };
  }

  function init({ request, isSessionCurrent }) {
    const profileRoot = document.getElementById("playerProfileDetails"), output = document.getElementById("statsOutput");
    if (!profileRoot || !output) return null;
    const panel = document.getElementById("adminPerformancePanel"), status = document.getElementById("adminStatsStatus");
    const refreshButton = document.getElementById("adminStatsRefresh"), checked = document.getElementById("adminStatsChecked");
    const training = document.getElementById("trainingOutput"), sources = document.getElementById("adminStatsSources");
    let selectedId = "", ready = false, version = 0, controller = null, busy = false;
    const format = value => new Intl.NumberFormat().format(value);
    const node = (tag, className, text) => {
      const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item;
    };
    const clear = (target, text) => target.replaceChildren(node("p", "empty-state", text));
    const isCurrent = () => typeof isSessionCurrent === "function" && isSessionCurrent();
    function setStatus(text, state = "idle") { status.textContent = text; status.dataset.state = state; }
    function setBusy(value) {
      busy = value; panel.setAttribute("aria-busy", String(value));
      refreshButton.disabled = value || !ready || !isCurrent(); refreshButton.textContent = value ? "Checking…" : "Refresh stats";
    }
    function abort() { version++; controller?.abort(); controller = null; }
    function select(id) {
      abort(); selectedId = id; ready = false; setBusy(false);
      clear(profileRoot, id ? "Loading selected player's profile…" : "Select a player to read their profile.");
      clear(output, id ? "Loading saved performance…" : "No player loaded yet.");
      clear(training, id ? "Loading training flags…" : "No player loaded yet.");
      sources.replaceChildren(); const row = node("tr"); const cell = node("td", "", id ? "Loading source values…" : "No player loaded yet."); cell.colSpan = 3; row.append(cell); sources.append(row);
      checked.textContent = id || "No player selected";
      setStatus(id ? "Waiting for the selected player's saved record…" : "Select a player to inspect saved performance.");
    }

    function sourceLabel(field) {
      return field.source === "statistics" ? "Saved PlayFab statistic" : field.source === "summary" ? "Public profile summary · fallback" : field.source === "invalid" ? "Invalid saved value · withheld" : "Not recorded or unavailable";
    }
    function card(label, value, note, metric) {
      const item = node("article", "admin-performance-card"); item.append(node("h4", "", label));
      const strong = node("strong", "", value); if (metric) strong.dataset.adminMetric = metric;
      item.append(strong, node("small", "", note)); return item;
    }
    function ratio(pair, quality = false) {
      if (pair.a === null || pair.b === null) return { value: "—", note: "Matching saved totals are not available." };
      if (pair.a > pair.b * (quality ? 100 : 1)) return { value: "—", note: "Recorded totals need checking in the game." };
      if (!pair.b) return { value: "Not enough data", note: quality ? "No scored completed jobs are recorded." : "No attempts are recorded." };
      const value = quality ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(pair.a / pair.b) : String(Math.round(100 * pair.a / pair.b));
      return { value: `${value}%`, note: `${quality ? "Average recorded completion score" : "Recorded completed ÷ attempted"} · ${pair.source === "summary" ? "public summary fallback" : "saved statistics"}` };
    }

    function renderStats(player) {
      const model = buildModel(player.statistics, player.userData), fields = model.fields;
      output.replaceChildren();
      const progression = levelFor(fields.TotalXP.value), top = node("div", "admin-performance-progression");
      top.append(card("Operator level", progression ? format(progression.level) : "—", `Total XP: ${fields.TotalXP.value === null ? "—" : format(fields.TotalXP.value)} · ${sourceLabel(fields.TotalXP)}`, "level"));
      const xp = node("div", "admin-performance-xp");
      xp.append(node("h4", "", progression ? `Progress to level ${format(progression.level + 1)}` : "XP progress"));
      const total = node("p", "admin-performance-xp-total", fields.TotalXP.value === null ? "Total XP unavailable" : `${format(fields.TotalXP.value)} total XP`); total.dataset.adminMetric = "xp"; xp.append(total);
      const progress = node("progress"); progress.max = progression?.needed || 1; progress.value = progression?.current || 0;
      progress.setAttribute("aria-label", progression ? `${format(progression.current)} of ${format(progression.needed)} XP toward level ${progression.level + 1}` : "XP progress unavailable");
      xp.append(progress, node("small", "", progression ? `${format(progression.current)} / ${format(progression.needed)} XP · ${format(progression.needed - progression.current)} XP to next level` : "Uses the game's current operator-level curve.")); top.append(xp); output.append(top);
      const grid = node("div", "admin-performance-grid");
      grid.append(card("Recorded jobs completed", fields.JobsCompleted.value === null ? "—" : format(fields.JobsCompleted.value), sourceLabel(fields.JobsCompleted), "completed"));
      grid.append(card("Recorded jobs attempted", fields.JobsAttempted.value === null ? "—" : format(fields.JobsAttempted.value), sourceLabel(fields.JobsAttempted), "attempted"));
      const completion = ratio(model.completion), quality = ratio(model.quality, true);
      grid.append(card("Completion rate", completion.value, completion.note, "completion"), card("Average work quality", quality.value, quality.note, "quality")); output.append(grid);
      output.append(node("p", "admin-performance-coverage", fields.JobsAttempted.value === 0
        ? "No job attempts are recorded in this saved source yet. This does not prove no jobs were played: game-side recording may be incomplete. XP saves separately."
        : "Shows only results saved by the game. No attempts are inferred from XP or purchases. Failed outcomes are not reclassified by this dashboard."));
      output.append(node("p", "admin-record-note", "The current game recorder excludes tutorial runs from job totals and uses completed-contract scores for average work quality. This read-only panel does not repair results, grant XP, or change balances."));
      setStatus(model.warnings.join(" ") || (model.any ? "Saved construction performance loaded." : "No supported saved performance values were returned. Missing fields are not treated as zero."), model.warnings.length || !model.any ? "warning" : "ready");
    }

    function renderProfile(player) {
      const data = object(player.userData) ? player.userData : {}, profile = object(player.profile) ? player.profile : {};
      profileRoot.replaceChildren();
      const header = node("div", "admin-record-identity"), avatarId = raw(data.ProfileAvatar);
      const avatar = AVATARS.has(avatarId) ? avatarId : "avatar_roadbuilder";
      const image = node("img"); image.src = `./assets/crew-avatars/${avatar}.png`; image.alt = ""; image.width = image.height = 76;
      const text = node("div"); text.append(node("h3", "", typeof profile.DisplayName === "string" && profile.DisplayName ? profile.DisplayName : "Unnamed player"));
      text.append(node("p", "admin-record-id", selectedId));
      text.append(node("small", "", AVATARS.has(avatarId) ? `Saved avatar: ${avatarId}` : "Default portrait · no supported saved avatar"));
      header.append(image, text); profileRoot.append(header);
      const bios = node("div", "admin-record-bios");
      [["Game About Me", "ProfileAboutMe", "No game About Me has been saved."], ["Website bio", "bio", "No website bio has been saved."]].forEach(([label, key, fallback]) => {
        const section = node("section", "admin-record-bio"); section.append(node("h4", "", label));
        const value = raw(data[key]); section.append(node("p", "", typeof value === "string" && value.trim() ? value : fallback));
        section.append(node("small", "", `Player Data / ${key}`)); bios.append(section);
      });
      profileRoot.append(bios, node("p", "admin-record-note", "Game About Me and website bio are separate saved fields; this view does not merge or overwrite them."));
      const identifiers = [["Title ID", profile.TitleId], ["Publisher ID", profile.PublisherId]].filter(([, value]) => typeof value === "string" && value);
      if (identifiers.length) {
        const details = node("details", "admin-record-identifiers"); details.append(node("summary", "", "Account identifiers"));
        identifiers.forEach(([label, value]) => details.append(node("p", "", `${label}: ${value}`))); profileRoot.append(details);
      }
    }

    function renderTraining(data) {
      const entries = Object.entries(object(data) ? data : {}).filter(([key]) => trainingKey(key)).sort(([a], [b]) => a.localeCompare(b));
      training.replaceChildren();
      if (!entries.length) return clear(training, "No training flags have been recorded for this player.");
      entries.forEach(([key, entry]) => {
        const value = raw(entry), label = /^HasCompletedTutorial$/i.test(key) ? "Tutorial completion flag" : key.replace(/^Tutorial_/i, "").replace(/_Complete$/i, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
        const state = String(value) === "1" ? "complete" : String(value) === "0" ? "pending" : "unknown";
        const item = node("article", "admin-training-card"); item.append(node("h4", "", label));
        item.append(node("span", `admin-training-state ${state}`, state === "complete" ? "Marked complete" : state === "pending" ? "Not marked complete" : "Unrecognized flag"));
        item.append(node("small", "", `${key}: ${value === undefined || value === null ? "—" : String(value)}`)); training.append(item);
      });
    }

    function renderSources(player) {
      sources.replaceChildren(); let count = 0;
      const append = (source, key, value) => {
        const row = node("tr"); row.append(node("td", "", source), node("th", "", key), node("td", "", value === undefined || value === null ? "—" : String(value))); row.children[1].scope = "row"; sources.append(row); count++;
      };
      if (Array.isArray(player.statistics)) player.statistics.forEach(stat => { if (object(stat)) append("Legacy statistic", typeof stat.StatisticName === "string" ? stat.StatisticName : "Unnamed statistic", stat.Value); });
      Object.entries(object(player.userData) ? player.userData : {}).filter(([key]) => summaryKey(key)).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => append("Public profile summary", key, raw(value)));
      if (!count) { const row = node("tr"), cell = node("td", "", "No saved source values returned."); cell.colSpan = 3; row.append(cell); sources.append(row); }
    }

    function render(player) {
      renderProfile(player); renderStats(player); renderTraining(player.userData); renderSources(player);
      checked.textContent = `Player ${selectedId} · Last checked ${new Date().toLocaleString()}`;
    }
    function correctOwner(player, id) {
      return object(player) && typeof player.playFabId === "string" && player.playFabId.toUpperCase() === id.toUpperCase()
        && (!player.profile?.PlayerId || String(player.profile.PlayerId).toUpperCase() === id.toUpperCase());
    }
    function accept(id, player) {
      if (id.toUpperCase() !== selectedId.toUpperCase() || !isCurrent()) return;
      if (!correctOwner(player, id)) { unavailable(id, "The server returned a different player's record. No performance data was displayed."); return; }
      ready = true; render(player); setBusy(false);
    }
    function unavailable(id, message = "The selected player record could not be loaded. Select the player again to retry.") {
      if (id.toUpperCase() !== selectedId.toUpperCase()) return;
      const wasReady = ready;
      abort(); clear(profileRoot, "Profile details are unavailable."); clear(output, "Performance values are unavailable."); clear(training, "Training flags are unavailable."); sources.replaceChildren();
      ready = wasReady; checked.textContent = `Player ${selectedId} · Latest read unavailable`; setStatus(message, "error"); setBusy(false);
    }
    async function refresh() {
      if (!isCurrent()) { select(""); return; }
      if (!ready || busy) return;
      const id = selectedId;
      abort(); const requestVersion = version;
      controller = new AbortController(); const requestController = controller;
      setBusy(true); clear(output, "Checking saved performance…"); clear(profileRoot, "Checking saved profile…"); clear(training, "Checking training flags…"); sources.replaceChildren();
      checked.textContent = `Player ${id} · Checking saved record`; setStatus("Reading the selected player's saved profile and statistics…", "loading");
      const timer = setTimeout(() => requestController.abort(), 30000);
      try {
        const result = await request(`/admin/player/${encodeURIComponent(id)}`, { signal: requestController.signal });
        if (requestVersion !== version) return;
        if (!isCurrent()) { select(""); return; }
        if (result?.ok !== true || !correctOwner(result.player, id)) throw new Error("The server returned an unexpected player record. No performance values were displayed.");
        render(result.player);
      } catch (error) {
        if (requestVersion !== version) return;
        if (!isCurrent()) { select(""); return; }
        unavailable(id, error.name === "AbortError" ? "The saved-record read timed out. Use Refresh stats to retry." : "The saved record could not be refreshed. Use Refresh stats to retry; no values were changed.");
      } finally {
        clearTimeout(timer);
        if (requestVersion === version && isCurrent()) { controller = null; setBusy(false); }
      }
    }
    refreshButton.addEventListener("click", () => { void refresh(); });
    document.addEventListener("visibilitychange", () => { if (selectedId && !isCurrent()) select(""); });
    select("");
    return { select, ready: accept, unavailable, dispose: () => select("") };
  }

  const api = Object.freeze({ init, handlesClientKey, levelFor, buildModel });
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.AdminPlayerRecord = api;
})();
