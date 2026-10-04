# ONE COMMAND offline fallback: fresh local chain + contracts + seeded demo data + the web app.
#   pnpm demo:local           (or: powershell -ExecutionPolicy Bypass -File scripts/demo-local.ps1)
# Needs: Foundry (anvil, forge), pnpm. No internet, no wallet, no API keys. Stop with: powershell -File scripts/dev-chain.ps1 -Stop
# Everything is LOCAL and DEMO: the chain is Anvil (31337), the issuer domain check uses a labelled stand-in zone.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "1/4 fresh Anvil + contracts"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "dev-chain.ps1")

Write-Host "2/4 seeding one certificate in every verdict state"
$env:NETWORK = "anvil"
$env:PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
$env:DOMAIN = "demo.mohar.local"
$env:APP_ORIGIN = "http://localhost:3000"
pnpm --filter "@mohar/core" seed
if ($LASTEXITCODE -ne 0) { throw "seed failed" }
node scripts/publish-seed.mjs
pnpm --filter "@mohar/core" scheme-seed
if ($LASTEXITCODE -ne 0) { throw "scholarship seed failed" }

Write-Host "3/4 web app on http://localhost:3000 (local demo mode, stand-in DNS zone for demo.mohar.local)"
$env:NEXT_PUBLIC_NETWORK = "anvil"
$env:NEXT_PUBLIC_APP_ORIGIN = "http://localhost:3000"
$env:NEXT_PUBLIC_DEV_DNS_JSON = '{"demo.mohar.local":["*"]}'
Write-Host "4/4 open http://localhost:3000/demo for QR cards and sample applications. Ctrl+C stops the web app."
Start-Process "http://localhost:3000/demo"
pnpm --filter "@mohar/web" dev
