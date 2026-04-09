console.log("admin-login.js loaded");

const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const statusText = document.getElementById("status");

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const API_BASE = isLocal
  ? "http://localhost:3000/api"
  : "https://roadimentary-admin-dashboard.onrender.com/api";

if (!loginBtn || !usernameInput || !passwordInput || !statusText) {
  console.error("Admin login page is missing required elements.");
} else {
  loginBtn.addEventListener("click", async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      statusText.textContent = "Please enter both username and password.";
      return;
    }

    statusText.textContent = "Logging in...";

    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      console.log("Login response:", data);

      if (!response.ok) {
        statusText.textContent = data.message || "Login failed.";
        return;
      }

      localStorage.setItem("adminToken", data.token);
      console.log("Saved token:", localStorage.getItem("adminToken"));

      statusText.textContent = "Login successful.";
      window.location.href = "./admin-dashboard.html";
    } catch (error) {
      console.error("Admin login error:", error);
      statusText.textContent = "Could not connect to backend.";
    }
  });
}