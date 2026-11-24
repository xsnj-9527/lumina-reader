param(
  [string]$SourcePath = (Join-Path (Get-Location) 'public\app-icon.png'),
  [string]$OutIconPath = (Join-Path (Get-Location) 'scripts\app-icon-rounded.png'),
  [string]$OutFaviconPath = (Join-Path (Get-Location) 'public\favicon.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $SourcePath)) {
  throw "Source icon not found: $SourcePath"
}

$srcBitmap = New-Object System.Drawing.Bitmap($SourcePath)
try {
  $size = 1024
  $pad = 82
  $inner = $size - ($pad * 2)
  $radius = 190

  $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      try {
        $d = $radius * 2
        $x = $pad
        $y = $pad
        $path.AddArc($x, $y, $d, $d, 180, 90)
        $path.AddArc($x + $inner - $d, $y, $d, $d, 270, 90)
        $path.AddArc($x + $inner - $d, $y + $inner - $d, $d, $d, 0, 90)
        $path.AddArc($x, $y + $inner - $d, $d, $d, 90, 90)
        $path.CloseFigure()

        $state = $g.Save()
        $g.SetClip($path)
        $g.DrawImage($srcBitmap, (New-Object System.Drawing.Rectangle($x, $y, $inner, $inner)))
        $g.Restore($state)

        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(24, 0, 0, 0), 2)
        try {
          $g.DrawPath($pen, $path)
        } finally {
          $pen.Dispose()
        }
      } finally {
        $path.Dispose()
      }
    } finally {
      $g.Dispose()
    }

    $outDir = Split-Path $OutIconPath -Parent
    if (-not (Test-Path $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $canvas.Save($OutIconPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $favSize = 64
    $favBitmap = New-Object System.Drawing.Bitmap($favSize, $favSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $fg = [System.Drawing.Graphics]::FromImage($favBitmap)
      try {
        $fg.Clear([System.Drawing.Color]::Transparent)
        $fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $fg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $fg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $fg.DrawImage($canvas, (New-Object System.Drawing.Rectangle(0, 0, $favSize, $favSize)))
      } finally {
        $fg.Dispose()
      }
      $favBitmap.Save($OutFaviconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $favBitmap.Dispose()
    }
  } finally {
    $canvas.Dispose()
  }
} finally {
  $srcBitmap.Dispose()
}

Write-Output "Generated rounded icon: $OutIconPath (1024x1024)"
Write-Output "Generated favicon: $OutFaviconPath (64x64)"
