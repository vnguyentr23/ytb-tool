const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const express = require('express');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const { CLIENT_RENEG_LIMIT } = require('tls');

// Load environment variables
dotenv.config();

let mainWindow;
let callbackServer;
let callbackServerInstance;

// Task management for TTS
const taskManager = {
  pendingTasks: new Map(),
  completedTasks: new Set(),
  failedTasks: new Set(),

  addTask(taskId, taskInfo) {
    this.pendingTasks.set(taskId, {
      ...taskInfo,
      startTime: Date.now(),
    });
  },

  completeTask(taskId, result) {
    if (this.pendingTasks.has(taskId)) {
      const task = this.pendingTasks.get(taskId);
      this.pendingTasks.delete(taskId);
      this.completedTasks.add(taskId);
      task.resolve(result);
    }
  },

  failTask(taskId, error) {
    if (this.pendingTasks.has(taskId)) {
      const task = this.pendingTasks.get(taskId);
      this.pendingTasks.delete(taskId);
      this.failedTasks.add(taskId);
      task.reject(error);
    }
  },

  cleanup() {
    for (const [taskId, task] of this.pendingTasks) {
      task.reject(new Error('Application shutdown'));
    }
    this.pendingTasks.clear();
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (callbackServerInstance) {
      callbackServerInstance.close();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  taskManager.cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Start callback server for TTS
ipcMain.handle('start-callback-server', async (event, config) => {
  return new Promise((resolve, reject) => {
    try {
      if (callbackServerInstance) {
        resolve({ success: true, message: 'Server already running' });
        return;
      }

      callbackServer = express();
      callbackServer.use(express.json());
      callbackServer.use(express.urlencoded({ extended: true }));

      // Callback endpoint for GenAI Pro (Labs & Max)
      callbackServer.post('/genaipro-callback', (req, res) => {
        const { id, result, error, status } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Task ID is required' });
        }

        if (result) {
          const audioUrl = result.startsWith('http') ? result : `https://genaipro.vn${result}`;
          taskManager.completeTask(id, audioUrl);
          
          // Send progress update to renderer
          mainWindow.webContents.send('tts-progress', {
            taskId: id,
            status: 'completed',
            audioUrl
          });
        } else if (error) {
          taskManager.failTask(id, new Error(error));
          mainWindow.webContents.send('tts-progress', {
            taskId: id,
            status: 'failed',
            error
          });
        }

        res.status(200).json({
          received: true,
          timestamp: new Date().toISOString(),
          taskId: id
        });
      });

      // Callback endpoint for AI33 Pro (Labs & Max)
      callbackServer.post('/ai33-callback', (req, res) => {
        const { id, status, metadata, error_message } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Task ID is required' });
        }

        console.log(`AI33 Callback received for task ${id}`, {
          status,
          hasMetadata: !!metadata,
          hasError: !!error_message
        });

        if (status === 'done' && metadata && metadata.audio_url) {
          taskManager.completeTask(id, metadata.audio_url);
          
          // Send progress update to renderer
          mainWindow.webContents.send('tts-progress', {
            taskId: id,
            status: 'completed',
            audioUrl: metadata.audio_url
          });
        } else if (status === 'error' || error_message) {
          taskManager.failTask(id, new Error(error_message || 'Unknown error'));
          mainWindow.webContents.send('tts-progress', {
            taskId: id,
            status: 'failed',
            error: error_message || 'Unknown error'
          });
        } else {
          console.log(`Callback for task ${id} - status: ${status}`);
        }

        res.status(200).json({
          received: true,
          timestamp: new Date().toISOString(),
          taskId: id
        });
      });

      // Health check
      callbackServer.get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date().toISOString() });
      });

      callbackServerInstance = callbackServer.listen(config.port || 9999, config.host || 'localhost', () => {
        resolve({
          success: true,
          message: `Callback server running on http://${config.host || 'localhost'}:${config.port || 9999}`
        });
      });

      callbackServerInstance.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
});

// Stop callback server
ipcMain.handle('stop-callback-server', async () => {
  return new Promise((resolve) => {
    if (callbackServerInstance) {
      callbackServerInstance.close(() => {
        callbackServerInstance = null;
        resolve({ success: true });
      });
    } else {
      resolve({ success: true, message: 'Server not running' });
    }
  });
});

// Split text into sentences
ipcMain.handle('split-text', async (event, { text, language = 'en' }) => {
  try {
    // Define regex patterns for different languages
    let splitRegex;
    
    switch (language) {
      case 'ja': // Japanese
        // Japanese full-width punctuation: 。！？
        splitRegex = /(?<=[。！？])/;
        break;
      
      case 'zh': // Chinese
        // Chinese full-width punctuation: 。！？
        splitRegex = /(?<=[。！？])/;
        break;
      
      case 'ko': // Korean
        // Korean uses both half-width and full-width
        splitRegex = /(?<=[.!?。！？])/;
        break;
      
      case 'vi': // Vietnamese
      case 'en': // English
      default:
        // English/Vietnamese: standard punctuation ., !, ?
        splitRegex = /(?<=[.!?])/;
        break;
    }
    
    // Split by sentence-ending punctuation
    // Using positive lookbehind to keep punctuation with sentences
    const sentences = text
      .split(splitRegex)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return { success: true, sentences, language };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create TTS task (Labs API)
ipcMain.handle('create-tts-task-labs', async (event, { text, segmentNumber, config }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://genaipro.vn/api/v1',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const payload = {
      input: text,
      voice_id: config.voiceId || "3VnrjnYrskPMDsapTr8X",
      model_id: config.model || "eleven_turbo_v2_5",
      style: 0,
      speed: 1.0,
      similarity: 0.5,
      stability: 0.5,
      use_speaker_boost: false,
    };

    if (config.callbackUrl) {
      payload.call_back_url = `${config.callbackUrl}/genaipro-callback`;
    }

    const response = await apiClient.post('/labs/task', payload);
    console.log(response);
    if (response.data.error) {
      throw new Error(`API Error: ${response.data.error}`);
    }

    const taskId = response.data.task_id;

    return { success: true, taskId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Request subtitle generation (Labs API)
ipcMain.handle('request-subtitle', async (event, { taskId, apiKey }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://genaipro.vn/api/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const payload = {
      max_characters_per_line: 42,
      max_lines_per_cue: 2,
      max_seconds_per_cue: 5
    };

    const response = await apiClient.post(`/labs/task/subtitle/${taskId}`, payload);

    if (response.data.error) {
      throw new Error(`Subtitle API Error: ${response.data.error}`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get task details to retrieve subtitle URL (Labs API)
ipcMain.handle('get-task-details', async (event, { taskId, apiKey }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://genaipro.vn/api/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await apiClient.get(`/labs/task/${taskId}`);

    if (response.data.error) {
      throw new Error(`Task Details API Error: ${response.data.error}`);
    }

    const subtitleUrl = response.data.subtitle;
    if (subtitleUrl) {
      const fullSubtitleUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `https://genaipro.vn${subtitleUrl}`;
      return { success: true, subtitleUrl: fullSubtitleUrl };
    } else {
      return { success: false, error: 'No subtitle URL found' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Download SRT file
ipcMain.handle('download-srt', async (event, { url, outputPath }) => {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Downloaded SRT file is empty');
    }

    await fs.writeFile(outputPath, response.data, 'utf8');

    return { success: true, size: Buffer.byteLength(response.data, 'utf8') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create TTS task (AI33 Labs API)
ipcMain.handle('create-tts-task-ai33-labs', async (event, { text, segmentNumber, config }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://api.ai33.pro/v1',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    const payload = {
      text: text,
      model: config.model || 'eleven_multilingual_v2',
    };

    if (config.callbackUrl) {
      payload.receive_url = `${config.callbackUrl}/ai33-callback`;
    }

    const response = await apiClient.post(`/text-to-speech/${config.voiceId}`, payload);

    if (!response.data.success) {
      throw new Error(`API Error: ${response.data.error || 'Unknown error'}`);
    }

    const taskId = response.data.task_id;

    return { success: true, taskId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create TTS task (AI33 Max API)
ipcMain.handle('create-tts-task-ai33-max', async (event, { text, segmentNumber, config }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://api.ai33.pro/v1m',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    const payload = {
      text: text,
      model: config.model || 'speech-2.5-hd-preview',
      voice_setting: {
        voice_id: config.voiceId,
        vol: 1,
        pitch: 0,
        speed: 1,
      },
      language_boost: config.language || 'Vietnamese',
    };

    if (config.callbackUrl) {
      payload.receive_url = `${config.callbackUrl}/ai33-callback`;
    }

    const response = await apiClient.post('/task/text-to-speech', payload);

    if (!response.data.success) {
      throw new Error(`API Error: ${response.data.error || 'Unknown error'}`);
    }

    const taskId = response.data.task_id;

    return { success: true, taskId };
  } catch (error) {
    console.log(error);
    return { success: false, error: error.message };
  }
});

// Create TTS task (Max API)
ipcMain.handle('create-tts-task-max', async (event, { text, segmentNumber, config }) => {
  try {
    const apiClient = axios.create({
      baseURL: 'https://genaipro.vn/api/v1',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const payload = {
      title: segmentNumber.toString(),
      text: text,
      voice_id: config.voiceId,
      model_id: config.model || "speech-2.5-hd-preview",
      is_clone: true,
      language: "Vietnamese",
    };

    if (config.callbackUrl) {
      payload.call_back_url = `${config.callbackUrl}/genaipro-callback`;
    }

    const response = await apiClient.post('/max/tasks', payload);

    if (response.data.error) {
      throw new Error(`API Error: ${response.data.error}`);
    }

    const taskId = response.data.id;

    return { success: true, taskId };
  } catch (error) {
    console.log(error);
    return { success: false, error: error.message };
  }
});

// Wait for TTS task completion
ipcMain.handle('wait-for-tts-task', async (event, { taskId, segmentNumber }) => {
  return new Promise((resolve, reject) => {
    taskManager.addTask(taskId, { resolve, reject, segmentNumber });
  });
});

// Download audio file
ipcMain.handle('download-audio', async (event, { url, outputPath }) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
    return { success: true, size: response.data.byteLength };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Select directory
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// Save file dialog
ipcMain.handle('save-file-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || 'file.txt',
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  
  return result;
});

// Open file dialog
ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: options.properties || ['openFile']
  });
  
  return result;
});

// Select files
ipcMain.handle('select-files', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: options.filters || []
  });
  
  if (result.canceled) {
    return { success: false, canceled: true };
  }
  
  return { success: true, paths: result.filePaths };
});

// Get audio duration using ffprobe
ipcMain.handle('get-audio-duration', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve({ success: true, duration });
      } else {
        reject(new Error('Failed to get audio duration'));
      }
    });
  });
});

// Sync video duration to audio
ipcMain.handle('sync-video-to-audio', async (event, { videoPath, audioDuration, outputPath, hwAccel = 'cpu' }) => {
  return new Promise((resolve, reject) => {
    // Get video duration first
    const ffprobeVideo = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);

    let videoDurationOutput = '';
    ffprobeVideo.stdout.on('data', (data) => {
      videoDurationOutput += data.toString();
    });

    ffprobeVideo.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Failed to get video duration'));
        return;
      }

      const videoDuration = parseFloat(videoDurationOutput.trim());
      const ratio = audioDuration / videoDuration;
      const audioTempo = 1 / ratio;

      // Build audio filter chain for atempo
      let audioFilter = "";
      if (audioTempo >= 0.5 && audioTempo <= 2.0) {
        audioFilter = `atempo=${audioTempo}`;
      } else if (audioTempo < 0.5) {
        let tempRatio = audioTempo;
        const filters = [];
        while (tempRatio < 0.5) {
          filters.push("atempo=0.5");
          tempRatio *= 2;
        }
        filters.push(`atempo=${tempRatio}`);
        audioFilter = filters.join(",");
      } else {
        let tempRatio = audioTempo;
        const filters = [];
        while (tempRatio > 2.0) {
          filters.push("atempo=2.0");
          tempRatio /= 2;
        }
        filters.push(`atempo=${tempRatio}`);
        audioFilter = filters.join(",");
      }

      // Build FFmpeg command based on hardware acceleration mode
      let ffmpegArgs = ['-loglevel', 'error'];
      
      // Input arguments (with hardware acceleration if GPU mode)
      if (hwAccel === 'gpu' || hwAccel === 'both') {
        ffmpegArgs.push(
          '-hwaccel', 'cuda',
          '-hwaccel_output_format', 'cuda',
          '-i', videoPath
        );
      } else {
        ffmpegArgs.push('-i', videoPath);
      }
      
      // Video filter
      if (hwAccel === 'gpu') {
        // GPU: use scale_cuda for GPU-accelerated scaling
        ffmpegArgs.push('-filter:v', `setpts=${ratio}*PTS,hwdownload,format=nv12`);
      } else if (hwAccel === 'both') {
        // Hybrid: download from GPU, apply CPU filter, upload back
        ffmpegArgs.push('-filter:v', `hwdownload,format=nv12,setpts=${ratio}*PTS,hwupload_cuda`);
      } else {
        // CPU: standard filter
        ffmpegArgs.push('-filter:v', `setpts=${ratio}*PTS`);
      }
      
      // Audio filter
      ffmpegArgs.push('-filter:a', audioFilter);
      
      // Encoding parameters
      if (hwAccel === 'gpu' || hwAccel === 'both') {
        // GPU encoding with NVENC
        ffmpegArgs.push(
          '-c:v', 'h264_nvenc',
          '-preset', 'p4',        // p1-p7 (p4 = medium quality/speed)
          '-cq', '23',            // Constant quality (like CRF)
          '-b:v', '0'             // Use CQ mode
        );
      } else {
        // CPU encoding
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23'
        );
      }
      
      ffmpegArgs.push(
        '-c:a', 'aac',
        '-y',
        outputPath
      );
      
      // Run ffmpeg to sync video
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Send progress to renderer if available
        mainWindow.webContents.send('video-sync-progress', {
          message: data.toString()
        });
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          reject(new Error(`FFmpeg failed: ${errorOutput}`));
        }
      });
    });
  });
});

// Check missing video files
ipcMain.handle('check-missing-videos', async (event, { voiceDir, videoDir, outputDir, promptsFile }) => {
  try {
    // Read voice files
    const voiceFiles = await fs.readdir(voiceDir);
    const mp3Files = voiceFiles
      .filter(f => f.toLowerCase().endsWith('.mp3'))
      .map(f => f.replace('.mp3', ''));

    // Read video files
    const videoFiles = await fs.readdir(videoDir);
    const mp4Files = videoFiles.filter(f => f.toLowerCase().endsWith('.mp4'));

    // Check synced output files
    let syncedFiles = [];
    try {
      const outputFiles = await fs.readdir(outputDir);
      syncedFiles = outputFiles
        .filter(f => f.toLowerCase().endsWith('.mp4'))
        .map(f => f.replace('.mp4', ''));
    } catch {
      // Output directory doesn't exist yet
    }

    // Read prompts file if provided
    let promptsMap = new Map();
    if (promptsFile) {
      try {
        const promptsContent = await fs.readFile(promptsFile, 'utf8');
        const lines = promptsContent.split('\n');
        
        for (const line of lines) {
          // Match format: "Scene 1. Scene Description..."
          const match = line.match(/^Scene\s+(\d+)\.[\s\S]+$/);
          if (match) {
            const sceneNum = match[1];
            promptsMap.set(sceneNum, line.trim());
          }
        }
      } catch (error) {
        // Prompts file not found or error reading
        console.log('Prompts file not found or error:', error.message);
      }
    }

    const missingVideos = [];
    const missingSync = [];
    
    for (const sceneNum of mp3Files) {
      // Check if source video exists
      // New format: "Scene 1. any text here.mp4" or "Scene 123. description.mp4"
      const videoPattern = new RegExp(`^Scene ${sceneNum}\\..*\\.mp4$`, 'i');
      const hasSourceVideo = mp4Files.some(v => videoPattern.test(v));
      
      const prompt = promptsMap.get(sceneNum) || null;
      
      if (!hasSourceVideo) {
        missingVideos.push({ sceneNum, reason: 'Source video not found', prompt });
      } else if (!syncedFiles.includes(sceneNum)) {
        missingSync.push({ sceneNum, sourceVideo: mp4Files.find(v => videoPattern.test(v)), prompt });
      }
    }

    return {
      success: true,
      total: mp3Files.length,
      synced: syncedFiles.length,
      missingVideos: missingVideos.length,
      missingSync: missingSync.length,
      missingVideosList: missingVideos,
      missingSyncList: missingSync
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper functions for SRT processing
function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      audioPath
    ]);

    let output = '';
    let errorOutput = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration) || duration <= 0) {
          reject(new Error(`Invalid duration value: ${output.trim()}`));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}: ${errorOutput || 'Unknown error'}`));
      }
    });

    ffprobe.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('ffprobe not found. Please ensure FFmpeg is installed and in PATH'));
      } else {
        reject(err);
      }
    });
  });
}

function parseSrtTime(timeStr) {
  try {
    // Format: HH:MM:SS,mmm
    const [timePart, msPart] = timeStr.split(',');
    const [h, m, s] = timePart.split(':').map(Number);
    const ms = parseInt(msPart);
    
    const totalSeconds = h * 3600 + m * 60 + s + ms / 1000.0;
    return totalSeconds;
  } catch (error) {
    console.error(`Error parsing time '${timeStr}':`, error);
    return 0.0;
  }
}

function formatSrtTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

async function readSrtFile(srtPath) {
  const entries = [];
  
  try {
    const content = await fs.readFile(srtPath, 'utf-8');
    
    if (!content || content.trim().length === 0) {
      console.warn(`SRT file is empty: ${srtPath}`);
      return entries;
    }
    
    const blocks = content.trim().split(/\n\s*\n/);
    
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 3) {
        const timingLine = lines[1].trim();
        const textLines = lines.slice(2);
        
        if (timingLine.includes(' --> ')) {
          const [startStr, endStr] = timingLine.split(' --> ');
          const startTime = parseSrtTime(startStr.trim());
          const endTime = parseSrtTime(endStr.trim());
          const text = textLines.join('\n');
          
          if (startTime >= 0 && endTime > startTime) {
            entries.push({
              start: startTime,
              end: endTime,
              text: text
            });
          } else {
            console.warn(`Invalid timing in SRT: ${startStr} --> ${endStr}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading SRT file ${srtPath}:`, error);
    throw error;
  }
  
  return entries;
}

async function mergeSrtFiles(srtDataList, audioDurations) {
  const mergedEntries = [];
  let cumulativeTime = 0.0;
  let entryCounter = 1;
  
  for (let i = 0; i < srtDataList.length; i++) {
    const srtEntries = srtDataList[i];
    const actualDuration = audioDurations[i];
    
    if (!srtEntries || srtEntries.length === 0) {
      cumulativeTime += actualDuration;
      continue;
    }
    
    // Get the original SRT duration
    const originalDuration = Math.max(...srtEntries.map(e => e.end));
    
    // Calculate scale factor
    const scaleFactor = originalDuration > 0 ? actualDuration / originalDuration : 1.0;
    
    // Add each subtitle entry with adjusted timing
    for (const entry of srtEntries) {
      const newStart = cumulativeTime + (entry.start * scaleFactor);
      const newEnd = cumulativeTime + (entry.end * scaleFactor);
      
      mergedEntries.push({
        seq: entryCounter,
        start: newStart,
        end: newEnd,
        text: entry.text
      });
      entryCounter++;
    }
    
    cumulativeTime += actualDuration;
  }
  
  return { mergedEntries, totalDuration: cumulativeTime };
}

// Check missing files (MP3 and SRT)
// Check missing MP3 files
ipcMain.handle('check-missing-files', async (event, { sentences, outputDir }) => {
  try {
    const missingMp3 = [];
    const existingMp3 = [];

    // Check MP3 files
    for (let i = 0; i < sentences.length; i++) {
      const segmentNumber = i + 1;
      const mp3Path = path.join(outputDir, `${segmentNumber}.mp3`);
      
      try {
        await fs.access(mp3Path);
        existingMp3.push(segmentNumber);
      } catch {
        missingMp3.push({ segmentNumber, text: sentences[i] });
      }
    }

    return {
      success: true,
      mp3: {
        total: sentences.length,
        existing: existingMp3.length,
        missing: missingMp3.length,
        missingList: missingMp3
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check missing SRT files (compares against existing MP3 files)
ipcMain.handle('check-missing-srt', async (event, { sentences, outputDir }) => {
  try {
    const missingSrt = [];
    const existingSrt = [];
    const mp3NotExist = [];
    const srtsDir = path.join(outputDir, 'srts');

    // Check SRT files only for sentences that have MP3
    for (let i = 0; i < sentences.length; i++) {
      const segmentNumber = i + 1;
      const mp3Path = path.join(outputDir, `${segmentNumber}.mp3`);
      const srtPath = path.join(srtsDir, `${segmentNumber}.srt`);
      
      // First check if MP3 exists
      try {
        await fs.access(mp3Path);
        
        // MP3 exists, now check SRT
        try {
          await fs.access(srtPath);
          existingSrt.push(segmentNumber);
        } catch {
          missingSrt.push({ segmentNumber, text: sentences[i] });
        }
      } catch {
        // MP3 doesn't exist, skip SRT check
        mp3NotExist.push(segmentNumber);
      }
    }

    return {
      success: true,
      srt: {
        total: sentences.length - mp3NotExist.length, // Only count sentences with MP3
        existing: existingSrt.length,
        missing: missingSrt.length,
        missingList: missingSrt
      },
      mp3NotExist: mp3NotExist.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read file
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write file
ipcMain.handle('write-file', async (event, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check if file exists
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    await fs.access(filePath);
    return { success: true, exists: true };
  } catch {
    return { success: true, exists: false };
  }
});

// Create directory
ipcMain.handle('create-directory', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Merge SRT files
ipcMain.handle('merge-srt-files', async (event, { outputDir }) => {
  try {
    const voicesDir = outputDir;
    const srtsDir = path.join(voicesDir, 'srts');
    
    // Check if directories exist
    try {
      await fs.access(voicesDir);
      await fs.access(srtsDir);
    } catch (error) {
      return { 
        success: false, 
        error: 'Output directory or srts subdirectory not found' 
      };
    }
    
    // Find all MP3 and SRT files (numbered 1, 2, 3, ...)
    const mp3Files = [];
    const srtFiles = [];
    const fileNumbers = [];
    
    // First, scan directory to find all numbered files
    const voiceFiles = await fs.readdir(voicesDir);
    const srtDirFiles = await fs.readdir(srtsDir);
    
    // Extract file numbers from MP3 files
    const mp3Numbers = new Set();
    for (const file of voiceFiles) {
      const match = file.match(/^(\d+)\.mp3$/);
      if (match) {
        mp3Numbers.add(parseInt(match[1]));
      }
    }
    
    // Extract file numbers from SRT files
    const srtNumbers = new Set();
    for (const file of srtDirFiles) {
      const match = file.match(/^(\d+)\.srt$/);
      if (match) {
        srtNumbers.add(parseInt(match[1]));
      }
    }
    
    // Find matching pairs (both MP3 and SRT exist)
    const matchingNumbers = [...mp3Numbers].filter(num => srtNumbers.has(num)).sort((a, b) => a - b);
    
    console.log(`Found MP3 files: ${[...mp3Numbers].sort((a, b) => a - b).join(', ')}`);
    console.log(`Found SRT files: ${[...srtNumbers].sort((a, b) => a - b).join(', ')}`);
    console.log(`Matching pairs: ${matchingNumbers.join(', ')}`);
    
    // Build file lists
    for (const num of matchingNumbers) {
      mp3Files.push(path.join(voicesDir, `${num}.mp3`));
      srtFiles.push(path.join(srtsDir, `${num}.srt`));
      fileNumbers.push(num);
    }
    
    if (mp3Files.length === 0) {
      return { 
        success: false, 
        error: 'No matching MP3/SRT pairs found' 
      };
    }
    
    // Get audio durations
    const audioDurations = [];
    for (let i = 0; i < mp3Files.length; i++) {
      const mp3File = mp3Files[i];
      try {
        const duration = await getAudioDuration(mp3File);
        audioDurations.push(duration);
        console.log(`File ${fileNumbers[i]}: ${duration.toFixed(2)}s`);
      } catch (error) {
        console.error(`Error getting duration for ${mp3File}:`, error);
        throw new Error(`Cannot get audio duration for file ${fileNumbers[i]}.mp3: ${error.message}`);
      }
    }
    
    const totalAudioDuration = audioDurations.reduce((sum, d) => sum + d, 0);
    console.log(`Total audio duration: ${totalAudioDuration.toFixed(2)}s`);
    
    // Read all SRT files
    const srtDataList = [];
    for (let i = 0; i < srtFiles.length; i++) {
      const srtFile = srtFiles[i];
      try {
        const entries = await readSrtFile(srtFile);
        srtDataList.push(entries);
        console.log(`File ${fileNumbers[i]}: ${entries.length} subtitle entries`);
        if (entries.length === 0) {
          console.warn(`Warning: SRT file ${fileNumbers[i]} is empty or invalid`);
        }
      } catch (error) {
        console.error(`Error reading SRT file ${srtFile}:`, error);
        throw new Error(`Cannot read SRT file ${fileNumbers[i]}.srt: ${error.message}`);
      }
    }
    
    // Merge SRT files
    const { mergedEntries, totalDuration } = await mergeSrtFiles(srtDataList, audioDurations);
    
    // Write merged SRT file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const mergedSrtPath = path.join(voicesDir, `merged_subtitles_${timestamp}.srt`);
    
    let srtContent = '';
    for (const entry of mergedEntries) {
      srtContent += `${entry.seq}\n`;
      srtContent += `${formatSrtTime(entry.start)} --> ${formatSrtTime(entry.end)}\n`;
      srtContent += `${entry.text}\n\n`;
    }
    
    await fs.writeFile(mergedSrtPath, srtContent, 'utf-8');
    
    return { 
      success: true,
      outputFile: mergedSrtPath,
      stats: {
        filesProcessed: mp3Files.length,
        totalSubtitles: mergedEntries.length,
        totalDuration: totalDuration,
        fileNumbers: fileNumbers
      }
    };
  } catch (error) {
    console.error('Error merging SRT files:', error);
    return { success: false, error: error.message };
  }
});

// Join voices (concatenate MP3 files)
ipcMain.handle('join-voices', async (event, { voicesDir }) => {
  try {
    // Find all MP3 files
    const allFiles = await fs.readdir(voicesDir);
    const mp3Files = allFiles
      .filter(f => f.endsWith('.mp3'))
      .map(f => {
        const numMatch = f.match(/^(\d+(\.\d+)?)\.mp3$/);
        return numMatch ? { name: f, num: parseFloat(numMatch[1]) } : null;
      })
      .filter(f => f !== null)
      .sort((a, b) => a.num - b.num);
    
    if (mp3Files.length === 0) {
      return {
        success: false,
        error: 'No MP3 files found in the selected directory'
      };
    }
    
    // Create temporary concat list file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const concatListFile = path.join(voicesDir, `temp_concat_list_${timestamp}.txt`);
    const outputFile = path.join(voicesDir, `joined_${timestamp}.mp3`);
    
    let concatContent = '';
    for (const file of mp3Files) {
      const filePath = path.join(voicesDir, file.name);
      // Escape single quotes for ffmpeg
      const escapedPath = filePath.replace(/'/g, "'\\''" );
      concatContent += `file '${escapedPath}'\n`;
    }
    
    await fs.writeFile(concatListFile, concatContent, 'utf-8');
    
    // Use ffmpeg concat demuxer
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListFile,
        '-c', 'copy',
        '-y',
        outputFile
      ]);
      
      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', async (code) => {
        // Clean up temp file
        try {
          await fs.unlink(concatListFile);
        } catch {}
        
        if (code === 0) {
          resolve({
            success: true,
            outputFile: outputFile,
            stats: {
              filesJoined: mp3Files.length,
              fileNumbers: mp3Files.map(f => f.num)
            }
          });
        } else {
          // Try fallback method: convert to WAV first
          resolve(await joinVoicesFallback(voicesDir, mp3Files, timestamp));
        }
      });
      
      ffmpeg.on('error', async (err) => {
        // Clean up temp file
        try {
          await fs.unlink(concatListFile);
        } catch {}
        
        // Try fallback method
        resolve(await joinVoicesFallback(voicesDir, mp3Files, timestamp));
      });
    });
  } catch (error) {
    console.error('Error joining voices:', error);
    return { success: false, error: error.message };
  }
});

// Fallback method for joining voices
async function joinVoicesFallback(voicesDir, mp3Files, timestamp) {
  try {
    console.log('Using fallback method: converting to WAV first...');
    
    const tempWavs = [];
    
    // Convert all MP3s to WAV
    for (let i = 0; i < mp3Files.length; i++) {
      const mp3Path = path.join(voicesDir, mp3Files[i].name);
      const wavPath = path.join(voicesDir, `temp_${i.toString().padStart(3, '0')}.wav`);
      tempWavs.push(wavPath);
      
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', mp3Path,
          '-ar', '44100',
          '-ac', '2',
          '-y', wavPath
        ]);
        
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Failed to convert ${mp3Files[i].name} to WAV`));
        });
        
        ffmpeg.on('error', reject);
      });
    }
    
    // Create concat list for WAV files
    const wavListFile = path.join(voicesDir, `temp_wav_list_${timestamp}.txt`);
    let wavListContent = '';
    for (const wavPath of tempWavs) {
      const escapedPath = wavPath.replace(/'/g, "'\\''" );
      wavListContent += `file '${escapedPath}'\n`;
    }
    await fs.writeFile(wavListFile, wavListContent, 'utf-8');
    
    // Concat WAV files and convert to MP3
    const outputFile = path.join(voicesDir, `joined_${timestamp}.mp3`);
    
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', wavListFile,
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-y', outputFile
      ]);
      
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Failed to concat WAV files'));
      });
      
      ffmpeg.on('error', reject);
    });
    
    // Clean up temporary files
    for (const wavPath of tempWavs) {
      try {
        await fs.unlink(wavPath);
      } catch {}
    }
    try {
      await fs.unlink(wavListFile);
    } catch {}
    
    return {
      success: true,
      outputFile: outputFile,
      stats: {
        filesJoined: mp3Files.length,
        fileNumbers: mp3Files.map(f => f.num),
        method: 'fallback (WAV conversion)'
      }
    };
  } catch (error) {
    console.error('Fallback method failed:', error);
    return { success: false, error: error.message };
  }
}

// =============================
// Text to Video (T2V) Handlers
// =============================

// Create T2V task
ipcMain.handle('create-t2v-task', async (event, { baseUrl, apiKey, accountName, prompt, aspectRatio }) => {
  console.log('\n=== CREATE T2V TASK API CALL ===');
  console.log('URL:', `${baseUrl}/api/v1/videos/generations/text-to-video`);
  console.log('Account:', accountName);
  console.log('Prompt:', prompt.substring(0, 100) + '...');
  console.log('Aspect Ratio:', aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE');
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
  
  try {
    const payload = {
      prompt: prompt,
      accountName: accountName,
      aspectRatio: aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE'
    };
    
    const response = await axios.post(
      `${baseUrl}/api/v1/videos/generations/text-to-video`,
      payload,
      {
        headers: {
          'Authorization': `Api-Key ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Response Status:', response.status);
    console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));
    
    const data = response.data;
    
    // Handle response structure: { success: true, media: { id, downloadUrl, ... } }
    if (data.success && data.media) {
      console.log('✅ Media ID:', data.media.id);
      console.log('✅ Download URL:', data.media.downloadUrl);
      console.log('✅ Duration:', data.media.duration);
      
      return { 
        success: true, 
        taskId: data.media.id,
        videoUrl: data.media.downloadUrl,
        immediate: true  // Video is ready immediately
      };
    }
    
    // Fallback for other response structures
    const taskId = data.id || data.task_id || data.media?.id;
    console.log('✅ Task ID:', taskId);
    return { success: true, taskId };
  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('❌ Response Status:', error.response.status);
      console.error('❌ Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
});

// Check T2V task status
// Download T2V video
ipcMain.handle('download-t2v-video', async (event, { videoUrl, outputDir, fileName }) => {
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, fileName);
    
    const response = await axios.get(videoUrl, {
      responseType: 'arraybuffer'
    });

    if (!response.data || response.data.byteLength === 0) {
      throw new Error('Downloaded video is empty');
    }

    await fs.writeFile(outputPath, response.data);

    return { success: true, filePath: outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
