const STORAGE_KEY = "club-auction-helper-session-v1";

const qualityOptions = ["白品", "绿品", "蓝品", "紫品", "橙品", "红品"];
const categoryOptions = ["古董", "珠宝", "奢品", "字画", "化石", "茗酿"];
const shapeOptions = ["1×1（1格）", "1×2（2格）", "2×1（2格）", "1×3（3格）", "3×1（3格）", "2×2（4格）", "2×3（6格）", "3×2（6格）", "2×4（8格）", "4×2（8格）", "3×3（9格）", "3×4（12格）", "4×3（12格）", "3×5（15格）", "4×4（16格）", "5×4（20格）"];

const families = [
  { id: "outline", label: "轮廓" },
  { id: "quality", label: "品质" },
  { id: "value", label: "价值" },
  { id: "slots", label: "格数" },
  { id: "count", label: "数量" },
  { id: "full", label: "完整信息" },
];

const templates = [
  { id: "outline-largest", family: "outline", label: "格子占用最多的藏品的轮廓", result: "shape", scope: "最大占格藏品" },
  { id: "outline-category-all", family: "outline", label: "某个指定品类的所有藏品的轮廓", params: ["category"], result: "bulk-shape", scope: "指定品类全部藏品" },
  { id: "outline-highest-random", family: "outline", label: "随机 1 个最高品质藏品的轮廓", result: "shape", scope: "随机最高品质藏品" },
  { id: "outline-random", family: "outline", label: "随机 X 件藏品的轮廓", params: ["count"], result: "multi-shape", scope: "随机藏品" },

  { id: "quality-random", family: "quality", label: "随机 X 件藏品的品质", params: ["count"], result: "multi-quality", scope: "随机藏品" },
  { id: "quality-all", family: "quality", label: "所有藏品的品质", result: "bulk-quality", scope: "全部藏品" },
  { id: "quality-largest", family: "quality", label: "格子占用最多的藏品的品质", result: "quality", scope: "最大占格藏品" },

  { id: "value-quality-total", family: "value", label: "某个指定品质的藏品的总价值", params: ["quality"], result: "value", scope: "指定品质全部藏品", directFact: true },
  { id: "value-all-total", family: "value", label: "所有藏品的总价值", result: "value", scope: "全部藏品", directFact: true },
  { id: "value-highest-random", family: "value", label: "随机 1 个最高品质藏品的价值", result: "value", scope: "随机最高品质藏品" },
  { id: "value-slots-average", family: "value", label: "占位 X 格的藏品的平均价值", params: ["slots"], result: "value", scope: "指定格数藏品", directFact: true },
  { id: "value-largest-random", family: "value", label: "随机 1 个占用格子最多的藏品的价值", result: "value", scope: "随机最大占格藏品" },

  { id: "slots-all-total", family: "slots", label: "所有藏品占用的总格数", result: "number", scope: "全部藏品", directFact: true },
  { id: "slots-quality-total", family: "slots", label: "某个指定品质的藏品占用的总格数", params: ["quality"], result: "number", scope: "指定品质全部藏品", directFact: true },
  { id: "slots-quality-average", family: "slots", label: "某个指定品质的藏品占用的平均格数", params: ["quality"], result: "number", scope: "指定品质全部藏品", directFact: true },
  { id: "slots-highest-random", family: "slots", label: "随机 1 个最高品质的藏品的格子数", result: "number", scope: "随机最高品质藏品" },
  { id: "slots-all-average", family: "slots", label: "所有藏品的平均格数", result: "number", scope: "全部藏品", directFact: true },

  { id: "count-quality-total", family: "count", label: "某个品质的藏品总数量", params: ["quality"], result: "number", scope: "指定品质全部藏品", directFact: true },
  { id: "count-all-total", family: "count", label: "所有藏品的总数量", result: "number", scope: "全部藏品", directFact: true },

  { id: "full-random", family: "full", label: "随机 X 个藏品的完整信息", params: ["count"], result: "multi-full", scope: "随机藏品" },
  { id: "full-all", family: "full", label: "所有藏品的完整信息", result: "bulk-full", scope: "全部藏品" },
  { id: "full-highest-random", family: "full", label: "随机 1 个最高品质藏品的完整信息", result: "full", scope: "随机最高品质藏品" },
  { id: "full-largest-random", family: "full", label: "随机 1 个占用格子数最多藏品的完整信息", result: "full", scope: "随机最大占格藏品" },
];

let selectedFamily = "outline";
let selectedTemplateId = null;
let catalog = [];
let session = loadSession();

const familyTabs = document.querySelector("#family-tabs");
const templateList = document.querySelector("#template-list");
const formCard = document.querySelector("#form-card");
const historyList = document.querySelector("#history-list");
const factsList = document.querySelector("#facts-list");
const inferenceList = document.querySelector("#inference-list");
const conflictStatus = document.querySelector("#conflict-status");
const recordCount = document.querySelector("#record-count");
const topRecordCount = document.querySelector("#top-record-count");
const catalogStatus = document.querySelector("#catalog-status");
const templateHeading = document.querySelector("#template-heading");

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { records: [] }; }
  catch { return { records: [] }; }
}

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows;
  const hasHeader = headers[0]?.replace(/^\uFEFF/, "") === "编号";
  const columnNames = ["编号", "名称", "轮廓", "价值", "品质", "品类", "描述", "图标"];
  const dataRows = hasHeader ? body : rows;
  const fieldNames = hasHeader ? headers.map((header) => header.replace(/^\uFEFF/, "")) : columnNames;
  return dataRows.map((r) => Object.fromEntries(fieldNames.map((name, index) => [name, r[index]])));
}

async function loadCatalog() {
  if (location.protocol === "file:") {
    catalogStatus.textContent = "请用启动脚本或 localhost 打开";
    return;
  }
  try {
    const response = await fetch("data/藏品图鉴汇总.csv");
    if (!response.ok) throw new Error("CSV not found");
    catalog = parseCsv(await response.text());
    catalogStatus.textContent = `已加载 ${catalog.length} 件藏品`;
    renderSummary();
  } catch {
    catalogStatus.textContent = "CSV 加载失败（检查本地服务）";
  }
}

function renderFamilies() {
  familyTabs.innerHTML = families.map((family) => `<button class="family-tab ${family.id === selectedFamily ? "active" : ""}" data-family="${family.id}" type="button">${family.label}</button>`).join("");
  familyTabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    selectedFamily = button.dataset.family;
    selectedTemplateId = null;
    renderFamilies(); renderTemplates(); renderForm();
  }));
}

function renderTemplates() {
  const familyTemplates = templates.filter((template) => template.family === selectedFamily);
  const family = families.find((item) => item.id === selectedFamily);
  templateHeading.textContent = `${family.label}相关线索`;
  templateList.innerHTML = familyTemplates.map((template) => `<button type="button" class="template-button ${template.id === selectedTemplateId ? "active" : ""}" data-template="${template.id}">${template.label}</button>`).join("");
  templateList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    selectedTemplateId = button.dataset.template;
    renderTemplates(); renderForm();
  }));
}

function optionButtons(name, values) {
  return `<div class="quick-choices" data-choice="${name}">${values.map((value) => `<button type="button" class="quick-choice" data-value="${value}">${value}</button>`).join("")}</div><input type="hidden" name="${name}" />`;
}

function fieldForParam(param) {
  if (param === "quality") return `<div class="field"><label>指定品质</label>${optionButtons("param-quality", qualityOptions)}</div>`;
  if (param === "category") return `<div class="field full"><label>指定品类</label>${optionButtons("param-category", categoryOptions)}</div>`;
  if (param === "count") return `<div class="field"><label>随机件数 X</label><input name="param-count" inputmode="numeric" type="number" min="1" max="20" placeholder="例如 3" /></div>`;
  return `<div class="field"><label>占位格数 X</label><input name="param-slots" inputmode="numeric" type="number" min="1" max="20" placeholder="例如 4" /></div>`;
}

function resultControl(kind, index = 1) {
  const label = `结果 ${index}`;
  if (kind === "shape") return `<div class="result-row"><span>${label}</span><select data-result><option value="">选择轮廓</option>${shapeOptions.map((shape) => `<option>${shape}</option>`).join("")}</select></div>`;
  if (kind === "quality") return `<div class="result-row"><span>${label}</span><select data-result><option value="">选择品质</option>${qualityOptions.map((quality) => `<option>${quality}</option>`).join("")}</select></div>`;
  if (kind === "full") return `<div class="result-row"><span>${label}</span><input data-result list="catalog-names" placeholder="输入名称后选择藏品" /></div>`;
  if (kind === "value") return `<div class="result-row"><span>${label}</span><input data-result inputmode="decimal" placeholder="输入价值，例如 128000 或 12.8w" /></div>`;
  return `<div class="result-row"><span>${label}</span><input data-result inputmode="decimal" placeholder="输入数字" /></div>`;
}

function bulkControl(kind) {
  const noun = kind === "shape" ? "轮廓" : kind === "quality" ? "品质" : "完整信息（名称）";
  return `<div class="field full"><label>批量结果</label><textarea data-bulk-result placeholder="每行一项${noun}。例如：\n${kind === "shape" ? "2×2（4格）" : kind === "quality" ? "紫品" : "西洋钻戒"}"></textarea></div>`;
}

function bindChoiceButtons(container) {
  container.querySelectorAll("[data-choice]").forEach((group) => {
    const hidden = group.parentElement.querySelector("input[type=hidden]");
    group.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active"); hidden.value = button.dataset.value;
    }));
  });
}

function renderForm() {
  const template = templates.find((item) => item.id === selectedTemplateId);
  if (!template) {
    formCard.className = "form-card empty";
    formCard.innerHTML = "<strong>选择一条情报句式开始录入。</strong><p class=\"form-description\">系统会只展示该句式所需的参数和结果输入位。</p>";
    return;
  }
  const params = (template.params ?? []).map(fieldForParam).join("");
  const resultKind = template.result.replace("multi-", "").replace("bulk-", "");
  const result = template.result.startsWith("bulk-")
    ? bulkControl(resultKind)
    : `<div class="field full"><label>游戏展示的结果</label><div class="result-list" id="result-list">${resultControl(resultKind)}</div></div>`;
  formCard.className = "form-card";
  formCard.innerHTML = `
    <p class="form-kicker">${families.find((family) => family.id === template.family).label}类情报</p>
    <h2 class="form-title">${template.label}</h2>
    <p class="form-description">目标范围：${template.scope}${template.result.startsWith("multi-") ? "；件数变化后会自动生成对应的结果栏。" : "。"}</p>
    <form id="intel-form"><div class="field-grid">${params}${result}</div><div class="form-footer"><span class="hint">Enter 提交 · 所有记录仅保存在这台设备的浏览器中</span><button class="submit-button" type="submit">录入情报</button></div></form>
    <datalist id="catalog-names">${catalog.map((item) => `<option value="${item.名称}">${item.品类} · ${item.品质} · ${item.价值}</option>`).join("")}</datalist>`;
  bindChoiceButtons(formCard);
  const countInput = formCard.querySelector("[name=param-count]");
  if (countInput) countInput.addEventListener("input", () => renderMultiResults(template, countInput.value));
  formCard.querySelector("#intel-form").addEventListener("submit", (event) => submitIntel(event, template));
  const firstInput = formCard.querySelector("input:not([type=hidden]), select, textarea");
  firstInput?.focus();
}

function renderMultiResults(template, rawCount) {
  const count = Math.max(1, Math.min(20, Number(rawCount) || 1));
  const kind = template.result.replace("multi-", "");
  const list = formCard.querySelector("#result-list");
  if (list) list.innerHTML = Array.from({ length: count }, (_, index) => resultControl(kind, index + 1)).join("");
}

function formatRecord(record) {
  const params = Object.values(record.params).filter(Boolean);
  const condition = params.length ? `（${params.join("、")}）` : "";
  const result = record.results.join("；");
  return `${record.label}${condition}：${result}`;
}

function normaliseValue(value) { return String(value).trim().replace(/\s+/g, " "); }

function submitIntel(event, template) {
  event.preventDefault();
  const form = event.currentTarget;
  const params = {};
  (template.params ?? []).forEach((param) => { params[param] = normaliseValue(form.querySelector(`[name=param-${param}]`)?.value); });
  if (Object.values(params).some((value) => !value)) { alert("请先补全句式中的条件。 "); return; }
  let results = [];
  const bulk = form.querySelector("[data-bulk-result]");
  if (bulk) results = bulk.value.split(/\r?\n/).map(normaliseValue).filter(Boolean);
  else results = [...form.querySelectorAll("[data-result]")].map((input) => normaliseValue(input.value)).filter(Boolean);
  const expectedCount = Number(params.count || 0);
  if (!results.length || (expectedCount && results.length !== expectedCount)) { alert("请填入全部情报结果。 "); return; }
  const record = { id: crypto.randomUUID(), templateId: template.id, label: template.label, params, results, createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
  session.records.unshift(record); persist(); renderSummary();
  form.reset(); renderForm();
}

function renderSummary() {
  recordCount.textContent = session.records.length;
  topRecordCount.textContent = session.records.length;
  historyList.innerHTML = session.records.length
    ? session.records.slice(0, 10).map((record) => `<li><span>${formatRecord(record)}<small>${record.createdAt}</small></span><button class="history-delete" type="button" data-delete-record="${record.id}" aria-label="删除这条记录">×</button></li>`).join("")
    : "<li class=\"muted\">尚未录入情报。</li>";
  historyList.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => {
    session.records = session.records.filter((record) => record.id !== button.dataset.deleteRecord);
    persist(); renderSummary();
  }));
  const direct = session.records.filter((record) => templates.find((template) => template.id === record.templateId)?.directFact);
  factsList.innerHTML = direct.length
    ? direct.slice(0, 7).map((record) => `<li>${formatRecord(record)}</li>`).join("")
    : "<li>录入总数、总价值或指定品质统计后，会在这里显示。</li>";
  const result = window.ConservativeSolver?.solve(catalog, session.records) ?? { lines: ["求解器加载失败。"], conflicts: [] };
  inferenceList.innerHTML = result.lines.map((line) => `<li>${line}</li>`).join("");
  if (result.conflicts.length) {
    conflictStatus.className = "conflict-error";
    conflictStatus.textContent = result.conflicts.join(" ");
  } else {
    conflictStatus.className = "conflict-ok";
    conflictStatus.textContent = "当前无冲突";
  }
}

function undoLastRecord() {
  if (session.records.length) { session.records.shift(); persist(); renderSummary(); }
}

document.querySelector("#undo-button").addEventListener("click", undoLastRecord);
document.querySelector("#clear-button").addEventListener("click", () => { if (confirm("确认清空本局全部已录入情报？")) { session = { records: [] }; persist(); renderSummary(); } });

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault(); undoLastRecord(); return;
  }
  if (event.target.matches("input, textarea, select")) return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const familyTemplates = templates.filter((template) => template.family === selectedFamily);
  const currentIndex = familyTemplates.findIndex((template) => template.id === selectedTemplateId);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = currentIndex < 0 ? (step > 0 ? 0 : familyTemplates.length - 1) : (currentIndex + step + familyTemplates.length) % familyTemplates.length;
  selectedTemplateId = familyTemplates[nextIndex].id;
  renderTemplates(); renderForm();
});

renderFamilies(); renderTemplates(); renderForm(); renderSummary(); loadCatalog();
