# OpenClaw Extension Build Script
$ErrorActionPreference = "Stop"

$extDir = "src\extension"
$distDir = "dist"
$srcFiles = @("background.js", "browser-polyfill.js", "content.js", "popup.html", "popup.js")
$icons = "$extDir/icons"
$distChrome = "$distDir/chrome"
$distFirefox = "$distDir/firefox"

Write-Host "--- Building Extensions ---" -ForegroundColor Cyan

# 1. Clean dist
Write-Host "Cleaning dist..."
if (Test-Path $distDir) {
    Remove-Item "$distDir/*" -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $distDir -Force
}
New-Item -ItemType Directory -Path $distChrome -Force
New-Item -ItemType Directory -Path $distFirefox -Force

# 2. Chrome Build
Write-Host "Building Chrome..."
foreach ($file in $srcFiles) {
    Copy-Item "$extDir/$file" "$distChrome/" -Force
}
Copy-Item "$icons" "$distChrome/" -Recurse -Force
Copy-Item "$extDir/manifest.chrome.json" "$distChrome/manifest.json" -Force

if (Test-Path "$distDir/openclaw-chrome.zip") { Remove-Item "$distDir/openclaw-chrome.zip" -Force }
Get-ChildItem -Path "$distChrome" | Compress-Archive -DestinationPath "$distDir/openclaw-chrome.zip" -Force

# 3. Firefox Build
Write-Host "Building Firefox..."
foreach ($file in $srcFiles) {
    Copy-Item "$extDir/$file" "$distFirefox/" -Force
}
Copy-Item "$icons" "$distFirefox/" -Recurse -Force
Copy-Item "$extDir/manifest.firefox.json" "$distFirefox/manifest.json" -Force

# Archivage à plat
if (Test-Path "$distDir/openclaw-firefox.zip") { Remove-Item "$distDir/openclaw-firefox.zip" -Force }
Get-ChildItem -Path "$distFirefox" | Compress-Archive -DestinationPath "$distDir/openclaw-firefox.zip" -Force
if (Test-Path "$distDir/openclaw-firefox.xpi") { Remove-Item "$distDir/openclaw-firefox.xpi" -Force }
Rename-Item "$distDir/openclaw-firefox.zip" "openclaw-firefox.xpi"

Write-Host "--- Done! ---" -ForegroundColor Green
Write-Host "Chrome Package:  $distDir/openclaw-chrome.zip"
Write-Host "Firefox Package: $distDir/openclaw-firefox.xpi"


Write-Host "--- Done! ---" -ForegroundColor Green
Write-Host "Chrome Package:  dist/openclaw-chrome.zip"
Write-Host "Firefox Package: dist/openclaw-firefox.xpi"

