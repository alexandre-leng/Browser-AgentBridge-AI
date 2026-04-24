Add-Type -AssemblyName System.Drawing

$sourcePath = 'extension\icons\icon128.png'
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

foreach ($size in @(16, 48, 128)) {
    $destPath = "extension\icons\icon$size.png"
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graph = [System.Drawing.Graphics]::FromImage($bmp)
    $graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graph.DrawImage($srcImg, 0, 0, $size, $size)
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graph.Dispose()
    $bmp.Dispose()
    Write-Host "Resized to $size x $size : $destPath"
}
$srcImg.Dispose()
