param([double[]]$From, [double[]]$To)
# drag inside the game window; coordinates are in the 960-wide screenshot space
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
public struct RECT { public int L, T, R, B; } }
"@
[M]::SetProcessDPIAware() | Out-Null
$p = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { "no window"; exit 1 }
[M]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$r = New-Object M+RECT; [M]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$s = ($r.R - $r.L) / 960.0
function Pt($v) { return @([int]($r.L + $v[0] * $s), [int]($r.T + $v[1] * $s)) }
$a = Pt $From; $b = Pt $To
[M]::SetCursorPos($a[0], $a[1]) | Out-Null; Start-Sleep -Milliseconds 250
[M]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 250
for ($i = 1; $i -le 12; $i++) { [M]::SetCursorPos([int]($a[0] + ($b[0] - $a[0]) * $i / 12), [int]($a[1] + ($b[1] - $a[1]) * $i / 12)) | Out-Null; Start-Sleep -Milliseconds 45 }
Start-Sleep -Milliseconds 250
[M]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
"dragged"
