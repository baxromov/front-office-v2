# ================================
# CONFIG
# ================================
$serverUser = "bakhromovshb"
$serverHost = "172.31.174.11"
$server = "$serverUser@$serverHost"

$serverImagesPath = "/home/$serverUser/images"
$serverProjectPath = "/home/$serverUser/front-office-v2"

$composeFile = "docker-compose.server.yml"
$envFile = ".env"
# ================================


Write-Host "➡️ Ensuring server directories exist..."
ssh $server "mkdir -p $serverImagesPath && mkdir -p $serverProjectPath"
Write-Host "✅ Directories ready."


Write-Host "➡️ Uploading compose file..."
scp "$composeFile" "${server}:${serverProjectPath}/"
Write-Host "✅ Compose uploaded."


Write-Host "➡️ Uploading .env file..."
scp "$envFile" "${server}:${serverProjectPath}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERROR: .env upload failed! Check local file exists."
    exit 1
}
Write-Host "✅ .env uploaded."


Write-Host "➡️ Committing project images..."
docker commit front-office-v2-fastapi-1 front-office-v2-fastapi-img | Out-Null
docker commit front-office-v2-langgraph-server-1 front-office-v2-langgraph-img | Out-Null
docker commit front-office-v2-frontend-1 front-office-frontend-img | Out-Null
Write-Host "✅ Commit complete."


Write-Host "➡️ Saving tar files..."
docker save -o fastapi.tar front-office-v2-fastapi-img
docker save -o langgraph.tar front-office-v2-langgraph-img
docker save -o frontend.tar front-office-frontend-img
Write-Host "✅ TARs created."


Write-Host "➡️ Uploading TAR files..."
scp fastapi.tar langgraph.tar frontend.tar "${server}:${serverImagesPath}/"
Write-Host "✅ TAR upload complete."


Write-Host "➡️ Removing old docker containers + images on server..."
ssh $server "docker rm -f fastapi langgraph-server frontend 2>/dev/null"
ssh $server "docker rmi -f front-office-v2-fastapi-img front-office-v2-langgraph-img front-office-frontend-img 2>/dev/null"
Write-Host "✅ Old containers & images removed."


Write-Host "➡️ Loading new images..."
ssh $server "
    docker load -i $serverImagesPath/fastapi.tar &&
    docker load -i $serverImagesPath/langgraph.tar &&
    docker load -i $serverImagesPath/frontend.tar
"
Write-Host "✅ Images loaded."


Write-Host "➡️ Running docker compose..."
ssh $server "cd $serverProjectPath && docker compose -f docker-compose.server.yml up -d"
Write-Host "✅ DEPLOYMENT COMPLETE!"
