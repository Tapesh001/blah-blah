param([string]$Keys, [int]$HoldMs = 80)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
$p = Get-Process UnrealEditor -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { "no window"; exit 1 }
[K]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
foreach ($c in $Keys.ToUpper().ToCharArray()) {
  $vk = [byte][char]$c; $sc = [byte][K]::MapVirtualKey($vk, 0)
  [K]::keybd_event($vk, $sc, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds $HoldMs
  [K]::keybd_event($vk, $sc, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 120
}
"sent $Keys"
