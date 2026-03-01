const { mkdirSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets", "icons");

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  "bunx",
  ["--bun", "icon-gen", "-i", "assets/logo.png", "-o", "assets/icons"],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}
