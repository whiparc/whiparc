# Create downloads directory if not exists
New-Item -ItemType Directory -Force -Path "apps/api/static/downloads"

$LDFLAGS = "-s -w -X main.version=0.0.0-dev"

# Go to cli folder to resolve dependency modules
Push-Location "apps/cli"

Write-Host "Building CLI for Windows (64-bit)..."
$env:GOOS="windows"; $env:GOARCH="amd64"
go build -ldflags="$LDFLAGS" -o ../api/static/downloads/whiparc-windows-amd64.exe main.go

Write-Host "Building CLI for macOS (Apple Silicon)..."
$env:GOOS="darwin"; $env:GOARCH="arm64"
go build -ldflags="$LDFLAGS" -o ../api/static/downloads/whiparc-darwin-arm64 main.go

Write-Host "Building CLI for macOS (Intel)..."
$env:GOOS="darwin"; $env:GOARCH="amd64"
go build -ldflags="$LDFLAGS" -o ../api/static/downloads/whiparc-darwin-amd64 main.go

Write-Host "Building CLI for Linux (64-bit)..."
$env:GOOS="linux"; $env:GOARCH="amd64"
go build -ldflags="$LDFLAGS" -o ../api/static/downloads/whiparc-linux-amd64 main.go

Pop-Location

Write-Host "Copying install.sh (Linux/macOS fallback installer)..."
Copy-Item -Force "installers/linux/install.sh" "apps/api/static/downloads/install.sh"

Write-Host "All CLI binaries successfully compiled and placed in apps/api/static/downloads!" -ForegroundColor Green
Write-Host "Note: the packaged installers (whiparc-setup-windows-amd64.exe, whiparc-macos.pkg, .deb/.rpm) are built by CI or installers/windows/build-local.ps1 — this script only produces raw binaries." -ForegroundColor Yellow
