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
  const form = document.getElementById("surveyForm");
  const submitBtn = document.getElementById("submitBtn");
  const copyRowBtn = document.getElementById("copyRowBtn");
  const statusMsg = document.getElementById("statusMsg");
  const toast = document.getElementById("toast");
  const draftBadge = document.getElementById("draftBadge");
  const existingMachineFields = document.getElementById("existingMachineFields");
  const qualityHint = document.getElementById("qualityHint");
  const potentialHint = document.getElementById("potentialHint");

  const selections = {};
  let saveTimer = null;
  let toastTimer = null;

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

    form.querySelectorAll("input[type='text'], textarea").forEach(function (el) {
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
    form.querySelectorAll("input[type='text'], textarea").forEach(function (el) {
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

  function toTsv(values) {
    return values
      .map(function (value) {
        const text = String(value);
        if (/[\t"\n]/.test(text)) {
          return '"' + text.replace(/"/g, '""') + '"';
        }
        return text;
      })
      .join("\t");
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
    existingMachineFields.classList.toggle("hidden", !show);
  }

  function validate(data) {
    const requiredGroups = document.querySelectorAll("[data-required='true']");
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
      if (!input.value.trim()) {
        input.classList.add("invalid");
        ok = false;
      } else {
        input.classList.remove("invalid");
      }
    });

    if (!ok) {
      setStatus("Fill required fields: " + missing.join(", "), "error");
      const firstInvalid = form.querySelector(".invalid, .group-invalid");
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    return ok;
  }

  function resetForm() {
    form.reset();
    Object.keys(selections).forEach(function (key) {
      setGroupValue(key, "");
    });
    toggleExistingFields(false);
    setStatus("");
    qualityHint.textContent = "Tap a score";
    potentialHint.textContent = "1–3 bad · 4–6 maybe · 7–8 strong · 9–10 investigate now";
  }

  async function copyRow() {
    const data = readFormData();
    const tsv = toTsv(rowValues(data));

    try {
      await navigator.clipboard.writeText(tsv);
      showToast("Row copied — paste into Sheet1");
    } catch (_err) {
      const area = document.createElement("textarea");
      area.value = tsv;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      showToast("Row copied");
    }
  }

  async function submitToSheet(data) {
    const endpoint = window.SURVEY_CONFIG && window.SURVEY_CONFIG.scriptUrl;

    if (!endpoint || endpoint.includes("YOUR_SCRIPT_ID")) {
      await copyRow();
      setStatus("No script URL configured — row copied instead", "success");
      resetForm();
      clearDraft();
      return;
    }

    submitBtn.disabled = true;
    setStatus("Submitting…");

    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          secret: window.SURVEY_CONFIG.secret || "",
          row: rowValues(data),
        }),
      });

      setStatus("Submitted", "success");
      showToast("Saved to Google Sheet");
      resetForm();
      clearDraft();
    } catch (err) {
      setStatus("Submit failed — use Copy row", "error");
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
        else if (score <= 6) potentialHint.textContent = "Maybe — worth tracking";
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
  copyRowBtn.addEventListener("click", copyRow);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const data = readFormData();
    if (!validate(data)) return;
    submitToSheet(data);
  });

  loadDraft();

  if (window.SURVEY_CONFIG && window.SURVEY_CONFIG.scriptUrl &&
      !window.SURVEY_CONFIG.scriptUrl.includes("YOUR_SCRIPT_ID")) {
    setStatus("Connected to Google Sheet");
  } else {
    setStatus("Copy row works now · add script URL for auto-submit");
  }
})();
