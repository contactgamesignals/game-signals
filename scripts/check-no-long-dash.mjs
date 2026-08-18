import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const forbidden = String.fromCodePoint(0x2014);
const ignoredDirectories = new Set([".git", ".next", "node_modules", ".vercel", "coverage", "dist"]);
const textExtensions = new Set([
  ".cjs", ".css", ".csv", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sql", ".svg", ".ts", ".tsx", ".txt", ".yml", ".yaml",
]);

const hits = [];

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(absolutePath);
      continue;
    }

    if (!entry.isFile() || !textExtensions.has(extname(entry.name).toLowerCase())) continue;

    let content;
    try {
      content = await readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(forbidden)) {
        hits.push(`${relative(root, absolutePath)}:${index + 1}`);
      }
    });
  }
}

await scanDirectory(root);

if (hits.length > 0) {
  console.error("Long dash character is not allowed. Replace it with a normal hyphen, comma, colon, or rewrite the sentence.");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log("No long dash characters found.");
