import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliRoot = path.join(repoRoot, "packages", "cli");

describe("9routerd CLI package", () => {
  test("declares the publishable 9routerd package and global bin", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf8"));

    expect(pkg.name).toBe("9routerd");
    expect(pkg.version).toBe("0.4.18+1");
    expect(pkg.private).not.toBe(true);
    expect(pkg.bin).toEqual({ "9routerd": "./bin/9routerd.js" });
    expect(pkg.files).toEqual(expect.arrayContaining(["bin/", "scripts/", "app/", "README.md"]));
    expect(pkg.scripts["prepare:app"]).toBe("node scripts/prepare-app.js");
    expect(pkg.scripts.prepack).toBe("npm run prepare:app");
  });

  test("ships executable CLI and app preparation script", () => {
    const bin = path.join(cliRoot, "bin", "9routerd.js");
    const prepare = path.join(cliRoot, "scripts", "prepare-app.js");

    expect(fs.existsSync(bin)).toBe(true);
    expect(fs.readFileSync(bin, "utf8")).toContain("start");
    expect(fs.statSync(bin).mode & 0o111).toBeGreaterThan(0);
    expect(fs.existsSync(prepare)).toBe(true);
    expect(fs.readFileSync(prepare, "utf8")).toContain(".next/standalone/server.js");
  });
});
