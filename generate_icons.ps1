Add-Type -AssemblyName System.Drawing

function Make-AppIcon($size, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    # Background gradient circle
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $c1 = [System.Drawing.ColorTranslator]::FromHtml('#4A148C')
    $c2 = [System.Drawing.ColorTranslator]::FromHtml('#7B1FA2')
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)
    $g.FillEllipse($brush, [int]($size * 0.02), [int]($size * 0.02), [int]($size * 0.96), [int]($size * 0.96))
    
    # White ring
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]($size * 0.03))
    $g.DrawEllipse($pen, [float]($size * 0.04), [float]($size * 0.04), [float]($size * 0.92), [float]($size * 0.92))
    
    # Draw Union logo in center
    $logoPath = Join-Path $PSScriptRoot 'img/nekaba_logo.png'
    if (Test-Path $logoPath) {
        $logo = [System.Drawing.Image]::FromFile($logoPath)
        $targetW = [int]($size * 0.65)
        $targetH = [int]($size * 0.65)
        $targetX = [int](($size - $targetW) / 2)
        $targetY = [int](($size - $targetH) / 2)
        $g.DrawImage($logo, $targetX, $targetY, $targetW, $targetH)
        $logo.Dispose()
    }
    
    $fullOut = Join-Path $PSScriptRoot $outPath
    $bmp.Save($fullOut, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated $fullOut"
}

Make-AppIcon 192 'img/icon-192.png'
Make-AppIcon 512 'img/icon-512.png'
Make-AppIcon 96 'img/icon-96.png'
Make-AppIcon 32 'img/favicon-32.png'
