param(
  [string]$PythonCommand = "py -3"
)

$ErrorActionPreference = "Stop"
$distDir = Join-Path $PSScriptRoot "..\dist\backend"
if (Test-Path $distDir) {
  Remove-Item -LiteralPath $distDir -Recurse -Force
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $projectRoot
try {
  & powershell -NoProfile -Command "$PythonCommand -m pip install pyinstaller"
  & powershell -NoProfile -Command "$PythonCommand -m PyInstaller server.py --onefile --name server --distpath dist/backend --workpath dist/pyinstaller/build --specpath dist/pyinstaller/spec"
}
finally {
  Pop-Location
}
