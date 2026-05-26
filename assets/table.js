(function () {
  "use strict";

  const SETTINGS_KEY = "vending-survey-settings";
  const AUTH_CACHE_KEY = "vending-survey-auth";
  const AUTH_CACHE_MS = 6 * 60 * 60 * 1000;
  const authOverlay = document.getElementById("authOverlay");
  const authForm = document.getElementById("authForm");
  const authPassword = document.getElementById("authPassword");
  const authStatus = document.getElementById("authStatus");
  const loadTableBtn = document.getElementById("loadTableBtn");
  const tableStatus = document.getElementById("tableStatus");
  const dataTable = document.getElementById("dataTable");
  const toast = document.getElementById("toast");

  let appPassword = "";
  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add("hidden");
    }, 2200);
  }

  function loadTheme() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : {};
      const theme = settings.theme === "light" ? "light" : "dark";
      document.body.dataset.theme = theme;

      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute("content", theme === "light" ? "#f4f7fb" : "#0c0f16");
      }
    } catch (_err) {
      document.body.dataset.theme = "dark";
    }
  }

  function endpointUrl() {
    return window.SURVEY_CONFIG && window.SURVEY_CONFIG.scriptUrl;
  }

  function configuredEndpoint() {
    const endpoint = endpointUrl();
    return endpoint && !endpoint.includes("YOUR_SCRIPT_ID");
  }

  function readCachedPassword() {
    try {
      const raw = localStorage.getItem(AUTH_CACHE_KEY);
      if (!raw) return "";

      const cached = JSON.parse(raw);
      if (!cached.password || !cached.expiresAt || cached.expiresAt <= Date.now()) {
        localStorage.removeItem(AUTH_CACHE_KEY);
        return "";
      }

      return cached.password;
    } catch (_err) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      return "";
    }
  }

  function cachePassword(password) {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      password: password,
      expiresAt: Date.now() + AUTH_CACHE_MS,
    }));
  }

  function clearCachedPassword() {
    localStorage.removeItem(AUTH_CACHE_KEY);
  }

  function setLocked(locked) {
    authOverlay.classList.toggle("hidden", !locked);
    loadTableBtn.disabled = locked;

    if (locked) {
      setTimeout(function () {
        authPassword.focus();
      }, 0);
    }
  }

  async function verifyPassword(password) {
    const url = new URL(endpointUrl());
    url.searchParams.set("action", "auth");
    url.searchParams.set("password", password);

    const response = await fetch(url.toString(), { method: "GET" });
    const payload = await response.json();
    return Boolean(payload.ok);
  }

  async function unlockWithCachedPassword() {
    const cachedPassword = readCachedPassword();
    if (!cachedPassword) return false;

    try {
      if (!(await verifyPassword(cachedPassword))) {
        clearCachedPassword();
        return false;
      }

      appPassword = cachedPassword;
      setLocked(false);
      return true;
    } catch (_err) {
      clearCachedPassword();
      return false;
    }
  }

  function renderTable(headers, rows) {
    dataTable.textContent = "";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(function (header) {
      const th = document.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      headers.forEach(function (_header, index) {
        const td = document.createElement("td");
        td.textContent = row[index] || "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    dataTable.appendChild(thead);
    dataTable.appendChild(tbody);
  }

  async function loadTableData() {
    if (!configuredEndpoint()) {
      tableStatus.textContent = "Add script URL first";
      return;
    }

    if (!appPassword) {
      setLocked(true);
      return;
    }

    const url = new URL(endpointUrl());
    url.searchParams.set("action", "rows");
    url.searchParams.set("password", appPassword);

    loadTableBtn.disabled = true;
    tableStatus.textContent = "Loading...";

    try {
      const response = await fetch(url.toString(), { method: "GET" });
      const payload = await response.json();

      if (!payload.ok) {
        throw new Error(payload.error || "Could not load table");
      }

      renderTable(payload.headers || [], payload.rows || []);
      tableStatus.textContent = (payload.rows || []).length + " rows loaded";
    } catch (err) {
      tableStatus.textContent = "Table load failed";
      showToast("Could not load table data");
    } finally {
      loadTableBtn.disabled = false;
    }
  }

  authForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!configuredEndpoint()) {
      authStatus.textContent = "Add script URL first";
      return;
    }

    const password = authPassword.value;
    authStatus.textContent = "Checking...";

    try {
      if (!(await verifyPassword(password))) {
        authStatus.textContent = "Wrong password";
        authPassword.select();
        return;
      }

      appPassword = password;
      cachePassword(password);
      authPassword.value = "";
      authStatus.textContent = "";
      setLocked(false);
      loadTableData();
    } catch (err) {
      authStatus.textContent = "Password check failed";
    }
  });

  loadTableBtn.addEventListener("click", loadTableData);

  loadTheme();

  if (configuredEndpoint()) {
    unlockWithCachedPassword().then(function (unlocked) {
      if (unlocked) {
        loadTableData();
      } else {
        setLocked(true);
      }
    });
  } else {
    setLocked(false);
    tableStatus.textContent = "Add script URL first";
  }
})();
