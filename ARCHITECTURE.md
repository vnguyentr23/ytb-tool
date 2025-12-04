# Application Architecture Overview

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Desktop Application                      │
│                    (Electron Framework)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────┬─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌────────┐          ┌──────────┐          ┌──────────┐
   │  HTML  │          │   CSS    │          │    JS    │
   │  (UI)  │◄────────►│(Styling) │◄────────►│ (Logic)  │
   └────────┘          └──────────┘          └──────────┘
   index.html           styles.css           renderer.js
        │                                         │
        └─────────────────┬───────────────────────┘
                          │ IPC Communication
                          ▼
                   ┌─────────────┐
                   │   Main.js   │ (Electron Main Process)
                   │  (Backend)  │
                   └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   ┌─────────┐      ┌──────────┐     ┌──────────┐
   │   API   │      │ Callback │     │  FFmpeg  │
   │Requests │      │  Server  │     │ Process  │
   └─────────┘      └──────────┘     └──────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   GenAI API       Ngrok Tunnel      Video/Audio
   (TTS)           (Port 9999)       Processing
```

## 🔄 Data Flow Diagrams

### Text to Speech Flow

```
User Input (Text)
     │
     ▼
Split by Sentences ───────────────► 1. "Hello world"
     │                              2. "Welcome to my channel"
     │                              3. "Let's begin"
     ▼
Create TTS Tasks
     │
     ├──► Task 1 ──► GenAI API ──► Processing...
     ├──► Task 2 ──► GenAI API ──► Processing...
     └──► Task 3 ──► GenAI API ──► Processing...
                          │
                          ▼
                    Callback Server ◄──── Completion Notification
                          │
                          ▼
                    Download Audio
                          │
                          ▼
                    Save Files ────────► 1.mp3
                                        2.mp3
                                        3.mp3
```

### Video Synchronization Flow

```
Voice Files               Video Files
(1.mp3, 2.mp3)           (Scene 1.mp4, Scene 2.mp4)
     │                           │
     └──────────┬────────────────┘
                │
                ▼
        Match by Scene Number
                │
                ▼
        ┌───────────────┐
        │  For each pair │
        └───────────────┘
                │
                ▼
        Get Audio Duration (FFprobe)
                │
                ▼
        Calculate Speed Adjustment
                │
                ▼
        Process Video (FFmpeg)
        - Adjust video speed
        - Adjust audio tempo
        - Preserve quality
                │
                ▼
        Save Synced Video ────────► output/1.mp4
                                     output/2.mp4
```

## 🎯 Component Interaction

### Tab 1: TTS Component

```
┌────────────────────────────────────────────┐
│         Text to Speech Interface           │
├────────────────────────────────────────────┤
│                                            │
│  API Configuration                         │
│  ├─ API Type [Labs/Max] ──────┐          │
│  ├─ API Key [********]         │          │
│  ├─ Voice ID [j210...]         │          │
│  └─ Ngrok URL [https://...]    │          │
│                                 ▼          │
│  Callback Server               Config     │
│  └─ [Start Server] ─────► Start Express  │
│                                            │
│  Output Directory                          │
│  └─ [Browse] ──────────► Select Folder    │
│                                            │
│  Text Content                              │
│  └─ [Large Text Area] ──► Input Text      │
│                                 │          │
│  [Generate TTS] ◄───────────────┘          │
│                                            │
│  Progress                                  │
│  └─ [Progress Bar] ──────► 50%            │
│  └─ [Log Output] ────────► Messages       │
└────────────────────────────────────────────┘
```

### Tab 2: Video Sync Component

```
┌────────────────────────────────────────────┐
│      Video Synchronization Interface       │
├────────────────────────────────────────────┤
│                                            │
│  Directories                               │
│  ├─ Voice Dir [Browse] ──► /voices/       │
│  ├─ Video Dir [Browse] ──► /videos/       │
│  └─ Output Dir [Browse] ─► /output/       │
│                                 │          │
│  Options                        │          │
│  └─ [✓] Force Reprocess         │          │
│                                 ▼          │
│  [Sync Videos] ◄────────────── Config     │
│                                            │
│  Progress                                  │
│  └─ [Progress Bar] ──────► 75%            │
│  └─ [Log Output] ────────► Processing...  │
└────────────────────────────────────────────┘
```

### Tab 3: Settings Component

```
┌────────────────────────────────────────────┐
│          Settings Interface                │
├────────────────────────────────────────────┤
│                                            │
│  Server Configuration                      │
│  ├─ Port: [9999]                          │
│  └─ Host: [localhost]                     │
│                                            │
│  Processing Configuration                  │
│  ├─ Concurrency: [4]                      │
│  └─ Max Retries: [1]                      │
│                                            │
│  [Save Settings]  [Load Settings]         │
└────────────────────────────────────────────┘
```

## 🔌 IPC Communication

### Main Process → Renderer Process

```javascript
// Events sent from main.js to renderer.js

mainWindow.webContents.send("tts-progress", {
  taskId: "12345",
  status: "completed",
  audioUrl: "https://...",
});

mainWindow.webContents.send("video-sync-progress", {
  message: "Processing scene 5...",
});
```

### Renderer Process → Main Process

```javascript
// Functions called from renderer.js to main.js

// TTS Functions
await ipcRenderer.invoke("start-callback-server", config);
await ipcRenderer.invoke("split-text", text);
await ipcRenderer.invoke("create-tts-task-labs", data);
await ipcRenderer.invoke("download-audio", { url, path });

// Video Sync Functions
await ipcRenderer.invoke("select-directory");
await ipcRenderer.invoke("get-audio-duration", path);
await ipcRenderer.invoke("sync-video-to-audio", data);

// File Operations
await ipcRenderer.invoke("read-file", path);
await ipcRenderer.invoke("write-file", { path, content });
await ipcRenderer.invoke("create-directory", path);
```

## 📊 State Management

```
┌─────────────────────────────────────────┐
│         Application State               │
├─────────────────────────────────────────┤
│                                         │
│  Global Variables (renderer.js)         │
│  ├─ serverRunning: boolean             │
│  ├─ ttsProcessing: boolean             │
│  ├─ syncProcessing: boolean            │
│  └─ settings: object                   │
│                                         │
│  Task Manager (main.js)                 │
│  ├─ pendingTasks: Map                  │
│  ├─ completedTasks: Set                │
│  └─ failedTasks: Set                   │
│                                         │
│  LocalStorage (persistent)              │
│  └─ appSettings: JSON                  │
└─────────────────────────────────────────┘
```

## 🛠️ External Dependencies

```
Application
    │
    ├──► Node.js (Runtime)
    │    └──► Built-in modules: fs, path, child_process
    │
    ├──► Electron (Framework)
    │    ├──► BrowserWindow (UI)
    │    ├──► ipcMain (Backend IPC)
    │    └──► ipcRenderer (Frontend IPC)
    │
    ├──► NPM Packages
    │    ├──► axios (HTTP requests)
    │    ├──► express (Callback server)
    │    ├──► dotenv (Environment variables)
    │    └──► fluent-ffmpeg (FFmpeg wrapper)
    │
    └──► External Tools
         ├──► FFmpeg (Video processing)
         │    ├──► ffmpeg (encoding)
         │    └──► ffprobe (analysis)
         │
         └──► Ngrok (Tunneling)
              └──► Public callback URL
```

## 🌐 Network Communication

```
Desktop App                 Internet
    │
    ├──► GenAI API
    │    └──► POST /labs/task (Create TTS)
    │    └──► POST /max/tasks (Create TTS)
    │
    ├──► Ngrok Tunnel
    │    └──► Public URL → localhost:9999
    │
    └──► Callback Server (localhost:9999)
         └──► POST /tts-callback (Receive results)
         └──► GET /health (Health check)
         └──► GET /status (Status check)
```

## 📁 File System Operations

```
Application
    │
    ├──► Read Operations
    │    ├──► Read text files (.txt)
    │    ├──► Read configuration (.env)
    │    └──► Read processed files (JSON)
    │
    ├──► Write Operations
    │    ├──► Save audio files (.mp3)
    │    ├──► Save video files (.mp4)
    │    └──► Save processed list (JSON)
    │
    └──► Directory Operations
         ├──► Create output directories
         ├──► List directory contents
         └──► Check file existence
```

## 🔄 Process Flow Timeline

```
Time: 0s
│  User opens application
│  └──► Electron initializes
│       └──► Loads UI (index.html)
│            └──► Executes renderer.js
│                 └──► Loads saved settings
│
Time: 5s
│  User configures settings
│  └──► Enters API key
│       └──► Starts callback server
│            └──► Express server listening
│
Time: 10s
│  User starts TTS processing
│  └──► Text split into sentences
│       └──► Tasks created sequentially
│            └──► API requests sent
│                 └──► Callbacks received
│                      └──► Audio downloaded
│                           └──► Progress updated
│
Time: 60s
│  All TTS tasks complete
│  └──► Summary displayed
│       └──► Files saved to disk
│
OR
│
Time: 10s
│  User starts video sync
│  └──► Files matched by scene
│       └──► Duration analyzed
│            └──► FFmpeg processes video
│                 └──► Progress updated
│                      └──► Synced video saved
│
Time: 120s
│  All videos synced
│  └──► Summary displayed
│       └──► Processed list updated
```

## 🎨 UI Components Hierarchy

```
BrowserWindow
    │
    └──► Document (index.html)
         │
         ├──► Header
         │    ├──► Title
         │    └──► Description
         │
         ├──► Tabs Container
         │    ├──► Tab Button: TTS
         │    ├──► Tab Button: Sync
         │    └──► Tab Button: Settings
         │
         ├──► Tab Content: TTS
         │    ├──► Form Groups
         │    │    ├──► API Type Select
         │    │    ├──► API Key Input
         │    │    ├──► Voice ID Input
         │    │    ├──► Ngrok URL Input
         │    │    ├──► Output Directory
         │    │    └──► Text Area
         │    ├──► Buttons
         │    │    ├──► Start Server
         │    │    ├──► Generate TTS
         │    │    └──► Clear
         │    └──► Progress Section
         │         ├──► Progress Bar
         │         └──► Log Output
         │
         ├──► Tab Content: Video Sync
         │    ├──► Form Groups
         │    │    ├──► Voice Directory
         │    │    ├──► Video Directory
         │    │    ├──► Output Directory
         │    │    └──► Force Reprocess
         │    ├──► Buttons
         │    │    ├──► Sync Videos
         │    │    └──► Clear
         │    └──► Progress Section
         │         ├──► Progress Bar
         │         └──► Log Output
         │
         └──► Tab Content: Settings
              ├──► Form Groups
              │    ├──► Callback Port
              │    ├──► Callback Host
              │    ├──► Concurrency
              │    └──► Max Retries
              └──► Buttons
                   ├──► Save Settings
                   └──► Load Settings
```

---

This diagram provides a visual overview of how all components work together in the application!
