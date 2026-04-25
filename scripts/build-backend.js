const { existsSync, mkdirSync, rmSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist", "backend");
const buildDir = path.join(root, ".build", "pyinstaller", "build");
const specDir = path.join(root, ".build", "pyinstaller", "spec");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  return result.status === 0;
}

function detectPython() {
  const localVenvCandidates = process.platform === "win32"
    ? [
        [path.join(root, "env", "Scripts", "python.exe"), []],
      ]
    : [
        [path.join(root, "env", "bin", "python"), []],
      ];

  const candidates = process.platform === "win32"
    ? [
        ["py", ["-3.13"]],
        ["py", ["-3.12"]],
        ["python", []],
      ]
    : [
        ["python3.13", []],
        ["python3.12", []],
        ["python3", []],
        ["python", []],
      ];

  for (const [command, baseArgs] of [...localVenvCandidates, ...candidates]) {
    const result = spawnSync(command, [...baseArgs, "--version"], {
      cwd: root,
      stdio: "ignore",
      shell: false,
    });

    if (result.status === 0) {
      return { command, baseArgs };
    }
  }

  throw new Error("Python 3.12 or 3.13 was not found. Install Python and retry.");
}

function main() {
  const python = detectPython();

  mkdirSync(distDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(specDir, { recursive: true });

  const outputName = process.platform === "win32" ? "server.exe" : "server";
  const outputPath = path.join(distDir, outputName);
  if (existsSync(outputPath)) {
    rmSync(outputPath, { force: true });
  }

  const args = [
    ...python.baseArgs,
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    "server",
    "--distpath",
    distDir,
    "--workpath",
    buildDir,
    "--specpath",
    specDir,
    "server.py",
  ];

  if (!run(python.command, args)) {
    process.exit(1);
  }
}

main();
