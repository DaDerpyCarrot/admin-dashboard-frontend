console.log("admin-dashboard.js loaded");

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE = isLocal
  ? "http://localhost:3000/api"
  : "https://roadimentary-admin-dashboard.onrender.com/api";

const token = localStorage.getItem("adminToken");
const dashboardContent = document.getElementById("adminDashboardContent");


console.log("Dashboard token:", token);

if (!token) {
  console.warn("No token found.");
  window.location.replace("./admin-login.html");
} else {
  document.body.classList.remove("admin-dashboard-hidden");
}

let currentPlayFabId = "";
let currentPlayerListRows = [];
let currentSort = {
  key: "lastLogin",
  direction: "desc"
};

const sortableHeaders = document.querySelectorAll(".sortable-th");

const listSearchInput = document.getElementById("listSearchInput");
const listAccountStatusFilter = document.getElementById("listAccountStatusFilter");
const listReviewStateFilter = document.getElementById("listReviewStateFilter");
const listFlaggedOnly = document.getElementById("listFlaggedOnly");
const listReviewedOnly = document.getElementById("listReviewedOnly");
const listLimitFilter = document.getElementById("listLimitFilter");
const loadPlayerListBtn = document.getElementById("loadPlayerListBtn");
const playerListStatus = document.getElementById("playerListStatus");
const playerListBody = document.getElementById("playerListBody");

const statusText = document.getElementById("status");
const playerStatus = document.getElementById("playerStatus");
const searchStatus = document.getElementById("searchStatus");
const logoutBtn = document.getElementById("logout-btn");

const totalPlayersEl = document.getElementById("totalPlayers");
const playersReviewedEl = document.getElementById("playersReviewed");
const flaggedPlayersEl = document.getElementById("flaggedPlayers");
const serverStatusEl = document.getElementById("serverStatus");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const refreshPlayersBtn = document.getElementById("refreshPlayersBtn");
const recountFlagsBtn = document.getElementById("recountFlagsBtn");
const searchResults = document.getElementById("searchResults");

const saveInternalBtn = document.getElementById("saveInternalBtn");
const banPlayerBtn = document.getElementById("banPlayerBtn");

const profileOutput = document.getElementById("profileOutput");
const statsOutput = document.getElementById("statsOutput");
const userDataOutput = document.getElementById("userDataOutput");
const internalDataOutput = document.getElementById("internalDataOutput");
const segmentsOutput = document.getElementById("segmentsOutput");

const adminNoteInput = document.getElementById("adminNoteInput");
const accountStatusInput = document.getElementById("accountStatusInput");
const reviewStateInput = document.getElementById("reviewStateInput");
const strikeCountInput = document.getElementById("strikeCountInput");

const banReasonInput = document.getElementById("banReasonInput");
const banDurationInput = document.getElementById("banDurationInput");

const moderationHistoryOutput = document.getElementById("moderationHistoryOutput");



async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Request failed with status ${response.status}, and response was not valid JSON.`);
  }

if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("adminToken");
    window.location.replace("./admin-login.html");
    throw new Error("Unauthorized.");
  }

  throw new Error(data.message || `Request failed with status ${response.status}.`);
}

  return data;
}

function safeValue(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry.Value === "string") return entry.Value;
  return "";
}

function renderSegments(segments) {
  segmentsOutput.innerHTML = "";

  if (!Array.isArray(segments) || segments.length === 0) {
    segmentsOutput.innerHTML = "<span class='pill'>No segments found</span>";
    return;
  }

  segments.forEach(segment => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = segment.Name || segment.Id || "Unnamed Segment";
    segmentsOutput.appendChild(pill);
  });
}

function renderSearchResults(players) {
  searchResults.innerHTML = "";

  if (!Array.isArray(players) || players.length === 0) {
    searchResults.innerHTML = "<div class='muted'>No players found.</div>";
    return;
  }

  players.forEach(player => {
    const card = document.createElement("div");
    card.className = "search-result";

    const metaWrap = document.createElement("div");
    metaWrap.className = "search-result-meta";

    const title = document.createElement("strong");
    title.textContent = player.displayName || player.playFabId || "Unnamed Player";

    const meta = document.createElement("small");
    meta.textContent = `PlayFab ID: ${player.playFabId}`;

    const button = document.createElement("button");
    button.textContent = "Load This Player";
    button.addEventListener("click", () => {
      loadPlayer(player.playFabId);
    });

    metaWrap.appendChild(title);
    metaWrap.appendChild(meta);

    card.appendChild(metaWrap);
    card.appendChild(button);
    searchResults.appendChild(card);
  });
}

function renderModerationHistory(history) {
  moderationHistoryOutput.innerHTML = "";

  if (!Array.isArray(history) || history.length === 0) {
    moderationHistoryOutput.innerHTML = `<div class="empty-state">No moderation history yet.</div>`;
    return;
  }

  history.forEach(entry => {
    const wrap = document.createElement("div");
    wrap.className = "history-entry";

    const top = document.createElement("div");
    top.className = "history-entry-top";

    const action = document.createElement("div");
    action.className = "history-action";
    action.textContent = humanizeKey(entry.action || "update");

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = formatDate(entry.timestamp);

    const admin = document.createElement("div");
    admin.className = "history-admin";
    admin.textContent = `By: ${entry.admin || "Unknown"}`;

    top.appendChild(action);
    top.appendChild(time);
    top.appendChild(admin);

    wrap.appendChild(top);

    if (entry.note) {
      const note = document.createElement("div");
      note.className = "history-note";
      note.textContent = entry.note;
      wrap.appendChild(note);
    }

    const meta = document.createElement("div");
    meta.className = "history-meta";

    if (entry.accountStatus) {
      const pill = document.createElement("span");
      pill.className = `status-pill ${String(entry.accountStatus).toLowerCase()}`;
      pill.textContent = `Status: ${entry.accountStatus}`;
      meta.appendChild(pill);
    }

    if (entry.reviewState) {
      const pill = document.createElement("span");
      pill.className = `status-pill ${String(entry.reviewState).toLowerCase()}`;
      pill.textContent = `Review: ${entry.reviewState}`;
      meta.appendChild(pill);
    }

    if (entry.strikeCount !== undefined && entry.strikeCount !== null && entry.strikeCount !== "") {
      const pill = document.createElement("span");
      pill.className = "status-pill";
      pill.textContent = `Strikes: ${entry.strikeCount}`;
      meta.appendChild(pill);
    }

    if (entry.durationHours) {
      const pill = document.createElement("span");
      pill.className = "status-pill";
      pill.textContent = `Duration: ${entry.durationHours}h`;
      meta.appendChild(pill);
    }

    if (meta.children.length > 0) {
      wrap.appendChild(meta);
    }

    moderationHistoryOutput.appendChild(wrap);
  });
}

function formatDateShort(value) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString();
}

function createStatusPillHtml(value) {
  const normalized = String(value || "unknown").toLowerCase().trim();
  return `<span class="status-pill ${normalized}">${value || "unknown"}</span>`;
}

function normalizeSortValue(row, key) {
  const value = row?.[key];

  if (key === "lastLogin") {
    return value ? new Date(value).getTime() || 0 : 0;
  }

  return String(value || "").toLowerCase().trim();
}

function sortPlayerRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    const aValue = normalizeSortValue(a, currentSort.key);
    const bValue = normalizeSortValue(b, currentSort.key);

    if (aValue < bValue) {
      return currentSort.direction === "asc" ? -1 : 1;
    }

    if (aValue > bValue) {
      return currentSort.direction === "asc" ? 1 : -1;
    }

    return 0;
  });

  return sorted;
}

function updateSortableHeaderUI() {
  sortableHeaders.forEach(header => {
    header.classList.remove("active-asc", "active-desc");

    const key = header.dataset.sortKey;
    if (key === currentSort.key) {
      header.classList.add(currentSort.direction === "asc" ? "active-asc" : "active-desc");
    }
  });
}

function renderPlayerList(rows) {
  currentPlayerListRows = Array.isArray(rows) ? [...rows] : [];
  const sortedRows = sortPlayerRows(currentPlayerListRows);

  playerListBody.innerHTML = "";
  updateSortableHeaderUI();

  if (!Array.isArray(sortedRows) || sortedRows.length === 0) {
    playerListBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table">No players matched the current filters.</td>
      </tr>
    `;
    return;
  }

  sortedRows.forEach(row => {
    const tr = document.createElement("tr");

    if (currentPlayFabId && row.playFabId === currentPlayFabId) {
      tr.classList.add("active-player-row");
    }

    tr.innerHTML = `
      <td class="player-name-cell">${row.displayName || "Unnamed Player"}</td>
      <td class="player-id-cell">${row.playFabId}</td>
      <td>${createStatusPillHtml(row.accountStatus)}</td>
      <td>${createStatusPillHtml(row.reviewState)}</td>
      <td>${formatDateShort(row.lastLogin)}</td>
      <td><button class="table-action-btn">Load</button></td>
    `;

    const btn = tr.querySelector("button");
    btn.addEventListener("click", () => {
      loadPlayer(row.playFabId);
    });

    playerListBody.appendChild(tr);
  });
}

async function loadPlayerList() {
  playerListStatus.textContent = "Loading player list...";

  try {
    const params = new URLSearchParams({
      q: listSearchInput.value.trim(),
      accountStatus: listAccountStatusFilter.value,
      reviewState: listReviewStateFilter.value,
      flaggedOnly: listFlaggedOnly.checked ? "true" : "false",
      reviewedOnly: listReviewedOnly.checked ? "true" : "false",
      limit: listLimitFilter.value || "50"
    });

    const data = await apiFetch(`/admin/player-list?${params.toString()}`);

    renderPlayerList(data.players || []);
    playerListStatus.textContent =
      `Showing ${data.players.length} of ${data.filtered} filtered players ` +
      `(from ${data.total} cached players).`;
  } catch (error) {
    console.error(error);
    playerListStatus.textContent = error.message;
    renderPlayerList([]);
  }
}

async function loadDashboard() {
  try {
    const data = await apiFetch("/admin/overview");

    totalPlayersEl.textContent = data.stats.totalPlayers;
    playersReviewedEl.textContent = data.stats.playersReviewed;
    flaggedPlayersEl.textContent = data.stats.flaggedPlayers;
    serverStatusEl.textContent = data.stats.serverStatus;

    if (dashboardContent) {
      dashboardContent.classList.remove("admin-dashboard-hidden");
    }

    statusText.textContent = "Dashboard loaded.";
  } catch (error) {
    console.error("Dashboard load failed:", error);
    statusText.textContent = `Dashboard failed to load: ${error.message}`;
  }
}

async function refreshPlayers() {
  searchStatus.textContent = "Refreshing player cache...";

  try {
    const data = await apiFetch("/admin/refresh-player-cache", {
      method: "POST"
    });

    searchStatus.textContent = `${data.message} (${data.totalPlayers} players)`;
    await loadDashboard();
    await loadPlayerList();

    if (searchInput.value.trim()) {
      await searchPlayers();
    }
  } catch (error) {
    console.error(error);
    searchStatus.textContent = error.message;
  }
}

async function recountAdminFlags() {
  searchStatus.textContent = "Recounting admin flags...";

  try {
    const data = await apiFetch("/admin/recount-admin-flags", {
      method: "POST"
    });

    searchStatus.textContent =
      `${data.message} Scanned: ${data.totalPlayersScanned}, ` +
      `Reviewed: ${data.playersReviewed}, Flagged: ${data.flaggedPlayers}`;

    await loadDashboard();
    await loadPlayerList();
    
  } catch (error) {
    console.error(error);
    searchStatus.textContent = error.message;
  }
}

async function searchPlayers() {
  const query = searchInput.value.trim();

  if (!query) {
    searchStatus.textContent = "Enter a PlayFab ID or display name.";
    renderSearchResults([]);
    return;
  }

  searchStatus.textContent = "Searching...";

  try {
    const data = await apiFetch(`/admin/player-search?q=${encodeURIComponent(query)}`);
    renderSearchResults(data.players || []);
    searchStatus.textContent = `${(data.players || []).length} result(s) found.`;
  } catch (error) {
    console.error(error);
    searchStatus.textContent = error.message;
    renderSearchResults([]);
  }
}

async function loadPlayer(playFabId) {
  const selectedId = (playFabId || "").trim();

  if (!selectedId) {
    playerStatus.textContent = "No player selected.";
    return;
  }

  currentPlayFabId = selectedId;
  playerStatus.textContent = `Loading player ${selectedId}...`;

  try {
    const data = await apiFetch(`/admin/player/${encodeURIComponent(selectedId)}`);
    const player = data.player || {};

    renderProfile(player.profile || {});
    renderStatistics(player.statistics || []);
    renderKeyValueData(userDataOutput, player.userData || {}, false);
    renderKeyValueData(internalDataOutput, player.internalData || {}, true);

    renderSegments(player.segments || []);
    renderModerationHistory(player.moderationHistory || []);

    adminNoteInput.value = safeValue(player.internalData?.AdminNote);
    accountStatusInput.value = safeValue(player.internalData?.AccountStatus);
    reviewStateInput.value = safeValue(player.internalData?.ReviewState);
    strikeCountInput.value = safeValue(player.internalData?.StrikeCount);

    playerStatus.textContent = `Player loaded: ${selectedId}`;
    
    renderPlayerList(currentPlayerListRows);
    await loadDashboard();
  } catch (error) {
    console.error(error);
    playerStatus.textContent = error.message;
  }
}

async function saveInternalData() {
  if (!currentPlayFabId) {
    playerStatus.textContent = "Load a player from search results first.";
    return;
  }

  playerStatus.textContent = "Saving internal data...";

  try {
    const strikeValue = strikeCountInput.value.trim();
    const payload = {
      adminNote: adminNoteInput.value.trim(),
      accountStatus: accountStatusInput.value,
      reviewState: reviewStateInput.value
    };

    if (strikeValue !== "") {
      payload.strikeCount = Number(strikeValue);
    }

    const data = await apiFetch(`/admin/player/${encodeURIComponent(currentPlayFabId)}/internal`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    playerStatus.textContent = data.message || "Internal data saved.";
    await loadPlayer(currentPlayFabId);
    await loadDashboard();
  } catch (error) {
    console.error(error);
    playerStatus.textContent = error.message;
  }
}

async function banPlayer() {
  if (!currentPlayFabId) {
    playerStatus.textContent = "Load a player from search results first.";
    return;
  }

  playerStatus.textContent = "Banning player...";

  try {
    const data = await apiFetch(`/admin/player/${encodeURIComponent(currentPlayFabId)}/ban`, {
      method: "POST",
      body: JSON.stringify({
        reason: banReasonInput.value.trim(),
        durationHours: Number(banDurationInput.value) || 24
      })
    });

    playerStatus.textContent = data.message || "Player banned.";
    await loadPlayer(currentPlayFabId);
    await loadDashboard();
  } catch (error) {
    console.error(error);
    playerStatus.textContent = error.message;
  }
}

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminToken");
  window.location.href = "./index.html";
});

if (loadPlayerListBtn) {
  loadPlayerListBtn.addEventListener("click", loadPlayerList);
}



searchBtn.addEventListener("click", searchPlayers);

if (refreshPlayersBtn) {
  refreshPlayersBtn.addEventListener("click", refreshPlayers);
}

if (recountFlagsBtn) {
  recountFlagsBtn.addEventListener("click", recountAdminFlags);
}

sortableHeaders.forEach(header => {
  header.addEventListener("click", () => {
    const key = header.dataset.sortKey;

    if (!key) return;

    if (currentSort.key === key) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.key = key;
      currentSort.direction = key === "lastLogin" ? "desc" : "asc";
    }

    renderPlayerList(currentPlayerListRows);
  });
});

saveInternalBtn.addEventListener("click", saveInternalData);
banPlayerBtn.addEventListener("click", banPlayer);

function clearContainer(el, emptyText = "No data.") {
  el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
}

function createInfoCard(label, value, options = {}) {
  const {
    mono = false,
    soft = false,
    status = false,
    wide = false
  } = options;

  const card = document.createElement("div");
  card.className = "info-card";
  if (wide) {
    card.classList.add("wide");
  }

  const labelEl = document.createElement("div");
  labelEl.className = "info-label";
  labelEl.textContent = titleCase(humanizeKey(label));

  const valueEl = document.createElement("div");

  if (status) {
    const normalized = String(value || "").toLowerCase().trim();
    valueEl.className = `status-pill ${normalized}`;
    valueEl.textContent = value || "—";
  } else {
    valueEl.className = "info-value";
    if (mono) valueEl.classList.add("mono");
    if (soft) valueEl.classList.add("soft");
    valueEl.textContent = value || "—";
  }

  card.appendChild(labelEl);
  card.appendChild(valueEl);

  return card;
}

function formatDate(value) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString();
}

function getPrimaryEmail(profile) {
  const emails = profile?.ContactEmailAddresses;
  if (!Array.isArray(emails) || emails.length === 0) return null;

  return emails[0];
}

function humanizeKey(key) {
  if (!key) return "—";

  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")   // AdminNote -> Admin Note
    .replace(/_/g, " ")                       // admin_note -> admin note
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text) {
  return String(text)
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function renderProfile(profile) {
  profileOutput.innerHTML = "";

  if (!profile || Object.keys(profile).length === 0) {
    clearContainer(profileOutput, "No profile loaded yet.");
    return;
  }

  const primaryEmail = getPrimaryEmail(profile);

  profileOutput.appendChild(createInfoCard("Display Name", profile.DisplayName));
  profileOutput.appendChild(createInfoCard("PlayFab ID", profile.PlayerId, { mono: true }));
  profileOutput.appendChild(createInfoCard("Title ID", profile.TitleId, { mono: true }));
  profileOutput.appendChild(createInfoCard("Publisher ID", profile.PublisherId, { mono: true }));
  profileOutput.appendChild(createInfoCard("Created", formatDate(profile.Created), { soft: true }));
  profileOutput.appendChild(createInfoCard("Last Login", formatDate(profile.LastLogin), { soft: true }));
  profileOutput.appendChild(createInfoCard("Email", primaryEmail?.EmailAddress || "—"));
  profileOutput.appendChild(
    createInfoCard("Email Verification", primaryEmail?.VerificationStatus || "—", {
      status: true
    })
  );
}

function renderStatistics(statistics) {
  statsOutput.innerHTML = "";

  if (!Array.isArray(statistics) || statistics.length === 0) {
    clearContainer(statsOutput, "No statistics found.");
    return;
  }

  statistics.forEach(stat => {
    const name = stat.StatisticName || "Unnamed Stat";
    const value = stat.Value ?? "—";
    statsOutput.appendChild(createInfoCard(name, String(value)));
  });
}

function renderKeyValueData(container, data, useStatusPills = false) {
  container.innerHTML = "";

  const entries = Object.entries(data || {}).filter(([key]) => {
    const normalizedKey = String(key).toLowerCase();

    if (useStatusPills) {
      return normalizedKey !== "moderationhistory";
    }

    return ![
      "adminnote",
      "accountstatus",
      "reviewstate",
      "strikecount",
      "moderationhistory"
    ].includes(normalizedKey);
  });

  if (entries.length === 0) {
    clearContainer(container, "No data found.");
    return;
  }

  const pinnedOrder = useStatusPills
    ? ["AdminNote", "AccountStatus", "ReviewState", "StrikeCount"]
    : [];

  const pinned = [];
  const remaining = [];

  entries.forEach(([key, raw]) => {
    const value =
      raw && typeof raw === "object" && "Value" in raw
        ? raw.Value
        : raw;

    const item = { key, value };

    if (pinnedOrder.includes(key)) {
      pinned.push(item);
    } else {
      remaining.push(item);
    }
  });

  pinned.sort((a, b) => pinnedOrder.indexOf(a.key) - pinnedOrder.indexOf(b.key));
  remaining.sort((a, b) => a.key.localeCompare(b.key));

  const ordered = [...pinned, ...remaining];

  ordered.forEach(({ key, value }) => {
    const stringValue = String(value ?? "—");
    const normalizedKey = String(key).toLowerCase();

    const isStatus =
      useStatusPills &&
      ["accountstatus", "reviewstate", "verificationstatus"].includes(normalizedKey);

    const isLongText =
      normalizedKey === "adminnote" || stringValue.length > 80;

    container.appendChild(
      createInfoCard(key, stringValue, {
        mono: !isStatus && !isLongText && stringValue.length > 18,
        status: isStatus,
        wide: isLongText
      })
    );
  });
}

if (token) {
  loadDashboard();
} else {
  statusText.textContent = "No admin token found. Please log in again.";
}

const backToTopBtn = document.getElementById("backToTopBtn");

window.addEventListener("scroll", () => {
  if (window.scrollY > 200) {
    backToTopBtn.style.display = "flex";
  } else {
    backToTopBtn.style.display = "none";
  }
});

backToTopBtn.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});