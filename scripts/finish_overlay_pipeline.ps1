# ==========================================
# FINISH LOWER-THIRD OVERLAY PIPELINE
# From cropped images → OBS overlays
# ==========================================

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "   FINISHING LOWER-THIRD PIPELINE"
Write-Host "=========================================="
Write-Host ""

# -------- PATHS --------
$BaseDir = "D:\livestreamEKC"

$LowerThirdDir = "$BaseDir\sdaFamily\LowerThirdAssets\lowerthird"

$WebDir = "$BaseDir\web"
$OverlaysDir = "$WebDir\overlays"
$AssetsDir = "$WebDir\assets"
$ImagesDir = "$AssetsDir\images"

$PythonScriptDir = "C:\Users\sbaly\Desktop\new"
$PythonExe = "$PythonScriptDir\conversion_env\Scripts\python.exe"

$HtmlGenerator = "$PythonScriptDir\generate_html_overlays.py"

# -------- CREATE STRUCTURE --------
Write-Host "[+] Creating web folder structure..."

$dirs = @(
    $WebDir,
    $OverlaysDir,
    $AssetsDir,
    $ImagesDir
)

foreach ($dir in $dirs) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "Created: $dir"
    }
}

# -------- COPY IMAGES --------
Write-Host "`n[+] Copying cropped lower-third images..."
Copy-Item "$LowerThirdDir\*.png" "$ImagesDir\" -Force
Write-Host "[✓] Images copied"

# -------- GENERATE HTML --------
if (!(Test-Path $HtmlGenerator)) {
    Write-Host "`n❌ generate_html_overlays.py not found!"
    Write-Host "Expected at: $HtmlGenerator"
    Write-Host "Create it first, then rerun this script."
    exit 1
}

Write-Host "`n[+] Generating HTML overlays..."
& $PythonExe $HtmlGenerator
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ HTML generation failed"
    exit 1
}
Write-Host "[✓] HTML overlays generated"

# -------- START SERVER --------
Write-Host ""
Write-Host "=========================================="
Write-Host "   SYSTEM READY FOR OBS"
Write-Host "=========================================="
Write-Host ""
Write-Host "Starting local web server on port 8080..."
Write-Host "DO NOT CLOSE THIS WINDOW WHILE STREAMING"
Write-Host ""

Set-Location $WebDir
python -m http.server 8080