import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next" || name === ".git") return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [full] : [];
  });
}

describe("session policy", () => {
  it("does not persist the session in browser storage", () => {
    const hits = files(process.cwd()).filter((file) => {
      if (file.includes(`${path.sep}tests${path.sep}`)) return false;
      const text = readFileSync(file, "utf8");
      return /localStorage|sessionStorage|indexedDB/.test(text);
    });
    expect(hits).toEqual([]);
  });
});
