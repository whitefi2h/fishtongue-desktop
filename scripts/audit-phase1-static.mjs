import fs from "node:fs";
import path from "node:path";

const output = path.resolve("out");
if (!fs.existsSync(output)) {
  throw new Error("缺少 out 静态导出目录，请先运行 npm run build:desktop。");
}

const forbidden = [
  "neo4j-driver",
  "next-auth",
  "bolt://",
  "neo4j://",
  "localhost:7474",
  "localhost:7687",
];
const files = walk(output).filter((file) => /\.(?:js|html|json)$/.test(file));
const violations = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) violations.push(`${path.relative(output, file)}: ${token}`);
  }
}

const apiOutput = path.join(output, "api");
if (fs.existsSync(apiOutput)) violations.push("静态产物包含 api/ 路由目录");

if (violations.length) {
  throw new Error(`Phase 1 静态产物审计失败：\n${violations.join("\n")}`);
}
console.log(`Phase 1 静态产物审计通过（${files.length} 个文件）。`);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

