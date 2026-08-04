const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE = isLocal
  ? "http://localhost:3000/api"
  : "https://roadimentary-admin-dashboard.onrender.com/api";

const LANDING_LOGIN_URL = isLocal
  ? "http://127.0.0.1:5500/?open=account&destination=admin"
  : "https://roadimentary-website.onrender.com/?open=account&destination=admin";

const DASHBOARD_URL = "./admin-dashboard.html";

const entryCard = document.querySelector(".admin-entry-card");
const statusText = document.getElementById("status");
const landingLink = document.getElementById("landing-login-link");

if (landingLink) landingLink.href = LANDING_LOGIN_URL;

function setEntryState(state, message) {
  if (entryCard) entryCard.dataset.entryState = state;
  if (statusText) statusText.textContent = message;
}

function getStoredAdminToken() {
  const sessionToken = sessionStorage.getItem("adminToken");
  if (sessionToken) return sessionToken;

  // Migrate a still-valid token from the old persistent login implementation.
  const legacyToken = localStorage.getItem("adminToken");

  if (legacyToken) {
    sessionStorage.setItem("adminToken", legacyToken);
    localStorage.removeItem("adminToken");
    return legacyToken;
  }

  return null;
}

function clearAdminToken() {
  sessionStorage.removeItem("adminToken");
  localStorage.removeItem("adminToken");
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function validateExistingSession(token) {
  const response = await fetch(`${API_BASE}/admin/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    clearAdminToken();
    return false;
  }

  return true;
}

async function consumeHandoff(code) {
  const response = await fetch(`${API_BASE}/auth/admin-handoff/consume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code }),
    cache: "no-store"
  });

  const data = await readJsonResponse(response);

  if (!response.ok || !data?.token) {
    throw new Error(
      data?.message || "The dashboard handoff could not be verified."
    );
  }

  clearAdminToken();
  sessionStorage.setItem("adminToken", data.token);
}

function openDashboard() {
  setEntryState("success", "Access confirmed. Opening the operations dashboard...");

  window.setTimeout(() => {
    window.location.replace(DASHBOARD_URL);
  }, 350);
}

async function initializeAdminEntry() {
  const url = new URL(window.location.href);
  const handoffCode = url.searchParams.get("handoff");

  // Remove the credential from the visible URL and browser history immediately.
  if (handoffCode) {
    window.history.replaceState({}, document.title, url.pathname);

    try {
      setEntryState("loading", "Confirming your one-time administrator handoff...");
      await consumeHandoff(handoffCode);
      openDashboard();
    } catch (error) {
      clearAdminToken();
      setEntryState(
        "error",
        `${error.message} Return to the landing page and sign in again.`
      );
    }

    return;
  }

  const existingToken = getStoredAdminToken();

  if (existingToken) {
    try {
      setEntryState("loading", "Checking your existing administrator session...");

      if (await validateExistingSession(existingToken)) {
        openDashboard();
        return;
      }
    } catch (error) {
      clearAdminToken();
    }
  }

  setEntryState(
    "idle",
    "Admin access now begins from the Roadimentary landing-page login."
  );
}

initializeAdminEntry();
