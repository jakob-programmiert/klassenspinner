const STORAGE_KEY = "klassenspinner-state-v1";
const FILE_FORMAT = "klassenspinner-class-v1";
const MAX_ATTEMPTS = 2500;

const defaultState = {
  students: [],
  tables: [],
  friends: [],
  assignments: {},
  selectedTableId: null,
};

let state = loadState();

const els = {
  spinButton: document.querySelector("#spinButton"),
  exportButton: document.querySelector("#exportButton"),
  importFile: document.querySelector("#importFile"),
  addTableButton: document.querySelector("#addTableButton"),
  addGroupButton: document.querySelector("#addGroupButton"),
  addSingleButton: document.querySelector("#addSingleButton"),
  studentForm: document.querySelector("#studentForm"),
  studentName: document.querySelector("#studentName"),
  studentList: document.querySelector("#studentList"),
  friendForm: document.querySelector("#friendForm"),
  friendA: document.querySelector("#friendA"),
  friendB: document.querySelector("#friendB"),
  friendList: document.querySelector("#friendList"),
  classroom: document.querySelector("#classroom"),
  seatCountLabel: document.querySelector("#seatCountLabel"),
  statusText: document.querySelector("#statusText"),
  selectedTableLabel: document.querySelector("#selectedTableLabel"),
  tableEditor: document.querySelector("#tableEditor"),
  tableName: document.querySelector("#tableName"),
  tableType: document.querySelector("#tableType"),
  tableSeats: document.querySelector("#tableSeats"),
  rotateTableButton: document.querySelector("#rotateTableButton"),
  deleteTableButton: document.querySelector("#deleteTableButton"),
  resultList: document.querySelector("#resultList"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      students: Array.isArray(saved.students) ? saved.students : [],
      tables: Array.isArray(saved.tables) ? saved.tables : [],
      friends: Array.isArray(saved.friends) ? saved.friends : [],
      assignments: saved.assignments && typeof saved.assignments === "object" ? saved.assignments : {},
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createPortableState() {
  normalizeState();
  return {
    format: FILE_FORMAT,
    exportedAt: new Date().toISOString(),
    state: {
      students: state.students,
      tables: state.tables,
      friends: state.friends,
      assignments: state.assignments,
      selectedTableId: state.selectedTableId,
    },
  };
}

function importPortableState(fileData) {
  const importedState = fileData?.format === FILE_FORMAT ? fileData.state : fileData;
  if (!importedState || typeof importedState !== "object") {
    throw new Error("Die Datei enthaelt keine Klassenspinner-Daten.");
  }

  if (!Array.isArray(importedState.tables) || !Array.isArray(importedState.students)) {
    throw new Error("Die Datei enthaelt keine gueltige Klassenstruktur.");
  }

  const students = importedState.students
    .filter((student) => typeof student?.id === "string" && typeof student?.name === "string")
    .map((student) => ({ id: student.id, name: cleanName(student.name) || "Ohne Namen" }));

  const tables = importedState.tables
    .filter((table) => typeof table?.id === "string")
    .map((table, index) => {
      const type = normalizeTableType(table.type);
      return {
        id: table.id,
        name: typeof table.name === "string" && cleanName(table.name) ? cleanName(table.name) : `Tisch ${index + 1}`,
        type,
        seats: normalizeSeatCount(type, table.seats),
        rotation: normalizeRotation(table.rotation),
        x: clamp(Number(table.x) || 40, 0, 4000),
        y: clamp(Number(table.y) || 40, 0, 4000),
      };
    });

  const studentIds = new Set(students.map((student) => student.id));
  const tableIds = new Set(tables.map((table) => table.id));
  const seatIds = new Set(
    tables.flatMap((table) => Array.from({ length: table.seats }, (_, index) => `${table.id}:${index}`)),
  );

  const friends = Array.isArray(importedState.friends)
    ? importedState.friends.filter(
        (pair) => studentIds.has(pair?.a) && studentIds.has(pair?.b) && pair.a !== pair.b,
      )
    : [];

  const assignments =
    importedState.assignments && typeof importedState.assignments === "object"
      ? Object.fromEntries(
          Object.entries(importedState.assignments).filter(
            ([seatId, studentId]) => seatIds.has(seatId) && studentIds.has(studentId),
          ),
        )
      : {};

  const selectedTableId = tableIds.has(importedState.selectedTableId)
    ? importedState.selectedTableId
    : tables[0]?.id || null;

  const nextState = {
    ...structuredClone(defaultState),
    students,
    tables,
    friends,
    assignments,
    selectedTableId,
  };

  state = nextState;
  normalizeState();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function getSeats() {
  return state.tables.flatMap((table) =>
    Array.from({ length: table.seats }, (_, index) => ({
      id: `${table.id}:${index}`,
      tableId: table.id,
      tableName: table.name,
      index,
    })),
  );
}

function getSelectedTable() {
  return state.tables.find((table) => table.id === state.selectedTableId) || null;
}

function normalizeState() {
  const studentIds = new Set(state.students.map((student) => student.id));
  const seatIds = new Set(getSeats().map((seat) => seat.id));

  state.tables.forEach((table) => {
    table.type = normalizeTableType(table.type);
    table.seats = normalizeSeatCount(table.type, table.seats);
    table.rotation = normalizeRotation(table.rotation);
  });

  state.friends = state.friends.filter(
    (pair) => studentIds.has(pair.a) && studentIds.has(pair.b) && pair.a !== pair.b,
  );

  state.assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(([seatId, studentId]) => seatIds.has(seatId) && studentIds.has(studentId)),
  );

  if (!state.tables.some((table) => table.id === state.selectedTableId)) {
    state.selectedTableId = state.tables[0]?.id || null;
  }
}

function render() {
  normalizeState();
  renderStudents();
  renderFriendOptions();
  renderFriends();
  renderClassroom();
  renderTableEditor();
  renderResults();
  renderStatus();
  saveState();
}

function renderStudents() {
  els.studentList.innerHTML = "";
  state.students.forEach((student) => {
    const li = document.createElement("li");
    li.className = "list-item";

    const input = document.createElement("input");
    input.value = student.name;
    input.setAttribute("aria-label", `${student.name} bearbeiten`);
    input.addEventListener("change", () => {
      const nextName = cleanName(input.value);
      if (!nextName) {
        input.value = student.name;
        return;
      }
      student.name = nextName;
      render();
    });

    const remove = document.createElement("button");
    remove.className = "icon-button danger";
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", `${student.name} loeschen`);
    remove.addEventListener("click", () => {
      state.students = state.students.filter((item) => item.id !== student.id);
      render();
    });

    li.append(input, remove);
    els.studentList.append(li);
  });
}

function renderFriendOptions() {
  const makeOptions = (select) => {
    select.innerHTML = "";
    state.students.forEach((student) => {
      const option = document.createElement("option");
      option.value = student.id;
      option.textContent = student.name;
      select.append(option);
    });
  };
  makeOptions(els.friendA);
  makeOptions(els.friendB);
  els.friendForm.querySelector("button").disabled = state.students.length < 2;
}

function renderFriends() {
  els.friendList.innerHTML = "";
  const names = new Map(state.students.map((student) => [student.id, student.name]));

  state.friends.forEach((pair) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.textContent = `${names.get(pair.a)} + ${names.get(pair.b)}`;

    const remove = document.createElement("button");
    remove.className = "icon-button danger";
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", "Freundespaar loeschen");
    remove.addEventListener("click", () => {
      state.friends = state.friends.filter((item) => item !== pair);
      render();
    });

    li.append(remove);
    els.friendList.append(li);
  });
}

function renderClassroom() {
  els.classroom.innerHTML = "";
  const assignedBySeat = state.assignments;
  const names = new Map(state.students.map((student) => [student.id, student.name]));

  state.tables.forEach((table) => {
    const tableEl = document.createElement("div");
    tableEl.className = `table is-${table.type}${table.id === state.selectedTableId ? " is-selected" : ""}`;
    const tableSize = getTableSize(table);
    tableEl.style.width = `${tableSize.width}px`;
    tableEl.style.minHeight = `${tableSize.height}px`;
    tableEl.style.left = `${table.x}px`;
    tableEl.style.top = `${table.y}px`;
    tableEl.dataset.rotation = String(table.rotation);
    tableEl.dataset.id = table.id;

    const body = document.createElement("div");
    body.className = "table-body";
    const typeLabel = getTableTypeLabel(table);
    body.innerHTML = `<div><div class="table-name">${escapeHtml(table.name)}</div><div class="table-meta">${escapeHtml(typeLabel)}</div></div>`;

    const seatRow = document.createElement("div");
    seatRow.className = `seat-row${table.type === "group" ? " is-group" : ""}`;
    Array.from({ length: table.seats }).forEach((_, index) => {
      const seat = document.createElement("div");
      const seatId = `${table.id}:${index}`;
      const studentName = names.get(assignedBySeat[seatId]);
      seat.className = `seat${studentName ? " is-filled" : ""}`;
      seat.textContent = studentName || `${index + 1}`;
      seatRow.append(seat);
    });
    if (table.type === "group") {
      body.append(seatRow);
      tableEl.append(body);
    } else {
      tableEl.append(body, seatRow);
    }

    tableEl.addEventListener("pointerdown", startDrag);
    tableEl.addEventListener("click", () => {
      state.selectedTableId = table.id;
      render();
    });

    els.classroom.append(tableEl);
  });
}

function renderTableEditor() {
  const table = getSelectedTable();
  els.tableEditor.classList.toggle("is-disabled", !table);
  els.selectedTableLabel.textContent = table ? table.name : "Keiner ausgewaehlt";
  els.tableName.value = table?.name || "";
  els.tableType.value = table?.type || "normal";
  els.tableSeats.value = table?.seats || "";
  els.tableSeats.disabled = table?.type === "single";
  els.rotateTableButton.disabled = !table || table.type === "group";
  els.rotateTableButton.textContent =
    table?.type === "group" ? "Gruppentisch bleibt kompakt" : table ? `Tisch drehen (${table.rotation} Grad)` : "Tisch drehen";
}

function renderResults() {
  els.resultList.innerHTML = "";
  const names = new Map(state.students.map((student) => [student.id, student.name]));

  state.tables.forEach((table) => {
    const namesAtTable = Array.from({ length: table.seats }, (_, index) => {
      const studentName = names.get(state.assignments[`${table.id}:${index}`]);
      return studentName ? `${index + 1}. ${studentName}` : `${index + 1}. frei`;
    });

    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `<strong>${escapeHtml(table.name)}</strong><br>${escapeHtml(namesAtTable.join(" | "))}`;
    els.resultList.append(li);
  });
}

function renderStatus(message) {
  const seats = getSeats().length;
  els.seatCountLabel.textContent = `${seats} ${seats === 1 ? "Platz" : "Plaetze"}`;

  if (message) {
    els.statusText.innerHTML = message;
    return;
  }

  if (state.students.length === 0) {
    els.statusText.textContent = "Trage zuerst Kinder ein.";
  } else if (seats < state.students.length) {
    els.statusText.textContent = `Es fehlen ${state.students.length - seats} Sitzplaetze.`;
  } else {
    els.statusText.textContent = `${state.students.length} Kinder, ${seats} Plaetze, ${state.friends.length} Freundesregeln.`;
  }
}

function startDrag(event) {
  if (event.target.classList.contains("seat")) return;
  const tableId = event.currentTarget.dataset.id;
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) return;

  state.selectedTableId = table.id;
  const rect = els.classroom.getBoundingClientRect();
  const tableRect = event.currentTarget.getBoundingClientRect();
  const offsetX = event.clientX - tableRect.left;
  const offsetY = event.clientY - tableRect.top;

  event.currentTarget.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    const seatMargin = 58;
    const maxX = Math.max(seatMargin, rect.width - tableRect.width - seatMargin);
    const maxY = Math.max(seatMargin, rect.height - tableRect.height - seatMargin);
    table.x = clamp(moveEvent.clientX - rect.left - offsetX, seatMargin, maxX);
    table.y = clamp(moveEvent.clientY - rect.top - offsetY, seatMargin, maxY);
    event.currentTarget.style.left = `${table.x}px`;
    event.currentTarget.style.top = `${table.y}px`;
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    render();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
}

function spin() {
  const seats = getSeats();
  if (state.students.length === 0) {
    renderStatus("Trage zuerst Kinder ein.");
    return;
  }
  if (seats.length < state.students.length) {
    renderStatus(`<span class="warning">Es gibt zu wenige Sitzplaetze fuer alle Kinder.</span>`);
    return;
  }

  let best = null;
  let bestViolations = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const assignment = {};
    const shuffledSeats = shuffle(seats);
    const shuffledStudents = shuffle(state.students);

    shuffledStudents.forEach((student, index) => {
      assignment[shuffledSeats[index].id] = student.id;
    });

    const violations = countViolations(assignment);
    if (violations < bestViolations) {
      best = assignment;
      bestViolations = violations;
      if (violations === 0) break;
    }
  }

  state.assignments = best || {};
  render();

  if (bestViolations === 0) {
    renderStatus("Neue Sitzordnung fertig. Keine Freundesregel wurde verletzt.");
  } else {
    renderStatus(`<span class="warning">Beste gefundene Sitzordnung: ${bestViolations} Freundesregel${bestViolations === 1 ? "" : "n"} verletzt.</span>`);
  }
  saveState();
}

function exportClassFile() {
  const data = JSON.stringify(createPortableState(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");

  link.href = url;
  link.download = `klassenspinner-klasse-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  renderStatus("Klassenstruktur wurde als Datei gespeichert.");
}

async function importClassFile(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    importPortableState(data);
    render();
    renderStatus("Klassenstruktur wurde aus der Datei geladen.");
    saveState();
  } catch (error) {
    renderStatus(`<span class="warning">${escapeHtml(error.message || "Die Datei konnte nicht geladen werden.")}</span>`);
  } finally {
    els.importFile.value = "";
  }
}

function countViolations(assignment) {
  const seatsByStudent = new Map(Object.entries(assignment).map(([seatId, studentId]) => [studentId, seatId]));
  let violations = 0;

  state.friends.forEach((pair) => {
    const seatA = parseSeatId(seatsByStudent.get(pair.a));
    const seatB = parseSeatId(seatsByStudent.get(pair.b));
    if (!seatA || !seatB || seatA.tableId !== seatB.tableId) return;

    const table = state.tables.find((item) => item.id === seatA.tableId);
    if (!table) return;

    if (table.type === "group") {
      violations += 1;
      return;
    }

    const distance = Math.abs(seatA.index - seatB.index);
    if (table.type !== "single" && distance === 1) {
      violations += 1;
    }
  });

  return violations;
}

function parseSeatId(seatId) {
  if (!seatId) return null;
  const [tableId, index] = seatId.split(":");
  return { tableId, index: Number(index) };
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getTableSize(table) {
  if (table.type === "single") {
    return { width: 122, height: 94 };
  }

  if (table.type === "group") {
    const columns = Math.min(4, Math.ceil(Math.sqrt(table.seats)));
    const rows = Math.ceil(table.seats / columns);
    return {
      width: Math.max(176, columns * 64),
      height: Math.max(126, rows * 48 + 54),
    };
  }

  const longSide = Math.max(176, table.seats * 62);
  const isSideways = table.rotation === 90 || table.rotation === 270;
  return {
    width: isSideways ? 94 : longSide,
    height: isSideways ? longSide : 94,
  };
}

function normalizeTableType(value) {
  return value === "single" || value === "group" ? value : "normal";
}

function normalizeSeatCount(type, value) {
  if (type === "single") return 1;
  const minimum = type === "group" ? 2 : 1;
  return clamp(Number(value) || minimum, minimum, 12);
}

function getTableTypeLabel(table) {
  if (table.type === "single") return "Einzelplatz";
  if (table.type === "group") return `${table.seats}er Gruppentisch`;
  return `${table.seats} Plaetze`;
}

function normalizeRotation(value) {
  const rotation = Number(value) || 0;
  const snapped = Math.round(rotation / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.studentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(els.studentName.value);
  if (!name) return;
  state.students.push({ id: uid("student"), name });
  els.studentName.value = "";
  render();
});

els.friendForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const a = els.friendA.value;
  const b = els.friendB.value;
  if (!a || !b || a === b) return;

  const exists = state.friends.some((pair) => [pair.a, pair.b].includes(a) && [pair.a, pair.b].includes(b));
  if (!exists) {
    state.friends.push({ a, b });
    render();
  }
});

els.addTableButton.addEventListener("click", () => {
  const tableNumber = state.tables.length + 1;
  const table = {
    id: uid("table"),
    name: `Tisch ${tableNumber}`,
    type: "normal",
    seats: 4,
    rotation: 0,
    x: 40 + ((tableNumber - 1) % 3) * 190,
    y: 40 + Math.floor((tableNumber - 1) / 3) * 150,
  };
  state.tables.push(table);
  state.selectedTableId = table.id;
  render();
});

els.addGroupButton.addEventListener("click", () => {
  const tableNumber = state.tables.length + 1;
  const table = {
    id: uid("table"),
    name: `Gruppentisch ${tableNumber}`,
    type: "group",
    seats: 6,
    rotation: 0,
    x: 40 + ((tableNumber - 1) % 3) * 210,
    y: 40 + Math.floor((tableNumber - 1) / 3) * 180,
  };
  state.tables.push(table);
  state.selectedTableId = table.id;
  render();
});

els.addSingleButton.addEventListener("click", () => {
  const tableNumber = state.tables.length + 1;
  const table = {
    id: uid("table"),
    name: `Einzelplatz ${tableNumber}`,
    type: "single",
    seats: 1,
    rotation: 0,
    x: 40 + ((tableNumber - 1) % 4) * 150,
    y: 40 + Math.floor((tableNumber - 1) / 4) * 140,
  };
  state.tables.push(table);
  state.selectedTableId = table.id;
  render();
});

els.tableName.addEventListener("input", () => {
  const table = getSelectedTable();
  if (!table) return;
  table.name = cleanName(els.tableName.value) || table.name;
  render();
});

els.tableSeats.addEventListener("change", () => {
  const table = getSelectedTable();
  if (!table) return;
  table.seats = normalizeSeatCount(table.type, els.tableSeats.value);
  render();
});

els.tableType.addEventListener("change", () => {
  const table = getSelectedTable();
  if (!table) return;
  table.type = normalizeTableType(els.tableType.value);
  if (table.type === "single") {
    table.seats = 1;
  } else if (table.type === "group" && table.seats < 2) {
    table.seats = 6;
  } else if (table.seats < 2) {
    table.seats = 4;
  }
  render();
});

els.rotateTableButton.addEventListener("click", () => {
  const table = getSelectedTable();
  if (!table) return;
  table.rotation = normalizeRotation(table.rotation + 90);
  render();
});

els.deleteTableButton.addEventListener("click", () => {
  const table = getSelectedTable();
  if (!table) return;
  state.tables = state.tables.filter((item) => item.id !== table.id);
  state.selectedTableId = state.tables[0]?.id || null;
  render();
});

els.spinButton.addEventListener("click", spin);
els.exportButton.addEventListener("click", exportClassFile);
els.importFile.addEventListener("change", () => {
  importClassFile(els.importFile.files[0]);
});

if (state.tables.length === 0) {
  state.tables = [
    { id: uid("table"), name: "Tisch 1", type: "normal", seats: 4, rotation: 0, x: 56, y: 56 },
    { id: uid("table"), name: "Einzelplatz", type: "single", seats: 1, rotation: 0, x: 360, y: 56 },
  ];
  state.selectedTableId = state.tables[0].id;
}

render();
