const storageKey = "shot-tracker-records";

const form = document.querySelector("#shot-form");
const personNameInput = document.querySelector("#person-name");
const dosageAmountInput = document.querySelector("#dosage-amount");
const lastDateInput = document.querySelector("#last-date");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const clearAllButton = document.querySelector("#clear-all");
const searchInput = document.querySelector("#record-search");
const recordList = document.querySelector("#record-list");
const emptyState = document.querySelector("#empty-state");
const recordCount = document.querySelector("#record-count");
const lastUpdated = document.querySelector("#last-updated");
const template = document.querySelector("#record-template");

let records = loadRecords();
let editingId = null;

setDefaultDate();
renderRecords();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const personName = personNameInput.value.trim();
  const dosageAmount = dosageAmountInput.value.trim();
  const lastDate = lastDateInput.value;

  if (!personName || !dosageAmount || !lastDate) {
    return;
  }

  if (editingId) {
    records = records.map((record) =>
      record.id === editingId
        ? { ...record, personName, dosageAmount, lastDate, updatedAt: Date.now() }
        : record,
    );
    editingId = null;
  } else {
    records.unshift({
      id: createId(),
      personName,
      dosageAmount,
      lastDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  saveRecords();
  form.reset();
  setDefaultDate();
  setFormMode("add");
  renderRecords();
});

cancelEditButton.addEventListener("click", () => {
  editingId = null;
  form.reset();
  setDefaultDate();
  setFormMode("add");
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
  form.reset();
  setDefaultDate();
  setFormMode("add");
  renderRecords();
});

searchInput.addEventListener("input", renderRecords);

recordList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest("[data-id]");

  if (!button || !card) {
    return;
  }

  const record = records.find((item) => item.id === card.dataset.id);
  if (!record) {
    return;
  }

  if (button.classList.contains("edit-button")) {
    editingId = record.id;
    personNameInput.value = record.personName;
    dosageAmountInput.value = record.dosageAmount;
    lastDateInput.value = record.lastDate;
    setFormMode("edit");
    personNameInput.focus();
  }

  if (button.classList.contains("delete-button")) {
    records = records.filter((item) => item.id !== record.id);
    if (editingId === record.id) {
      editingId = null;
      setFormMode("add");
      form.reset();
      setDefaultDate();
    }
    saveRecords();
    renderRecords();
  }
});

function loadRecords() {
  try {
    const storedRecords = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(storedRecords) ? storedRecords : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    window.alert("This browser could not save the records.");
  }
}

function renderRecords() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const visibleRecords = records
    .filter((record) => record.personName.toLowerCase().includes(searchTerm))
    .sort((first, second) => new Date(second.lastDate) - new Date(first.lastDate));

  recordList.innerHTML = "";
  recordCount.textContent = records.length;
  emptyState.classList.toggle("hidden", visibleRecords.length > 0);
  clearAllButton.disabled = records.length === 0;

  lastUpdated.textContent = records.length
    ? `Newest: ${formatDate(recordsSortedByDate()[0].lastDate)}`
    : "No records yet";

  visibleRecords.forEach((record) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = record.id;
    card.querySelector("h3").textContent = record.personName;
    card.querySelector(".dosage").textContent = `Dose: ${record.dosageAmount}`;
    card.querySelector(".date-line").textContent = `Last had it: ${formatDate(
      record.lastDate,
    )}`;
    card.querySelector(".time-badge").textContent = timeAgo(record.lastDate);
    recordList.append(card);
  });

  if (records.length > 0 && visibleRecords.length === 0) {
    emptyState.querySelector("strong").textContent = "No matching records.";
    emptyState.querySelector("span").textContent = "Try a different name.";
  } else {
    emptyState.querySelector("strong").textContent = "No shots tracked yet.";
    emptyState.querySelector("span").textContent = "Add the first record above.";
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recordsSortedByDate() {
  return [...records].sort((first, second) => {
    return new Date(second.lastDate) - new Date(first.lastDate);
  });
}

function setFormMode(mode) {
  const isEditing = mode === "edit";
  submitButton.textContent = isEditing ? "Update record" : "Save record";
  document.querySelector("#form-title").textContent = isEditing
    ? "Edit record"
    : "Add a record";
  cancelEditButton.classList.toggle("hidden", !isEditing);
}

function setDefaultDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  lastDateInput.value = now.toISOString().slice(0, 16);
}

function formatDate(value) {
  const date = new Date(value);
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
