# Starts a fresh local Anvil chain and deploys Mohar to it (also the demo-day fallback, see README).
#   powershell -File scripts/dev-chain.ps1            # fresh chain + deploy
#   powershell -File scripts/dev-chain.ps1 -Stop      # stop anvil
param([switch]$Stop, [int]$Port = 8545)

$foundry = Join-Path $env:USERPROFILE ".foundry\bin"
if (Test-Path $foundry) { $env:Path += ";$foundry" }
Get-Process anvil -ErrorAction SilentlyContinue | Stop-Process -Force
if ($Stop) { Write-Host "anvil stopped"; exit 0 }

$log = Join-Path $env:TEMP "mohar-anvil.log"
Start-Process -FilePath (Get-Command anvil).Source -ArgumentList "--port", $Port -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError ($log + ".err")
for ($i = 0; $i -lt 40; $i++) {
  try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | Out-Null; break } catch { Start-Sleep -Milliseconds 250 }
}

# anvil account #0 is the accreditation authority, #1 is the demo issuer (Acharya Institute)
$env:PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
$env:NETWORK = "anvil"
$env:DEMO_ISSUER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
Push-Location (Join-Path $PSScriptRoot "..\packages\contracts")
forge script script/Deploy.s.sol --rpc-url "http://127.0.0.1:$Port" --broadcast 2>&1 | Select-String "IssuerRegistry|CertificateRegistry|wrote|Error|SUCCESSFUL"
Pop-Location
