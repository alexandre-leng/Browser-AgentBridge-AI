# Génère les variantes d'icônes "connecté" (vert) et "déconnecté" (rouge)
# en PNG aux tailles 16/48/128 — dessinées directement via System.Drawing.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot "..\src\extension\icons"
$iconsDir = (Resolve-Path $iconsDir).Path

function New-StatusIcon {
    param(
        [int]$Size,
        [string]$Hex,        # ex: "#2ed573"
        [string]$OutPath
    )

    $color = [System.Drawing.ColorTranslator]::FromHtml($Hex)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Fond transparent
    $g.Clear([System.Drawing.Color]::Transparent)

    # Coin arrondi proportionnel
    $radius = [Math]::Max(2, [int]($Size * 0.18))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillPath($brush, $path)
    $brush.Dispose()

    # Cercle blanc central (visage)
    $cR = [int]($Size * 0.32)
    $cx = [int]($Size * 0.5 - $cR / 2)
    $cy = [int]($Size * 0.46 - $cR / 2)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, $cx, $cy, $cR, $cR)

    # Deux yeux colorés
    $eyeR = [Math]::Max(1, [int]($Size * 0.05))
    $colorBrush = New-Object System.Drawing.SolidBrush($color)
    $eyeY = [int]($Size * 0.42)
    $g.FillEllipse($colorBrush, [int]($Size * 0.42), $eyeY, $eyeR * 2, $eyeR * 2)
    $g.FillEllipse($colorBrush, [int]($Size * 0.54), $eyeY, $eyeR * 2, $eyeR * 2)

    # Sourire (arc blanc)
    if ($Size -ge 32) {
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [Math]::Max(1, $Size * 0.04))
        $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $smileRect = New-Object System.Drawing.Rectangle([int]($Size * 0.36), [int]($Size * 0.5), [int]($Size * 0.28), [int]($Size * 0.22))
        $g.DrawArc($pen, $smileRect, 20, 140)
        $pen.Dispose()
    }

    $whiteBrush.Dispose()
    $colorBrush.Dispose()
    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote $OutPath"
}

$variants = @(
    @{ Hex = '#2ed573'; Suffix = 'green' },
    @{ Hex = '#ff4757'; Suffix = 'red'   }
)

foreach ($v in $variants) {
    foreach ($size in @(16, 48, 128)) {
        $out = Join-Path $iconsDir ("icon{0}_{1}.png" -f $size, $v.Suffix)
        New-StatusIcon -Size $size -Hex $v.Hex -OutPath $out
    }
}

Write-Host "--- Done ---" -ForegroundColor Green
