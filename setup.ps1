# TTS & Video Sync App - Setup Script
# Run this script to set up the application

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TTS & Video Sync App - Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js installation
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "OK Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR Node.js not found!" -ForegroundColor Red
    Write-Host "  Please install Node.js from: https://nodejs.org/" -ForegroundColor Red
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

# Check npm installation
Write-Host "Checking npm installation..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "OK npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR npm not found!" -ForegroundColor Red
    exit 1
}

# Check FFmpeg installation
Write-Host ""
Write-Host "Checking FFmpeg installation..." -ForegroundColor Yellow
try {
    $ffmpegVersion = ffmpeg -version 2>$null
    Write-Host "OK FFmpeg found" -ForegroundColor Green
} catch {
    Write-Host "ERROR FFmpeg not found!" -ForegroundColor Red
    Write-Host "  Please install FFmpeg:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    Write-Host "  2. Extract to C:\ffmpeg" -ForegroundColor Yellow
    Write-Host "  3. Add C:\ffmpeg\bin to PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Continue without FFmpeg? (Video sync will not work) [Y/N]" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -ne "Y" -and $response -ne "y") {
        exit 1
    }
}

# Check Ngrok installation
Write-Host ""
Write-Host "Checking Ngrok installation..." -ForegroundColor Yellow
try {
    $ngrokVersion = ngrok version 2>$null
    Write-Host "OK Ngrok found" -ForegroundColor Green
} catch {
    Write-Host "ERROR Ngrok not found!" -ForegroundColor Red
    Write-Host "  Please install Ngrok:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://ngrok.com/download" -ForegroundColor Yellow
    Write-Host "  2. Extract and add to PATH" -ForegroundColor Yellow
    Write-Host "  3. Sign up and run: ngrok config add-authtoken YOUR_TOKEN" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Continue without Ngrok? (TTS callback will not work) [Y/N]" -ForegroundColor Yellow
    $response = Read-Host
    if ($response -ne "Y" -and $response -ne "y") {
        exit 1
    }
}

# Install npm dependencies
Write-Host ""
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Yellow
Write-Host ""

try {
    npm install
    Write-Host ""
    Write-Host "OK Dependencies installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR Failed to install dependencies!" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

# Create .env file if it doesn't exist
Write-Host ""
Write-Host "Setting up configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "OK Created .env file from template" -ForegroundColor Green
    Write-Host "  Please edit .env file and add your API keys" -ForegroundColor Yellow
} else {
    Write-Host "OK .env file already exists" -ForegroundColor Green
}

# Create assets directory if it doesn't exist
if (-not (Test-Path "assets")) {
    New-Item -ItemType Directory -Path "assets" | Out-Null
    Write-Host "OK Created assets directory" -ForegroundColor Green
}

# Final instructions
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env file with your API keys:" -ForegroundColor White
Write-Host "   notepad .env" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Start Ngrok tunnel (in a separate terminal):" -ForegroundColor White
Write-Host "   ngrok http 9999" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Copy the Ngrok HTTPS URL and add it to .env" -ForegroundColor White
Write-Host ""

Write-Host "4. Start the application:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""

Write-Host "For detailed documentation, see:" -ForegroundColor Yellow
Write-Host "- README.md (full documentation)" -ForegroundColor White
Write-Host "- QUICKSTART.md (quick start guide)" -ForegroundColor White
Write-Host ""

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
