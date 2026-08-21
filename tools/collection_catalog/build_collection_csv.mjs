import fs from "node:fs/promises";
import path from "node:path";

const [inputPath = "auction_collections_raw.csv", outputPath = "藏品图鉴汇总.csv"] = process.argv.slice(2);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ""; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const [headers, ...body] = rows;
  return body.filter((r) => r.length === headers.length).map((r) => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i]])));
}

function quote(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const categories = { 1: "古董", 2: "珠宝", 3: "奢品", 4: "字画", 5: "化石", 6: "茗酿" };
const qualities = { 1: "白品", 2: "绿品", 3: "蓝品", 4: "紫品", 5: "橙品", 6: "红品" };
const records = parseCsv(await fs.readFile(inputPath, "utf8"))
  .filter((row) => row.field_1 === "1")
  .map((row) => [
    Number(row.id), row.name, `${row.field_4}×${row.field_5}（${row.field_6}格）`, Number(row.value),
    qualities[row.field_3] ?? `未知（${row.field_3}）`, categories[row.field_2] ?? "未知", row.description, row.icon,
  ])
  .sort((a, b) => a[0] - b[0]);

const rows = [["藏品ID", "名称", "轮廓", "价值", "品质", "品类", "描述", "图标资源ID"], ...records];
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`, "utf8");
console.log(`WROTE ${outputPath} records=${records.length}`);
