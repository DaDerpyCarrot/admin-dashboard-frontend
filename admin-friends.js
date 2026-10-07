"use strict";

window.AdminCrew = (() => {
  const AVATARS = new Set([
    "avatar_roadbuilder", "avatar_maplecrew", "avatar_asphaltace", "avatar_pavepaws",
    "avatar_brickbuddy", "avatar_surveyor", "avatar_forewoman",
    "avatar_uniform_white_khaki", "avatar_uniform_white_khaki_male"
  ]);
  const GROUPS = {
    friends: { title: "Confirmed friends", empty: "No confirmed friends for this player yet." },
    incoming: { title: "Received requests", empty: "No pending requests received by this player." },
    outgoing: { title: "Sent requests", empty: "No pending requests sent by this player." }
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function init({ request, openPlayer }) {
    const panel = document.getElementById("adminCrewPanel");
    if (!panel) return null;
    const status = document.getElementById("crewStatus");
    const refresh = document.getElementById("crewRefreshBtn");
    const controls = document.getElementById("crewControls");
    const filter = document.getElementById("crewFilter");
    const list = document.getElementById("crewContactList");
    const heading = document.getElementById("crewGroupHeading");
    const counts = {
      friends: document.getElementById("crewFriendsCount"),
      incoming: document.getElementById("crewIncomingCount"),
      outgoing: document.getElementById("crewOutgoingCount")
    };
    let selectedId = "";
    let playerReady = false;
    let version = 0;
    let controller = null;
    let crew = null;
    let group = "friends";
    let busy = false;

    function setStatus(message, state = "idle") {
      status.textContent = message;
      status.dataset.state = state;
    }
    function updateCounts(data = null) {
      Object.keys(GROUPS).forEach(key => {
        counts[key].textContent = data ? String(data[key].length) : "—";
        panel.querySelector(`[data-crew-count="${key}"]`).textContent = data ? String(data[key].length) : "0";
      });
    }
    function setBusy(value) {
      busy = value;
      panel.setAttribute("aria-busy", String(value));
      refresh.disabled = value || !playerReady;
      refresh.textContent = value ? "Checking crew…" : "Refresh crew";
    }
    function abort() {
      version++;
      controller?.abort();
      controller = null;
    }
    function select(playFabId) {
      abort();
      selectedId = playFabId;
      playerReady = false;
      crew = null;
      group = "friends";
      filter.value = "";
      controls.hidden = true;
      list.replaceChildren();
      updateCounts();
      setBusy(false);
      document.getElementById("crewPlayerId").textContent = playFabId || "No player selected";
      setStatus(playFabId ? "Waiting for this player's profile…" : "Select a player to inspect their crew.");
    }

    function render() {
      if (!crew) return;
      controls.hidden = false;
      panel.querySelectorAll("[data-crew-group]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.crewGroup === group));
      });
      heading.textContent = GROUPS[group].title;
      const query = filter.value.trim().toLowerCase();
      const rows = crew[group].filter(row => `${row.displayName} ${row.playFabId}`.toLowerCase().includes(query));
      list.replaceChildren();
      if (!rows.length) {
        list.append(element("li", "admin-crew-empty", query ? "No matches in this category." : GROUPS[group].empty));
        return;
      }
      rows.forEach(row => {
        const item = element("li", "admin-crew-contact");
        const avatar = element("img", "admin-crew-avatar");
        const avatarName = AVATARS.has(row.avatar) ? row.avatar : "avatar_roadbuilder";
        avatar.src = `./assets/crew-avatars/${avatarName}.png`;
        avatar.alt = "";
        avatar.loading = "lazy";
        avatar.addEventListener("error", () => {
          if (avatar.dataset.fallback) { avatar.hidden = true; return; }
          avatar.dataset.fallback = "true";
          avatar.src = "./assets/crew-avatars/avatar_roadbuilder.png";
        });
        const copy = element("div", "admin-crew-contact-copy");
        copy.append(element("strong", "admin-crew-name", row.displayName || "Builder"));
        copy.append(element("span", "admin-crew-id", `PlayFab ID: ${row.playFabId}`));
        const presence = element("span", "admin-crew-presence", row.online === true ? "Recently active in game"
          : row.online === false ? "Not recently active in game" : "Game presence unknown");
        presence.dataset.online = String(row.online);
        copy.append(presence);
        const view = element("button", "admin-crew-view", "View player →");
        view.type = "button";
        view.setAttribute("aria-label", `View player ${row.displayName || row.playFabId}`);
        view.addEventListener("click", () => openPlayer(row.playFabId));
        item.append(avatar, copy, view);
        list.append(item);
      });
    }

    async function load(playFabId = selectedId) {
      if (!playFabId || playFabId !== selectedId || !playerReady || busy) return;
      abort();
      const thisVersion = version;
      controller = new AbortController();
      const requestController = controller;
      const signal = requestController.signal;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; requestController.abort(); }, 30000);
      crew = null;
      controls.hidden = true;
      list.replaceChildren();
      updateCounts();
      setBusy(true);
      setStatus("Checking this player's confirmed friends and pending requests…", "loading");
      try {
        const data = await request(`/admin/player/${encodeURIComponent(playFabId)}/friends`, { signal });
        if (thisVersion !== version || playFabId !== selectedId) return;
        const result = data?.crew;
        if (data?.ok !== true || result?.playFabId !== selectedId || !Object.keys(GROUPS).every(key => Array.isArray(result[key]))) {
          throw new Error("Unexpected crew response. Check that the backend update is deployed.");
        }
        // Defensive validation; all names remain text nodes, never HTML.
        for (const key of Object.keys(GROUPS)) {
          if (!result[key].every(row => row && typeof row.playFabId === "string" && /^[a-zA-Z0-9_-]{3,64}$/.test(row.playFabId))) {
            throw new Error("The crew response contained an invalid player ID.");
          }
        }
        crew = result;
        updateCounts(crew);
        render();
        const stamp = new Date(crew.fetchedAt);
        const checked = Number.isNaN(stamp.getTime()) ? "Crew loaded." : `Last checked ${stamp.toLocaleString()}.`;
        setStatus(checked + (crew.avatarReadsUnavailable > 0 ? " Some portraits are using the default avatar." : ""), "ready");
      } catch (error) {
        if (thisVersion !== version || playFabId !== selectedId) return;
        const missingRoute = /404|not valid JSON/i.test(error.message || "");
        setStatus(timedOut ? "Crew check timed out. Please refresh to retry."
          : missingRoute ? "Crew endpoint unavailable. Deploy the server files first, then refresh."
          : `Crew unavailable: ${error.message || "Please retry."}`, "error");
      } finally {
        clearTimeout(timer);
        if (thisVersion === version) { controller = null; setBusy(false); }
      }
    }
    function ready(playFabId) {
      if (playFabId !== selectedId) return;
      playerReady = true;
      setBusy(false);
      void load(playFabId);
    }
    function unavailable(playFabId) {
      if (playFabId !== selectedId) return;
      setStatus("The selected profile could not be loaded. Reload the player before checking their crew.", "error");
    }
    refresh.addEventListener("click", () => { void load(); });
    filter.addEventListener("input", render);
    panel.querySelectorAll("[data-crew-group]").forEach(button => {
      button.addEventListener("click", () => { group = button.dataset.crewGroup; render(); });
    });
    return { select, ready, unavailable, dispose: () => select("") };
  }
  return { init };
})();
