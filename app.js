const storageKey = "shot-tracker-records";

const form = document.querySelector("#shot-form");
const personNameInput = document.querySelector("#person-name");
const dosageAmountInput = document.querySelector("#dosage-amount");
const dosageUnitInput = document.querySelector("#dosage-unit");
const lastDateInput = document.querySelector("#last-date");
const repeatDaysInput = document.querySelector("#repeat-days");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const clearAllButton = document.querySelector("#clear-all");
const exportButton = document.querySelector("#export-records");
const importButton = document.querySelector("#import-records");
const importFileInput = document.querySelector("#import-file");
const searchInput = document.querySelector("#record-search");
const recordList = document.querySelector("#record-list");
const emptyState = document.querySelector("#empty-state");
const recordCount = document.querySelector("#record-count");
const lastUpdated = document.querySelector("#last-updated");
const personTemplate = document.querySelector("#person-template");
const shotTemplate = document.querySelector("#shot-template");

let records = loadRecords();
let editingId = null;

saveRecords({ alertOnError: false });
setDefaultDate();
renderRecords();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const personName = personNameInput.value.trim();
  const dosageAmount = normalizeAmount(dosageAmountInput.value);
  const dosageUnit = dosageUnitInput.value;
  const lastDate = lastDateInput.value;
  const repeatDays = normalizeRepeatDays(repeatDaysInput.value);

  if (!personName || !dosageAmount || !lastDate) {
    return;
  }

  if (!isValidDate(lastDate)) {
    window.alert("Choose a valid date and time.");
    return;
  }

  if (repeatDaysInput.value && repeatDays === null) {
    window.alert("Repeat days must be a whole number greater than zero.");
    return;
  }

  if (new Date(lastDate).getTime() > Date.now() + 60000) {
    const confirmed = window.confirm("That date is in the future. Save it anyway?");
    if (!confirmed) {
      return;
    }
  }

  const recordData = {
    personName,
    dosageAmount,
    dosageUnit,
    lastDate,
    repeatDays,
    updatedAt: Date.now(),
  };

  if (editingId) {
    records = records.map((record) =>
      record.id === editingId ? { ...record, ...recordData } : record,
    );
    editingId = null;
  } else {
    records.unshift({
      id: createId(),
      ...recordData,
      createdAt: Date.now(),
    });
  }

  saveRecords();
  resetForm();
  renderRecords();
});

cancelEditButton.addEventListener("click", () => {
  editingId = null;
  resetForm();
});

clearAllButton.addEventListener("click", () => {
  if (!records.length) {
    return;
  }

  const confirmed = window.confirm("Clear every saved record?");
  if (!confirmed) {
    return;
  }

  records = [];
  editingId = null;
  saveRecords();
  resetForm();
  renderRecords();
});

exportButton.addEventListener("click", () => {
  if (!records.length) {
    return;
  }

  const payload = {
    app: "shot-tracker",
    exportedAt: new Date().toISOString(),
    records,
  };
  const backup = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(backup);
  const link = document.createElement("a");

  link.href = url;
  link.download = `shot-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

importButton.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", () => {
  const [file] = importFileInput.files;
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedRecords = Array.isArray(parsed) ? parsed : parsed.records;

      if (!Array.isArray(importedRecords)) {
        throw new Error("Backup does not contain records.");
      }

      const existingIds = new Set(records.map((record) => record.id));
      const normalizedRecords = importedRecords.map((record) => {
        const normalizedRecord = normalizeRecord(record);
        normalizedRecord.id = uniqueId(existingIds, normalizedRecord.id);
        return normalizedRecord;
      });

      if (!normalizedRecords.length) {
        throw new Error("Backup is empty.");
      }

      records = [...normalizedRecords, ...records].sort(sortByLastDateDesc);
      saveRecords();
      editingId = null;
      resetForm();
      renderRecords();
      window.alert(`${normalizedRecords.length} record(s) imported.`);
    } catch {
      window.alert("That backup file could not be imported.");
    } finally {
      importFileInput.value = "";
    }
  });
  reader.readAsText(file);
});

searchInput.addEventListener("input", renderRecords);

recordList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const row = event.target.closest("[data-id]");

  if (!button || !row) {
    return;
  }

  const record = records.find((item) => item.id === row.dataset.id);
  if (!record) {
    return;
  }

  if (button.classList.contains("edit-button")) {
    editingId = record.id;
    personNameInput.value = record.personName;
    dosageAmountInput.value = record.dosageAmount;
    dosageUnitInput.value = knownUnit(record.dosageUnit) ? record.dosageUnit : "other";
    lastDateInput.value = normalizeDateInput(record.lastDate);
    repeatDaysInput.value = record.repeatDays || "";
    setFormMode("edit");
    personNameInput.focus();
  }

  if (button.classList.contains("delete-button")) {
    records = records.filter((item) => item.id !== record.id);
    if (editingId === record.id) {
      editingId = null;
      resetForm();
    }
    saveRecords();
    renderRecords();
  }
});

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    const storedRecords = Array.isArray(parsed) ? parsed : parsed?.records;
    return Array.isArray(storedRecords)
      ? storedRecords.map(normalizeRecord).sort(sortByLastDateDesc)
      : [];
  } catch {
    return [];
  }
}

function saveRecords(options = {}) {
  const { alertOnError = true } = options;

  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
    return true;
  } catch {
    if (alertOnError) {
      window.alert("This browser could not save the records.");
    }
    return false;
  }
}

function renderRecords() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const visibleRecords = records
    .filter((record) => record.personName.toLowerCase().includes(searchTerm))
    .sort(sortByLastDateDesc);
  const groupedRecords = groupByPerson(visibleRecords);

  recordList.innerHTML = "";
  recordCount.textContent = records.length;
  emptyState.classList.toggle("hidden", visibleRecords.length > 0);
  clearAllButton.disabled = records.length === 0;
  exportButton.disabled = records.length === 0;

  lastUpdated.textContent = records.length
    ? `Newest: ${formatDate(recordsSortedByDate()[0].lastDate)}`
    : "No records yet";

  groupedRecords.forEach((group) => {
    const personCard = personTemplate.content.firstElementChild.cloneNode(true);
    const historyList = personCard.querySelector(".history-list");
    const shotCount = group.records.length;

    personCard.querySelector("h3").textContent = group.personName;
    personCard.querySelector(".person-summary").textContent =
      `${shotCount} shot${shotCount === 1 ? "" : "s"} saved`;
    personCard.querySelector(".time-badge").textContent = timeAgo(
      group.records[0].lastDate,
    );

    group.records.forEach((record) => {
      const shotRow = shotTemplate.content.firstElementChild.cloneNode(true);
      const dueLine = shotRow.querySelector(".due-line");
      const due = getDueInfo(record);

      shotRow.dataset.id = record.id;
      shotRow.querySelector(".dosage").textContent = `Dose: ${formatDosage(record)}`;
      shotRow.querySelector(".date-line").textContent = `Last had it: ${formatDate(
        record.lastDate,
      )}`;

      if (due) {
        dueLine.textContent = due.text;
        dueLine.classList.add(due.status);
      } else {
        dueLine.classList.add("hidden");
      }

      historyList.append(shotRow);
    });

    recordList.append(personCard);
  });

  if (records.length > 0 && visibleRecords.length === 0) {
    emptyState.querySelector("strong").textContent = "No matching records.";
    emptyState.querySelector("span").textContent = "Try a different name.";
  } else {
    emptyState.querySelector("strong").textContent = "No shots tracked yet.";
    emptyState.querySelector("span").textContent = "Add the first record above.";
  }
}

function normalizeRecord(record) {
  const parsedDose = parseDoseText(record?.dosageAmount);
  const rawUnit = record?.dosageUnit || parsedDose.unit;
  const repeatDays = normalizeRepeatDays(record?.repeatDays);

  return {
    id: cleanString(record?.id) || createId(),
    personName: cleanString(record?.personName || record?.name) || "Unnamed",
    dosageAmount: parsedDose.amount || cleanString(record?.dosageAmount) || "0",
    dosageUnit: knownUnit(rawUnit) ? normalizeUnit(rawUnit) : "other",
    lastDate: normalizeDateInput(record?.lastDate || record?.lastHadIt || Date.now()),
    repeatDays,
    createdAt: Number(record?.createdAt) || Date.now(),
    updatedAt: Number(record?.updatedAt) || Date.now(),
  };
}

function groupByPerson(items) {
  const groups = new Map();

  items.forEach((record) => {
    const key = record.personName.trim().toLowerCase();
    const group = groups.get(key) || {
      personName: record.personName,
      records: [],
    };

    group.records.push(record);
    group.records.sort(sortByLastDateDesc);
    group.personName = group.records[0].personName;
    groups.set(key, group);
  });

  return [...groups.values()].sort((first, second) => {
    return sortByLastDateDesc(first.records[0], second.records[0]);
  });
}

function getDueInfo(record) {
  if (!record.repeatDays) {
    return null;
  }

  const lastDate = new Date(record.lastDate);
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + Number(record.repeatDays));

  const today = startOfDay(new Date());
  const nextDay = startOfDay(nextDate);
  const diffDays = Math.round((nextDay - today) / 86400000);
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(nextDate);

  if (diffDays < 0) {
    const daysLate = Math.abs(diffDays);
    return {
      text: `${daysLate} day${daysLate === 1 ? "" : "s"} late`,
      status: "overdue",
    };
  }

  if (diffDays === 0) {
    return {
      text: "Due today",
      status: "due-today",
    };
  }

  return {
    text: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"} (${formattedDate})`,
    status: "upcoming",
  };
}

function parseDoseText(value) {
  const rawValue = cleanString(value);
  const match = rawValue.match(/^(\d+(?:\.\d+)?)\s*(mL|mg|units?)?$/i);

  if (!match) {
    return { amount: rawValue, unit: "" };
  }

  return {
    amount: match[1],
    unit: match[2] ? normalizeUnit(match[2]) : "",
  };
}

function normalizeAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function normalizeRepeatDays(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const repeatDays = Number.parseInt(value, 10);
  return Number.isInteger(repeatDays) && repeatDays > 0 ? repeatDays : null;
}

function formatDosage(record) {
  const unit = record.dosageUnit === "other" ? "" : record.dosageUnit;
  return [record.dosageAmount, unit].filter(Boolean).join(" ");
}

function cleanString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function knownUnit(value) {
  return ["mL", "mg", "units", "other"].includes(normalizeUnit(value));
}

function normalizeUnit(value) {
  const unit = cleanString(value).toLowerCase();

  if (unit === "ml") {
    return "mL";
  }

  if (unit === "mg") {
    return "mg";
  }

  if (unit === "unit" || unit === "units") {
    return "units";
  }

  if (unit === "other") {
    return "other";
  }

  return "";
}

function uniqueId(existingIds, preferredId) {
  let id = preferredId || createId();

  while (existingIds.has(id)) {
    id = createId();
  }

  existingIds.add(id);
  return id;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recordsSortedByDate() {
  return [...records].sort(sortByLastDateDesc);
}

function sortByLastDateDesc(first, second) {
  return new Date(second.lastDate) - new Date(first.lastDate);
}

function setFormMode(mode) {
  const isEditing = mode === "edit";
  submitButton.textContent = isEditing ? "Update record" : "Save record";
  document.querySelector("#form-title").textContent = isEditing
    ? "Edit record"
    : "Add a record";
  cancelEditButton.classList.toggle("hidden", !isEditing);
}

function resetForm() {
  form.reset();
  dosageUnitInput.value = "mL";
  setDefaultDate();
  setFormMode("add");
}

function setDefaultDate() {
  lastDateInput.value = formatDateTimeInput(new Date());
}

function normalizeDateInput(value) {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? formatDateTimeInput(new Date())
      : formatDateTimeInput(date);
  }

  const rawValue = cleanString(value);

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawValue)) {
    return rawValue.slice(0, 16);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? formatDateTimeInput(new Date())
    : formatDateTimeInput(date);
}

function formatDateTimeInput(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timeAgo(value) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(Math.abs(diffMs) / 60000);
  const tense = diffMs >= 0 ? "ago" : "from now";

  if (diffMinutes < 60) {
    return `${diffMinutes || 1} min ${tense}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours} hr ${tense}`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 60) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ${tense}`;
  }

  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths} mo ${tense}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
