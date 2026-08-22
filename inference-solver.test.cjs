const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const solver = require("./inference-solver.js");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ""; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return rows.filter((values) => values.length > 1)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function record(templateId, quality, result) {
  return { templateId, params: quality ? { quality } : {}, results: [String(result)] };
}

const dataDir = path.join(__dirname, "data");
const catalogFile = fs.readdirSync(dataDir).find((name) => name.endsWith(".csv") && !name.includes("raw"));
const catalog = parseCsv(fs.readFileSync(path.join(dataDir, catalogFile), "utf8"));

{
  const result = solver.solve(catalog, [record("value-quality-one", "橙品", 73110)]);
  assert.match(result.lines.join("\n"), /确定.*岭南青铜鼓/);
  assert.deepEqual(result.conflicts, []);
}

{
  const groups = new Map();
  catalog.filter((item) => ["红品", "橙品", "紫品"].includes(item.品质)).forEach((item) => {
    const key = `${item.品质}|${item.价值}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const [, duplicateItems] = [...groups.entries()].find(([, items]) => items.length > 1);
  const clue = duplicateItems[0];
  const result = solver.solve(catalog, [record("value-quality-one", clue.品质, clue.价值)]);
  assert.match(result.lines.join("\n"), /候选/);
  duplicateItems.forEach((item) => assert.match(result.lines.join("\n"), new RegExp(item.名称)));
}

{
  const synthetic = [
    { 名称: "二格红品", 品质: "红品", 价值: "100", 轮廓: "1×2（2格）" },
    { 名称: "八格红品", 品质: "红品", 价值: "200", 轮廓: "2×4（8格）" },
  ];
  const records = [
    record("count-quality-total", "红品", 2),
    record("slots-quality-average", "红品", 5),
    record("slots-quality-one", "红品", 2),
  ];
  const result = solver.solve(synthetic, records);
  assert.match(result.lines.join("\n"), /唯一属性组合/);
  assert.match(result.lines.join("\n"), /2格×1/);
  assert.match(result.lines.join("\n"), /8格×1/);
  assert.match(result.lines.join("\n"), /必然包含.*8格×1/);
}

{
  const synthetic = [{ 名称: "斯诺克纪念球杆", 品质: "橙品", 价值: "46340", 轮廓: "6×1（6格）" }];
  const records = [record("count-quality-total", "橙品", 2), record("value-quality-total", "橙品", 92680)];
  const result = solver.solve(synthetic, records);
  assert.match(result.lines.join("\n"), /唯一属性组合.*46,340×2.*斯诺克纪念球杆/);
}

{
  const records = [record("count-quality-total", "橙品", 2), record("value-quality-total", "橙品", 92680)];
  const result = solver.solve(catalog, records);
  assert.equal(result.conflicts.length, 0);
  assert.match(result.lines.join("\n"), /46,340×2.*斯诺克纪念球杆/);
}

{
  const synthetic = [
    { 名称: "甲", 品质: "紫品", 价值: "100", 轮廓: "2×2（4格）" },
    { 名称: "乙", 品质: "紫品", 价值: "200", 轮廓: "1×2（2格）" },
  ];
  const records = [{ templateId: "outline-quality-all", params: { quality: "紫品" }, results: ["2×2（4格）", "1×2（2格）"] }];
  const result = solver.solve(synthetic, records);
  assert.match(result.lines.join("\n"), /2件，共6格/);
  assert.match(result.lines.join("\n"), /唯一属性组合/);
}

{
  const records = [
    record("slots-quality-one", "紫品", 2),
    record("value-quality-total", "紫品", 4373),
    record("slots-quality-one", "紫品", 1),
  ];
  const result = solver.solve(catalog, records);
  assert.deepEqual(result.conflicts, []);
  assert.match(result.lines.join("\n"), /至少 2 件不同藏品/);
  assert.match(result.lines.join("\n"), /1格×1.*2格×1/);
  assert.match(result.lines.join("\n"), /最低合计价值为 6,755/);
  assert.match(result.lines.join("\n"), /数据库未覆盖/);
}

{
  const records = [
    record("slots-quality-one", "紫品", 2),
    record("value-quality-total", "紫品", 4373),
    record("slots-quality-one", "紫品", 1),
    record("slots-quality-one", "紫品", 2),
  ];
  const result = solver.solve(catalog, records);
  assert.deepEqual(result.conflicts, []);
  assert.match(result.lines.join("\n"), /至少 3 件不同藏品/);
  assert.match(result.lines.join("\n"), /1格×1.*2格×2/);
}

{
  const synthetic = [{ 名称: "一格紫品", 品质: "紫品", 价值: "100", 轮廓: "1×1（1格）" }];
  const records = [
    record("count-quality-total", "紫品", 1),
    record("slots-quality-one", "紫品", 1),
    record("slots-quality-one", "紫品", 1),
  ];
  const result = solver.solve(synthetic, records);
  assert.match(result.conflicts.join("\n"), /至少已揭示 2 件不同实例/);
}

console.log("inference solver tests passed");
