const storageKey = "shot-tracker-records";

const form = document.querySelector("#shot-form");
const personNameInput = document.querySelector("#person-name");
const dosageAmountInput = document.querySelector("#dosage-amount");
const dosageUnitInput = document.querySelector("#dosage-unit");
const customUnitInput = document.querySelector("#custom-unit");
const customUnitLabel = document.querySelector("#custom-unit-label");
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
  const dosageUnit =
    dosageUnitInput.value === "other"
      ? normalizeStoredUnit(customUnitInput.value)
      : dosageUnitInput.value;
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

dosageUnitInput.addEventListener("change", updateCustomUnitVisibility);

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

  downloadFile({
    content: recordsToXlsx(records),
    filename: `shot-tracker-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  reader.addEventListener("load", async () => {
    try {
      const importedRecords = await fileToRecords(file, reader.result);

      if (!Array.isArray(importedRecords)) {
        throw new Error("Backup does not contain records.");
      }

      const datedRecords = importedRecords.filter(hasValidImportDate);
      const invalidDateCount = importedRecords.length - datedRecords.length;
      const normalizedRecords = normalizeImportedRecords(datedRecords);

      if (!normalizedRecords.length && !invalidDateCount) {
        throw new Error("Backup is empty.");
      }

      const merge = mergeRecords(normalizedRecords, records);
      records = merge.records;
      saveRecords();
      editingId = null;
      resetForm();
      renderRecords();
      window.alert(importSummary({ ...merge, invalidDateCount }));
    } catch {
      window.alert("That file could not be imported.");
    } finally {
      importFileInput.value = "";
    }
  });
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
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
    customUnitInput.value = knownUnit(record.dosageUnit) ? "" : record.dosageUnit;
    updateCustomUnitVisibility();
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

async function fileToRecords(file, content) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".xlsx")) {
    return xlsxToRecords(content);
  }

  if (fileName.endsWith(".csv")) {
    return csvToRecords(String(content));
  }

  return jsonToRecords(String(content));
}

function recordsToXlsx(items) {
  const rows = spreadsheetRows(items);
  const createdAt = new Date().toISOString();
  const files = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": packageRelsXml(),
    "docProps/app.xml": appPropsXml(),
    "docProps/core.xml": corePropsXml(createdAt),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(rows),
  };

  return zipFiles(files);
}

function spreadsheetRows(items) {
  const headers = [
    "Name",
    "Dosage Amount",
    "Unit",
    "Last Had It",
    "Repeat Every Days",
    "Due Status",
    "Record ID",
  ];
  const rows = [...items].sort(sortByLastDateDesc).map((record) => [
    record.personName,
    record.dosageAmount,
    record.dosageUnit === "other" ? "" : record.dosageUnit,
    formatSpreadsheetDate(record.lastDate),
    record.repeatDays || "",
    getDueInfo(record)?.text || "",
    record.id,
  ]);

  return [headers, ...rows];
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function packageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function appPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Shot Tracker</Application>
</Properties>`;
}

function corePropsXml(timestamp) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Shot Tracker</dc:title>
  <dc:creator>Shot Tracker</dc:creator>
  <cp:lastModifiedBy>Shot Tracker</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="17600"/>
  </bookViews>
  <sheets>
    <sheet name="Shot Records" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F7B72"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E2E0"/></left>
      <right style="thin"><color rgb="FFD9E2E0"/></right>
      <top style="thin"><color rgb="FFD9E2E0"/></top>
      <bottom style="thin"><color rgb="FFD9E2E0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function worksheetXml(rows) {
  const lastRow = Math.max(rows.length, 1);
  const lastCell = `G${lastRow}`;
  const rowsXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const style = rowIndex === 0 ? 1 : 2;
      const cells = row
        .map((cell, columnIndex) => worksheetCell(rowNumber, columnIndex, cell, style))
        .join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/>
    <col min="2" max="2" width="15" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="21" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="22" customWidth="1"/>
    <col min="7" max="7" width="34" customWidth="1" hidden="1"/>
  </cols>
  <sheetData>${rowsXml}</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function worksheetCell(rowNumber, columnIndex, value, style) {
  const ref = `${columnName(columnIndex)}${rowNumber}`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(
    value,
  )}</t></is></c>`;
}

function columnName(index) {
  let number = index + 1;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function columnIndex(name) {
  return cleanString(name)
    .toUpperCase()
    .split("")
    .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function escapeXml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function xlsxToRecords(content) {
  const files = await unzipTextFiles(new Uint8Array(content));
  const worksheetPath = Object.keys(files).find((path) => {
    return /^xl\/worksheets\/sheet\d+\.xml$/i.test(path);
  });

  if (!worksheetPath) {
    return [];
  }

  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]);
  const rows = worksheetRowsFromXml(files[worksheetPath], sharedStrings);

  if (rows.length < 2) {
    return [];
  }

  const fields = rows[0].map(csvHeaderToField);
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cleanString(cell)))
    .map((row) => {
      const record = {};

      fields.forEach((field, index) => {
        if (field) {
          record[field] = stripSpreadsheetGuard(row[index]);
        }
      });

      if (record.lastDate) {
        record.lastDate = parseSpreadsheetDate(record.lastDate);
      }

      return record;
    });
}

async function unzipTextFiles(bytes) {
  const decoder = new TextDecoder();
  const entries = await unzipFiles(bytes);

  return Object.fromEntries(
    Object.entries(entries).map(([path, data]) => [path, decoder.decode(data)]),
  );
}

async function unzipFiles(bytes) {
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directoryOffset = findEndOfCentralDirectory(view);

  if (directoryOffset < 0) {
    throw new Error("Not a valid Excel file.");
  }

  const fileCount = view.getUint16(directoryOffset + 10, true);
  let offset = view.getUint32(directoryOffset + 16, true);
  const files = {};

  for (let index = 0; index < fileCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid Excel directory.");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const fileName = decoder.decode(fileNameBytes).replace(/\\/g, "/");
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const fileData = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      files[fileName] = fileData;
    } else if (method === 8) {
      files[fileName] = await inflateRaw(fileData);
    } else {
      throw new Error("Unsupported Excel file compression.");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(view) {
  const minimumOffset = Math.max(0, view.byteLength - 65557);

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot read compressed Excel files.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }

  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  return [...documentXml.getElementsByTagName("si")].map((item) => {
    return [...item.getElementsByTagName("t")]
      .map((text) => text.textContent || "")
      .join("");
  });
}

function worksheetRowsFromXml(xml, sharedStrings) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const rows = [...documentXml.getElementsByTagName("row")];

  return rows.map((row) => {
    const cells = [...row.getElementsByTagName("c")];
    const values = [];

    cells.forEach((cell) => {
      const cellRef = cell.getAttribute("r") || "";
      const column = cellRef.match(/[A-Z]+/i)?.[0];
      const index = column ? columnIndex(column) : values.length;
      values[index] = xlsxCellValue(cell, sharedStrings);
    });

    return values.map((value) => value || "");
  });
}

function xlsxCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");

  if (type === "inlineStr") {
    return [...cell.getElementsByTagName("t")]
      .map((text) => text.textContent || "")
      .join("");
  }

  const value = cell.getElementsByTagName("v")[0]?.textContent || "";

  if (type === "s") {
    return sharedStrings[Number(value)] || "";
  }

  return value;
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { dosDate, dosTime } = dosDateTime(new Date());
  let offset = 0;

  Object.entries(files).forEach(([path, content]) => {
    const name = encoder.encode(path);
    const data = content instanceof Uint8Array ? content : encoder.encode(content);
    const crc = crc32(data);
    const localHeader = zipLocalHeader({
      name,
      data,
      crc,
      dosDate,
      dosTime,
    });
    const centralHeader = zipCentralHeader({
      name,
      data,
      crc,
      dosDate,
      dosTime,
      offset,
    });

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((total, part) => {
    return total + part.length;
  }, 0);
  const end = zipEndRecord({
    fileCount: centralParts.length,
    centralDirectorySize,
    centralDirectoryOffset,
  });

  return concatBytes([...localParts, ...centralParts, end]);
}

function zipLocalHeader({ name, data, crc, dosDate, dosTime }) {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);

  return header;
}

function zipCentralHeader({ name, data, crc, dosDate, dosTime, offset }) {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);

  return header;
}

function zipEndRecord({ fileCount, centralDirectorySize, centralDirectoryOffset }) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);

  return header;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

function concatBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = (crc >>> 8) ^ crcTable()[(crc ^ byte) & 0xff];
  });

  return (crc ^ 0xffffffff) >>> 0;
}

let cachedCrcTable;

function crcTable() {
  if (cachedCrcTable) {
    return cachedCrcTable;
  }

  cachedCrcTable = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    cachedCrcTable[index] = value >>> 0;
  }

  return cachedCrcTable;
}

function recordsToCsv(items) {
  return `\ufeff${spreadsheetRows(items).map(csvRow).join("\r\n")}`;
}

function csvRow(row) {
  return row.map(csvCell).join(",");
}

function csvCell(value) {
  const text = safeSpreadsheetValue(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function safeSpreadsheetValue(value) {
  const text = cleanString(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function stripSpreadsheetGuard(value) {
  const text = cleanString(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function downloadFile({ content, filename, type }) {
  const file = new Blob([content], { type });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function jsonToRecords(content) {
  const parsed = JSON.parse(content);
  const importedRecords = Array.isArray(parsed) ? parsed : parsed.records;
  return Array.isArray(importedRecords) ? importedRecords : null;
}

function csvToRecords(content) {
  const rows = parseCsv(content.replace(/^\ufeff/, ""));

  if (rows.length < 2) {
    return [];
  }

  const fields = rows[0].map(csvHeaderToField);
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cleanString(cell)))
    .map((row) => {
      const record = {};

      fields.forEach((field, index) => {
        if (field) {
          record[field] = stripSpreadsheetGuard(row[index]);
        }
      });

      if (record.lastDate) {
        record.lastDate = parseSpreadsheetDate(record.lastDate);
      }

      return record;
    });
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvHeaderToField(header) {
  const normalizedHeader = cleanString(header).toLowerCase().replace(/[^a-z0-9]/g, "");
  const fields = {
    name: "personName",
    personname: "personName",
    dosageamount: "dosageAmount",
    dose: "dosageAmount",
    dosage: "dosageAmount",
    unit: "dosageUnit",
    lasthadit: "lastDate",
    lastdate: "lastDate",
    repeaterydays: "repeatDays",
    repeateveryday: "repeatDays",
    repeateverydays: "repeatDays",
    repeatdays: "repeatDays",
    recordid: "id",
    id: "id",
  };

  return fields[normalizedHeader] || "";
}

function normalizeImportedRecords(importedRecords) {
  const importedIds = new Set();

  return importedRecords.map((record) => {
    const normalizedRecord = normalizeRecord(record);
    normalizedRecord.id = uniqueId(importedIds, normalizedRecord.id);
    return normalizedRecord;
  });
}

function mergeRecords(importedRecords, currentRecords) {
  const importedById = new Map(
    importedRecords.map((record) => [record.id, record]),
  );
  const currentIds = new Set(currentRecords.map((record) => record.id));
  let updatedCount = 0;
  const mergedRecords = currentRecords.map((record) => {
    const importedRecord = importedById.get(record.id);
    if (!importedRecord) {
      return record;
    }

    updatedCount += 1;
    return {
      ...record,
      ...importedRecord,
      createdAt: record.createdAt || importedRecord.createdAt,
      updatedAt: Date.now(),
    };
  });
  // Rows without a matching ID (such as a CSV with no Record ID column) are
  // matched by content so importing the same file twice adds nothing new.
  const knownKeys = new Set(mergedRecords.map(recordContentKey));
  let addedCount = 0;
  let duplicateCount = 0;

  importedRecords.forEach((record) => {
    if (currentIds.has(record.id)) {
      return;
    }

    const key = recordContentKey(record);
    if (knownKeys.has(key)) {
      duplicateCount += 1;
      return;
    }

    knownKeys.add(key);
    mergedRecords.push(record);
    addedCount += 1;
  });

  return {
    records: mergedRecords.sort(sortByLastDateDesc),
    addedCount,
    updatedCount,
    duplicateCount,
  };
}

function recordContentKey(record) {
  return [
    record.personName.trim().toLowerCase(),
    Number(record.dosageAmount) || record.dosageAmount,
    record.dosageUnit.toLowerCase(),
    record.lastDate,
  ].join("|");
}

function hasValidImportDate(record) {
  const value = record?.lastDate ?? record?.lastHadIt;

  if (typeof value === "number") {
    return Number.isFinite(value) && isValidDate(value);
  }

  return Boolean(cleanString(value)) && isValidDate(value);
}

function importSummary({ addedCount, updatedCount, duplicateCount, invalidDateCount }) {
  const lines = [`${addedCount} record(s) added, ${updatedCount} updated.`];

  if (duplicateCount) {
    lines.push(`${duplicateCount} duplicate row(s) skipped.`);
  }

  if (invalidDateCount) {
    lines.push(`${invalidDateCount} row(s) skipped because the date was missing or invalid.`);
  }

  return lines.join("\n");
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
  const rawUnit = normalizeStoredUnit(record?.dosageUnit) !== "other"
    ? record.dosageUnit
    : parsedDose.unit;
  const repeatDays = normalizeRepeatDays(record?.repeatDays);

  return {
    id: cleanString(record?.id) || createId(),
    personName: cleanString(record?.personName || record?.name) || "Unnamed",
    dosageAmount: parsedDose.amount || cleanString(record?.dosageAmount) || "0",
    dosageUnit: normalizeStoredUnit(rawUnit),
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
  const match = rawValue.match(/^(\d+(?:\.\d+)?)\s*([^\d\s.,].*)?$/);

  if (!match) {
    return { amount: rawValue, unit: "" };
  }

  return {
    amount: match[1],
    unit: match[2] ? normalizeStoredUnit(match[2]) : "",
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

// Known units are normalized; anything else is kept as a custom unit.
// "other" means no unit was given.
function normalizeStoredUnit(value) {
  if (knownUnit(value)) {
    return normalizeUnit(value);
  }

  return cleanString(value).slice(0, 20) || "other";
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
  updateCustomUnitVisibility();
  setDefaultDate();
  setFormMode("add");
}

function updateCustomUnitVisibility() {
  customUnitLabel.classList.toggle("hidden", dosageUnitInput.value !== "other");
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

function formatSpreadsheetDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function parseSpreadsheetDate(value) {
  const text = cleanString(value);
  const localDateTime = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/,
  );

  if (localDateTime) {
    const [, year, month, day, hours, minutes] = localDateTime;
    return formatDateTimeInput(
      new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)),
    );
  }

  const spreadsheetSerialDate = Number(text);
  if (Number.isFinite(spreadsheetSerialDate) && spreadsheetSerialDate > 20000) {
    // Serial dates have no time zone, so read the UTC parts as local wall-clock time.
    const utcDate = new Date(Math.round((spreadsheetSerialDate - 25569) * 86400000));
    return formatDateTimeInput(
      new Date(
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth(),
        utcDate.getUTCDate(),
        utcDate.getUTCHours(),
        utcDate.getUTCMinutes(),
      ),
    );
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : formatDateTimeInput(date);
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
