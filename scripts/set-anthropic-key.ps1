# Puts the Anthropic API key from the clipboard into .env.local without printing it.
# Usage (after clicking "Copy" on the key in the Anthropic Console):
#   powershell -ExecutionPolicy Bypass -File scripts\set-anthropic-key.ps1
$k = Get-Clipboard -Raw
if ($null -eq $k) { $k = '' }
$k = $k.Trim()
if ($k -notmatch '^sk-ant-[A-Za-z0-9_\-]{20,}$') {
  # not in the clipboard: ask for it in a small window (stays on this computer)
  Add-Type -AssemblyName Microsoft.VisualBasic
  $k = [Microsoft.VisualBasic.Interaction]::InputBox("הדבק כאן את המפתח של Anthropic (מתחיל ב-sk-ant-) ולחץ OK", "מפתח Anthropic").Trim()
}
if ($k -notmatch '^sk-ant-[A-Za-z0-9_\-]{20,}$') {
  Write-Output "NOKEY: no Anthropic key was given"
  exit 1
}
$p = Join-Path $PSScriptRoot '..\.env.local'
$lines = [IO.File]::ReadAllLines($p, [Text.Encoding]::UTF8) | ForEach-Object {
  if ($_ -like 'ANTHROPIC_API_KEY=*') { 'ANTHROPIC_API_KEY=' + $k } else { $_ }
}
[IO.File]::WriteAllLines($p, $lines, (New-Object Text.UTF8Encoding $false))
Set-Clipboard -Value ' '
Write-Output ("OK: saved key " + $k.Substring(0, 11) + "...")
