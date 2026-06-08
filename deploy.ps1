# ==============================================================================
# CME Analytics Engine - One-Click Deployment Script for Windows
# ==============================================================================
#
# This script copies your local files to your DigitalOcean Droplet via SCP
# and triggers a Docker rebuild over SSH.
#
# Usage:
#   1. Open PowerShell in this folder.
#   2. Run: .\deploy.ps1
#
# Note: Make sure your public key is added to the server's authorized_keys.
# ==============================================================================

# --- Configuration ---
$ServerIP = "YOUR_SERVER_IP"  # <-- Change this to your Server IP
$DestPath = "~/cme-analytics-engine"
$ProjectPrefix = "cme-prod"

# Ensure IP is configured
if ($ServerIP -eq "YOUR_SERVER_IP") {
    Write-Host "❌ ERROR: Please open deploy.ps1 and replace 'YOUR_SERVER_IP' with your actual server IP address." -ForegroundColor Red
    Exit
}

Write-Host "🚀 Starting manual deployment to $ServerIP..." -ForegroundColor Cyan

# 1. Create directory on server if it doesn't exist
Write-Host "📂 Ensuring directory exists on server..." -ForegroundColor Yellow
ssh root@$ServerIP "mkdir -p $DestPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to connect or create directory on server." -ForegroundColor Red
    Exit
}

# 2. Sync files directly using SCP
Write-Host "📦 Copying files to server..." -ForegroundColor Yellow
# We exclude node_modules, dist, and local outputs to keep it fast
scp -r `
  Dockerfile `
  docker-compose.yml `
  docker-compose.deploy.yml `
  package.json `
  package-lock.json `
  tsconfig.json `
  src `
  dashboard `
  "root@${ServerIP}:${DestPath}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to copy files." -ForegroundColor Red
    Exit
}
Write-Host "✓ Files copied successfully." -ForegroundColor Green

# 3. Trigger Docker Rebuild on Server
Write-Host "⚙️ Rebuilding and starting Docker containers on server..." -ForegroundColor Yellow
$SSHCommand = @"
cd $DestPath
mkdir -p output logs errors config
echo "🚀 Building Docker containers..."
docker compose -p $ProjectPrefix -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
echo "🧹 Cleaning up old Docker images..."
docker image prune -f
echo "✅ CME Analytics Engine is up and running!"
"@

ssh root@$ServerIP $SSHCommand

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Rebuild failed on server." -ForegroundColor Red
    Exit
}

Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
