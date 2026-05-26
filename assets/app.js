(function () {
  "use strict";

  const COLUMNS = [
    "areaDistrict",
    "address",
    "buildingName",
    "buildingType",
    "peopleCount",
    "existingMachine",
    "operatorName",
    "machineQuality",
    "cardPayment",
    "coffeeAvailable",
    "nearbyFood",
    "accessDifficulty",
    "notes",
    "potentialScore",
  ];

  const SHEET_HEADERS = [
    "Area/District",
    "Address",
    "Building Name",
    "Building Type",
    "Estimated People Count",
    "Existing Machine?",
    "Operator Name",
    "Machine Quality (1-5)",
    "Card Payment?",
    "Coffee Available?",
    "Nearby Food Distance",
    "Access Difficulty",
    "Notes",
    "Potential Score (1-10)",
  ];

  const DRAFT_KEY = "vending-survey-draft";
  const SETTINGS_KEY = "vending-survey-settings";
  const AUTH_CACHE_KEY = "vending-survey-auth";
  const AUTH_CACHE_MS = 6 * 60 * 60 * 1000;
  const DEFAULT_SETTINGS = {
    requiredCheck: true,
    theme: "dark",
  };

  const form = document.getElementById("surveyForm");
  const submitBtn = document.getElementById("submitBtn");
  const nextBtn = document.getElementById("nextBtn");
  const backBtn = document.getElementById("backBtn");
  const gpsBtn = document.getElementById("gpsBtn");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel = document.getElementById("settingsPanel");
  const requiredCheckToggle = document.getElementById("requiredCheckToggle");
  const themeToggle = document.getElementById("themeToggle");
  const statusMsg = document.getElementById("statusMsg");
  const toast = document.getElementById("toast");
  const authOverlay = document.getElementById("authOverlay");
  const authForm = document.getElementById("authForm");
  const authPassword = document.getElementById("authPassword");
  const authStatus = document.getElementById("authStatus");
  const draftBadge = document.getElementById("draftBadge");
  const existingMachineFields = document.getElementById("existingMachineFields");
  const qualityHint = document.getElementById("qualityHint");
  const potentialHint = document.getElementById("potentialHint");
  const steps = Array.from(document.querySelectorAll(".survey-step"));
  const stepLabel = document.getElementById("stepLabel");
  const progressPercent = document.getElementById("progressPercent");
  const progressFill = document.getElementById("progressFill");

  const selections = {};
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let currentStep = 0;
  let saveTimer = null;
  let toastTimer = null;
  let appPassword = "";

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add("hidden");
    }, 2200);
  }

  function setStatus(message, type) {
    statusMsg.textContent = message || "";
    statusMsg.className = "status" + (type ? " " + type : "");
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
      }
    } catch (_err) {
      settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

  function clearValidationMarks() {
    form.querySelectorAll(".invalid").forEach(function (el) {
      el.classList.remove("invalid");
    });

    form.querySelectorAll(".group-invalid").forEach(function (el) {
      el.classList.remove("group-invalid");
    });
  }

  function applySettings() {
    document.body.dataset.theme = settings.theme;
    requiredCheckToggle.checked = settings.requiredCheck;
    themeToggle.checked = settings.theme === "light";

    const themeColor = settings.theme === "light" ? "#f4f7fb" : "#0c0f16";
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", themeColor);
    }

    if (!settings.requiredCheck) {
      clearValidationMarks();
      setStatus("Required checks are off");
    }
  }

  function getGroup(name) {
    return document.querySelector('[data-name="' + name + '"]');
  }

  function setGroupValue(name, value) {
    const group = getGroup(name);
    if (!group) return;

    selections[name] = value || "";

    group.querySelectorAll(".chip, .score-btn").forEach(function (btn) {
      btn.classList.toggle("selected", btn.dataset.value === value);
    });

    group.classList.remove("group-invalid");
  }

  function getGroupValue(name) {
    return selections[name] || "";
  }

  function readFormData() {
    const data = {};
    COLUMNS.forEach(function (key) {
      data[key] = "";
    });

    form.querySelectorAll("input[type='text'], select, textarea").forEach(function (el) {
      if (el.name) {
        data[el.name] = el.value.trim();
      }
    });

    Object.keys(selections).forEach(function (key) {
      data[key] = selections[key] || "";
    });

    if (data.existingMachine !== "yes") {
      data.operatorName = "";
      data.machineQuality = "";
    }

    return data;
  }

  function writeFormData(data) {
    form.querySelectorAll("input[type='text'], select, textarea").forEach(function (el) {
      if (el.name && data[el.name] != null) {
        el.value = data[el.name];
      }
    });

    Object.keys(data).forEach(function (key) {
      if (getGroup(key)) {
        setGroupValue(key, data[key] || "");
      }
    });

    toggleExistingFields(data.existingMachine === "yes");
  }

  function rowValues(data) {
    return COLUMNS.map(function (key) {
      return data[key] || "";
    });
  }

  function saveDraft() {
    const data = readFormData();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    draftBadge.classList.remove("hidden");
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 350);
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      writeFormData(JSON.parse(raw));
      draftBadge.classList.remove("hidden");
    } catch (_err) {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    draftBadge.classList.add("hidden");
  }

  function toggleExistingFields(show) {
    existingMachineFields.classList.toggle("collapsed", !show);
  }

  function updateWizard() {
    const total = steps.length;
    const progress = Math.round(((currentStep + 1) / total) * 100);

    steps.forEach(function (step, index) {
      step.classList.toggle("active", index === currentStep);
    });

    stepLabel.textContent = "Step " + (currentStep + 1) + " of " + total + " - " +
      (steps[currentStep].dataset.stepTitle || "");
    progressPercent.textContent = progress + "%";
    progressFill.style.width = progress + "%";

    backBtn.disabled = currentStep === 0;
    nextBtn.classList.toggle("hidden", currentStep === total - 1);
    submitBtn.classList.toggle("hidden", currentStep !== total - 1);
  }

  function goToStep(index) {
    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    updateWizard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(stepIndex) {
    if (!settings.requiredCheck) {
      clearValidationMarks();
      return true;
    }

    const scope = steps[stepIndex];
    const requiredGroups = scope.querySelectorAll("[data-required='true']");
    let ok = true;
    const missing = [];

    requiredGroups.forEach(function (group) {
      const name = group.dataset.name;
      const value = getGroupValue(name);
      if (!value) {
        group.classList.add("group-invalid");
        missing.push(name);
        ok = false;
      } else {
        group.classList.remove("group-invalid");
      }
    });

    ["areaDistrict", "address"].forEach(function (name) {
      const input = form.elements[name];
      if (!scope.contains(input)) return;
      if (!input.value.trim()) {
        input.classList.add("invalid");
        missing.push(name);
        ok = false;
      } else {
        input.classList.remove("invalid");
      }
    });

    if (!ok) {
      setStatus("Fill required fields: " + missing.join(", "), "error");
      const firstInvalid = scope.querySelector(".invalid, .group-invalid");
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    return ok;
  }

  function validateAllSteps() {
    if (!settings.requiredCheck) {
      clearValidationMarks();
      setStatus("");
      return true;
    }

    for (let i = 0; i < steps.length; i += 1) {
      if (!validateStep(i)) {
        goToStep(i);
        validateStep(i);
        return false;
      }
    }

    setStatus("");
    return true;
  }

  function endpointUrl() {
    return window.SURVEY_CONFIG && window.SURVEY_CONFIG.scriptUrl;
  }

  function configuredEndpoint() {
    const endpoint = endpointUrl();
    return endpoint && !endpoint.includes("YOUR_SCRIPT_ID");
  }

  function setLocked(locked) {
    authOverlay.classList.toggle("hidden", !locked);
    submitBtn.disabled = locked;
    nextBtn.disabled = locked;
    backBtn.disabled = locked || currentStep === 0;

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
      setStatus("Connected to Google Sheet", "success");
      return true;
    } catch (_err) {
      clearCachedPassword();
      return false;
    }
  }

  function requirePassword() {
    if (!configuredEndpoint()) {
      setLocked(false);
      return;
    }

    setLocked(true);
    authStatus.textContent = "";
  }

  function fillGpsCoordinates() {
    if (!navigator.geolocation) {
      setStatus("GPS is not supported by this browser", "error");
      return;
    }

    gpsBtn.disabled = true;
    setStatus("Getting GPS location...");

    navigator.geolocation.getCurrentPosition(
      function (position) {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        const accuracy = Math.round(position.coords.accuracy);
        const input = form.elements.address;

        input.value = latitude + ", " + longitude;
        input.classList.remove("invalid");
        scheduleSave();
        setStatus("GPS saved. Accuracy about " + accuracy + " m", "success");
        showToast("GPS coordinates filled");
        gpsBtn.disabled = false;
      },
      function (error) {
        const messages = {
          1: "Location permission denied",
          2: "GPS position unavailable",
          3: "GPS timed out",
        };

        setStatus(messages[error.code] || "Could not get GPS location", "error");
        gpsBtn.disabled = false;
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 12000,
      }
    );
  }

  function resetForm() {
    form.reset();
    Object.keys(selections).forEach(function (key) {
      setGroupValue(key, "");
    });
    toggleExistingFields(false);
    setStatus("");
    qualityHint.textContent = "Tap a score";
    potentialHint.textContent = "1-3 bad / 4-6 maybe / 7-8 strong / 9-10 investigate now";
    goToStep(0);
  }

  async function submitToSheet(data) {
    const endpoint = endpointUrl();

    if (!configuredEndpoint()) {
      setStatus("No Google Sheets script URL configured", "error");
      return;
    }

    if (!appPassword) {
      requirePassword();
      return;
    }

    submitBtn.disabled = true;
    setStatus("Submitting...");

    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          password: appPassword,
          row: rowValues(data),
        }),
      });

      setStatus("Submitted", "success");
      showToast("Saved to Google Sheet");
      resetForm();
      clearDraft();
    } catch (err) {
      setStatus("Submit failed", "error");
      showToast("Network error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  document.querySelectorAll("[data-name]").forEach(function (group) {
    group.addEventListener("click", function (event) {
      const btn = event.target.closest(".chip, .score-btn");
      if (!btn || !group.contains(btn)) return;

      const name = group.dataset.name;
      const value = btn.dataset.value;
      setGroupValue(name, value);

      if (name === "existingMachine") {
        toggleExistingFields(value === "yes");
        if (value !== "yes") {
          setGroupValue("machineQuality", "");
          form.elements.operatorName.value = "";
        }
      }

      if (name === "machineQuality") {
        qualityHint.textContent = btn.title || value;
      }

      if (name === "potentialScore") {
        const score = Number(value);
        if (score <= 3) potentialHint.textContent = "Bad fit";
        else if (score <= 6) potentialHint.textContent = "Maybe. Worth tracking";
        else if (score <= 8) potentialHint.textContent = "Strong candidate";
        else potentialHint.textContent = "Investigate immediately";
      }

      if (name === "peopleCountQuick") {
        form.elements.peopleCount.value = value;
      }

      scheduleSave();
    });
  });

  document.querySelectorAll(".preset").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const target = form.elements[btn.dataset.target];
      if (target) {
        target.value = btn.dataset.value;
        scheduleSave();
      }
    });
  });

  document.querySelectorAll(".note-tag").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const notes = form.elements.notes;
      const tag = btn.dataset.value;
      if (!notes.value.includes(tag)) {
        notes.value = notes.value ? notes.value.trim() + ", " + tag : tag;
        scheduleSave();
      }
    });
  });

  form.addEventListener("input", scheduleSave);
  settingsToggle.addEventListener("click", function () {
    settingsPanel.classList.toggle("hidden");
  });
  authForm.addEventListener("submit", async function (event) {
    event.preventDefault();

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
      setStatus("Connected to Google Sheet", "success");
    } catch (err) {
      authStatus.textContent = "Password check failed";
    }
  });
  requiredCheckToggle.addEventListener("change", function () {
    settings.requiredCheck = requiredCheckToggle.checked;
    saveSettings();
    applySettings();
    showToast(settings.requiredCheck ? "Required checks on" : "Required checks off");
  });
  themeToggle.addEventListener("change", function () {
    settings.theme = themeToggle.checked ? "light" : "dark";
    saveSettings();
    applySettings();
  });
  gpsBtn.addEventListener("click", fillGpsCoordinates);
  backBtn.addEventListener("click", function () {
    goToStep(currentStep - 1);
  });
  nextBtn.addEventListener("click", function () {
    if (!validateStep(currentStep)) return;
    setStatus("");
    goToStep(currentStep + 1);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const data = readFormData();
    if (!validateAllSteps()) return;
    submitToSheet(data);
  });

  loadSettings();
  applySettings();
  loadDraft();
  updateWizard();

  if (configuredEndpoint()) {
    unlockWithCachedPassword().then(function (unlocked) {
      if (!unlocked) {
        requirePassword();
      }
    });
  } else {
    setStatus("Add script URL for submit");
  }
})();
