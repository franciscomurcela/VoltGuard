# Adds VoltGuard local dev subdomain entries to the Windows hosts file.
# Run once per machine: Open PowerShell as Administrator and run ./add-hosts.ps1

$ErrorActionPreference = "Stop"

# Verifica se o PowerShell está a correr como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Este script precisa de privilégios de Administrador para modificar o ficheiro hosts."
    Write-Warning "Por favor, abre o PowerShell como Administrador e tenta novamente."
    exit
}

$HostsFile = "$env:windir\System32\drivers\etc\hosts"

$VoltGuardHosts = @(
    "composer.voltguard.pt",
    "oam.voltguard.pt",
    "notifications.voltguard.pt",
    "anomaly.voltguard.pt",
    "auth.voltguard.pt"
)

$Added = 0

foreach ($HostEntry in $VoltGuardHosts) {
    # O -SimpleMatch garante que procura a string exata, ignorando os pontos como caracteres de regex
    $exists = Select-String -Path $HostsFile -Pattern $HostEntry -SimpleMatch -Quiet
    
    if ($exists) {
        Write-Host "  already present: $HostEntry"
    } else {
        Add-Content -Path $HostsFile -Value "127.0.0.1  $HostEntry"
        Write-Host "  added: $HostEntry"
        $Added++
    }
}

if ($Added -gt 0) {
    $suffix = if ($Added -eq 1) { "y" } else { "ies" }
    Write-Host "Done — $Added entr$suffix added to $HostsFile."
} else {
    Write-Host "Done — all entries were already present."
}