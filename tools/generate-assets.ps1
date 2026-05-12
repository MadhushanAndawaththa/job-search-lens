$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
    param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2.0
    $path.AddArc($x, $y, $d, $d, 180.0, 90.0)
    $path.AddArc(($x + $w - $d), $y, $d, $d, 270.0, 90.0)
    $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0.0, 90.0)
    $path.AddArc($x, ($y + $h - $d), $d, $d, 90.0, 90.0)
    $path.CloseFigure()
    return $path
}

function Set-GraphicsQuality {
    param($g)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}

function Draw-Pill {
    param($g, [float]$x, [float]$y, [string]$text, $font, [string]$fillColor, [string]$textColor)
    $size = $g.MeasureString($text, $font)
    $padX = 16.0
    $padY = 8.0
    $pw = [float]($size.Width + ($padX * 2.0))
    $ph = [float]($size.Height + ($padY * 2.0))
    $path = New-RoundedPath -x $x -y $y -w $pw -h $ph -r 14.0
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($fillColor))
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($textColor))
    $g.FillPath($brush, $path)
    $g.DrawString($text, $font, $textBrush, ($x + $padX), ($y + $padY - 1.0))
    $brush.Dispose()
    $textBrush.Dispose()
    $path.Dispose()
    return [float]($size.Width + ($padX * 2.0))
}

function Draw-CardMock {
    param($g, [float]$x, [float]$y, [float]$w, [float]$h)
    $sx = $x + 6.0
    $sy = $y + 12.0
    $shadowPath = New-RoundedPath -x $sx -y $sy -w $w -h $h -r 24.0
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 15, 23, 42))
    $g.FillPath($shadowBrush, $shadowPath)
    $shadowBrush.Dispose()
    $shadowPath.Dispose()
    $cardPath = New-RoundedPath -x $x -y $y -w $w -h $h -r 24.0
    $cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 255, 255, 255))
    $g.FillPath($cardBrush, $cardPath)
    $cardBrush.Dispose()
    $cardPath.Dispose()
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#DDE7F3'), 1.0)
    $titleFS = [float][Math]::Max([Math]::Round($h * 0.045), 11.0)
    $titleFont = New-Object System.Drawing.Font('Segoe UI', $titleFS, [System.Drawing.FontStyle]::Bold)
    $bodyFS = [float][Math]::Max([Math]::Round($h * 0.03), 8.0)
    $bodyFont = New-Object System.Drawing.Font('Segoe UI', $bodyFS)
    $mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#5B6B7D'))
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#163042'))
    $g.DrawString('Job Hunt Visualizer', $titleFont, $textBrush, ($x + ($w * 0.08)), ($y + ($h * 0.08)))
    $g.DrawLine($linePen, ($x + ($w * 0.08)), ($y + ($h * 0.19)), ($x + ($w * 0.92)), ($y + ($h * 0.19)))
    $g.DrawString('Highlight keywords on LinkedIn job details', $bodyFont, $mutedBrush, ($x + ($w * 0.08)), ($y + ($h * 0.24)))
    $swatchColors = @('#FFE082', '#FFCC80', '#CE93D8', '#90CAF9', '#A5D6A7')
    for ($i = 0; $i -lt $swatchColors.Count; $i++) {
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($swatchColors[$i]))
        $g.FillEllipse($brush, ($x + ($w * 0.08) + ($i * ($w * 0.1))), ($y + ($h * 0.34)), ($w * 0.065), ($w * 0.065))
        $brush.Dispose()
    }
    $rowYs = @([float]($y + ($h * 0.52)), [float]($y + ($h * 0.64)), [float]($y + ($h * 0.76)))
    $dots = @('#6B7280', '#1D4ED8', '#188038')
    $labels = @('Viewed', 'Saved', 'Applied')
    for ($i = 0; $i -lt $rowYs.Count; $i++) {
        $rw = [float]($w * 0.84)
        $rh = [float]($h * 0.08)
        $rx = [float]($x + ($w * 0.08))
        $rowPath = New-RoundedPath -x $rx -y $rowYs[$i] -w $rw -h $rh -r 12.0
        $rowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#F8FAFC'))
        $g.FillPath($rowBrush, $rowPath)
        $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($dots[$i]))
        $g.FillEllipse($dotBrush, ($x + ($w * 0.12)), ($rowYs[$i] + ($h * 0.022)), ($w * 0.03), ($w * 0.03))
        $g.DrawString($labels[$i], $bodyFont, $textBrush, ($x + ($w * 0.18)), ($rowYs[$i] + ($h * 0.015)))
        $rowBrush.Dispose()
        $dotBrush.Dispose()
        $rowPath.Dispose()
    }
    $linePen.Dispose()
    $titleFont.Dispose()
    $bodyFont.Dispose()
    $mutedBrush.Dispose()
    $textBrush.Dispose()
}

function Write-Icon {
    param([int]$size, [string]$path)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Set-GraphicsQuality -g $g
    $g.Clear([System.Drawing.Color]::Transparent)
    $szm1 = [float]($size - 1)
    $bgRect = New-Object System.Drawing.RectangleF(0.0, 0.0, $szm1, $szm1)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, [System.Drawing.ColorTranslator]::FromHtml('#0F766E'), [System.Drawing.ColorTranslator]::FromHtml('#1D4ED8'), 35.0)
    $iconRadius = [float][Math]::Max([Math]::Round($size * 0.22), 4.0)
    $szm2 = [float]($size - 2)
    $bgPath = New-RoundedPath -x 1.0 -y 1.0 -w $szm2 -h $szm2 -r $iconRadius
    $g.FillPath($bgBrush, $bgPath)
    $cardRadius = [float][Math]::Max([Math]::Round($size * 0.08), 3.0)
    $cx = [float]($size * 0.16)
    $cy = [float]($size * 0.14)
    $cw = [float]($size * 0.40)
    $ch = [float]($size * 0.52)
    $cardPath = New-RoundedPath -x $cx -y $cy -w $cw -h $ch -r $cardRadius
    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235,255,255,255))
    $g.FillPath($cardBrush, $cardPath)
    $lineColors = @('#FFE082', '#A5D6A7', '#90CAF9')
    for ($i = 0; $i -lt $lineColors.Count; $i++) {
        $lineWidth = [float][Math]::Max([Math]::Round($size * 0.055), 2.0)
        $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($lineColors[$i]), $lineWidth)
        $startY = [float](($size * 0.26) + ($i * ($size * 0.11)))
        $g.DrawLine($pen, [float]($size * 0.22), $startY, [float]($size * 0.47), $startY)
        $pen.Dispose()
    }
    $lensWidth = [float][Math]::Max([Math]::Round($size * 0.075), 2.0)
    $lensPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $lensWidth)
    $g.DrawEllipse($lensPen, ($size * 0.48), ($size * 0.28), ($size * 0.23), ($size * 0.23))
    $g.DrawLine($lensPen, ($size * 0.64), ($size * 0.46), ($size * 0.80), ($size * 0.62))
    $bgBrush.Dispose()
    $bgPath.Dispose()
    $cardBrush.Dispose()
    $cardPath.Dispose()
    $lensPen.Dispose()
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

function Write-Banner {
    param([int]$w, [int]$h, [string]$path, [string]$title, [string]$subtitle)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Set-GraphicsQuality -g $g
    $wf = [float]$w
    $hf = [float]$h
    $bgRect = New-Object System.Drawing.RectangleF(0.0, 0.0, $wf, $hf)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, [System.Drawing.ColorTranslator]::FromHtml('#0F766E'), [System.Drawing.ColorTranslator]::FromHtml('#1D4ED8'), 18.0)
    $g.FillRectangle($bgBrush, 0.0, 0.0, $wf, $hf)
    $orb1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26,255,255,255))
    $orb2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18,255,255,255))
    $g.FillEllipse($orb1, -40.0, -40.0, ($w * 0.38), ($w * 0.38))
    $g.FillEllipse($orb2, ($w * 0.62), ($h * 0.08), ($w * 0.26), ($w * 0.26))
    $g.FillEllipse($orb2, ($w * 0.55), ($h * 0.58), ($w * 0.22), ($w * 0.22))
    $titleFS = [float][Math]::Max([Math]::Round($h * 0.085), 22.0)
    $titleFont = New-Object System.Drawing.Font('Segoe UI', $titleFS, [System.Drawing.FontStyle]::Bold)
    $subtitleFS = [float][Math]::Max([Math]::Round($h * 0.042), 12.0)
    $subtitleFont = New-Object System.Drawing.Font('Segoe UI', $subtitleFS)
    $pillFS = [float][Math]::Max([Math]::Round($h * 0.032), 10.0)
    $pillFont = New-Object System.Drawing.Font('Segoe UI', $pillFS, [System.Drawing.FontStyle]::Bold)
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $softBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 239, 248, 255))
    $left = [float]($w * 0.07)
    $top = [float]($h * 0.12)
    $textWidth = [float]($w * 0.43)
    $titleRect = New-Object System.Drawing.RectangleF($left, $top, $textWidth, ($h * 0.28))
    $subtitleRect = New-Object System.Drawing.RectangleF($left, ($top + ($h * 0.26)), $textWidth, ($h * 0.16))
    $g.DrawString($title, $titleFont, $whiteBrush, $titleRect)
    $g.DrawString($subtitle, $subtitleFont, $softBrush, $subtitleRect)
    $pillX = $left
    $pillY = $top + ($h * 0.52)
    $dr1 = Draw-Pill -g $g -x $pillX -y $pillY -text 'Local-only' -font $pillFont -fillColor '#E6FFFB' -textColor '#115E59'
    $pillX += $dr1 + 10.0
    $dr2 = Draw-Pill -g $g -x $pillX -y $pillY -text 'Keyword highlights' -font $pillFont -fillColor '#DBEAFE' -textColor '#1D4ED8'
    $pillX += $dr2 + 10.0
    [void](Draw-Pill -g $g -x $pillX -y $pillY -text 'LinkedIn Jobs' -font $pillFont -fillColor '#FEF3C7' -textColor '#92400E')
    Draw-CardMock -g $g -x ($w * 0.58) -y ($h * 0.12) -w ($w * 0.30) -h ($h * 0.70)
    $bgBrush.Dispose()
    $orb1.Dispose()
    $orb2.Dispose()
    $titleFont.Dispose()
    $subtitleFont.Dispose()
    $pillFont.Dispose()
    $whiteBrush.Dispose()
    $softBrush.Dispose()
    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$iconDir = Join-Path (Get-Location) 'assets/icons'
$storeDir = Join-Path (Get-Location) 'assets/store'
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Force -Path $iconDir | Out-Null }
if (-not (Test-Path $storeDir)) { New-Item -ItemType Directory -Force -Path $storeDir | Out-Null }
foreach ($size in 16,32,48,128) {
    Write-Icon -size $size -path (Join-Path $iconDir ("icon$size.png"))
}
Write-Banner -w 440 -h 280 -path (Join-Path $storeDir 'small-promo-440x280.png') -title 'Job Hunt Visualizer' -subtitle 'Highlight keywords and dim previously processed jobs.'
Write-Banner -w 1400 -h 560 -path (Join-Path $storeDir 'marquee-1400x560.png') -title 'Scan LinkedIn Jobs Faster' -subtitle 'Highlight the terms you care about and de-emphasize jobs LinkedIn already marks as Viewed, Saved, or Applied.'
Write-Banner -w 1280 -h 800 -path (Join-Path $storeDir 'store-preview-1280x800.png') -title 'Less noise. Faster scans.' -subtitle 'Local-only highlights and state dimming.'
