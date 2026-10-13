# Chạy PowerShell bằng Run as administrator:
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Token "token"
param(
  [string]$OpsUrl = "https://platform.monicalhoteldalat.com",
  [string]$Token
)

$ErrorActionPreference = "Stop"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $admin) {
  Write-Error "Cần mật khẩu Administrator. Chuột phải PowerShell, chọn Run as administrator."
  exit 1
}

$node = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $node) {
  Write-Error "Chưa có Node.js 18 trở lên. Cài Node rồi chạy lại."
  exit 1
}

if (-not $Token) {
  $secure = Read-Host "Token máy gửi Zalo" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if (-not $Token) {
  Write-Error "Thiếu token."
  exit 1
}

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = "C:\ProgramData\MonicalZalo"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $source "agent.mjs") (Join-Path $dest "agent.mjs") -Force
Copy-Item (Join-Path $source "package.json") (Join-Path $dest "package.json") -Force

$json = (@{
  opsUrl = $OpsUrl.TrimEnd("/")
  token = $Token
  pollMs = 4000
} | ConvertTo-Json)
[System.IO.File]::WriteAllText((Join-Path $dest "config.json"), $json)

Push-Location $dest
try { & npm install --omit=dev }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

icacls $dest /inheritance:r /T | Out-Null
icacls $dest /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "Users:(OI)(CI)RX" /T | Out-Null
icacls (Join-Path $dest "config.json") /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null

$taskName = "Monical Zalo Sender"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $dest "agent.mjs")`"" -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Đã cài. Máy gửi chạy nền khi Windows khởi động. Chỉ Administrator dừng được."
