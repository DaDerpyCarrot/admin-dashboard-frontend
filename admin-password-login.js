const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE = isLocal
  ? "http://localhost:3000/api"
  : "https://roadimentary-admin-dashboard.onrender.com/api";

const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const statusText = document.getElementById("status");

async function submitLegacyLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    statusText.textContent = "Please enter both username and password.";
    return;
  }

  loginBtn.disabled = true;
  statusText.textContent = "Signing in through the temporary fallback...";

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password }),
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok || !data?.token) {
      statusText.textContent = data?.message || "Login failed.";
      return;
    }

    localStorage.removeItem("adminToken");
    sessionStorage.setItem("adminToken", data.token);
    statusText.textContent = "Login successful. Opening dashboard...";
    window.location.replace("./admin-dashboard.html");
  } catch (error) {
    statusText.textContent = "Could not connect to the admin server.";
  } finally {
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener("click", submitLegacyLogin);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitLegacyLogin();
});
