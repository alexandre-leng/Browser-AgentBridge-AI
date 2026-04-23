# OpenClaw Extension Build Script
$ErrorActionPreference = "Stop"

$base = "extension"
$src = "extension/src"
$icons = "extension/icons"
$distChrome = "dist/chrome"
$distFirefox = "dist/firefox"

Write-Host "--- Building Extensions ---" -ForegroundColor Cyan

# 1. Clean dist
Remove-Item "$distChrome/*", "$distFirefox/*" -Recurse -ErrorAction SilentlyContinue

# 2. Chrome Build
Write-Host "Building Chrome..."
Copy-Item "$src/*" "$distChrome/" -Recurse
Copy-Item "$icons" "$distChrome/icons" -Recurse
Copy-Item "$base/manifest.chrome.json" "$distChrome/manifest.json" -Force

# 3. Firefox Build
Write-Host "Building Firefox..."
Copy-Item "$src/*" "$distFirefox/" -Recurse
Copy-Item "$icons" "$distFirefox/icons" -Recurse
Copy-Item "$base/manifest.firefox.json" "$distFirefox/manifest.json" -Force

Write-Host "--- Done! ---" -ForegroundColor Green
Write-Host "Chrome Extension:  $distChrome"
Write-Host "Firefox Extension: $distFirefox"
