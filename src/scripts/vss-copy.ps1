param(
    [Parameter(Mandatory=$true)][string]$SourcePath,
    [Parameter(Mandatory=$true)][string]$DestPath
)

$ErrorActionPreference = 'Stop'

$drive = $SourcePath.Substring(0, 2) + '\'
$relativePath = $SourcePath.Substring(2)

try {
    $shadow = (Get-WmiObject -List Win32_ShadowCopy).Create($drive, 'ClientAccessible')
    $shadowObj = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $shadow.ShadowID }
    $shadowPath = $shadowObj.DeviceObject + $relativePath

    cmd /c "copy `"$shadowPath`" `"$DestPath`" /y" | Out-Null

    $shadowObj.Delete()

    if (Test-Path $DestPath) {
        Write-Output 'OK'
    } else {
        Write-Output 'FAIL'
    }
} catch {
    Write-Error $_
    exit 1
}
