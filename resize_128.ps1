Add-Type -AssemblyName System.Drawing

$sourcePath = 'extension\icons\icon128.png'
$srcImg = [System.Drawing.Image]::FromFile($sourcePath)

$destPath = "extension\icons\icon128_new.png"
$bmp = New-Object System.Drawing.Bitmap(128, 128)
$graph = [System.Drawing.Graphics]::FromImage($bmp)
$graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graph.DrawImage($srcImg, 0, 0, 128, 128)
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graph.Dispose()
$bmp.Dispose()
$srcImg.Dispose()

Remove-Item $sourcePath -Force
Rename-Item $destPath "icon128.png"
