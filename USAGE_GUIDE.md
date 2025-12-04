# Usage Guide - TTS & Video Sync App

## Table of Contents

1. [Getting Started](#getting-started)
2. [Text to Speech Feature](#text-to-speech-feature)
3. [Video Synchronization Feature](#video-synchronization-feature)
4. [Tips & Tricks](#tips--tricks)
5. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Time Setup

1. **Run setup script**

   ```powershell
   .\setup.ps1
   ```

2. **Configure your API key**

   - Open `.env` file
   - Add your GenAI API key:
     ```
     API_KEY_GEN=your_actual_api_key_here
     ```

3. **Start Ngrok** (required for TTS)

   ```powershell
   ngrok http 9999
   ```

   - Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
   - Keep this terminal window open

4. **Launch the app**
   ```powershell
   npm start
   ```
   or
   ```powershell
   .\start.ps1
   ```

---

## Text to Speech Feature

### Basic Workflow

1. **Configure API Settings**

   - API Type: Choose "GenAI Labs" or "GenAI Max"
   - API Key: Your GenAI API key
   - Voice ID: Default is provided, or use your custom voice
   - Ngrok URL: Paste the URL from your ngrok terminal

2. **Start Callback Server**

   - Click "Start Callback Server" button
   - Wait for "✅ Running" status

3. **Prepare Your Text**

   - Paste your text in the text area
   - Text will be split by:
     - Commas (,)
     - Periods (.)
     - Question marks (?)
     - Exclamation marks (!)

4. **Select Output Location**

   - Click "Browse" next to "Output Directory"
   - Choose where to save your audio files

5. **Generate TTS**
   - Click "🎙️ Generate TTS"
   - Monitor progress in real-time
   - Files will be saved as: 1.mp3, 2.mp3, 3.mp3, etc.

### Example Usage

**Input Text:**

```
Welcome to our channel, today we're discussing important topics.
First, let's talk about technology. Then we'll move to business.
Finally, we'll wrap up with some tips!
```

**Output Files:**

- `1.mp3` - "Welcome to our channel"
- `2.mp3` - "today we're discussing important topics"
- `3.mp3` - "First"
- `4.mp3` - "let's talk about technology"
- `5.mp3` - "Then we'll move to business"
- `6.mp3` - "Finally"
- `7.mp3` - "we'll wrap up with some tips"

### Advanced Tips

**Sentence Splitting:**

- Use commas for short pauses
- Use periods for full stops
- Combine short phrases: "Hello, world" becomes one audio file
- Split long sentences for better control

**Voice Selection:**

- Labs API: ElevenLabs voices (multilingual)
- Max API: Vietnamese optimized voices
- Test different voices for best results

**Batch Processing:**

- Process 10-50 sentences at once
- Use concurrency: 4-8 for most systems
- Monitor system resources

---

## Video Synchronization Feature

### Basic Workflow

1. **Organize Your Files**

   **Voice Directory Structure:**

   ```
   voices/
   ├── 1.mp3
   ├── 2.mp3
   ├── 3.mp3
   └── ...
   ```

   **Video Directory Structure:**

   ```
   videos/
   ├── 1. Scene 1. Opening.mp4
   ├── 2. Scene 2. Main Content.mp4
   ├── 3. Scene 3. Closing.mp4
   └── ...
   ```

2. **Select Directories**

   - Voice Directory: Click "Browse" and select folder with .mp3 files
   - Video Directory: Click "Browse" and select folder with .mp4 files
   - Output Directory: Where synced videos will be saved

3. **Configure Options**

   - ☐ Force reprocess: Check to re-process all files (ignore cache)
   - ☑ Force reprocess: Uncheck to skip already processed files

4. **Sync Videos**
   - Click "🎬 Sync Videos"
   - Monitor progress for each video
   - Results saved to output directory

### File Naming Requirements

**Voice Files:**

- Format: `{number}.mp3`
- Examples: `1.mp3`, `2.mp3`, `2.5.mp3`, `10.mp3`
- Number can be integer or decimal

**Video Files:**

- Format: `[any]. Scene {number}. [description].mp4`
- Examples:
  - `1. Scene 1. Opening Scene.mp4`
  - `2. Scene 2.5. Transition Effect.mp4`
  - `100. Scene 10. Final Scene.mp4`

**Important:** The scene number in video filename must match the voice file number!

### How It Works

1. **Matching:** App matches voice files with video files by scene number
2. **Analysis:** Measures audio duration
3. **Adjustment:** Adjusts video speed to match audio length
4. **Processing:** Uses FFmpeg to:
   - Speed up or slow down video
   - Adjust audio pitch accordingly
   - Maintain video quality (CRF 23)
   - Use fast preset for reasonable speed

### Processing Details

**Video Speed Adjustment:**

- If audio is shorter than video → speeds up video
- If audio is longer than video → slows down video
- Multiple atempo filters chained for extreme adjustments

**Quality Settings:**

- Video codec: libx264
- Preset: fast (good balance of speed/quality)
- CRF: 23 (good quality)
- Audio codec: AAC

### Example Scenario

You have:

- `1.mp3` (10 seconds of narration)
- `1. Scene 1. Intro.mp4` (15 seconds of video)

Result:

- App speeds up video from 15s to 10s
- Video plays 1.5x faster
- Output: `1.mp4` (10 seconds, synced with audio)

---

## Tips & Tricks

### Text to Speech

**Optimizing Text Input:**

- Break long paragraphs into shorter sentences
- Remove unnecessary punctuation
- Use consistent formatting
- Test with a few sentences first

**Improving Quality:**

- Choose appropriate voice for content
- Keep sentences under 200 characters
- Use natural language
- Avoid special characters

**Workflow Efficiency:**

- Save commonly used settings
- Use templates for recurring content
- Process in batches during off-peak hours
- Keep a backup of original text

### Video Synchronization

**File Organization:**

- Keep originals in separate folder
- Use consistent naming convention
- Number scenes sequentially
- Document scene descriptions

**Quality Control:**

- Preview first video before batch processing
- Check audio-video sync manually
- Keep processing logs
- Monitor output file sizes

**Performance:**

- Close other applications during processing
- Use SSD for faster I/O
- Process overnight for large batches
- Monitor disk space

---

## Troubleshooting

### TTS Issues

**Problem:** Callback server won't start

```
Error: Port 9999 already in use
```

**Solution:**

1. Close any applications using port 9999
2. Or change port in Settings tab
3. Update Ngrok command: `ngrok http NEW_PORT`

---

**Problem:** Tasks failing with "timeout"
**Solution:**

1. Check internet connection
2. Verify API key is correct
3. Ensure Ngrok tunnel is active
4. Reduce concurrency to 1-2
5. Try again in a few minutes

---

**Problem:** Audio files are empty or corrupted
**Solution:**

1. Check available disk space
2. Verify output directory is writable
3. Test with shorter text
4. Check API quota/limits

---

### Video Sync Issues

**Problem:** FFmpeg not found

```
Error: FFmpeg command failed
```

**Solution:**

1. Install FFmpeg: https://ffmpeg.org/download.html
2. Add FFmpeg to system PATH
3. Restart PowerShell/Terminal
4. Restart application
5. Test: `ffmpeg -version`

---

**Problem:** Videos don't match audio files

```
Warning: No video found for scene X
```

**Solution:**

1. Check file naming conventions
2. Ensure scene numbers match exactly
3. Look for typos in filenames
4. Use decimal numbers if needed (2.5, 3.5)

---

**Problem:** Synced video quality is poor
**Solution:**

1. Use higher quality source videos
2. Adjust CRF value in `main.js` (line ~XXX):
   ```javascript
   '-crf', '18',  // Lower = better (default: 23)
   ```
3. Change preset to 'slow':
   ```javascript
   '-preset', 'slow',  // Better quality (default: fast)
   ```
4. Trade-off: Better quality = longer processing time

---

**Problem:** Processing is very slow
**Solution:**

1. Use 'ultrafast' preset (lower quality)
2. Close other applications
3. Process smaller batches
4. Check system resources (CPU/RAM/Disk)
5. Consider upgrading hardware

---

### General Issues

**Problem:** Application crashes on startup
**Solution:**

1. Delete `node_modules` folder
2. Run: `npm install`
3. Check Node.js version: `node --version` (need v16+)
4. Check for error messages in console

---

**Problem:** Settings not saving
**Solution:**

1. Check localStorage is enabled
2. Try different output directory
3. Check disk permissions
4. Clear browser cache (Electron uses Chromium)

---

**Problem:** Can't select directories
**Solution:**

1. Run application as administrator (Windows)
2. Check folder permissions
3. Try different folder location
4. Use full path without special characters

---

## Getting Help

If you encounter issues not covered here:

1. Check the logs in the application
2. Review error messages carefully
3. Verify all prerequisites are installed
4. Check configuration files (.env)
5. Test with minimal example first

## Feedback

Found a bug or have a suggestion?

- Document the issue with steps to reproduce
- Include error messages and logs
- Note your system configuration
- Describe expected vs actual behavior

Happy creating! 🎙️🎬
