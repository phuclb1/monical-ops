# Dừng máy gửi. Chỉ chạy được khi PowerShell được mở bằng Run as administrator.
$ErrorActionPreference = "Stop"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $admin) {
  Write-Error "Cần mật khẩu Administrator. Chuột phải PowerShell, chọn Run as administrator."
  exit 1
}

$taskName = "Monical Zalo Sender"
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Output "Đã dừng và gỡ lịch khởi động. Thư mục C:\ProgramData\MonicalZalo vẫn còn."
