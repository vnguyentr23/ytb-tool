# TTS & Video Sync Desktop Application

A powerful desktop application for generating Text-to-Speech audio from sentences and synchronizing video duration with audio files.

## 🌟 Features

### 1. Text to Speech Generation

- Split text by sentences (comma or period separated)
- Generate TTS for each sentence individually
- Support for multiple TTS APIs:
  - GenAI Labs (ElevenLabs compatible)
  - GenAI Max
- Batch processing with concurrent task management
- Real-time progress tracking
- Automatic retry on failures

### 2. Video Synchronization

- Automatically adjust video duration to match audio duration
- Batch process multiple video-audio pairs
- Smart file matching by scene numbers
- Skip already processed files
- Preserve video quality with optimized encoding
- Progress tracking for each video

### 3. User-Friendly Interface

- Modern, intuitive GUI
- Tab-based navigation
- Real-time logs and progress bars
- Configurable settings
- File browser integration

## 📋 Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **FFmpeg** - Required for video/audio processing
   - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
   - Mac: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg`
3. **Ngrok** (for TTS callback) - [Download here](https://ngrok.com/download)

## 🚀 Installation

1. **Clone or download this application**

2. **Install dependencies**

   ```powershell
   cd desktop_app
   npm install
   ```

3. **Configure environment variables**

   ```powershell
   # Copy the example configuration
   Copy-Item .env.example .env

   # Edit .env file with your actual API keys
   notepad .env
   ```

4. **Set up Ngrok** (required for TTS)

   ```powershell
   # Start ngrok tunnel
   ngrok http 9999

   # Copy the https URL (e.g., https://abc123.ngrok-free.app)
   # Add it to your .env file as NGROK_URL
   ```

## 🎮 Usage

### Starting the Application

```powershell
npm start
```

### Tab 1: Text to Speech

1. **Configure TTS Settings**

   - Select API Type (Labs or Max)
   - Enter your API Key
   - Enter Voice ID (or use default)
   - Enter Ngrok URL
   - Click "Start Callback Server"

2. **Select Output Directory**

   - Click "Browse" to choose where audio files will be saved

3. **Enter Text Content**

   - Paste or type your text
   - Sentences will be automatically split by commas (,) and periods (.)

4. **Generate TTS**
   - Click "🎙️ Generate TTS"
   - Monitor progress in real-time
   - Audio files will be saved as: 1.mp3, 2.mp3, 3.mp3, etc.

**Example Input:**

```
Hello world, this is the first sentence.
This is the second sentence, and here's another one.
Final sentence here.
```

**Output:**

- 1.mp3 - "Hello world"
- 2.mp3 - "this is the first sentence"
- 3.mp3 - "This is the second sentence"
- 4.mp3 - "and here's another one"
- 5.mp3 - "Final sentence here"

### Tab 2: Video Synchronization

1. **Select Directories**

   - Voice Directory: Folder containing .mp3 files (1.mp3, 2.mp3, etc.)
   - Video Directory: Folder containing .mp4 files (named like "Scene 1. Description.mp4")
   - Output Directory: Where synced videos will be saved

2. **Configure Options**

   - Check "Force reprocess" to ignore previously processed files

3. **Sync Videos**
   - Click "🎬 Sync Videos"
   - The app will:
     - Match voice files with video files by scene number
     - Adjust video speed to match audio duration
     - Preserve video quality
     - Save results to output directory

**File Naming Convention:**

- Voice files: `1.mp3`, `2.mp3`, `2.5.mp3`, etc.
- Video files: `[number]. Scene [number]. [description].mp4`
  - Example: `1. Scene 1. Opening Scene.mp4`
  - Example: `2. Scene 2.5. Transition.mp4`

### Tab 3: Settings

Configure application behavior:

- **Callback Server Port**: Default 9999
- **Callback Server Host**: Default localhost
- **Concurrency**: Number of parallel TTS tasks (1-15)
- **Max Retries**: Number of retry attempts for failed tasks

Click "💾 Save Settings" to persist your configuration.

## 📁 Project Structure

```
desktop_app/
├── main.js              # Electron main process
├── renderer.js          # UI logic and event handlers
├── index.html           # Application UI
├── styles.css           # Styling
├── package.json         # Dependencies and scripts
├── .env                 # Configuration (create from .env.example)
└── .env.example         # Example configuration
```

## 🔧 Configuration Details

### API Keys

**GenAI Labs API (ElevenLabs)**

- Sign up at https://genaipro.vn
- Get your API key from the dashboard
- Add to `.env` as `API_KEY_GEN`

**GenAI Max API**

- Same provider as GenAI Labs
- Uses the same API key
- Different endpoint for Max models

### Voice IDs

You can find voice IDs from your TTS provider:

- GenAI Labs: Browse available voices in your dashboard
- Default voice provided: `j210dv0vWm7fCknyQpbA` (Vietnamese military channel voice)

### Ngrok Setup

Ngrok creates a public tunnel to your local callback server:

1. Download ngrok from https://ngrok.com/download
2. Sign up for a free account
3. Configure your auth token:
   ```powershell
   ngrok config add-authtoken YOUR_TOKEN
   ```
4. Start tunnel:
   ```powershell
   ngrok http 9999
   ```
5. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok-free.app`)
6. Paste into the app's Ngrok URL field

## 🎯 Tips & Best Practices

### Text to Speech

- Keep sentences concise for better quality
- Use proper punctuation for natural breaks
- Test with a small sample before processing large texts
- Monitor the callback server status
- Check logs for any failed segments

### Video Synchronization

- Ensure video files are properly named with scene numbers
- Use consistent naming conventions
- Process videos in batches for efficiency
- Keep original files as backup
- Check output quality after processing

### Performance

- Adjust concurrency based on your system resources
- Lower concurrency (2-4) for slower systems
- Higher concurrency (10-15) for powerful systems
- Monitor system resources during processing

## 🐛 Troubleshooting

### TTS Issues

**Problem:** "Callback server not running"

- **Solution:** Click "Start Callback Server" before generating TTS
- Make sure Ngrok is running and URL is correct

**Problem:** Tasks timing out or failing

- **Solution:**
  - Check your API key is valid
  - Verify internet connection
  - Check Ngrok tunnel is active
  - Try reducing concurrency

**Problem:** "Task not found" errors

- **Solution:** Restart the callback server
- Make sure the Ngrok URL in .env matches the actual tunnel

### Video Sync Issues

**Problem:** "FFmpeg not found"

- **Solution:** Install FFmpeg and add to system PATH
- Restart the application after installation

**Problem:** Videos don't match audio files

- **Solution:**
  - Check file naming conventions
  - Ensure scene numbers match between voice and video files
  - Look at logs for specific mismatches

**Problem:** Output videos have quality issues

- **Solution:**
  - Original videos should be high quality
  - Adjust FFmpeg CRF value in main.js (lower = better quality)
  - Use `preset: 'slow'` for better quality (slower processing)

### General Issues

**Problem:** Application won't start

- **Solution:**
  - Run `npm install` again
  - Check Node.js version (>= 16)
  - Delete `node_modules` and reinstall

**Problem:** Settings not saving

- **Solution:**
  - Check browser localStorage is enabled
  - Try clicking "Save Settings" again
  - Check console for errors

## 🔒 Security Notes

- Never commit your `.env` file to version control
- Keep your API keys secure
- Ngrok URLs are temporary - regenerate when needed
- Use HTTPS URLs for production callbacks

## 📝 License

MIT License - Feel free to modify and distribute

## 🤝 Support

For issues or questions:

1. Check the troubleshooting section above
2. Review logs in the application
3. Verify all prerequisites are installed
4. Check that configuration is correct

## 🎉 Credits

Built with:

- Electron - Desktop framework
- FFmpeg - Video/audio processing
- Axios - HTTP requests
- Express - Callback server
- Ngrok - Tunneling service

Based on the original TTS scripts from the `tts_download` and `auto_match_voice_video` folders.
