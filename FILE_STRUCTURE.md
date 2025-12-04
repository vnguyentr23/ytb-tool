# 📁 Desktop App File Structure

```
desktop_app/
│
├── 📄 package.json              # Node.js dependencies and scripts
├── 📄 main.js                   # Electron main process (backend logic)
├── 📄 renderer.js               # UI logic and event handlers
├── 📄 index.html                # Application UI structure
├── 📄 styles.css                # Application styling
├── 📄 app.js                    # App entry point
│
├── 📄 .env.example              # Environment variables template
├── 📄 .env                      # Your actual configuration (create this)
├── 📄 .gitignore                # Git ignore rules
│
├── 📄 README.md                 # Full documentation
├── 📄 QUICKSTART.md             # Quick start guide
├── 📄 USAGE_GUIDE.md            # Detailed usage instructions
├── 📄 FILE_STRUCTURE.md         # This file
│
├── 📄 setup.ps1                 # Setup automation script
├── 📄 start.ps1                 # Quick start script
│
├── 📁 assets/                   # Application assets
│   ├── README.md
│   ├── icon.png                 # (optional) App icon
│   └── icon.ico                 # (optional) Windows icon
│
├── 📁 node_modules/             # Dependencies (auto-generated)
│
└── 📁 dist/                     # Build output (auto-generated)
```

## 🎯 Core Files Description

### Main Application Files

**`main.js`** - Electron Main Process

- Creates application window
- Handles IPC communication
- Manages callback server for TTS
- Provides file system operations
- Executes FFmpeg commands for video sync
- ~600 lines of backend logic

**`renderer.js`** - UI Logic

- Handles all user interactions
- Manages application state
- Updates progress bars and logs
- Communicates with main process via IPC
- Implements TTS and video sync workflows
- ~400 lines of frontend logic

**`index.html`** - User Interface

- Three-tab layout: TTS, Video Sync, Settings
- Form inputs for configuration
- Progress bars and log displays
- Clean, modern design
- ~200 lines of HTML

**`styles.css`** - Styling

- Modern gradient design (purple theme)
- Responsive layout
- Custom scrollbars
- Button animations and hover effects
- ~400 lines of CSS

### Configuration Files

**`package.json`**

- Dependencies: electron, axios, express, dotenv, fluent-ffmpeg
- Scripts: start, build
- App metadata

**`.env`** (create from `.env.example`)

```env
API_KEY_GEN=your_api_key
NGROK_URL=https://xxxxx.ngrok-free.app
CALLBACK_PORT=9999
CALLBACK_HOST=localhost
```

### Documentation Files

**`README.md`** - Complete Documentation

- Feature overview
- Installation instructions
- Usage guide
- Configuration details
- Troubleshooting
- ~500 lines

**`QUICKSTART.md`** - Fast Setup

- Minimal steps to get started
- Essential commands
- Quick reference

**`USAGE_GUIDE.md`** - Detailed Usage

- Step-by-step tutorials
- Examples for each feature
- Tips and best practices
- Common issues and solutions

**`FILE_STRUCTURE.md`** - This File

- Project structure overview
- File descriptions
- Development guide

## 🔧 Automation Scripts

**`setup.ps1`** - Setup Script

- Checks prerequisites (Node.js, FFmpeg, Ngrok)
- Installs npm dependencies
- Creates .env from template
- Creates assets directory

**`start.ps1`** - Start Script

- Validates setup
- Launches application
- Quick convenience script

## 🏗️ Development Workflow

### Initial Setup

```powershell
# 1. Run setup
.\setup.ps1

# 2. Edit configuration
notepad .env

# 3. Start ngrok (separate terminal)
ngrok http 9999

# 4. Start app
npm start
```

### Daily Development

```powershell
# Start app
.\start.ps1
```

### Making Changes

**UI Changes:**

- Edit `index.html` for structure
- Edit `styles.css` for appearance
- Reload app: Ctrl+R

**Logic Changes:**

- Edit `renderer.js` for UI logic
- Edit `main.js` for backend logic
- Restart app to see changes

### Building for Distribution

```powershell
npm run build
```

Output: `dist/` folder with installer

## 📦 Dependencies

### Production Dependencies

- `electron` - Desktop framework
- `axios` - HTTP requests
- `express` - Callback server
- `dotenv` - Environment variables
- `fluent-ffmpeg` - FFmpeg wrapper

### Dev Dependencies

- `electron-builder` - Build and package

### External Requirements

- Node.js (v16+)
- FFmpeg (system install)
- Ngrok (system install)

## 🎨 UI Structure

### Tab 1: Text to Speech

- API configuration form
- Callback server controls
- Text input area
- Output directory selector
- Generate button
- Progress display
- Log output

### Tab 2: Video Synchronization

- Voice directory selector
- Video directory selector
- Output directory selector
- Force reprocess checkbox
- Sync button
- Progress display
- Log output

### Tab 3: Settings

- Callback server settings
- Processing configuration
- Concurrency controls
- Save/Load buttons

## 🔄 Data Flow

### TTS Workflow

```
User Input (text)
    ↓
Split by Sentences (renderer.js)
    ↓
Create TTS Tasks (main.js → API)
    ↓
Callback Server Receives Results (main.js)
    ↓
Download Audio Files (main.js)
    ↓
Update UI Progress (renderer.js)
```

### Video Sync Workflow

```
User Selects Directories
    ↓
Read Voice & Video Files (main.js)
    ↓
Match Files by Scene Number (renderer.js)
    ↓
Get Audio Duration (FFprobe)
    ↓
Adjust Video Speed (FFmpeg)
    ↓
Save Synced Video (main.js)
    ↓
Update UI Progress (renderer.js)
```

## 🔐 Security Notes

### Sensitive Files (Don't Commit)

- `.env` - Contains API keys
- `node_modules/` - Large, regenerable
- `dist/` - Build artifacts

### Safe to Commit

- Source code (js, html, css)
- Documentation (md files)
- Configuration templates (.env.example)
- Scripts (ps1 files)

## 🚀 Deployment

### Building Installer

```powershell
npm run build
```

### Distribution Files

```
dist/
├── TTS Video Sync Setup.exe      # Windows installer
└── win-unpacked/                 # Unpacked version
```

### Installation Package Contents

- Application executable
- Node.js runtime (bundled)
- Dependencies (bundled)
- Assets and resources

## 📊 Metrics

- Total Lines of Code: ~2000
- Core Logic: ~1000 lines
- UI/Styling: ~600 lines
- Documentation: ~1500 lines
- Configuration: ~100 lines

## 🎓 Learning Resources

**Electron:**

- Official docs: https://www.electronjs.org/docs
- IPC communication
- Main vs Renderer process

**FFmpeg:**

- Official docs: https://ffmpeg.org/documentation.html
- Video processing
- Audio manipulation

**Node.js:**

- File system operations
- Child processes
- Event emitters

## 🔍 Key Concepts

### IPC (Inter-Process Communication)

- Main process ↔ Renderer process
- `ipcMain.handle()` - Main process listeners
- `ipcRenderer.invoke()` - Renderer process calls

### Callback Server

- Express server for TTS callbacks
- Receives completion notifications from API
- Resolves pending promises
- Updates UI in real-time

### Video Synchronization

- FFprobe: Get duration
- FFmpeg: Adjust speed
- Atempo filter: Audio pitch preservation
- Chain filters for extreme adjustments

## 🎯 Future Enhancements

Possible features to add:

- Batch export for subtitles
- Video preview before sync
- Custom FFmpeg presets
- Multiple API provider support
- Progress pause/resume
- Queue management
- Error recovery
- Auto-retry failed tasks

## 🐛 Debug Mode

Enable debugging:

```javascript
// In main.js
if (process.env.NODE_ENV === "development") {
  mainWindow.webContents.openDevTools();
}
```

Set in .env:

```
NODE_ENV=development
```

## 📝 Notes

- The app uses Electron's built-in Chromium browser
- Settings stored in localStorage
- Processed files tracked in JSON
- Logs displayed in real-time
- All operations are asynchronous

---

Made with ❤️ for content creators
