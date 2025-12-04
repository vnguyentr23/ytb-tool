# Quick Start Guide

## 1. Install Prerequisites

### Install Node.js

- Download from: https://nodejs.org/
- Choose LTS version
- Run installer and follow instructions

### Install FFmpeg

#### Windows:

1. Download from: https://ffmpeg.org/download.html#build-windows
2. Extract to `C:\ffmpeg`
3. Add to PATH:
   - Open "Environment Variables"
   - Edit "Path" variable
   - Add: `C:\ffmpeg\bin`
4. Restart terminal/PowerShell

### Install Ngrok

1. Download from: https://ngrok.com/download
2. Extract to a folder
3. Sign up at https://ngrok.com/
4. Get your auth token
5. Run: `ngrok config add-authtoken YOUR_TOKEN`

## 2. Install Application

```powershell
# Navigate to application folder
cd desktop_app

# Install dependencies
npm install
```

## 3. Configure

```powershell
# Create .env file
Copy-Item .env.example .env

# Edit configuration
notepad .env
```

Add your API keys and settings:

```
API_KEY_GEN=your_api_key_here
NGROK_URL=
```

## 4. Start Ngrok

```powershell
ngrok http 9999
```

Copy the HTTPS URL and add it to your .env file or paste it in the app.

## 5. Run Application

```powershell
npm start
```

## 6. Use the App

### For TTS:

1. Go to "Text to Speech" tab
2. Enter API key and Ngrok URL
3. Click "Start Callback Server"
4. Select output directory
5. Paste your text
6. Click "Generate TTS"

### For Video Sync:

1. Go to "Video Sync" tab
2. Select voice directory (with .mp3 files)
3. Select video directory (with .mp4 files)
4. Select output directory
5. Click "Sync Videos"

## 🎯 Common Commands

```powershell
# Install dependencies
npm install

# Start application
npm start

# Start ngrok
ngrok http 9999

# Build for distribution
npm run build
```

## 📞 Need Help?

Check the full README.md for detailed documentation and troubleshooting.
