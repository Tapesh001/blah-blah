param([string]$Out)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Win { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
public struct RECT { public int L, T, R, B; } }
"@
[Win]::SetProcessDPIAware() | Out-Null
$p = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { "no window"; exit 1 }
[Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 700
$r = New-Object Win+RECT
[Win]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.R - $r.L; $h = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$small = New-Object System.Drawing.Bitmap $bmp, ([int]($w * 960 / [Math]::Max($w,960))), ([int]($h * 960 / [Math]::Max($w,960)))
$small.Save($Out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
"$($p.MainWindowTitle) ${w}x${h} -> $Out"
