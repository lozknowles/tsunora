# Fixed CIM metadata queries. $Request is decoded data, never caller script.
$ErrorActionPreference = 'Stop'
$Product = Get-CimInstance Win32_ComputerSystemProduct -OperationTimeoutSec 2
$Identity = ([string]$Product.UUID).Trim().ToLowerInvariant()
if ($Identity -notmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' -or $Identity -match '^0+-0+-0+-0+-0+$|^f+-f+-f+-f+-f+$') { throw 'machine_identity_unavailable' }
$Hasher = [System.Security.Cryptography.SHA256]::Create()
$IdentityHash = -join ($Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes('agent-control-windows-machine/v1:' + $Identity)) | ForEach-Object { $_.ToString('x2') })
$Hasher.Dispose()
$Identity = $null
$Product = $null
$Computer = Get-CimInstance Win32_ComputerSystem -OperationTimeoutSec 2
$OperatingSystem = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 2
$Cpu = Get-CimInstance Win32_Processor -OperationTimeoutSec 2 | Select-Object -First 1
$Architecture = switch ([int]$Cpu.Architecture) { 0 {'i386'} 9 {'x86_64'} 12 {'aarch64'} default {throw 'unsupported_architecture'} }
$Graphics = @{status='UNAVAILABLE'; source='WINDOWS_CIM'; devices=@()}
try {
    $Devices = @(Get-CimInstance Win32_VideoController -OperationTimeoutSec 2 | Sort-Object DeviceID | Select-Object -First 32)
    $Index = 0
    $Graphics.devices = @($Devices | ForEach-Object {
        # AdapterRAM is unreliable for shared/integrated GPUs; do not call it VRAM.
        @{index=$Index; model=([string]$_.Name).Trim(); memoryMiB=$null; driver=([string]$_.DriverVersion).Trim()}
        $Index += 1
    })
    $Graphics.status = 'OBSERVED'
} catch { $Graphics = @{status='UNAVAILABLE'; source='WINDOWS_CIM'; devices=@()} }
[ordered]@{
    schema='agent-control.estate-remote/v1'; method='smbios-uuid+cim-metadata/v1'
    resourceAlias=$Request.resourceAlias; nonce=$Request.nonce
    observedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); status='COMPLETE'
    host=@{identitySha256=$IdentityHash; platform='windows'; architecture=$Architecture; identityScope='SMBIOS_UUID'}
    cpuCount=[int]$Computer.NumberOfLogicalProcessors; memoryBytes=[long]$Computer.TotalPhysicalMemory
    cpuModel=([string]$Cpu.Name).Trim(); gpuInventory=$Graphics
    deviceModel=([string]$Computer.Model).Trim(); osVersion=([string]$OperatingSystem.Version).Trim(); missing=@()
} | ConvertTo-Json -Depth 6 -Compress
