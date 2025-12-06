const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Global state
let serverRunning = false;
let ttsProcessing = {
  genai: false,
  ai33: false
};
let ttsCancelled = {
  genai: false,
  ai33: false
};
let syncProcessing = false;
let t2vIOProcessing = false;
let t2vIOCancelled = false;
let t2vIOTasks = [];
let settings = {
  callbackPort: 9999,
  callbackHost: 'localhost',
  batchSize: 15,
  maxRetries: 1,
  t2vBatchSize: 5,  // T2V batch size per account
  t2vTaskDelay: 500,  // Delay between T2V tasks in milliseconds
  // GENAI TTS settings
  genai: {
    apiType: 'labs',
    apiKey: '',
    voiceId: '',
    model: '',
    ngrokUrl: '',
    outputDir: '',
    language: 'vi',
    downloadSrt: false
  },
  // AI33 TTS settings
  ai33: {
    apiType: 'labs',
    apiKey: '',
    voiceId: '',
    model: '',
    ngrokUrl: '',
    outputDir: '',
    language: 'vi'
  },
  // Video sync settings
  voiceDir: '',
  videoDir: '',
  syncOutputDir: '',
  hwAccel: 'cpu',  // Hardware acceleration: 'cpu', 'gpu', 'both'
  // T2V IO settings
  t2vIO: {
    baseUrl: '',
    apiKey: '',
    outputDir: '',
    aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
    concurrent: 3,
    delay: 1000,
    maxRetries: 2
  }
};

// Tab switching
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active from all buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(`${tabName}-tab`).classList.add('active');
  event.target.classList.add('active');
}

// Update provider info
// Update GENAI API type info
function updateGenaiApiTypeInfo() {
  const apiType = document.getElementById('genai-api-type').value;
  const info = document.getElementById('genai-api-type-info');

  if (apiType === 'labs') {
    info.textContent = 'Labs: voice_id chuẩn ElevenLabs';
  } else {
    info.textContent = 'Max: Custom voice ID (số)';
  }

  // Update SRT checkbox visibility for GENAI
  updateMergeSrtVisibility('genai');
}

// Update AI33 API type info
function updateAi33ApiTypeInfo() {
  const apiType = document.getElementById('ai33-api-type').value;
  const info = document.getElementById('ai33-api-type-info');

  if (apiType === 'labs') {
    info.textContent = 'Labs: voice_id chuẩn ElevenLabs';
  } else {
    info.textContent = 'Max: Custom voice ID (số)';
  }
}

// Update Merge SRT button visibility (only for GENAI Labs with downloadSrt enabled)
function updateMergeSrtVisibility(provider) {
  if (provider === 'genai') {
    const apiType = document.getElementById('genai-api-type').value;
    const downloadSrt = document.getElementById('genai-download-srt').checked;
    const mergeSrtBtn = document.getElementById('genai-merge-srt-btn');
    const checkSrtBtn = document.getElementById('genai-check-srt-btn');

    if (mergeSrtBtn) {
      mergeSrtBtn.style.display = (apiType === 'labs' && downloadSrt) ? 'inline-block' : 'none';
    }
    if (checkSrtBtn) {
      checkSrtBtn.style.display = (apiType === 'labs' && downloadSrt) ? 'inline-block' : 'none';
    }
  }
}

// Toggle config section visibility
function toggleConfig(provider) {
  const section = document.getElementById(`${provider}-config-section`);
  const toggle = document.getElementById(`${provider}-config-toggle`);

  if (section.style.display === 'none') {
    section.style.display = 'grid';
    toggle.textContent = '▼';
  } else {
    section.style.display = 'none';
    toggle.textContent = '▶';
  }
}

// Toggle Sync config section
function toggleSyncConfig() {
  const section = document.getElementById('sync-config-section');
  const toggle = document.getElementById('sync-config-toggle');

  if (section.style.display === 'none') {
    section.style.display = 'grid';
    toggle.textContent = '▼';
  } else {
    section.style.display = 'none';
    toggle.textContent = '▶';
  }
}

// Logging functions
function addLog(logId, message, type = 'info') {
  const logDiv = document.getElementById(logId);
  if (!logDiv) {
    console.warn(`Log element not found: ${logId}`);
    return;
  }
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
}

function clearLog(logId) {
  const logDiv = document.getElementById(logId);
  if (logDiv) {
    logDiv.innerHTML = '';
  }
}

function updateProgress(progressBarId, percentage) {
  const progressBar = document.getElementById(progressBarId);
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage}%`;
  }
}

// ======================
// Callback Server
// ======================
async function startCallbackServer() {
  if (serverRunning) {
    alert('Callback server is already running!');
    return;
  }

  // Get ngrok URL from either GENAI or AI33 (prefer GENAI if available)
  let ngrokUrl = document.getElementById('genai-ngrok-url')?.value.trim();
  if (!ngrokUrl) {
    ngrokUrl = document.getElementById('ai33-ngrok-url')?.value.trim();
  }

  if (!ngrokUrl) {
    alert('Please enter a valid Ngrok URL in either GENAI or AI33 tab');
    return;
  }

  try {
    const result = await ipcRenderer.invoke('start-callback-server', {
      port: settings.callbackPort,
      host: settings.callbackHost
    });

    if (result.success) {
      serverRunning = true;
      // Update status in both tabs (they share the same server-status ID)
      const statusElements = document.querySelectorAll('#server-status');
      statusElements.forEach(el => {
        el.textContent = '✅ Running';
        el.className = 'status success';
      });
      alert(result.message);
    }
  } catch (error) {
    alert(`Failed to start server: ${error.message}`);
    const statusElements = document.querySelectorAll('#server-status');
    statusElements.forEach(el => {
      el.textContent = '❌ Error';
      el.className = 'status error';
    });
  }
}

async function stopCallbackServer() {
  if (!serverRunning) return;

  try {
    await ipcRenderer.invoke('stop-callback-server');
    serverRunning = false;
    const statusElements = document.querySelectorAll('#server-status');
    statusElements.forEach(el => {
      el.textContent = '⏹️ Stopped';
      el.className = 'status';
    });
  } catch (error) {
    console.error('Failed to stop server:', error);
  }
}

// ======================
// Preview Sentences
// ======================
let previewSentencesData = null;

async function previewSentences(provider) {
  const textContent = document.getElementById(`${provider}-text-content`).value.trim();
  const language = document.getElementById(`${provider}-language`).value;

  if (!textContent) {
    alert('Please enter some text first!');
    return;
  }

  try {
    // Split text into sentences
    const splitResult = await ipcRenderer.invoke('split-text', { text: textContent, language });

    if (!splitResult.success) {
      alert('Failed to split text: ' + splitResult.error);
      return;
    }

    const sentences = splitResult.sentences;
    previewSentencesData = { sentences, language };

    // Update preview info
    document.getElementById('preview-count').textContent = sentences.length;
    document.getElementById('preview-language').textContent = getLanguageName(language);

    // Display sentences
    const listContainer = document.getElementById('preview-sentences-list');
    listContainer.innerHTML = '';

    sentences.forEach((sentence, index) => {
      const item = document.createElement('div');
      item.className = 'sentence-item';
      item.innerHTML = `
        <div class="sentence-number">#${index + 1}</div>
        <div class="sentence-text">${escapeHtml(sentence)}</div>
      `;
      listContainer.appendChild(item);
    });

    // Show modal
    document.getElementById('preview-sentences-modal').style.display = 'flex';
  } catch (error) {
    alert('Error previewing sentences: ' + error.message);
  }
}

function closePreviewModal() {
  document.getElementById('preview-sentences-modal').style.display = 'none';
}

function copySentencesToClipboard() {
  if (!previewSentencesData) return;

  const text = previewSentencesData.sentences
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n\n');

  navigator.clipboard.writeText(text).then(() => {
    alert(`Copied ${previewSentencesData.sentences.length} sentences to clipboard!`);
  }).catch(err => {
    alert('Failed to copy: ' + err.message);
  });
}

async function exportSentencesToFile() {
  if (!previewSentencesData) return;

  const outputDir = document.getElementById('output-dir').value.trim();
  if (!outputDir) {
    alert('Please select output directory first (in Settings tab)');
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `sentences_${timestamp}.txt`;
    const filePath = require('path').join(outputDir, filename);

    const content = previewSentencesData.sentences
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n\n');

    const result = await ipcRenderer.invoke('write-file', { filePath, content });

    if (result.success) {
      alert(`Sentences exported to:\n${filePath}`);
    } else {
      alert('Failed to export: ' + result.error);
    }
  } catch (error) {
    alert('Error exporting sentences: ' + error.message);
  }
}

function getLanguageName(code) {
  const names = {
    'vi': 'Tiếng Việt',
    'en': 'English',
    'ja': '日本語 (Japanese)',
    'zh': '中文 (Chinese)',
    'ko': '한국어 (Korean)'
  };
  return names[code] || code.toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ======================
// Directory Selection
// ======================
async function selectOutputDir(provider) {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById(`${provider}-output-dir`).value = result;
    autoSaveSettings();
  }
}

async function selectVoiceDir() {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById('voice-dir').value = result;
    autoSaveSettings();
  }
}

async function selectVideoDir() {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById('video-dir').value = result;
    autoSaveSettings();
  }
}

async function selectSyncOutputDir() {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById('sync-output-dir').value = result;
    autoSaveSettings();
  }
}

async function selectPromptsFile() {
  const result = await ipcRenderer.invoke('select-files', {
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.success && !result.canceled && result.paths.length > 0) {
    document.getElementById('prompts-file').value = result.paths[0];
  }
}

// ======================
// TTS Processing
// ======================
async function startTTSProcessing(provider) {
  if (ttsProcessing[provider]) {
    alert('TTS processing is already running for this provider!');
    return;
  }

  // Get provider-specific elements
  const apiKey = document.getElementById(`${provider}-api-key`).value.trim();
  const voiceId = document.getElementById(`${provider}-voice-id`).value.trim();
  const model = document.getElementById(`${provider}-model`).value.trim();
  const outputDir = document.getElementById(`${provider}-output-dir`).value.trim();
  const textContent = document.getElementById(`${provider}-text-content`).value.trim();
  const ngrokUrl = document.getElementById(`${provider}-ngrok-url`).value.trim();
  const apiType = document.getElementById(`${provider}-api-type`).value;
  const language = document.getElementById(`${provider}-language`).value;

  if (!apiKey) {
    alert('Please enter your API key');
    return;
  }

  if (!outputDir) {
    alert('Please select an output directory');
    return;
  }

  if (!textContent) {
    alert('Please enter text content');
    return;
  }

  if (!serverRunning) {
    alert('Please start the callback server first');
    return;
  }

  ttsProcessing[provider] = true;
  ttsCancelled[provider] = false;
  clearLog(`${provider}-log`);
  updateProgress(`${provider}-progress-bar`, 0);

  // Show Stop button, hide Start button
  document.getElementById(`${provider}-start-btn`).style.display = 'none';
  document.getElementById(`${provider}-stop-btn`).style.display = 'inline-block';

  try {
    addLog(`${provider}-log`, '🚀 Starting TTS processing...', 'info');

    // Split text into sentences
    addLog(`${provider}-log`, `✂️ Splitting text into sentences (Language: ${language.toUpperCase()})...`, 'info');
    const splitResult = await ipcRenderer.invoke('split-text', { text: textContent, language });

    if (!splitResult.success) {
      throw new Error('Failed to split text');
    }

    const sentences = splitResult.sentences;
    addLog(`${provider}-log`, `📝 Found ${sentences.length} sentences`, 'success');

    // Create output directory
    await ipcRenderer.invoke('create-directory', outputDir);

    // Process sentences with semaphore pattern
    const results = [];
    const concurrency = settings.batchSize;
    let completedCount = 0;

    addLog(`${provider}-log`, `⚡ Processing with concurrency: ${concurrency}`, 'info');

    // Process single segment
    const processSegment = async (segmentIndex) => {
      const sentence = sentences[segmentIndex];
      const segmentNumber = segmentIndex + 1;

      try {
        // Check if cancelled
        if (ttsCancelled[provider]) {
          throw new Error('Processing cancelled by user');
        }

        addLog(`${provider}-log`, `🔄 [${segmentNumber}/${sentences.length}] Creating TTS task...`, 'info');
        addLog(`${provider}-log`, `📝 [${segmentNumber}] Text: "${sentence.substring(0, 60)}..."`, 'info');

        // Create TTS task
        const config = {
          apiKey,
          voiceId,
          model: model || '',
          callbackUrl: ngrokUrl
        };

        addLog(`${provider}-log`, `🌐 [${segmentNumber}] Calling ${provider.toUpperCase()} ${apiType.toUpperCase()} API...`, 'info');

        let taskResult;

        if (provider === 'genai' && apiType === 'labs') {
          taskResult = await ipcRenderer.invoke('create-tts-task-labs', {
            text: sentence,
            segmentNumber,
            config
          });
        } else if (provider === 'genai' && apiType === 'max') {
          taskResult = await ipcRenderer.invoke('create-tts-task-max', {
            text: sentence,
            segmentNumber,
            config
          });
        } else if (provider === 'ai33' && apiType === 'labs') {
          taskResult = await ipcRenderer.invoke('create-tts-task-ai33-labs', {
            text: sentence,
            segmentNumber,
            config
          });
        } else if (provider === 'ai33' && apiType === 'max') {
          taskResult = await ipcRenderer.invoke('create-tts-task-ai33-max', {
            text: sentence,
            segmentNumber,
            config
          });
        }

        if (!taskResult.success) {
          throw new Error(taskResult.error);
        }

        addLog(`${provider}-log`, `✅ [${segmentNumber}] API responded - Task created: ${taskResult.taskId}`, 'success');
        addLog(`${provider}-log`, `⏳ [${segmentNumber}] Waiting for TTS generation callback...`, 'info');

        // Wait for completion via callback
        const audioUrl = await ipcRenderer.invoke('wait-for-tts-task', {
          taskId: taskResult.taskId,
          segmentNumber
        });

        addLog(`${provider}-log`, `📥 [${segmentNumber}] Callback received - Downloading audio...`, 'info');
        // Download audio
        const outputPath = path.join(outputDir, `${segmentNumber}.mp3`);
        const downloadResult = await ipcRenderer.invoke('download-audio', {
          url: audioUrl,
          outputPath
        });

        if (downloadResult.success) {
          addLog(`${provider}-log`, `✅ [${segmentNumber}] SUCCESS - Downloaded (${(downloadResult.size / 1024).toFixed(1)} KB)`, 'success');

          // Update progress immediately after each completion
          completedCount++;
          const progress = Math.round((completedCount / sentences.length) * 100);
          updateProgress(`${provider}-progress-bar`, progress);

          return { success: true, segmentNumber, taskId: taskResult.taskId };
        } else {
          throw new Error('Download failed');
        }

      } catch (error) {
        addLog(`${provider}-log`, `❌ [${segmentNumber}] Failed: ${error.message}`, 'error');

        // Update progress even on failure
        completedCount++;
        const progress = Math.round((completedCount / sentences.length) * 100);
        updateProgress(`${provider}-progress-bar`, progress);

        return { success: false, segmentNumber, error: error.message };
      }
    };

    // Process queue with semaphore pattern
    const processQueue = async (startIndex) => {
      if (startIndex >= sentences.length) return;

      const result = await processSegment(startIndex);
      results.push(result);

      // Process next segment (maintain concurrency)
      await processQueue(startIndex + concurrency);
    };

    // Start concurrent processing
    const semaphore = new Array(concurrency).fill(null);
    const promises = semaphore.map((_, index) => processQueue(index));
    await Promise.all(promises);

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, `✅ Processing complete!`, 'success');
    addLog(`${provider}-log`, `📊 Total: ${sentences.length} | Success: ${successful} | Failed: ${failed}`, 'info');
    addLog(`${provider}-log`, `📁 Output: ${outputDir}`, 'info');

    // Save task IDs to cache for SRT retry (GENAI Labs only)
    if (provider === 'genai' && apiType === 'labs' && successful > 0) {
      const successfulResults = results.filter(r => r.success && r.taskId);
      if (successfulResults.length > 0) {
        try {
          const taskIdCachePath = path.join(outputDir, '.task_ids_cache.json');

          // Read existing cache
          let existingCache = {};
          try {
            const cacheResult = await ipcRenderer.invoke('read-file', taskIdCachePath);
            if (cacheResult.success) {
              existingCache = JSON.parse(cacheResult.content);
            }
          } catch (error) {
            // No existing cache
          }

          // Update cache with new task IDs
          successfulResults.forEach(r => {
            existingCache[r.segmentNumber] = r.taskId;
          });

          await ipcRenderer.invoke('write-file', {
            filePath: taskIdCachePath,
            content: JSON.stringify(existingCache, null, 2)
          });

          addLog(`${provider}-log`, `💾 Saved ${successfulResults.length} task IDs for future SRT retry`, 'info');
        } catch (error) {
          addLog(`${provider}-log`, `⚠️ Failed to save task IDs: ${error.message}`, 'warning');
        }
      }
    }

    // Process SRT files if enabled (GENAI Labs only)
    if (provider === 'genai' && apiType === 'labs' && successful > 0) {
      const downloadSrt = document.getElementById('genai-download-srt')?.checked;
      if (downloadSrt) {
        await processSrtFiles(results, apiKey, outputDir, provider);
      }
    }

    if (failed > 0) {
      const failedNumbers = results.filter(r => !r.success).map(r => r.segmentNumber).join(', ');
      addLog(`${provider}-log`, `⚠️ Failed segments: ${failedNumbers}`, 'warning');
    }

    // Auto-join MP3 files only if all files are successful (no failures)
    if (successful > 0 && failed === 0) {
      addLog(`${provider}-log`, '═══════════════════════════', 'info');
      addLog(`${provider}-log`, '🎵 Auto-joining MP3 files...', 'info');

      try {
        const joinResult = await ipcRenderer.invoke('join-voices', { voicesDir: outputDir });

        if (joinResult.success) {
          const { outputFile, stats } = joinResult;
          addLog(`${provider}-log`, `✅ MP3 files joined successfully!`, 'success');
          addLog(`${provider}-log`, `📄 Output: ${outputFile}`, 'info');
          addLog(`${provider}-log`, `📊 Files joined: ${stats.filesJoined}`, 'info');
        } else {
          addLog(`${provider}-log`, `⚠️ Auto-join failed: ${joinResult.errbor}`, 'warning');
        }
      } catch (error) {
        addLog(`${provider}-log`, `⚠️ Auto-join error: ${error.message}`, 'warning');
      }
    } else if (failed > 0) {
      addLog(`${provider}-log`, `🚫 Auto-join skipped: ${failed} file(s) failed. Fix failures and retry to enable auto-join.`, 'info');
    }

    // Auto-merge SRT files only if enabled and all files are successful (GENAI Labs only)
    if (provider === 'genai' && apiType === 'labs' && successful > 0 && failed === 0) {
      const downloadSrt = document.getElementById('genai-download-srt')?.checked;
      if (downloadSrt) {
        addLog(`${provider}-log`, '═══════════════════════════', 'info');
        addLog(`${provider}-log`, '📋 Auto-merging SRT files...', 'info');

        try {
          const mergeResult = await ipcRenderer.invoke('merge-srt-files', { outputDir });

          if (mergeResult.success) {
            const { outputFile, stats } = mergeResult;
            const durationMinutes = (stats.totalDuration / 60).toFixed(1);
            addLog(`${provider}-log`, `✅ SRT files merged successfully!`, 'success');
            addLog(`${provider}-log`, `📄 Output: ${outputFile}`, 'info');
            addLog(`${provider}-log`, `📝 Total subtitles: ${stats.totalSubtitles}`, 'info');
            addLog(`${provider}-log`, `⏱️  Duration: ${durationMinutes} minutes`, 'info');
          } else {
            addLog(`${provider}-log`, `⚠️ Auto-merge SRT failed: ${mergeResult.error}`, 'warning');
          }
        } catch (error) {
          addLog(`${provider}-log`, `⚠️ Auto-merge SRT error: ${error.message}`, 'warning');
        }
      }
    } else if (provider === 'genai' && apiType === 'labs' && failed > 0) {
      const downloadSrt = document.getElementById('genai-download-srt')?.checked;
      if (downloadSrt) {
        addLog(`${provider}-log`, `🚫 Auto-merge SRT skipped: ${failed} file(s) failed. Fix failures and retry to enable auto-merge.`, 'info');
      }
    }

  } catch (error) {
    addLog(`${provider}-log`, `❌ Fatal error: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  } finally {
    ttsProcessing[provider] = false;
    ttsCancelled[provider] = false;
    // Reset buttons
    document.getElementById(`${provider}-start-btn`).style.display = 'inline-block';
    const stopBtn = document.getElementById(`${provider}-stop-btn`);
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    stopBtn.textContent = '⏹️ Stop TTS';
  }
}

// Process SRT files (GENAI Labs only)
async function processSrtFiles(results, apiKey, outputDir, provider) {
  addLog(`${provider}-log`, '═══════════════════════════', 'info');
  addLog(`${provider}-log`, '📋 Starting subtitle processing...', 'info');

  const successfulResults = results.filter(r => r.success && r.taskId);

  if (successfulResults.length === 0) {
    addLog(`${provider}-log`, '⚠️ No successful tasks found for subtitle processing', 'warning');
    return;
  }

  addLog(`${provider}-log`, `📝 Processing subtitles for ${successfulResults.length} segments`, 'info');

  // Create srts directory
  const srtsDir = path.join(outputDir, 'srts');
  addLog(`${provider}-log`, `📁 Ensuring SRT directory exists...`, 'info');
  await ipcRenderer.invoke('create-directory', srtsDir);
  addLog(`${provider}-log`, `✅ SRT directory ready: ${srtsDir}`, 'success');

  try {
    // Phase 1: Request subtitles for all tasks
    addLog(`${provider}-log`, 'Phase 1: Requesting subtitles for all tasks...', 'info');
    const subtitleRequests = [];

    for (const result of successfulResults) {
      try {
        const { taskId, segmentNumber } = result;
        addLog(`${provider}-log`, `Requesting subtitle for segment ${segmentNumber}...`, 'info');

        const requestResult = await ipcRenderer.invoke('request-subtitle', {
          taskId,
          apiKey
        });

        subtitleRequests.push({
          taskId,
          segmentNumber,
          requested: requestResult.success
        });

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        addLog(`${provider}-log`, `❌ Failed to request subtitle for segment ${result.segmentNumber}: ${error.message}`, 'error');
      }
    }

    // Wait 30 seconds for subtitle generation
    addLog(`${provider}-log`, '⏳ Waiting 30 seconds for subtitle generation...', 'info');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Phase 2: Download SRT files
    addLog(`${provider}-log`, 'Phase 2: Downloading SRT files...', 'info');
    let srtDownloaded = 0;
    let srtFailed = 0;

    for (const request of subtitleRequests) {
      if (!request.requested) {
        addLog(`${provider}-log`, `⏭️ Skipping segment ${request.segmentNumber} - subtitle request failed`, 'warning');
        srtFailed++;
        continue;
      }

      try {
        addLog(`${provider}-log`, `[${request.segmentNumber}] Getting subtitle URL...`, 'info');

        const detailsResult = await ipcRenderer.invoke('get-task-details', {
          taskId: request.taskId,
          apiKey
        });

        if (detailsResult.success && detailsResult.subtitleUrl) {
          const srtPath = path.join(srtsDir, `${request.segmentNumber}.srt`);

          const downloadResult = await ipcRenderer.invoke('download-srt', {
            url: detailsResult.subtitleUrl,
            outputPath: srtPath
          });

          if (downloadResult.success) {
            addLog(`${provider}-log`, `✅ [${request.segmentNumber}] SRT downloaded (${(downloadResult.size / 1024).toFixed(1)} KB)`, 'success');
            srtDownloaded++;
          } else {
            addLog(`${provider}-log`, `❌ [${request.segmentNumber}] SRT download failed`, 'error');
            srtFailed++;
          }
        } else {
          addLog(`${provider}-log`, `⚠️ [${request.segmentNumber}] No subtitle URL available`, 'warning');
          srtFailed++;
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        addLog(`${provider}-log`, `❌ [${request.segmentNumber}] Error processing SRT: ${error.message}`, 'error');
        srtFailed++;
      }
    }

    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, `✅ Subtitle processing complete!`, 'success');
    addLog(`${provider}-log`, `📊 Total: ${subtitleRequests.length} | Downloaded: ${srtDownloaded} | Failed: ${srtFailed}`, 'info');
    addLog(`${provider}-log`, `📁 SRT Output: ${srtsDir}`, 'info');

    if (srtFailed > 0) {
      addLog(`${provider}-log`, `⚠️ ${srtFailed} SRT files failed to download. You can retry using "Check Missing Files" → "Retry Missing Files"`, 'warning');
    }
  } catch (error) {
    addLog(`${provider}-log`, `❌ Subtitle processing error: ${error.message}`, 'error');
  }
}

// Stop TTS processing
function stopTTSProcessing(provider) {
  if (!ttsProcessing[provider]) {
    return;
  }

  if (confirm('Are you sure you want to stop TTS processing?\n\nCurrent batch will complete before stopping.')) {
    ttsCancelled[provider] = true;
    addLog(`${provider}-log`, '🛑 Stopping TTS processing...', 'info');

    // Disable stop button
    const stopBtn = document.getElementById(`${provider}-stop-btn`);
    stopBtn.disabled = true;
    stopBtn.textContent = '⏹️ Stopping...';
  }
}

function clearTTSForm(provider) {
  document.getElementById(`${provider}-text-content`).value = '';
  clearLog(`${provider}-log`);
  updateProgress(`${provider}-progress-bar`, 0);
  hideMissingFilesSection(provider);
}

// Global variable to store missing files info
let missingFilesData = null;

// Check for missing SRT files only (GENAI Labs only)
async function checkMissingSrt(provider) {
  const outputDir = document.getElementById(`${provider}-output-dir`)?.value.trim();
  const textContent = document.getElementById(`${provider}-text-content`)?.value.trim();
  const language = document.getElementById(`${provider}-language`)?.value;
  const apiType = document.getElementById(`${provider}-api-type`)?.value;

  if (!outputDir) {
    alert('Please select an output directory');
    return;
  }

  if (!textContent) {
    alert('Please enter text content');
    return;
  }

  if (provider !== 'genai' || apiType !== 'labs') {
    alert('SRT check is only available for GENAI Labs API!');
    return;
  }

  try {
    addLog(`${provider}-log`, '🔍 Checking for missing SRT files...', 'info');

    // Ensure output directory exists
    await ipcRenderer.invoke('create-directory', outputDir);

    // Split text into sentences
    const splitResult = await ipcRenderer.invoke('split-text', { text: textContent, language });
    if (!splitResult.success) {
      throw new Error('Failed to split text');
    }

    const sentences = splitResult.sentences;

    // Check missing SRT files
    addLog(`${provider}-log`, '📋 Checking SRT files (comparing with existing MP3)...', 'info');
    const srtResult = await ipcRenderer.invoke('check-missing-srt', {
      sentences,
      outputDir
    });

    if (!srtResult.success) {
      throw new Error(srtResult.error);
    }

    // Create result with only SRT data
    const result = {
      mp3: null,  // Not checking MP3
      srt: srtResult.srt,
      mp3NotExist: srtResult.mp3NotExist
    };

    // Store result for retry
    missingFilesData = {
      provider,
      sentences,
      outputDir,
      checkSrt: true,
      result
    };

    // Display results
    displayMissingFilesReport(result, provider);
    addLog(`${provider}-log`, '✅ Missing SRT check completed', 'success');

  } catch (error) {
    addLog(`${provider}-log`, `❌ Error checking SRT files: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  }
}

// Check for missing files
async function checkMissingFiles(provider) {
  const outputDir = document.getElementById(`${provider}-output-dir`)?.value.trim();
  const textContent = document.getElementById(`${provider}-text-content`)?.value.trim();
  const language = document.getElementById(`${provider}-language`)?.value;
  const apiType = document.getElementById(`${provider}-api-type`)?.value;

  if (!outputDir) {
    alert('Please select an output directory');
    return;
  }

  if (!textContent) {
    alert('Please enter text content');
    return;
  }

  try {
    addLog(`${provider}-log`, '🔍 Checking for missing files...', 'info');

    // Ensure output directory exists
    await ipcRenderer.invoke('create-directory', outputDir);

    // Split text into sentences
    const splitResult = await ipcRenderer.invoke('split-text', { text: textContent, language });
    if (!splitResult.success) {
      throw new Error('Failed to split text');
    }

    const sentences = splitResult.sentences;

    // Check missing MP3 files
    addLog(`${provider}-log`, '🎵 Checking MP3 files...', 'info');
    const mp3Result = await ipcRenderer.invoke('check-missing-files', {
      sentences,
      outputDir
    });

    if (!mp3Result.success) {
      throw new Error(mp3Result.error);
    }

    // Check missing SRT files if Labs API
    let srtResult = null;
    const checkSrt = (provider === 'genai' && apiType === 'labs');
    if (checkSrt) {
      addLog(`${provider}-log`, '📋 Checking SRT files (comparing with existing MP3)...', 'info');
      srtResult = await ipcRenderer.invoke('check-missing-srt', {
        sentences,
        outputDir
      });

      if (!srtResult.success) {
        throw new Error(srtResult.error);
      }
    }

    // Combine results
    const result = {
      mp3: mp3Result.mp3,
      srt: srtResult ? srtResult.srt : null,
      mp3NotExist: srtResult ? srtResult.mp3NotExist : 0
    };

    // Store result for retry
    missingFilesData = {
      provider,
      sentences,
      outputDir,
      checkSrt,
      result
    };

    // Display results
    displayMissingFilesReport(result, provider);
    addLog(`${provider}-log`, '✅ Missing files check completed', 'success');

  } catch (error) {
    addLog(`${provider}-log`, `❌ Error checking files: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  }
}

// Display missing files report
function displayMissingFilesReport(result, provider) {
  const section = document.getElementById(`${provider}-missing-files-section`);
  const summaryDiv = document.getElementById(`${provider}-missing-files-summary`);
  const detailsDiv = document.getElementById(`${provider}-missing-files-details`);

  // Build summary
  let summaryHTML = '';

  // Only show total if we checked MP3
  if (result.mp3) {
    summaryHTML += `
      <div class="stat-row">
        <span class="stat-label">Total Sentences:</span>
        <span class="stat-value">${result.mp3.total}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">MP3 Files - Existing:</span>
        <span class="stat-value success">${result.mp3.existing}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">MP3 Files - Missing:</span>
        <span class="stat-value error">${result.mp3.missing}</span>
      </div>
    `;
  }

  if (result.srt) {
    summaryHTML += `
      <div class="stat-row">
        <span class="stat-label">SRT Files - Existing:</span>
        <span class="stat-value success">${result.srt.existing}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">SRT Files - Missing:</span>
        <span class="stat-value error">${result.srt.missing}</span>
      </div>
    `;
  }

  summaryDiv.innerHTML = summaryHTML;

  // Build details
  let detailsHTML = '';

  if (result.mp3 && result.mp3.missing > 0) {
    detailsHTML += '<h4>Missing MP3 Files:</h4>';
    result.mp3.missingList.slice(0, 20).forEach(item => {
      const preview = item.text.length > 80 ? item.text.substring(0, 80) + '...' : item.text;
      detailsHTML += `
        <div class="missing-item">
          <span class="item-number">Segment ${item.segmentNumber}:</span>
          <span class="item-text">${preview}</span>
        </div>
      `;
    });
    if (result.mp3.missingList.length > 20) {
      detailsHTML += `<p style="text-align: center; color: #888;">... and ${result.mp3.missingList.length - 20} more</p>`;
    }
  }

  if (result.srt && result.srt.missing > 0) {
    detailsHTML += '<h4 style="margin-top: 20px;">Missing SRT Files (MP3 exists but SRT missing):</h4>';
    if (result.mp3NotExist > 0) {
      detailsHTML += `<p style="color: #888; margin-bottom: 10px;"><i>Note: ${result.mp3NotExist} segments skipped (MP3 not exist)</i></p>`;
    }
    result.srt.missingList.slice(0, 20).forEach(item => {
      const preview = item.text.length > 80 ? item.text.substring(0, 80) + '...' : item.text;
      detailsHTML += `
        <div class="missing-item">
          <span class="item-number">Segment ${item.segmentNumber}:</span>
          <span class="item-text">${preview}</span>
        </div>
      `;
    });
    if (result.srt.missingList.length > 20) {
      detailsHTML += `<p style="text-align: center; color: #888;">... and ${result.srt.missingList.length - 20} more</p>`;
    }
  }

  const mp3AllGood = !result.mp3 || result.mp3.missing === 0;
  const srtAllGood = !result.srt || result.srt.missing === 0;

  if (mp3AllGood && srtAllGood) {
    detailsHTML = '<p style="text-align: center; color: #28a745; font-weight: 600;">🎉 All files are present! No missing files found.</p>';
  }

  detailsDiv.innerHTML = detailsHTML;
  section.style.display = 'block';

  // Show appropriate retry buttons
  const retryMp3Btn = document.getElementById(`${provider}-retry-mp3-btn`);
  const retrySrtBtn = document.getElementById(`${provider}-retry-srt-btn`);

  console.log(`[${provider}] Retry button check:`, {
    retryMp3Btn: !!retryMp3Btn,
    retrySrtBtn: !!retrySrtBtn,
    mp3Missing: result.mp3?.missing,
    srtMissing: result.srt?.missing
  });

  if (retryMp3Btn) {
    if (result.mp3 && result.mp3.missing > 0) {
      retryMp3Btn.style.display = 'inline-block';
      console.log(`[${provider}] Showing retry MP3 button - ${result.mp3.missing} files missing`);
    } else {
      retryMp3Btn.style.display = 'none';
      console.log(`[${provider}] Hiding retry MP3 button - no missing files`);
    }
  } else {
    console.error(`[${provider}] Retry MP3 button element not found!`);
  }

  // Only show SRT retry button for GENAI Labs with SRT enabled
  if (retrySrtBtn) {
    const downloadSrt = provider === 'genai' && document.getElementById('genai-download-srt')?.checked;
    if (downloadSrt && result.srt && result.srt.missing > 0) {
      retrySrtBtn.style.display = 'inline-block';
      console.log(`[${provider}] Showing retry SRT button - ${result.srt.missing} files missing`);
    } else {
      retrySrtBtn.style.display = 'none';
      console.log(`[${provider}] Hiding retry SRT button`);
    }
  }
}

// Merge SRT files
async function mergeSrtFiles(provider) {
  // Ask user to select SRT directory
  const result = await ipcRenderer.invoke('select-directory');

  if (!result) {
    return;
  }

  const srtsDir = result;

  if (!confirm(`Merge all SRT files in:\n${srtsDir}\n\nThis will create a single merged SRT file. Continue?`)) {
    return;
  }

  addLog(`${provider}-log`, '📋 Starting SRT merge process...', 'info');
  addLog(`${provider}-log`, `📁 Directory: ${srtsDir}`, 'info');

  try {
    const mergeResult = await ipcRenderer.invoke('merge-srt-files', { outputDir: srtsDir });

    if (mergeResult.success) {
      const { outputFile, stats } = mergeResult;
      const durationMinutes = (stats.totalDuration / 60).toFixed(1);

      addLog(`${provider}-log`, '✅ SRT files merged successfully!', 'success');
      addLog(`${provider}-log`, `📄 Output file: ${outputFile}`, 'info');
      addLog(`${provider}-log`, `📊 Files processed: ${stats.filesProcessed}`, 'info');
      addLog(`${provider}-log`, `📝 Total subtitles: ${stats.totalSubtitles}`, 'info');
      addLog(`${provider}-log`, `⏱️  Total duration: ${durationMinutes} minutes (${stats.totalDuration.toFixed(1)}s)`, 'info');
      addLog(`${provider}-log`, `🔢 File numbers: ${stats.fileNumbers.join(', ')}`, 'info');

      alert(`SRT files merged successfully!\n\nOutput: ${outputFile}\nProcessed: ${stats.filesProcessed} files\nSubtitles: ${stats.totalSubtitles}\nDuration: ${durationMinutes} minutes`);
    } else {
      addLog(`${provider}-log`, `❌ Failed to merge SRT files: ${mergeResult.error}`, 'error');
      alert(`Failed to merge SRT files: ${mergeResult.error}`);
    }
  } catch (error) {
    addLog(`${provider}-log`, `❌ Error: ${error.message}`, 'error');
    alert(`Error merging SRT files: ${error.message}`);
  }
}

// Join voices (concatenate MP3 files)
async function joinVoices(provider) {
  // Ask user to select voices directory
  const result = await ipcRenderer.invoke('select-directory');

  if (!result) {
    return;
  }

  const voicesDir = result;

  if (!confirm(`Join all MP3 files in:\n${voicesDir}\n\nThis will create a single joined MP3 file. Continue?`)) {
    return;
  }

  addLog(`${provider}-log`, '🎵 Starting voice joining process...', 'info');
  addLog(`${provider}-log`, `📁 Directory: ${voicesDir}`, 'info');

  try {
    const joinResult = await ipcRenderer.invoke('join-voices', { voicesDir });

    if (joinResult.success) {
      const { outputFile, stats } = joinResult;

      addLog(`${provider}-log`, '✅ Voices joined successfully!', 'success');
      addLog(`${provider}-log`, `📄 Output file: ${outputFile}`, 'info');
      addLog(`${provider}-log`, `📊 Files joined: ${stats.filesJoined}`, 'info');
      addLog(`${provider}-log`, `🔢 File numbers: ${stats.fileNumbers.join(', ')}`, 'info');
      if (stats.method) {
        addLog(`${provider}-log`, `🔧 Method: ${stats.method}`, 'info');
      }

      alert(`Voices joined successfully!\n\nOutput: ${outputFile}\nFiles joined: ${stats.filesJoined}`);
    } else {
      addLog(`${provider}-log`, `❌ Failed to join voices: ${joinResult.error}`, 'error');
      alert(`Failed to join voices: ${joinResult.error}`);
    }
  } catch (error) {
    addLog(`${provider}-log`, `❌ Error: ${error.message}`, 'error');
    alert(`Error joining voices: ${error.message}`);
  }
}

// Retry missing MP3 files
async function retryMissingVoices(provider) {
  console.log(`[${provider}] retryMissingVoices called`);
  console.log(`[${provider}] missingFilesData:`, missingFilesData);

  if (!missingFilesData) {
    const msg = `No missing files data available.\n\nPlease follow these steps:\n1. Enter text in the text area\n2. Click "Check Missing MP3" button\n3. Then click "Retry Missing Voices" button`;
    alert(msg);
    return;
  }

  // Use provider from stored data if not passed
  if (!provider) {
    provider = missingFilesData.provider || 'genai';
  }

  const { result } = missingFilesData;
  console.log(`[${provider}] result:`, result);

  // Check if MP3 data exists (might be null if only SRT was checked)
  if (!result.mp3) {
    alert('No MP3 check data available. Please run "Check Missing MP3" first.');
    return;
  }

  const hasMissingMp3 = result.mp3.missing > 0;
  console.log(`[${provider}] hasMissingMp3:`, hasMissingMp3, 'missing count:', result.mp3.missing);

  if (!hasMissingMp3) {
    alert('No missing MP3 files to retry!');
    return;
  }

  if (!confirm(`This will retry generating ${result.mp3.missing} missing MP3 files. Continue?`)) {
    console.log(`[${provider}] User cancelled retry`);
    return;
  }

  console.log(`[${provider}] User confirmed retry, proceeding...`);

  // Hide missing files section
  hideMissingFilesSection(provider);

  // Prepare data for retry
  const apiKey = document.getElementById(`${provider}-api-key`).value.trim();
  const voiceId = document.getElementById(`${provider}-voice-id`).value.trim();
  const model = document.getElementById(`${provider}-model`).value.trim();
  const ngrokUrl = document.getElementById(`${provider}-ngrok-url`).value.trim();
  const apiType = document.getElementById(`${provider}-api-type`).value;
  const { outputDir } = missingFilesData;

  console.log(`[${provider}] Retry config:`, { apiKey: apiKey ? 'SET' : 'NOT SET', voiceId, model, ngrokUrl, apiType, outputDir });

  if (!serverRunning) {
    console.error(`[${provider}] Server not running!`);
    alert('Please start the callback server first');
    return;
  }

  console.log(`[${provider}] Server is running, starting retry process...`);

  ttsProcessing[provider] = true;
  clearLog(`${provider}-log`);
  updateProgress(`${provider}-progress-bar`, 0);

  console.log(`[${provider}] Set ttsProcessing to true, cleared log, reset progress`);

  try {
    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, '🔄 Retrying missing MP3 files...', 'info');
    addLog(`${provider}-log`, '═══════════════════════════', 'info');

    // Ensure output directory exists
    await ipcRenderer.invoke('create-directory', outputDir);
    console.log(`[${provider}] Output directory created/verified`);

    // Get only missing segments
    const missingSegments = result.mp3.missingList.map(item => ({
      segmentNumber: item.segmentNumber,
      text: item.text
    }));

    console.log(`[${provider}] Missing segments:`, missingSegments);

    addLog(`${provider}-log`, `📝 Found ${missingSegments.length} missing MP3 segments`, 'info');
    addLog(`${provider}-log`, `⚡ Processing with concurrency: ${settings.batchSize}`, 'info');
    addLog(`${provider}-log`, `📁 Output directory: ${outputDir}`, 'info');

    // Process in batches
    const results = [];
    const batchSize = settings.batchSize;
    let completedCount = 0;

    console.log(`[${provider}] Starting batch processing with batchSize: ${batchSize}`);

    for (let batchStart = 0; batchStart < missingSegments.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, missingSegments.length);
      const batch = missingSegments.slice(batchStart, batchEnd);
      const batchNumber = Math.floor(batchStart / batchSize) + 1;
      const totalBatches = Math.ceil(missingSegments.length / batchSize);

      console.log(`[${provider}] Processing batch ${batchNumber}/${totalBatches}:`, batch.map(s => s.segmentNumber));
      addLog(`${provider}-log`, `📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} segments)`, 'info');

      const batchPromises = batch.map(async (segment) => {
        const { segmentNumber, text } = segment;

        console.log(`[${provider}] Starting segment ${segmentNumber}`);

        try {
          addLog(`${provider}-log`, `🔄 [${segmentNumber}] RETRY - Creating new TTS task...`, 'info');
          addLog(`${provider}-log`, `📝 [${segmentNumber}] Text: "${text.substring(0, 60)}..."`, 'info');

          const config = {
            apiKey,
            voiceId,
            model: model || '',
            callbackUrl: ngrokUrl
          };

          console.log(`[${provider}] [${segmentNumber}] Calling API with config:`, { ...config, apiKey: config.apiKey ? 'SET' : 'NOT SET' });
          addLog(`${provider}-log`, `🌐 [${segmentNumber}] Calling ${provider.toUpperCase()} ${apiType.toUpperCase()} API...`, 'info');

          let taskResult;
          if (provider === 'genai' && apiType === 'labs') {
            console.log(`[${provider}] [${segmentNumber}] Invoking create-tts-task-labs`);
            taskResult = await ipcRenderer.invoke('create-tts-task-labs', {
              text,
              segmentNumber,
              config
            });
          } else if (provider === 'genai' && apiType === 'max') {
            console.log(`[${provider}] [${segmentNumber}] Invoking create-tts-task-max`);
            taskResult = await ipcRenderer.invoke('create-tts-task-max', {
              text,
              segmentNumber,
              config
            });
          } else if (provider === 'ai33' && apiType === 'labs') {
            console.log(`[${provider}] [${segmentNumber}] Invoking create-tts-task-ai33-labs`);
            taskResult = await ipcRenderer.invoke('create-tts-task-ai33-labs', {
              text,
              segmentNumber,
              config
            });
          } else if (provider === 'ai33' && apiType === 'max') {
            console.log(`[${provider}] [${segmentNumber}] Invoking create-tts-task-ai33-max`);
            taskResult = await ipcRenderer.invoke('create-tts-task-ai33-max', {
              text,
              segmentNumber,
              config
            });
          }

          console.log(`[${provider}] [${segmentNumber}] API result:`, taskResult);

          if (!taskResult.success) {
            throw new Error(taskResult.error);
          }

          addLog(`${provider}-log`, `✅ [${segmentNumber}] API responded - Task created: ${taskResult.taskId}`, 'success');
          addLog(`${provider}-log`, `⏳ [${segmentNumber}] Waiting for TTS generation callback...`, 'info');

          const audioUrl = await ipcRenderer.invoke('wait-for-tts-task', {
            taskId: taskResult.taskId,
            segmentNumber
          });

          addLog(`${provider}-log`, `📥 [${segmentNumber}] Callback received - Downloading audio...`, 'info');
          const outputPath = path.join(outputDir, `${segmentNumber}.mp3`);
          const downloadResult = await ipcRenderer.invoke('download-audio', {
            url: audioUrl,
            outputPath
          });

          if (downloadResult.success) {
            addLog(`${provider}-log`, `✅ [${segmentNumber}] RETRY SUCCESS - Downloaded (${(downloadResult.size / 1024).toFixed(1)} KB)`, 'success');

            // Update progress immediately
            completedCount++;
            const progress = Math.round((completedCount / missingSegments.length) * 100);
            updateProgress(`${provider}-progress-bar`, progress);

            return { success: true, segmentNumber, taskId: taskResult.taskId };
          } else {
            throw new Error('Download failed');
          }

        } catch (error) {
          addLog(`${provider}-log`, `❌ [${segmentNumber}] RETRY FAILED: ${error.message}`, 'error');

          // Update progress even on failure
          completedCount++;
          const progress = Math.round((completedCount / missingSegments.length) * 100);
          updateProgress(`${provider}-progress-bar`, progress);

          return { success: false, segmentNumber, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      addLog(`${provider}-log`, `✅ Batch ${batchNumber}/${totalBatches} completed`, 'success');
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, `✅ MP3 retry complete!`, 'success');
    addLog(`${provider}-log`, `📊 Total: ${missingSegments.length} | Success: ${successful} | Failed: ${failed}`, 'info');

    if (failed > 0) {
      const failedNumbers = results.filter(r => !r.success).map(r => r.segmentNumber).join(', ');
      addLog(`${provider}-log`, `⚠️ Failed segments: ${failedNumbers}`, 'warning');
    }

    // Auto-join MP3 files only if all retry attempts are successful
    if (successful > 0 && failed === 0) {
      // Check if there are any other missing MP3 files in the directory
      addLog(`${provider}-log`, '═══════════════════════════', 'info');
      addLog(`${provider}-log`, '🔍 Verifying all MP3 files are present...', 'info');

      try {
        const { sentences } = missingFilesData;
        const verifyResult = await ipcRenderer.invoke('check-missing-files', {
          sentences,
          outputDir
        });

        if (verifyResult.success && verifyResult.mp3.missing === 0) {
          addLog(`${provider}-log`, '✅ All MP3 files are present. Auto-joining...', 'info');

          const joinResult = await ipcRenderer.invoke('join-voices', { voicesDir: outputDir });

          if (joinResult.success) {
            const { outputFile, stats } = joinResult;
            addLog(`${provider}-log`, `✅ MP3 files joined successfully!`, 'success');
            addLog(`${provider}-log`, `📄 Output: ${outputFile}`, 'info');
            addLog(`${provider}-log`, `📊 Files joined: ${stats.filesJoined}`, 'info');
          } else {
            addLog(`${provider}-log`, `⚠️ Auto-join failed: ${joinResult.error}`, 'warning');
          }
        } else {
          addLog(`${provider}-log`, `🚫 Auto-join skipped: ${verifyResult.mp3.missing} MP3 file(s) still missing. Run "Check Missing Files" to see details.`, 'info');
        }
      } catch (error) {
        addLog(`${provider}-log`, `⚠️ Auto-join error: ${error.message}`, 'warning');
      }
    } else if (failed > 0) {
      addLog(`${provider}-log`, `🚫 Auto-join skipped: ${failed} retry attempt(s) failed. Fix failures to enable auto-join.`, 'info');
    }

    // Save task IDs to cache for SRT retry
    const successfulResults = results.filter(r => r.success && r.taskId);
    if (successfulResults.length > 0) {
      try {
        const taskIdCachePath = path.join(outputDir, '.task_ids_cache.json');

        // Read existing cache
        let existingCache = {};
        try {
          const cacheResult = await ipcRenderer.invoke('read-file', taskIdCachePath);
          if (cacheResult.success) {
            existingCache = JSON.parse(cacheResult.content);
          }
        } catch (error) {
          // No existing cache
        }

        // Update cache with new task IDs
        successfulResults.forEach(r => {
          existingCache[r.segmentNumber] = r.taskId;
        });

        await ipcRenderer.invoke('write-file', {
          filePath: taskIdCachePath,
          content: JSON.stringify(existingCache, null, 2)
        });

        addLog(`${provider}-log`, `💾 Saved ${successfulResults.length} task IDs for future SRT retry`, 'info');
      } catch (error) {
        addLog(`${provider}-log`, `⚠️ Failed to save task IDs: ${error.message}`, 'warning');
      }
    }

  } catch (error) {
    addLog(`${provider}-log`, `❌ Error: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  } finally {
    ttsProcessing[provider] = false;
    updateProgress(`${provider}-progress-bar`, 100);
  }
}

// Retry missing SRT files
async function retryMissingSrt(provider) {
  if (!missingFilesData) {
    alert('No missing files data available. Please run "Check Missing Files" first.');
    return;
  }

  // Use provider from stored data if not passed
  if (!provider) {
    provider = missingFilesData.provider || 'genai';
  }

  const { result } = missingFilesData;
  const hasMissingSrt = result.srt && result.srt.missing > 0;

  if (!hasMissingSrt) {
    alert('No missing SRT files to retry!');
    return;
  }

  const apiType = document.getElementById(`${provider}-api-type`).value;

  if (provider !== 'genai' || apiType !== 'labs') {
    alert('SRT download is only available for GENAI Labs API!');
    return;
  }

  if (!confirm(`This will retry downloading ${result.srt.missing} missing SRT files. Continue?`)) {
    return;
  }

  // Hide missing files section
  hideMissingFilesSection(provider);

  const apiKey = document.getElementById(`${provider}-api-key`).value.trim();
  const { outputDir } = missingFilesData;

  if (!apiKey) {
    alert('Please enter your API key');
    return;
  }

  ttsProcessing[provider] = true;
  clearLog(`${provider}-log`);
  updateProgress(`${provider}-progress-bar`, 0);

  try {
    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, '🔄 Retrying missing SRT files...', 'info');
    addLog(`${provider}-log`, '═══════════════════════════', 'info');

    const missingSrtSegments = result.srt.missingList;
    addLog(`${provider}-log`, `📝 Found ${missingSrtSegments.length} missing SRT files`, 'info');
    addLog(`${provider}-log`, `📁 Output directory: ${outputDir}`, 'info');

    // Create srts directory
    const srtsDir = path.join(outputDir, 'srts');
    await ipcRenderer.invoke('create-directory', srtsDir);

    // Check if we have taskIds stored (from recent TTS generation)
    // For now, we need to inform user that SRT can only be retried if MP3 was just generated
    addLog(`${provider}-log`, '⚠️ Note: SRT retry requires corresponding MP3 files and recent task IDs', 'warning');
    addLog(`${provider}-log`, '💡 Tip: If SRT is missing, try running "Retry Missing Voices" first to get new task IDs', 'info');

    let srtDownloaded = 0;
    let srtFailed = 0;
    let srtSkipped = 0;

    // We need taskIds - check if there's a way to retrieve them
    // For segments with existing MP3, we can't get taskId unless we store it
    addLog(`${provider}-log`, '🔍 Checking for available task IDs...', 'info');

    // Read task IDs from a potential cache file (we'll need to implement this)
    const taskIdCachePath = path.join(outputDir, '.task_ids_cache.json');
    let taskIdMap = new Map();

    try {
      const cacheResult = await ipcRenderer.invoke('read-file', taskIdCachePath);
      if (cacheResult.success) {
        const cacheData = JSON.parse(cacheResult.content);
        taskIdMap = new Map(Object.entries(cacheData));
        addLog(`${provider}-log`, `✅ Found ${taskIdMap.size} cached task IDs`, 'success');
      }
    } catch (error) {
      addLog(`${provider}-log`, '⚠️ No task ID cache found. SRT retry may fail.', 'warning');
    }

    let processedCount = 0;

    // Phase 1: Request subtitles
    addLog(`${provider}-log`, 'Phase 1: Requesting subtitles...', 'info');
    const subtitleRequests = [];

    for (const item of missingSrtSegments) {
      const { segmentNumber } = item;
      const taskId = taskIdMap.get(segmentNumber.toString());

      if (!taskId) {
        addLog(`${provider}-log`, `⏭️ [${segmentNumber}] Skipping - no taskId available`, 'warning');
        srtSkipped++;
        processedCount++;
        updateProgress(`${provider}-progress-bar`, Math.round((processedCount / missingSrtSegments.length) * 50));
        continue;
      }

      try {
        addLog(`${provider}-log`, `🔄 [${segmentNumber}] RETRY SRT - Requesting subtitle from task: ${taskId}`, 'info');

        const requestResult = await ipcRenderer.invoke('request-subtitle', {
          taskId,
          apiKey
        });

        if (requestResult.success) {
          addLog(`${provider}-log`, `✅ [${segmentNumber}] Subtitle request sent successfully`, 'success');
        }

        subtitleRequests.push({
          taskId,
          segmentNumber,
          requested: requestResult.success
        });

        processedCount++;
        updateProgress(`${provider}-progress-bar`, Math.round((processedCount / missingSrtSegments.length) * 50));

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        addLog(`${provider}-log`, `❌ [${segmentNumber}] Failed to request subtitle: ${error.message}`, 'error');
        srtFailed++;
        processedCount++;
        updateProgress(`${provider}-progress-bar`, Math.round((processedCount / missingSrtSegments.length) * 50));
      }
    }

    if (subtitleRequests.length === 0) {
      throw new Error('No SRT requests could be made. Please retry MP3 generation first to obtain task IDs.');
    }

    // Wait 30 seconds
    addLog(`${provider}-log`, '⏳ Waiting 30 seconds for subtitle generation...', 'info');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Phase 2: Download SRT files
    addLog(`${provider}-log`, 'Phase 2: Downloading SRT files...', 'info');
    processedCount = 0;

    for (const request of subtitleRequests) {
      if (!request.requested) {
        srtFailed++;
        processedCount++;
        updateProgress(`${provider}-progress-bar`, 50 + Math.round((processedCount / subtitleRequests.length) * 50));
        continue;
      }

      try {
        addLog(`${provider}-log`, `🔍 [${request.segmentNumber}] Getting subtitle URL from task: ${request.taskId}`, 'info');

        const detailsResult = await ipcRenderer.invoke('get-task-details', {
          taskId: request.taskId,
          apiKey
        });

        if (detailsResult.success && detailsResult.subtitleUrl) {
          const srtPath = path.join(srtsDir, `${request.segmentNumber}.srt`);

          addLog(`${provider}-log`, `📥 [${request.segmentNumber}] Downloading SRT file...`, 'info');

          const downloadResult = await ipcRenderer.invoke('download-srt', {
            url: detailsResult.subtitleUrl,
            outputPath: srtPath
          });

          if (downloadResult.success) {
            addLog(`${provider}-log`, `✅ [${request.segmentNumber}] SRT RETRY SUCCESS - Downloaded (${(downloadResult.size / 1024).toFixed(1)} KB)`, 'success');
            srtDownloaded++;
          } else {
            addLog(`${provider}-log`, `❌ [${request.segmentNumber}] SRT download failed: ${downloadResult.error}`, 'error');
            srtFailed++;
          }
        } else {
          addLog(`${provider}-log`, `❌ [${request.segmentNumber}] No subtitle URL found`, 'error');
          srtFailed++;
        }

        processedCount++;
        updateProgress(`${provider}-progress-bar`, 50 + Math.round((processedCount / subtitleRequests.length) * 50));

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        addLog(`${provider}-log`, `❌ [${request.segmentNumber}] SRT download error: ${error.message}`, 'error');
        srtFailed++;
        processedCount++;
        updateProgress(`${provider}-progress-bar`, 50 + Math.round((processedCount / subtitleRequests.length) * 50));
      }
    }

    // Summary
    addLog(`${provider}-log`, '═══════════════════════════', 'info');
    addLog(`${provider}-log`, `✅ SRT retry complete!`, 'success');
    addLog(`${provider}-log`, `📊 Total: ${missingSrtSegments.length} | Downloaded: ${srtDownloaded} | Failed: ${srtFailed} | Skipped: ${srtSkipped}`, 'info');

    if (srtSkipped > 0) {
      addLog(`${provider}-log`, `💡 ${srtSkipped} files skipped due to missing task IDs. Run "Retry Missing Voices" first.`, 'warning');
    }

    // Auto-merge SRT files only if all retry attempts are successful and no files are skipped
    if (srtDownloaded > 0 && srtFailed === 0 && srtSkipped === 0) {
      // Verify all SRT files are present
      addLog(`${provider}-log`, '═══════════════════════════', 'info');
      addLog(`${provider}-log`, '🔍 Verifying all SRT files are present...', 'info');

      try {
        const { sentences } = missingFilesData;
        const verifyResult = await ipcRenderer.invoke('check-missing-srt', {
          sentences,
          outputDir
        });

        if (verifyResult.success && verifyResult.srt.missing === 0) {
          addLog(`${provider}-log`, '✅ All SRT files are present. Auto-merging...', 'info');

          const mergeResult = await ipcRenderer.invoke('merge-srt-files', { outputDir });

          if (mergeResult.success) {
            const { outputFile, stats } = mergeResult;
            const durationMinutes = (stats.totalDuration / 60).toFixed(1);
            addLog(`${provider}-log`, `✅ SRT files merged successfully!`, 'success');
            addLog(`${provider}-log`, `📄 Output: ${outputFile}`, 'info');
            addLog(`${provider}-log`, `📝 Total subtitles: ${stats.totalSubtitles}`, 'info');
            addLog(`${provider}-log`, `⏱️  Duration: ${durationMinutes} minutes`, 'info');
          } else {
            addLog(`${provider}-log`, `⚠️ Auto-merge SRT failed: ${mergeResult.error}`, 'warning');
          }
        } else {
          addLog(`${provider}-log`, `🚫 Auto-merge SRT skipped: ${verifyResult.srt.missing} SRT file(s) still missing. Run "Check Missing SRT" to see details.`, 'info');
        }
      } catch (error) {
        addLog(`${provider}-log`, `⚠️ Auto-merge SRT error: ${error.message}`, 'warning');
      }
    } else if (srtFailed > 0 || srtSkipped > 0) {
      const reason = srtFailed > 0 ? `${srtFailed} download(s) failed` : `${srtSkipped} file(s) skipped`;
      addLog(`${provider}-log`, `🚫 Auto-merge SRT skipped: ${reason}. Fix issues to enable auto-merge.`, 'info');
    }

  } catch (error) {
    addLog(`${provider}-log`, `❌ Error: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  } finally {
    ttsProcessing[provider] = false;
    updateProgress(`${provider}-progress-bar`, 100);
  }
}

// Hide missing files section
function hideMissingFilesSection(provider) {
  const section = document.getElementById(`${provider}-missing-files-section`);
  if (section) {
    section.style.display = 'none';
  }
  missingFilesData = null;
}

// Listen for TTS progress updates
ipcRenderer.on('tts-progress', (event, data) => {
  if (data.status === 'completed') {
    console.log('TTS task completed:', data.taskId);
  } else if (data.status === 'failed') {
    console.error('TTS task failed:', data.taskId, data.error);
  }
});

// ======================
// Video Sync Processing
// ======================
async function startVideoSync() {
  if (syncProcessing) {
    alert('Video sync is already running!');
    return;
  }

  // Validate inputs
  const voiceDir = document.getElementById('voice-dir').value.trim();
  const videoDir = document.getElementById('video-dir').value.trim();
  const outputDir = document.getElementById('sync-output-dir').value.trim();
  const forceReprocess = document.getElementById('force-reprocess').checked;

  if (!voiceDir) {
    alert('Please select voice directory');
    return;
  }

  if (!videoDir) {
    alert('Please select video directory');
    return;
  }

  if (!outputDir) {
    alert('Please select output directory');
    return;
  }

  syncProcessing = true;
  clearLog('sync-log');
  updateProgress('sync-progress-bar', 0);

  try {
    addLog('sync-log', '🚀 Starting video synchronization...', 'info');

    // Create output directory if not exists
    addLog('sync-log', `📁 Ensuring directories exist...`, 'info');
    await ipcRenderer.invoke('create-directory', outputDir);
    addLog('sync-log', `✅ Output directory ready: ${outputDir}`, 'success');

    // Verify voice and video directories exist
    const voiceDirCheck = await ipcRenderer.invoke('file-exists', voiceDir);
    if (!voiceDirCheck.exists) {
      throw new Error(`Voice directory does not exist: ${voiceDir}`);
    }

    const videoDirCheck = await ipcRenderer.invoke('file-exists', videoDir);
    if (!videoDirCheck.exists) {
      throw new Error(`Video directory does not exist: ${videoDir}`);
    }

    // Read voice files
    const voiceFiles = await fs.readdir(voiceDir);
    const mp3Files = voiceFiles
      .filter(f => f.toLowerCase().endsWith('.mp3'))
      .sort((a, b) => {
        const numA = parseFloat(a.replace('.mp3', ''));
        const numB = parseFloat(b.replace('.mp3', ''));
        return numA - numB;
      });

    addLog('sync-log', `📁 Found ${mp3Files.length} voice files`, 'info');

    // Read video files
    const videoFiles = await fs.readdir(videoDir);
    const mp4Files = videoFiles.filter(f => f.toLowerCase().endsWith('.mp4'));

    addLog('sync-log', `📁 Found ${mp4Files.length} video files`, 'info');

    // Load processed files list
    const processedFile = path.join(outputDir, 'processed_files.json');
    let processedSet = new Set();

    if (!forceReprocess) {
      try {
        const processedData = await ipcRenderer.invoke('read-file', processedFile);
        if (processedData.success) {
          processedSet = new Set(JSON.parse(processedData.content));
          addLog('sync-log', `📋 Loaded ${processedSet.size} processed files`, 'info');
        }
      } catch {
        // File doesn't exist yet
      }
    }

    // Process each voice file
    let processed = 0;
    let skipped = 0;
    let missing = 0;
    let errors = 0;

    for (let i = 0; i < mp3Files.length; i++) {
      const voiceFile = mp3Files[i];
      const sceneNum = voiceFile.replace('.mp3', '');

      // Check if already processed
      if (processedSet.has(sceneNum)) {
        addLog('sync-log', `⏭️ Skipping scene ${sceneNum} (already processed)`, 'info');
        skipped++;
        continue;
      }

      // Find matching video
      // New format: "Scene 1. any text here.mp4" or "Scene 123. description.mp4"
      const videoPattern = new RegExp(`^Scene ${sceneNum}\\..*\\.mp4$`, 'i');
      const matchingVideo = mp4Files.find(v => videoPattern.test(v));

      if (!matchingVideo) {
        addLog('sync-log', `❌ No video found for scene ${sceneNum}`, 'error');
        missing++;
        continue;
      }

      try {
        addLog('sync-log', `[${i + 1}/${mp3Files.length}] Processing scene ${sceneNum}...`, 'info');

        // Get audio duration
        const voicePath = path.join(voiceDir, voiceFile);
        const durationResult = await ipcRenderer.invoke('get-audio-duration', voicePath);

        if (!durationResult.success) {
          throw new Error('Failed to get audio duration');
        }

        const audioDuration = durationResult.duration;
        addLog('sync-log', `⏱️ Audio duration: ${audioDuration.toFixed(2)}s`, 'info');

        // Sync video
        const videoPath = path.join(videoDir, matchingVideo);
        const outputPath = path.join(outputDir, `${sceneNum}.mp4`);

        const syncResult = await ipcRenderer.invoke('sync-video-to-audio', {
          videoPath,
          audioDuration,
          outputPath,
          hwAccel: settings.hwAccel || 'cpu'
        });

        if (syncResult.success) {
          addLog('sync-log', `✅ Scene ${sceneNum} synced successfully`, 'success');
          processedSet.add(sceneNum);
          processed++;
        } else {
          throw new Error('Sync failed');
        }

      } catch (error) {
        addLog('sync-log', `❌ Scene ${sceneNum} failed: ${error.message}`, 'error');
        errors++;
      }

      // Update progress
      const progress = Math.round(((i + 1) / mp3Files.length) * 100);
      updateProgress('sync-progress-bar', progress);
    }

    // Save processed files list
    await ipcRenderer.invoke('write-file', {
      filePath: processedFile,
      content: JSON.stringify(Array.from(processedSet))
    });

    // Summary
    addLog('sync-log', '═══════════════════════════', 'info');
    addLog('sync-log', `✅ Synchronization complete!`, 'success');
    addLog('sync-log', `📊 Total: ${mp3Files.length} | Processed: ${processed} | Skipped: ${skipped}`, 'info');
    addLog('sync-log', `📊 Missing: ${missing} | Errors: ${errors}`, 'info');
    addLog('sync-log', `📁 Output: ${outputDir}`, 'info');

  } catch (error) {
    addLog('sync-log', `❌ Fatal error: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  } finally {
    syncProcessing = false;
  }
}

// Update hardware acceleration
function updateHwAccel() {
  const hwAccel = document.getElementById('hw-accel').value;
  settings.hwAccel = hwAccel;
  saveSettings();
}

function clearSyncForm() {
  clearLog('sync-log');
  updateProgress('sync-progress-bar', 0);
  hideMissingVideosSection();
}

// Global variable to store missing videos info
let missingVideosData = null;

// Check for missing videos
async function checkMissingVideos() {
  const voiceDir = document.getElementById('voice-dir').value.trim();
  const videoDir = document.getElementById('video-dir').value.trim();
  const outputDir = document.getElementById('sync-output-dir').value.trim();
  const promptsFile = document.getElementById('prompts-file').value.trim();

  if (!voiceDir) {
    alert('Please select voice directory');
    return;
  }

  if (!videoDir) {
    alert('Please select video directory');
    return;
  }

  if (!outputDir) {
    alert('Please select output directory');
    return;
  }

  try {
    addLog('sync-log', '🔍 Checking for missing videos...', 'info');

    // Verify directories exist
    const voiceDirCheck = await ipcRenderer.invoke('file-exists', voiceDir);
    if (!voiceDirCheck.exists) {
      throw new Error(`Voice directory does not exist: ${voiceDir}`);
    }

    const videoDirCheck = await ipcRenderer.invoke('file-exists', videoDir);
    if (!videoDirCheck.exists) {
      throw new Error(`Video directory does not exist: ${videoDir}`);
    }

    // Ensure output directory exists
    await ipcRenderer.invoke('create-directory', outputDir);

    const result = await ipcRenderer.invoke('check-missing-videos', {
      voiceDir,
      videoDir,
      outputDir,
      promptsFile: promptsFile || null
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Log prompts for missing videos
    if (result.missingVideos > 0) {
      addLog('sync-log', '═══════════════════════════', 'info');
      addLog('sync-log', '📝 Prompts for Missing Source Videos:', 'warning');
      result.missingVideosList.forEach(item => {
        if (item.prompt) {
          addLog('sync-log', `Scene ${item.sceneNum}:`, 'info');
          addLog('sync-log', item.prompt, 'info');
          addLog('sync-log', '---', 'info');
        } else {
          addLog('sync-log', `Scene ${item.sceneNum}: (No prompt available)`, 'warning');
        }
      });
    }

    if (result.missingSync > 0) {
      addLog('sync-log', '═══════════════════════════', 'info');
      addLog('sync-log', '📝 Prompts for Videos Not Yet Synced:', 'warning');
      result.missingSyncList.forEach(item => {
        if (item.prompt) {
          addLog('sync-log', `Scene ${item.sceneNum}:`, 'info');
          addLog('sync-log', item.prompt, 'info');
          addLog('sync-log', '---', 'info');
        } else {
          addLog('sync-log', `Scene ${item.sceneNum}: (No prompt available)`, 'warning');
        }
      });
    }

    // Store result for retry
    missingVideosData = {
      voiceDir,
      videoDir,
      outputDir,
      result
    };

    // Display results
    displayMissingVideosReport(result);
    addLog('sync-log', '✅ Missing videos check completed', 'success');

  } catch (error) {
    addLog('sync-log', `❌ Error checking videos: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  }
}

// Display missing videos report
function displayMissingVideosReport(result) {
  const section = document.getElementById('missing-videos-section');
  const summaryDiv = document.getElementById('missing-videos-summary');
  const detailsDiv = document.getElementById('missing-videos-details');

  // Build summary
  let summaryHTML = `
    <div class="stat-row">
      <span class="stat-label">Total Voice Files:</span>
      <span class="stat-value">${result.total}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Videos Synced:</span>
      <span class="stat-value success">${result.synced}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Missing Source Videos:</span>
      <span class="stat-value error">${result.missingVideos}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Not Yet Synced:</span>
      <span class="stat-value error">${result.missingSync}</span>
    </div>
  `;

  summaryDiv.innerHTML = summaryHTML;

  // Build details
  let detailsHTML = '';

  if (result.missingVideos > 0) {
    detailsHTML += '<h4>Missing Source Videos (No matching video file found):</h4>';
    result.missingVideosList.slice(0, 20).forEach(item => {
      detailsHTML += `
        <div class="missing-item">
          <span class="item-number">Scene ${item.sceneNum}:</span>
          <span class="item-text">${item.reason}</span>
        </div>
      `;
    });
    if (result.missingVideosList.length > 20) {
      detailsHTML += `<p style="text-align: center; color: #888;">... and ${result.missingVideosList.length - 20} more</p>`;
    }
  }

  if (result.missingSync > 0) {
    detailsHTML += '<h4 style="margin-top: 20px;">Videos Not Yet Synced:</h4>';
    result.missingSyncList.slice(0, 20).forEach(item => {
      detailsHTML += `
        <div class="missing-item">
          <span class="item-number">Scene ${item.sceneNum}:</span>
          <span class="item-text">${item.sourceVideo}</span>
        </div>
      `;
    });
    if (result.missingSyncList.length > 20) {
      detailsHTML += `<p style="text-align: center; color: #888;">... and ${result.missingSyncList.length - 20} more</p>`;
    }
  }

  if (result.missingVideos === 0 && result.missingSync === 0) {
    detailsHTML = '<p style="text-align: center; color: #28a745; font-weight: 600;">🎉 All videos are synced! No missing videos found.</p>';
  }

  detailsDiv.innerHTML = detailsHTML;
  section.style.display = 'block';
}

// Retry missing videos
async function retryMissingVideos() {
  if (!missingVideosData) {
    alert('No missing videos data available. Please run "Check Missing Videos" first.');
    return;
  }

  const { result } = missingVideosData;

  if (result.missingSync === 0) {
    alert('No videos to retry! All available videos are already synced.');
    return;
  }

  if (result.missingVideos > 0) {
    if (!confirm(`Warning: ${result.missingVideos} source video(s) are missing and cannot be synced.\n\nContinue to sync ${result.missingSync} available video(s)?`)) {
      return;
    }
  } else {
    if (!confirm(`This will sync ${result.missingSync} missing video(s). Continue?`)) {
      return;
    }
  }

  // Hide missing videos section
  hideMissingVideosSection();

  const { voiceDir, videoDir, outputDir } = missingVideosData;

  syncProcessing = true;
  clearLog('sync-log');
  updateProgress('sync-progress-bar', 0);

  try {
    addLog('sync-log', '🔄 Retrying missing videos...', 'info');

    // Ensure output directory exists
    await ipcRenderer.invoke('create-directory', outputDir);

    // Verify voice and video directories exist
    const voiceDirCheck = await ipcRenderer.invoke('file-exists', voiceDir);
    if (!voiceDirCheck.exists) {
      throw new Error(`Voice directory does not exist: ${voiceDir}`);
    }

    const videoDirCheck = await ipcRenderer.invoke('file-exists', videoDir);
    if (!videoDirCheck.exists) {
      throw new Error(`Video directory does not exist: ${videoDir}`);
    }
    addLog('sync-log', `📝 Syncing ${result.missingSync} videos`, 'info');

    const fs = require('fs').promises;
    const path = require('path');

    // Load processed files list
    const processedFile = path.join(outputDir, 'processed_files.json');
    let processedSet = new Set();

    try {
      const processedData = await ipcRenderer.invoke('read-file', processedFile);
      if (processedData.success) {
        processedSet = new Set(JSON.parse(processedData.content));
      }
    } catch {
      // File doesn't exist yet
    }

    // Read video files
    const videoFiles = await fs.readdir(videoDir);
    const mp4Files = videoFiles.filter(f => f.toLowerCase().endsWith('.mp4'));

    let processed = 0;
    let errors = 0;

    // Process only missing sync videos
    for (let i = 0; i < result.missingSyncList.length; i++) {
      const item = result.missingSyncList[i];
      const sceneNum = item.sceneNum;

      try {
        addLog('sync-log', `[${i + 1}/${result.missingSyncList.length}] Processing scene ${sceneNum}...`, 'info');

        // Get audio duration
        const voiceFile = `${sceneNum}.mp3`;
        const voicePath = path.join(voiceDir, voiceFile);
        const durationResult = await ipcRenderer.invoke('get-audio-duration', voicePath);

        if (!durationResult.success) {
          throw new Error('Failed to get audio duration');
        }

        const audioDuration = durationResult.duration;
        addLog('sync-log', `⏱️ Audio duration: ${audioDuration.toFixed(2)}s`, 'info');

        // Sync video
        const videoPath = path.join(videoDir, item.sourceVideo);
        const outputPath = path.join(outputDir, `${sceneNum}.mp4`);

        const syncResult = await ipcRenderer.invoke('sync-video-to-audio', {
          videoPath,
          audioDuration,
          outputPath,
          hwAccel: settings.hwAccel || 'cpu'
        });

        if (syncResult.success) {
          addLog('sync-log', `✅ Scene ${sceneNum} synced successfully`, 'success');
          processedSet.add(sceneNum);
          processed++;
        } else {
          throw new Error('Sync failed');
        }

      } catch (error) {
        addLog('sync-log', `❌ Scene ${sceneNum} failed: ${error.message}`, 'error');
        errors++;
      }

      // Update progress
      const progress = Math.round(((i + 1) / result.missingSyncList.length) * 100);
      updateProgress('sync-progress-bar', progress);
    }

    // Save processed files list
    await ipcRenderer.invoke('write-file', {
      filePath: processedFile,
      content: JSON.stringify(Array.from(processedSet))
    });

    // Summary
    addLog('sync-log', '═══════════════════════════', 'info');
    addLog('sync-log', `✅ Retry complete!`, 'success');
    addLog('sync-log', `📊 Total: ${result.missingSyncList.length} | Success: ${processed} | Failed: ${errors}`, 'info');

    if (errors > 0) {
      addLog('sync-log', `⚠️ ${errors} video(s) failed to sync`, 'warning');
    }

    // Clear missing videos data
    missingVideosData = null;

  } catch (error) {
    addLog('sync-log', `❌ Fatal error: ${error.message}`, 'error');
    alert(`Error: ${error.message}`);
  } finally {
    syncProcessing = false;
  }
}

// Hide missing videos section
function hideMissingVideosSection() {
  document.getElementById('missing-videos-section').style.display = 'none';
  missingVideosData = null;
}

// Listen for video sync progress updates
ipcRenderer.on('video-sync-progress', (event, data) => {
  // You can add real-time progress updates here if needed
  console.log('Video sync progress:', data.message);
});

// ======================
// Settings
// ======================

// Auto-save settings when TTS fields change
function autoSaveSettings() {
  saveSettings();

  const statusDiv = document.getElementById('auto-save-status');
  if (statusDiv) {
    statusDiv.textContent = '💾 Settings saved automatically';
    statusDiv.style.color = '#28a745';

    setTimeout(() => {
      statusDiv.textContent = '';
    }, 2000);
  }
}

function saveSettings() {
  settings.callbackPort = parseInt(document.getElementById('callback-port').value);
  settings.callbackHost = document.getElementById('callback-host').value.trim();
  settings.batchSize = parseInt(document.getElementById('batch-size').value);
  settings.t2vBatchSize = parseInt(document.getElementById('t2v-batch-size')?.value || 5);
  settings.t2vMaxRetries = parseInt(document.getElementById('t2v-max-retries')?.value || 2);
  settings.t2vTaskDelay = parseInt(document.getElementById('t2v-task-delay')?.value || 500);
  settings.maxRetries = parseInt(document.getElementById('max-retries').value);

  // Save GENAI TTS settings
  const genaiApiType = document.getElementById('genai-api-type');
  const genaiApiKey = document.getElementById('genai-api-key');
  const genaiVoiceId = document.getElementById('genai-voice-id');
  const genaiModel = document.getElementById('genai-model');
  const genaiNgrokUrl = document.getElementById('genai-ngrok-url');
  const genaiOutputDir = document.getElementById('genai-output-dir');
  const genaiLanguage = document.getElementById('genai-language');
  const genaiDownloadSrt = document.getElementById('genai-download-srt');

  if (genaiApiType) settings.genai.apiType = genaiApiType.value;
  if (genaiApiKey) settings.genai.apiKey = genaiApiKey.value.trim();
  if (genaiVoiceId) settings.genai.voiceId = genaiVoiceId.value.trim();
  if (genaiModel) settings.genai.model = genaiModel.value.trim();
  if (genaiNgrokUrl) settings.genai.ngrokUrl = genaiNgrokUrl.value.trim();
  if (genaiOutputDir) settings.genai.outputDir = genaiOutputDir.value.trim();
  if (genaiLanguage) settings.genai.language = genaiLanguage.value;
  if (genaiDownloadSrt) settings.genai.downloadSrt = genaiDownloadSrt.checked;

  // Save AI33 TTS settings
  const ai33ApiType = document.getElementById('ai33-api-type');
  const ai33ApiKey = document.getElementById('ai33-api-key');
  const ai33VoiceId = document.getElementById('ai33-voice-id');
  const ai33Model = document.getElementById('ai33-model');
  const ai33NgrokUrl = document.getElementById('ai33-ngrok-url');
  const ai33OutputDir = document.getElementById('ai33-output-dir');
  const ai33Language = document.getElementById('ai33-language');

  if (ai33ApiType) settings.ai33.apiType = ai33ApiType.value;
  if (ai33ApiKey) settings.ai33.apiKey = ai33ApiKey.value.trim();
  if (ai33VoiceId) settings.ai33.voiceId = ai33VoiceId.value.trim();
  if (ai33Model) settings.ai33.model = ai33Model.value.trim();
  if (ai33NgrokUrl) settings.ai33.ngrokUrl = ai33NgrokUrl.value.trim();
  if (ai33OutputDir) settings.ai33.outputDir = ai33OutputDir.value.trim();
  if (ai33Language) settings.ai33.language = ai33Language.value;

  // Save Video Sync settings
  settings.voiceDir = document.getElementById('voice-dir').value.trim();
  settings.videoDir = document.getElementById('video-dir').value.trim();
  settings.syncOutputDir = document.getElementById('sync-output-dir').value.trim();

  // Save T2V settings
  const t2vBaseUrl = document.getElementById('t2v-base-url');
  const t2vApiKey = document.getElementById('t2v-api-key');
  const t2vOutputDir = document.getElementById('t2v-output-dir');
  const t2vAspectRatio = document.getElementById('t2v-aspect-ratio');

  if (t2vBaseUrl) settings.t2vBaseUrl = t2vBaseUrl.value.trim();
  if (t2vApiKey) settings.t2vApiKey = t2vApiKey.value.trim();
  if (t2vOutputDir) settings.t2vOutputDir = t2vOutputDir.value.trim();
  if (t2vAspectRatio) settings.t2vAspectRatio = t2vAspectRatio.value;

  settings.t2vAccounts = t2vAccounts;

  // Save T2V IO settings
  if (!settings.t2vIO) {
    settings.t2vIO = {
      baseUrl: '',
      apiKey: '',
      outputDir: '',
      aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
      concurrent: 3,
      delay: 1000,
      maxRetries: 2
    };
  }

  const t2vIOBaseUrl = document.getElementById('t2v-io-base-url');
  const t2vIOApiKey = document.getElementById('t2v-io-api-key');
  const t2vIOOutputDir = document.getElementById('t2v-io-output-dir');
  const t2vIOAspectRatio = document.getElementById('t2v-io-aspect-ratio');
  const t2vIOConcurrent = document.getElementById('t2v-io-concurrent');
  const t2vIODelay = document.getElementById('t2v-io-delay');
  const t2vIOMaxRetries = document.getElementById('t2v-io-max-retries');

  if (t2vIOBaseUrl) settings.t2vIO.baseUrl = t2vIOBaseUrl.value.trim();
  if (t2vIOApiKey) settings.t2vIO.apiKey = t2vIOApiKey.value.trim();
  if (t2vIOOutputDir) settings.t2vIO.outputDir = t2vIOOutputDir.value.trim();
  if (t2vIOAspectRatio) settings.t2vIO.aspectRatio = t2vIOAspectRatio.value;
  if (t2vIOConcurrent) settings.t2vIO.concurrent = parseInt(t2vIOConcurrent.value);
  if (t2vIODelay) settings.t2vIO.delay = parseInt(t2vIODelay.value);
  if (t2vIOMaxRetries) settings.t2vIO.maxRetries = parseInt(t2vIOMaxRetries.value);

  localStorage.setItem('appSettings', JSON.stringify(settings));

  const statusDiv = document.getElementById('settings-status');
  if (statusDiv) {
    statusDiv.textContent = '✅ Settings saved successfully!';
    statusDiv.className = 'status-message success';

    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status-message';
    }, 3000);
  }
}

function loadSettings() {
  const saved = localStorage.getItem('appSettings');
  if (saved) {
    const savedSettings = JSON.parse(saved);

    // Migrate old settings to new structure if needed
    if (!savedSettings.genai && savedSettings.apiProvider) {
      savedSettings.genai = {
        apiType: savedSettings.apiType || 'labs',
        apiKey: savedSettings.genaiApiKey || '',
        voiceId: savedSettings.voiceId || '',
        model: savedSettings.ttsModel || '',
        ngrokUrl: savedSettings.ngrokUrl || '',
        outputDir: savedSettings.outputDir || '',
        language: savedSettings.language || 'vi',
        downloadSrt: savedSettings.downloadSrt || false
      };
      savedSettings.ai33 = {
        apiType: 'labs',
        apiKey: savedSettings.ai33ApiKey || '',
        voiceId: '',
        model: '',
        ngrokUrl: '',
        outputDir: '',
        language: 'vi'
      };
    }

    settings = savedSettings;

    document.getElementById('callback-port').value = settings.callbackPort;
    document.getElementById('callback-host').value = settings.callbackHost;
    document.getElementById('batch-size').value = settings.batchSize || 15;
    if (document.getElementById('t2v-batch-size')) {
      document.getElementById('t2v-batch-size').value = settings.t2vBatchSize || 5;
    }
    if (document.getElementById('t2v-max-retries')) {
      document.getElementById('t2v-max-retries').value = settings.t2vMaxRetries || 2;
    }
    if (document.getElementById('t2v-task-delay')) {
      document.getElementById('t2v-task-delay').value = settings.t2vTaskDelay || 500;
    }
    document.getElementById('max-retries').value = settings.maxRetries;

    // Restore GENAI TTS settings
    if (settings.genai) {
      if (settings.genai.apiType) document.getElementById('genai-api-type').value = settings.genai.apiType;
      if (settings.genai.apiKey) document.getElementById('genai-api-key').value = settings.genai.apiKey;
      if (settings.genai.voiceId) document.getElementById('genai-voice-id').value = settings.genai.voiceId;
      if (settings.genai.model) document.getElementById('genai-model').value = settings.genai.model;
      if (settings.genai.ngrokUrl) document.getElementById('genai-ngrok-url').value = settings.genai.ngrokUrl;
      if (settings.genai.outputDir) document.getElementById('genai-output-dir').value = settings.genai.outputDir;
      if (settings.genai.language) document.getElementById('genai-language').value = settings.genai.language;
      if (settings.genai.downloadSrt !== undefined) document.getElementById('genai-download-srt').checked = settings.genai.downloadSrt;
    }

    // Restore AI33 TTS settings
    if (settings.ai33) {
      if (settings.ai33.apiType) document.getElementById('ai33-api-type').value = settings.ai33.apiType;
      if (settings.ai33.apiKey) document.getElementById('ai33-api-key').value = settings.ai33.apiKey;
      if (settings.ai33.voiceId) document.getElementById('ai33-voice-id').value = settings.ai33.voiceId;
      if (settings.ai33.model) document.getElementById('ai33-model').value = settings.ai33.model;
      if (settings.ai33.ngrokUrl) document.getElementById('ai33-ngrok-url').value = settings.ai33.ngrokUrl;
      if (settings.ai33.outputDir) document.getElementById('ai33-output-dir').value = settings.ai33.outputDir;
      if (settings.ai33.language) document.getElementById('ai33-language').value = settings.ai33.language;
    }

    // Update info texts
    updateGenaiApiTypeInfo();
    updateAi33ApiTypeInfo();
    updateMergeSrtVisibility('genai');

    // Restore Video Sync settings
    if (settings.voiceDir) document.getElementById('voice-dir').value = settings.voiceDir;
    if (settings.videoDir) document.getElementById('video-dir').value = settings.videoDir;
    if (settings.syncOutputDir) document.getElementById('sync-output-dir').value = settings.syncOutputDir;
    if (settings.hwAccel) document.getElementById('hw-accel').value = settings.hwAccel;

    // Restore T2V settings
    if (settings.t2vBaseUrl) document.getElementById('t2v-base-url').value = settings.t2vBaseUrl;
    if (settings.t2vApiKey) document.getElementById('t2v-api-key').value = settings.t2vApiKey;
    if (settings.t2vOutputDir) document.getElementById('t2v-output-dir').value = settings.t2vOutputDir;
    if (settings.t2vAspectRatio) document.getElementById('t2v-aspect-ratio').value = settings.t2vAspectRatio;
    if (settings.t2vAccounts) {
      t2vAccounts = settings.t2vAccounts;
      renderT2VAccounts();
    }

    // Restore T2V IO settings
    if (settings.t2vIO) {
      if (settings.t2vIO.baseUrl) document.getElementById('t2v-io-base-url').value = settings.t2vIO.baseUrl;
      if (settings.t2vIO.apiKey) document.getElementById('t2v-io-api-key').value = settings.t2vIO.apiKey;
      if (settings.t2vIO.outputDir) document.getElementById('t2v-io-output-dir').value = settings.t2vIO.outputDir;
      if (settings.t2vIO.aspectRatio) document.getElementById('t2v-io-aspect-ratio').value = settings.t2vIO.aspectRatio;
      if (settings.t2vIO.concurrent) document.getElementById('t2v-io-concurrent').value = settings.t2vIO.concurrent;
      if (settings.t2vIO.delay) document.getElementById('t2v-io-delay').value = settings.t2vIO.delay;
      if (settings.t2vIO.maxRetries !== undefined) document.getElementById('t2v-io-max-retries').value = settings.t2vIO.maxRetries;
    }

    const statusDiv = document.getElementById('settings-status');
    statusDiv.textContent = '✅ Settings loaded successfully!';
    statusDiv.className = 'status-message success';

    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status-message';
    }, 3000);
  }
}

// Load settings on startup
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
});

// =============================
// Text to Video Functions
// =============================

let t2vAccounts = [];
let t2vProcessing = false;
let t2vCancelled = false;
let t2vTasksData = {};  // Store task data by account
let t2vAccountStops = {};  // Track stop requests per account

// Helper function for delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Toggle T2V config section
function toggleT2VConfig() {
  const section = document.getElementById('t2v-config-section');
  const toggle = document.getElementById('t2v-config-toggle');

  if (section.style.display === 'none') {
    section.style.display = 'grid';
    toggle.textContent = '▼';
  } else {
    section.style.display = 'none';
    toggle.textContent = '▶';
  }
}

// Select T2V output directory
async function selectT2VOutputDir() {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById('t2v-output-dir').value = result;
    settings.t2vOutputDir = result;
    autoSaveSettings();
  }
}

// Add T2V account
function addT2VAccount() {
  const input = document.getElementById('new-account-name');
  const accountName = input.value.trim();

  if (!accountName) {
    alert('Please enter an account name');
    return;
  }

  if (t2vAccounts.includes(accountName)) {
    alert('Account already exists');
    return;
  }

  t2vAccounts.push(accountName);
  input.value = '';

  renderT2VAccounts();
  autoSaveSettings();
}

// Remove T2V account
function removeT2VAccount(accountName) {
  t2vAccounts = t2vAccounts.filter(acc => acc !== accountName);
  renderT2VAccounts();
  autoSaveSettings();
}

// Render T2V accounts list
function renderT2VAccounts() {
  const listDiv = document.getElementById('t2v-accounts-list');

  if (t2vAccounts.length === 0) {
    listDiv.innerHTML = '<p style="text-align: center; color: #6c757d; margin: 15px 0;">No accounts added yet</p>';
    return;
  }

  listDiv.innerHTML = t2vAccounts.map(acc => `
    <div class="account-tag">
      <span>👤 ${acc}</span>
      <button class="remove-btn" onclick="removeT2VAccount('${acc}')" title="Remove account">×</button>
    </div>
  `).join('');
}

// Distribute prompts evenly across accounts
function distributePrompts(prompts, accounts) {
  const distribution = {};
  accounts.forEach(acc => {
    distribution[acc] = [];
  });

  const promptsPerAccount = Math.ceil(prompts.length / accounts.length);

  prompts.forEach((prompt, index) => {
    const accountIndex = Math.floor(index / promptsPerAccount);
    const account = accounts[Math.min(accountIndex, accounts.length - 1)];
    distribution[account].push({
      index: index + 1,
      text: prompt,
      status: 'pending',
      error: null,
      taskId: null,
      videoUrl: null
    });
  });

  return distribution;
}

// Start T2V processing
async function startT2VProcessing() {
  console.log('🔴 BUTTON CLICKED - startT2VProcessing called');

  if (t2vProcessing) {
    alert('Processing already in progress');
    return;
  }

  // Validate inputs
  const baseUrl = document.getElementById('t2v-base-url').value.trim();
  const apiKey = document.getElementById('t2v-api-key').value.trim();
  const outputDir = document.getElementById('t2v-output-dir').value.trim();
  const aspectRatio = document.getElementById('t2v-aspect-ratio').value;
  const promptsText = document.getElementById('t2v-prompts').value.trim();
  const batchSize = settings.t2vBatchSize || 5;

  console.log('=== START T2V GENERATION ===');
  console.log('Base URL:', baseUrl);
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
  console.log('Output Dir:', outputDir);
  console.log('Aspect Ratio:', aspectRatio);
  console.log('Batch Size:', batchSize);
  console.log('Accounts:', t2vAccounts);

  if (!baseUrl) {
    console.error('Validation failed: Base URL is empty');
    alert('Please enter Base URL');
    return;
  }

  if (!apiKey) {
    console.error('Validation failed: API Key is empty');
    alert('Please enter API Key');
    return;
  }

  if (!outputDir) {
    console.error('Validation failed: Output directory is empty');
    alert('Please select output directory');
    return;
  }

  if (t2vAccounts.length === 0) {
    console.error('Validation failed: No accounts added');
    alert('Please add at least one account');
    return;
  }

  if (!promptsText) {
    console.error('Validation failed: Prompts text is empty');
    alert('Please enter prompts');
    return;
  }

  const prompts = promptsText.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  console.log('Total prompts parsed:', prompts.length);
  console.log('First 3 prompts:', prompts.slice(0, 3));

  if (prompts.length === 0) {
    console.error('Validation failed: No valid prompts found');
    alert('No valid prompts found');
    return;
  }

  console.log('✅ All validations passed');

  t2vProcessing = true;
  t2vCancelled = false;

  document.getElementById('start-t2v-btn').disabled = true;
  document.getElementById('stop-t2v-btn').style.display = 'inline-block';

  const logDiv = document.getElementById('t2v-log');
  logDiv.innerHTML = '';

  addLog('t2v-log', `🎬 Starting Text-to-Video generation...`, 'info');
  addLog('t2v-log', `📊 Total prompts: ${prompts.length} | Accounts: ${t2vAccounts.length} | Batch size: ${batchSize}`, 'info');
  addLog('t2v-log', `🔧 Config: ${baseUrl} | Aspect: ${aspectRatio}`, 'info');

  // Distribute prompts
  t2vTasksData = distributePrompts(prompts, t2vAccounts);

  console.log('Prompts distribution:', Object.entries(t2vTasksData).map(([account, tasks]) => ({
    account,
    count: tasks.length
  })));

  // Log distribution
  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    addLog('t2v-log', `👤 ${account}: ${tasks.length} prompts`, 'info');
  }

  // Show status section
  document.getElementById('t2v-status').style.display = 'block';
  renderAccountsStatus();

  console.log('Starting concurrent processing for all accounts...');

  // Process all accounts concurrently
  const accountPromises = t2vAccounts.map(account => processAccountPrompts(account, baseUrl, apiKey, aspectRatio, outputDir));

  try {
    await Promise.all(accountPromises);

    console.log('All accounts processing completed');

    if (!t2vCancelled) {
      addLog('t2v-log', '✅ All processing completed!', 'success');
    } else {
      addLog('t2v-log', '⏹️ Processing stopped by user', 'warning');
    }

    // Show failed/incomplete prompts
    showFailedPrompts();
  } catch (error) {
    addLog('t2v-log', `❌ Error: ${error.message}`, 'error');
  } finally {
    t2vProcessing = false;
    document.getElementById('start-t2v-btn').disabled = false;
    document.getElementById('stop-t2v-btn').style.display = 'none';
  }
}

// Process prompts for one account with batch processing
async function processAccountPrompts(accountName, baseUrl, apiKey, aspectRatio, outputDir, retryAttempt = 0) {
  const tasks = t2vTasksData[accountName];
  const batchSize = settings.t2vBatchSize || 5;
  const maxRetries = settings.t2vMaxRetries || 2;

  updateAccountStatus(accountName, 'processing', retryAttempt);

  // Clear stop flag for this account
  t2vAccountStops[accountName] = false;

  if (retryAttempt === 0) {
    addLog('t2v-log', `🎥 [${accountName}] Starting batch processing with concurrency: ${batchSize}`, 'info');
  } else {
    addLog('t2v-log', `🔄 [${accountName}] Auto-retry attempt ${retryAttempt}/${maxRetries}`, 'info');
  }

  // Semaphore pattern for batch processing
  const semaphore = new Array(batchSize).fill(null);

  const processTask = async (task) => {
    if (t2vCancelled || t2vAccountStops[accountName]) {
      console.log(`[${accountName}] Task #${task.index} skipped - stopped`);
      return;
    }

    // Skip if already completed successfully
    if (task.status === 'downloaded' || task.status === 'completed') {
      console.log(`[${accountName}] Task #${task.index} skipped - already completed`);
      return;
    }

    // Initialize retry count if not exists
    if (typeof task.retryCount === 'undefined') {
      task.retryCount = 0;
    }

    task.status = 'creating';
    renderAccountsStatus();

    addLog('t2v-log', `🎥 [${accountName}] Processing prompt #${task.index}: ${task.text.substring(0, 50)}...`, 'info');
    console.log(`\n>>> [${accountName}] Starting task #${task.index}`);
    console.log('Prompt:', task.text);

    try {
      // Create video generation task
      console.log(`[${accountName}] Calling create-t2v-task API...`);
      const result = await ipcRenderer.invoke('create-t2v-task', {
        baseUrl,
        apiKey,
        accountName,
        prompt: task.text,
        aspectRatio
      });

      console.log(`[${accountName}] API Result:`, result);

      if (!result.success) {
        throw new Error(result.error);
      }

      task.taskId = result.taskId;
      addLog('t2v-log', `✅ [${accountName}] Task created: ${result.taskId}`, 'success');
      console.log(`✅ [${accountName}] Task ID: ${result.taskId}`);

      // API returns downloadUrl immediately, no need to poll
      if (!result.videoUrl) {
        throw new Error('No video URL returned from API');
      }

      const videoUrl = result.videoUrl;
      task.videoUrl = videoUrl;
      task.status = 'generated';
      renderAccountsStatus();

      console.log(`✅ [${accountName}] Video URL: ${videoUrl}`);
      addLog('t2v-log', `✅ [${accountName}] Video ready, starting download...`, 'success');

      // Download video
      task.status = 'downloading';
      renderAccountsStatus();
      await downloadT2VVideo(videoUrl, outputDir, task.index, accountName, task.text);

      task.status = 'downloaded';

    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      addLog('t2v-log', `❌ [${accountName}] Prompt #${task.index} failed: ${error.message}`, 'error');
    }

    renderAccountsStatus();
    updateT2VProgress();
  };

  const processQueue = async (taskIndex) => {
    if (taskIndex >= tasks.length) return;
    if (t2vCancelled || t2vAccountStops[accountName]) return;

    const task = tasks[taskIndex];
    await processTask(task);

    // Delay after task completes, before picking next task
    const delay = settings.t2vTaskDelay || 500;
    if (delay > 0) {
      await sleep(delay);
    }

    // Process next task in queue
    await processQueue(taskIndex + batchSize);
  };

  // Start concurrent processing
  const promises = semaphore.map((_, index) => processQueue(index));
  await Promise.all(promises);

  if (!t2vCancelled && !t2vAccountStops[accountName]) {
    // Check for failed tasks
    const failedTasks = tasks.filter(t => t.status === 'error');

    if (failedTasks.length > 0 && retryAttempt < maxRetries) {
      // Auto-retry failed tasks
      addLog('t2v-log', `⚠️ [${accountName}] ${failedTasks.length} prompts failed, auto-retrying...`, 'warning');
      await processAccountPrompts(accountName, baseUrl, apiKey, aspectRatio, outputDir, retryAttempt + 1);
    } else {
      if (failedTasks.length > 0) {
        addLog('t2v-log', `❌ [${accountName}] ${failedTasks.length} prompts still failed after ${maxRetries} retries`, 'error');
      } else {
        addLog('t2v-log', `✅ [${accountName}] All prompts processed successfully`, 'success');
      }
    }
  } else if (t2vAccountStops[accountName]) {
    addLog('t2v-log', `⏹️ [${accountName}] Processing stopped by user`, 'warning');

    // Count incomplete tasks for this account
    const incompleteTasks = tasks.filter(t =>
      t.status === 'error' ||
      t.status === 'pending' ||
      t.status === 'creating' ||
      t.status === 'downloading' ||
      t.status === 'generated'
    );
    if (incompleteTasks.length > 0) {
      addLog('t2v-log', `⚠️ [${accountName}] ${incompleteTasks.length} prompts incomplete`, 'warning');
    }
  }

  updateAccountStatus(accountName, 'completed', retryAttempt);

  // Check if all accounts finished and show incomplete prompts
  checkAndShowIncompletePrompts();
}

// Poll T2V task status
// Sanitize prompt text for filename
function sanitizeFilename(text, maxLength = 100) {
  // Remove special characters except periods, keep alphanumeric, spaces, hyphens, underscores, periods, and unicode characters
  let sanitized = text
    .replace(/[^a-zA-Z0-9\s\-_.\u00C0-\u1EF9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }

  // If empty after sanitization, use timestamp
  if (!sanitized) {
    sanitized = `video_${Date.now()}`;
  }

  return sanitized;
}

// Download T2V video
async function downloadT2VVideo(videoUrl, outputDir, promptIndex, accountName, promptText = '') {
  const baseName = promptText ? sanitizeFilename(promptText) : `prompt_${promptIndex}`;
  const fileName = `${baseName}.mp4`;

  const result = await ipcRenderer.invoke('download-t2v-video', {
    videoUrl,
    outputDir,
    fileName
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  addLog('t2v-log', `💾 [${accountName}] Downloaded: ${fileName}`, 'success');
}

// Stop T2V processing
function stopT2VProcessing() {
  if (!t2vProcessing) return;

  const confirmed = confirm('Are you sure you want to stop all processing?');
  if (confirmed) {
    t2vCancelled = true;
    // Stop all accounts
    t2vAccounts.forEach(acc => {
      t2vAccountStops[acc] = true;
    });
    addLog('t2v-log', '⏹️ Stopping all processing...', 'warning');
  }
}

// Check if all accounts have finished and show incomplete prompts
function checkAndShowIncompletePrompts() {
  // Check if we're in a processing session
  if (!t2vProcessing) return;

  // Check if all accounts have completed status
  let allCompleted = true;
  for (const account of t2vAccounts) {
    const tasks = t2vTasksData[account];
    if (!tasks || !tasks.accountStatus) continue;

    if (tasks.accountStatus !== 'completed') {
      allCompleted = false;
      break;
    }
  }

  // If all accounts finished, show incomplete prompts
  if (allCompleted) {
    console.log('All accounts finished, showing incomplete prompts...');
    showFailedPrompts();
  }
}

// Update account status
function updateAccountStatus(accountName, status, retryAttempt) {
  const tasks = t2vTasksData[accountName];
  if (!tasks || !Array.isArray(tasks)) return;

  // Count stats
  const downloaded = tasks.filter(t => t.status === 'downloaded' || t.status === 'completed').length;
  const generated = tasks.filter(t => t.status === 'generated').length;
  const errors = tasks.filter(t => t.status === 'error').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const creating = tasks.filter(t => t.status === 'creating').length;
  const downloading = tasks.filter(t => t.status === 'downloading').length;

  // Processing = creating + downloading (đang xử lý API hoặc đang download)
  const processing = creating + downloading;

  // Total successful videos (generated + downloaded)
  const totalSuccessful = generated + downloaded;

  // Auto-detect status based on tasks state
  let finalStatus = status;
  if (pending === 0 && creating === 0 && downloading === 0) {
    // All tasks finished (either downloaded or error)
    finalStatus = 'completed';
  } else if (creating > 0 || downloading > 0) {
    finalStatus = 'processing';
  }

  tasks.accountStatus = finalStatus;
  tasks.retryAttempt = (typeof retryAttempt === 'number') ? retryAttempt : 0;
  tasks.stats = {
    downloaded,
    totalSuccessful,
    processing,
    errors,
    pending,
    total: tasks.length
  };
}

// Render accounts status cards
function renderAccountsStatus() {
  const statusDiv = document.getElementById('t2v-accounts-status');

  const html = t2vAccounts.map(account => {
    const tasks = t2vTasksData[account] || [];

    // Auto-update status before rendering (preserve existing retryAttempt)
    if (Array.isArray(tasks) && tasks.length > 0) {
      const currentRetryAttempt = tasks.retryAttempt || 0;
      updateAccountStatus(account, tasks.accountStatus || 'idle', currentRetryAttempt);
    }

    const stats = tasks.stats || {
      downloaded: 0,
      totalSuccessful: 0,
      processing: 0,
      errors: 0,
      pending: tasks.length,
      total: tasks.length
    };
    const status = tasks.accountStatus || 'idle';
    const retryAttempt = tasks.retryAttempt || 0;
    const maxRetries = settings.t2vMaxRetries || 2;

    const statusClass = status === 'processing' ? 'processing' :
      status === 'completed' ? 'completed' :
        stats.errors > 0 ? 'error' : '';

    // Show retry badge in header
    const retryBadge = `<span class="retry-badge" style="font-size: 0.85rem; padding: 4px 8px; background: ${retryAttempt > 0 ? '#ff9800' : '#888'}; color: white; border-radius: 4px; font-weight: 500;">🔄 ${retryAttempt}/${maxRetries}</span>`;

    return `
      <div class="account-status-card ${statusClass}">
        <h4 style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <span>👤 ${account}</span>
            ${retryBadge}
            <span class="status-badge ${status}">${status.toUpperCase()}</span>
          </div>
          <button class="secondary-button" onclick="replaceAccount('${account}')" style="font-size: 0.8rem; padding: 5px 10px; margin-left: 10px;">
            🔄 Replace
          </button>
        </h4>
        
        <div class="account-stats" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: nowrap; overflow-x: auto;">
          <div class="stat-item" style="flex: 0 0 auto; min-width: 90px; text-align: center;">
            <span class="stat-value" style="font-size: 1.3rem;">${stats.processing}</span>
            <span class="stat-label" style="font-size: 0.75rem;">Processing</span>
          </div>
          <div class="stat-item" style="flex: 0 0 auto; min-width: 90px; text-align: center;">
            <span class="stat-value" style="font-size: 1.3rem;">${stats.pending}</span>
            <span class="stat-label" style="font-size: 0.75rem;">Pending</span>
          </div>
          <div class="stat-item" style="flex: 0 0 auto; min-width: 90px; text-align: center;">
            <span class="stat-value" style="font-size: 1.3rem;">${stats.downloaded}/${stats.totalSuccessful}</span>
            <span class="stat-label" style="font-size: 0.75rem;">Downloaded</span>
          </div>
          <div class="stat-item" style="flex: 0 0 auto; min-width: 90px; text-align: center;">
            <span class="stat-value" style="font-size: 1.3rem;">${stats.errors}</span>
            <span class="stat-label" style="font-size: 0.75rem;">Errors</span>
          </div>
        </div>
        
        <div class="account-prompts-list">
          ${tasks.map((task, idx) => `
            <div class="prompt-item ${task.status}">
              <span class="prompt-index">#${task.index}</span>
              <span class="prompt-text">${task.text.substring(0, 40)}${task.text.length > 40 ? '...' : ''}</span>
              <span class="prompt-status-icon ${task.status}" ${task.status === 'error' ? `title="Error: ${task.error || 'Unknown error'}"` : ''}>
                ${getDetailedStatusIcon(task.status)}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  statusDiv.innerHTML = html;
}

// Get detailed status icon with animation
function getDetailedStatusIcon(status) {
  switch (status) {
    case 'pending': return '<span class="status-icon pending" title="Pending">⏳</span>';
    case 'creating': return '<span class="status-icon loading" title="Creating task...">🔄</span>';
    case 'generated': return '<span class="status-icon success" title="Video generated">✨</span>';
    case 'downloading': return '<span class="status-icon loading" title="Downloading...">⬇️</span>';
    case 'downloaded': return '<span class="status-icon success" title="Downloaded successfully">✅</span>';
    case 'completed': return '<span class="status-icon success" title="Completed">✅</span>';
    case 'transferred': return '<span class="status-icon transferred" title="Transferred to another account">🔀</span>';
    case 'error': return '<span class="status-icon error" title="Error occurred">❌</span>';
    default: return '<span class="status-icon idle" title="Idle">⚪</span>';
  }
}

// Replace account with new account
let replaceAccountContext = null; // Store context for modal

function replaceAccount(oldAccountName) {
  const tasks = t2vTasksData[oldAccountName];
  if (!tasks || !Array.isArray(tasks)) {
    alert('Account not found!');
    return;
  }

  // Count incomplete tasks
  const incompleteTasks = tasks.filter(t =>
    t.status !== 'downloaded' && t.status !== 'completed' && t.status !== 'transferred'
  );

  if (incompleteTasks.length === 0) {
    alert('All tasks in this account are already completed!');
    return;
  }

  // Get available accounts (exclude current account)
  const availableAccounts = t2vAccounts.filter(acc => acc !== oldAccountName);

  if (availableAccounts.length === 0) {
    alert('No other accounts available! Please add more accounts first.');
    return;
  }

  // Store context
  replaceAccountContext = {
    oldAccountName,
    incompleteTasks,
    availableAccounts
  };

  // Show modal
  const modal = document.getElementById('replace-account-modal');
  const info = document.getElementById('replace-account-info');
  const select = document.getElementById('replace-account-select');

  info.innerHTML = `
    <strong>Account:</strong> ${oldAccountName}<br>
    <strong>Incomplete tasks:</strong> ${incompleteTasks.length}<br><br>
    These tasks will be transferred to the selected account and reset to pending status.
  `;

  // Populate dropdown
  select.innerHTML = availableAccounts.map(acc =>
    `<option value="${acc}">${acc}</option>`
  ).join('');

  modal.style.display = 'flex';
}

function closeReplaceAccountModal() {
  document.getElementById('replace-account-modal').style.display = 'none';
  replaceAccountContext = null;
}

function confirmReplaceAccount() {
  if (!replaceAccountContext) return;

  const { oldAccountName, incompleteTasks } = replaceAccountContext;
  const select = document.getElementById('replace-account-select');
  const newAccountName = select.value;

  if (!newAccountName) {
    alert('Please select an account!');
    return;
  }

  console.log(`Replacing account: ${oldAccountName} -> ${newAccountName}`);

  // Get existing tasks for new account or create empty array
  const existingTasks = t2vTasksData[newAccountName] || [];

  // Transfer incomplete tasks
  const transferredTasks = incompleteTasks.map(task => ({
    ...task,
    status: 'pending',  // Reset to pending
    error: null,
    retryCount: 0
  }));

  // Add transferred tasks to new account
  t2vTasksData[newAccountName] = [...existingTasks, ...transferredTasks];

  // Mark transferred tasks in old account as 'transferred'
  incompleteTasks.forEach(task => {
    task.status = 'transferred';
    task.error = `Transferred to ${newAccountName}`;
  });

  addLog('t2v-log', `🔄 Account replaced: ${oldAccountName} → ${newAccountName}`, 'info');
  addLog('t2v-log', `📦 Transferred ${transferredTasks.length} incomplete task(s)`, 'info');

  // Save settings and re-render
  autoSaveSettings();
  renderAccountsStatus();

  // Close modal
  closeReplaceAccountModal();

  alert(`Account replaced successfully!\n\n` +
    `Old: ${oldAccountName}\n` +
    `New: ${newAccountName}\n` +
    `Transferred: ${transferredTasks.length} task(s)`);
}

// Get detailed status icon with animation

// Update T2V progress bar
function updateT2VProgress() {
  let totalCompleted = 0;
  let totalTasks = 0;

  for (const tasks of Object.values(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      totalTasks += tasks.length;
      totalCompleted += tasks.filter(t => t.status === 'downloaded' || t.status === 'completed' || t.status === 'error').length;
    }
  }

  const percentage = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;
  document.getElementById('t2v-progress-bar').style.width = `${percentage}%`;
}

// Show failed prompts
function showFailedPrompts() {
  const failedPrompts = [];

  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      // Include all incomplete prompts: error, pending, creating, downloading, generated (not downloaded yet)
      const accountFailed = tasks.filter(t =>
        t.status === 'error' ||
        t.status === 'pending' ||
        t.status === 'creating' ||
        t.status === 'downloading' ||
        t.status === 'generated'
      );
      accountFailed.forEach(task => {
        failedPrompts.push({ ...task, account });
      });
    }
  }

  if (failedPrompts.length === 0) {
    addLog('t2v-log', '✅ All prompts processed successfully!', 'success');
    return;
  }

  addLog('t2v-log', `⚠️ ${failedPrompts.length} incomplete prompts`, 'warning');

  const section = document.getElementById('t2v-failed-section');
  const summary = document.getElementById('t2v-failed-summary');
  const list = document.getElementById('t2v-failed-list');

  summary.innerHTML = `
    <p><strong>Total Incomplete:</strong> ${failedPrompts.length}</p>
    <p>These prompts were not successfully downloaded. You can edit and retry them below.</p>
  `;

  list.innerHTML = failedPrompts.map((task, idx) => `
    <div class="failed-prompt-item" id="failed-prompt-${idx}">
      <div class="prompt-info">
        <div class="prompt-number">Prompt #${task.index} - Account: ${task.account}</div>
        <div class="prompt-text-display" id="prompt-display-${idx}">${task.text}</div>
        <div class="prompt-error">Error: ${task.error}</div>
        <input type="text" class="edit-prompt-input" id="prompt-edit-${idx}" value="${task.text}" style="display: none;" />
      </div>
      <div class="prompt-actions">
        <button class="secondary-button" onclick="editFailedPrompt(${idx})" id="edit-btn-${idx}" style="font-size: 0.9rem; padding: 6px 12px;">✏️ Edit</button>
        <button class="primary-button" onclick="saveFailedPrompt(${idx})" id="save-btn-${idx}" style="display: none; font-size: 0.9rem; padding: 6px 12px;">💾 Save</button>
        <button class="secondary-button" onclick="cancelEditPrompt(${idx})" id="cancel-btn-${idx}" style="display: none; font-size: 0.9rem; padding: 6px 12px;">✖️ Cancel</button>
      </div>
    </div>
  `).join('');

  section.style.display = 'block';
}

// Edit failed prompt
function editFailedPrompt(idx) {
  document.getElementById(`prompt-display-${idx}`).style.display = 'none';
  document.getElementById(`prompt-edit-${idx}`).style.display = 'block';
  document.getElementById(`edit-btn-${idx}`).style.display = 'none';
  document.getElementById(`save-btn-${idx}`).style.display = 'inline-block';
  document.getElementById(`cancel-btn-${idx}`).style.display = 'inline-block';
}

// Save edited prompt
function saveFailedPrompt(idx) {
  const newText = document.getElementById(`prompt-edit-${idx}`).value.trim();

  if (!newText) {
    alert('Prompt cannot be empty');
    return;
  }

  // Find and update the prompt in t2vTasksData
  let found = false;
  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const task = tasks.find(t => t.status === 'error');
      if (task) {
        // Update the first failed task (simplified logic)
        const failedTasks = tasks.filter(t => t.status === 'error');
        if (failedTasks[idx]) {
          failedTasks[idx].text = newText;
          failedTasks[idx].error = null;
          found = true;
          break;
        }
      }
    }
  }

  document.getElementById(`prompt-display-${idx}`).textContent = newText;
  document.getElementById(`prompt-display-${idx}`).style.display = 'block';
  document.getElementById(`prompt-edit-${idx}`).style.display = 'none';
  document.getElementById(`edit-btn-${idx}`).style.display = 'inline-block';
  document.getElementById(`save-btn-${idx}`).style.display = 'none';
  document.getElementById(`cancel-btn-${idx}`).style.display = 'none';

  addLog('t2v-log', `✏️ Prompt #${idx + 1} updated`, 'info');
}

// Cancel edit prompt
function cancelEditPrompt(idx) {
  document.getElementById(`prompt-display-${idx}`).style.display = 'block';
  document.getElementById(`prompt-edit-${idx}`).style.display = 'none';
  document.getElementById(`edit-btn-${idx}`).style.display = 'inline-block';
  document.getElementById(`save-btn-${idx}`).style.display = 'none';
  document.getElementById(`cancel-btn-${idx}`).style.display = 'none';
}

// Retry failed prompts
async function retryFailedPrompts() {
  const baseUrl = document.getElementById('t2v-base-url').value.trim();
  const apiKey = document.getElementById('t2v-api-key').value.trim();
  const outputDir = document.getElementById('t2v-output-dir').value.trim();
  const aspectRatio = document.getElementById('t2v-aspect-ratio').value;

  if (!baseUrl || !apiKey || !outputDir) {
    alert('Please check configuration');
    return;
  }

  hideFailedPromptsSection();

  addLog('t2v-log', '🔄 Retrying failed prompts...', 'info');

  // Show retry statistics per account
  let totalErrors = 0;
  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const failedTasks = tasks.filter(t => t.status === 'error');
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      if (failedTasks.length > 0 || pendingTasks.length > 0) {
        addLog('t2v-log', `👤 [${account}] Errors: ${failedTasks.length} | Pending: ${pendingTasks.length}`, 'info');
        totalErrors += failedTasks.length;
      }
    }
  }

  if (totalErrors === 0) {
    addLog('t2v-log', '✅ No failed prompts to retry!', 'success');
    return;
  }

  addLog('t2v-log', `📊 Total errors to retry: ${totalErrors}`, 'info');

  t2vProcessing = true;
  t2vCancelled = false;

  document.getElementById('start-t2v-btn').disabled = true;
  document.getElementById('stop-t2v-btn').style.display = 'inline-block';

  // Process only failed tasks
  const accountPromises = [];

  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const failedTasks = tasks.filter(t => t.status === 'error');
      if (failedTasks.length > 0) {
        // Get current retry attempt from tasks (increment by 1 for this retry)
        const currentRetryAttempt = (tasks.retryAttempt || 0) + 1;
        accountPromises.push(retryAccountFailedTasks(account, failedTasks, baseUrl, apiKey, aspectRatio, outputDir, currentRetryAttempt));
      }
    }
  }

  try {
    await Promise.all(accountPromises);

    if (!t2vCancelled) {
      addLog('t2v-log', '✅ Retry completed!', 'success');
      showFailedPrompts();  // Show remaining failures
    }
  } catch (error) {
    addLog('t2v-log', `❌ Retry error: ${error.message}`, 'error');
  } finally {
    t2vProcessing = false;
    document.getElementById('start-t2v-btn').disabled = false;
    document.getElementById('stop-t2v-btn').style.display = 'none';
  }
}

// Retry account failed tasks with batch processing
async function retryAccountFailedTasks(accountName, failedTasks, baseUrl, apiKey, aspectRatio, outputDir, retryAttempt = 0) {
  const batchSize = settings.t2vBatchSize || 5;
  const maxRetries = settings.t2vMaxRetries || 2;

  updateAccountStatus(accountName, 'processing', retryAttempt);

  // Clear stop flag for this account
  t2vAccountStops[accountName] = false;

  const retryInfo = retryAttempt > 0 ? ` (Attempt ${retryAttempt}/${maxRetries})` : '';
  addLog('t2v-log', `🔄 [${accountName}] Retrying ${failedTasks.length} failed prompts with batch size: ${batchSize}${retryInfo}`, 'info');

  // Semaphore pattern for batch processing
  const semaphore = new Array(batchSize).fill(null);

  const processTask = async (task) => {
    if (t2vCancelled || t2vAccountStops[accountName]) return;

    task.status = 'creating';
    task.error = null;
    renderAccountsStatus();

    addLog('t2v-log', `🔄 [${accountName}] Retrying prompt #${task.index}: ${task.text.substring(0, 50)}...`, 'info');
    console.log(`\n>>> [${accountName}] Retrying task #${task.index}`);
    console.log('Prompt:', task.text);

    try {
      console.log(`[${accountName}] Calling create-t2v-task API...`);
      const result = await ipcRenderer.invoke('create-t2v-task', {
        baseUrl,
        apiKey,
        accountName,
        prompt: task.text,
        aspectRatio
      });

      console.log(`[${accountName}] API Result:`, result);

      if (!result.success) {
        throw new Error(result.error);
      }

      task.taskId = result.taskId;
      addLog('t2v-log', `✅ [${accountName}] Task created: ${result.taskId}`, 'success');
      console.log(`✅ [${accountName}] Task ID: ${result.taskId}`);

      // API returns downloadUrl immediately, no need to poll
      if (!result.videoUrl) {
        throw new Error('No video URL returned from API');
      }

      const videoUrl = result.videoUrl;
      task.videoUrl = videoUrl;
      task.status = 'generated';
      renderAccountsStatus();

      console.log(`✅ [${accountName}] Video URL: ${videoUrl}`);
      addLog('t2v-log', `✅ [${accountName}] Video ready, starting download...`, 'success');

      task.status = 'downloading';
      renderAccountsStatus();
      await downloadT2VVideo(videoUrl, outputDir, task.index, accountName, task.text);

      task.status = 'downloaded';
      addLog('t2v-log', `💾 [${accountName}] Prompt #${task.index} downloaded successfully`, 'success');

    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      addLog('t2v-log', `❌ [${accountName}] Retry failed for #${task.index}: ${error.message}`, 'error');
    }

    renderAccountsStatus();
    updateT2VProgress();
  };

  const processQueue = async (taskIndex) => {
    if (taskIndex >= failedTasks.length) return;
    if (t2vCancelled || t2vAccountStops[accountName]) return;

    const task = failedTasks[taskIndex];
    await processTask(task);

    // Delay after task completes, before picking next task
    const delay = settings.t2vTaskDelay || 500;
    if (delay > 0) {
      await sleep(delay);
    }

    // Process next task in queue
    await processQueue(taskIndex + batchSize);
  };

  // Start concurrent processing
  const promises = semaphore.map((_, index) => processQueue(index));
  await Promise.all(promises);

  updateAccountStatus(accountName, 'completed', retryAttempt);
}

// Hide failed prompts section
function hideFailedPromptsSection() {
  document.getElementById('t2v-failed-section').style.display = 'none';
}

// Download generated but not downloaded videos
async function downloadGeneratedVideos() {
  const outputDir = document.getElementById('t2v-output-dir').value.trim();

  if (!outputDir) {
    alert('Please select output directory');
    return;
  }

  let generatedCount = 0;
  const generatedTasks = [];

  // Find all videos that are generated but not downloaded
  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const generated = tasks.filter(t => t.status === 'generated' && t.videoUrl);
      generated.forEach(task => {
        generatedTasks.push({ ...task, account });
      });
      generatedCount += generated.length;
    }
  }

  if (generatedCount === 0) {
    alert('No generated videos waiting to be downloaded');
    return;
  }

  const confirmed = confirm(`Found ${generatedCount} generated videos that haven't been downloaded yet.\nDownload now?`);
  if (!confirmed) return;

  log('t2v', `📥 Downloading ${generatedCount} generated videos...`, 'info');

  let successCount = 0;
  let failCount = 0;

  for (const task of generatedTasks) {
    try {
      task.status = 'downloading';
      renderAccountsStatus();

      await downloadT2VVideo(task.videoUrl, outputDir, task.index, task.account, task.text);

      task.status = 'downloaded';
      successCount++;

      log('t2v', `✅ Downloaded: ${task.text.substring(0, 50)}...`, 'success');

    } catch (error) {
      task.status = 'generated'; // Revert to generated status
      failCount++;
      log('t2v', `❌ Download failed for #${task.index}: ${error.message}`, 'error');
    }

    renderAccountsStatus();
    updateT2VProgress();
  }

  log('t2v', `✅ Download completed! Success: ${successCount}, Failed: ${failCount}`, successCount > 0 ? 'success' : 'warn');

  if (failCount > 0) {
    alert(`Download completed with some errors.\nSuccess: ${successCount}\nFailed: ${failCount}`);
  } else {
    alert(`All ${successCount} videos downloaded successfully!`);
  }
}

// Download completed videos
async function downloadCompletedVideos() {
  const outputDir = document.getElementById('t2v-output-dir').value.trim();

  if (!outputDir) {
    alert('Please select output directory');
    return;
  }

  let completedCount = 0;

  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const completed = tasks.filter(t => t.status === 'completed' && t.videoUrl);
      completedCount += completed.length;
    }
  }

  if (completedCount === 0) {
    alert('No completed videos to download');
    return;
  }

  alert(`Found ${completedCount} completed videos. Download will start now.`);

  log('t2v', `📥 Downloading ${completedCount} videos...`, 'info');

  for (const [account, tasks] of Object.entries(t2vTasksData)) {
    if (Array.isArray(tasks)) {
      const completed = tasks.filter(t => t.status === 'completed' && t.videoUrl);

      for (const task of completed) {
        try {
          await downloadT2VVideo(task.videoUrl, outputDir, task.index, account, task.text);
        } catch (error) {
          log('t2v', `❌ Download failed for #${task.index}: ${error.message}`, 'error');
        }
      }
    }
  }

  log('t2v', '✅ All downloads completed!', 'success');
}

// Clear T2V form
function clearT2VForm() {
  if (t2vProcessing) {
    alert('Cannot clear while processing');
    return;
  }

  document.getElementById('t2v-prompts').value = '';
  document.getElementById('t2v-log').innerHTML = '';
  document.getElementById('t2v-progress-bar').style.width = '0%';
  document.getElementById('t2v-status').style.display = 'none';
  document.getElementById('t2v-failed-section').style.display = 'none';

  t2vTasksData = {};
}

// ===========================
// T2V IO Functions
// ===========================

// Toggle T2V IO config section
function toggleT2VIOConfig() {
  const section = document.getElementById('t2v-io-config-section');
  const toggle = document.getElementById('t2v-io-config-toggle');

  if (section.style.display === 'none') {
    section.style.display = 'grid';
    toggle.textContent = '▼';
  } else {
    section.style.display = 'none';
    toggle.textContent = '▶';
  }
}

// Select T2V IO output directory
async function selectT2VIOOutputDir() {
  const result = await ipcRenderer.invoke('select-directory');
  if (result) {
    document.getElementById('t2v-io-output-dir').value = result;
    settings.t2vIO.outputDir = result;
    autoSaveSettings();
  }
}

// Clear T2V IO form
function clearT2VIOForm() {
  if (t2vIOProcessing) {
    alert('Cannot clear while processing');
    return;
  }

  document.getElementById('t2v-io-prompts').value = '';
  document.getElementById('t2v-io-log').innerHTML = '';
  document.getElementById('t2v-io-progress-bar').style.width = '0%';
  document.getElementById('t2v-io-total').textContent = '0';
  document.getElementById('t2v-io-completed').textContent = '0';
  document.getElementById('t2v-io-failed').textContent = '0';
  document.getElementById('t2v-io-processing').textContent = '0';
  document.getElementById('t2v-io-status').style.display = 'none';
  document.getElementById('t2v-io-failed-section').style.display = 'none';

  t2vIOTasks = [];
}

// Start T2V IO processing
async function startT2VIOProcessing() {
  if (t2vIOProcessing) {
    alert('Processing already in progress');
    return;
  }

  // Get configuration
  const baseUrl = document.getElementById('t2v-io-base-url').value.trim();
  const apiKey = document.getElementById('t2v-io-api-key').value.trim();
  const outputDir = document.getElementById('t2v-io-output-dir').value.trim();
  const aspectRatio = document.getElementById('t2v-io-aspect-ratio').value;
  const concurrent = parseInt(document.getElementById('t2v-io-concurrent').value) || 3;
  const delay = parseInt(document.getElementById('t2v-io-delay').value) || 1000;
  const promptsText = document.getElementById('t2v-io-prompts').value.trim();

  // Validation
  if (!baseUrl) {
    alert('Please enter Base URL');
    return;
  }

  if (!apiKey) {
    alert('Please enter API Key');
    return;
  }

  if (!outputDir) {
    alert('Please select output directory');
    return;
  }

  if (!promptsText) {
    alert('Please enter prompts');
    return;
  }

  const prompts = promptsText.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  if (prompts.length === 0) {
    alert('No valid prompts found');
    return;
  }

  // Initialize
  t2vIOProcessing = true;
  t2vIOCancelled = false;
  t2vIOTasks = prompts.map((text, index) => ({
    index: index + 1,
    text,
    status: 'pending',
    taskId: null,
    videoUrl: null,
    error: null
  }));

  document.getElementById('start-t2v-io-btn').disabled = true;
  document.getElementById('stop-t2v-io-btn').style.display = 'inline-block';

  const logDiv = document.getElementById('t2v-io-log');
  logDiv.innerHTML = '';

  addLog('t2v-io-log', `🎬 Starting T2V IO generation...`, 'info');
  addLog('t2v-io-log', `📊 Total prompts: ${prompts.length} | Concurrent: ${concurrent} | Delay: ${delay}ms`, 'info');

  // Show status section and render cards
  document.getElementById('t2v-io-status').style.display = 'block';
  renderT2VIOPromptsStatus();

  // Update stats
  updateT2VIOStats();

  // Process with concurrency control with retry logic
  const maxRetries = settings.t2vIO.maxRetries || 2;
  await processT2VIOTasksWithRetry(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay, maxRetries, 0);

  // Show results
  if (!t2vIOCancelled) {
    const failed = t2vIOTasks.filter(t => t.status === 'error');
    if (failed.length > 0) {
      showT2VIOFailedPrompts();
      addLog('t2v-io-log', `⚠️ Completed with ${failed.length} failures`, 'warning');
    } else {
      addLog('t2v-io-log', '✅ All processing completed successfully!', 'success');
    }
  } else {
    addLog('t2v-io-log', '⏹️ Processing stopped by user', 'warning');
  }

  t2vIOProcessing = false;
  document.getElementById('start-t2v-io-btn').disabled = false;
  document.getElementById('stop-t2v-io-btn').style.display = 'none';
}

// Process T2V IO tasks with retry logic
async function processT2VIOTasksWithRetry(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay, maxRetries, retryAttempt) {
  // Log retry attempt if not first run
  if (retryAttempt > 0) {
    addLog('t2v-io-log', `🔄 Retry Attempt ${retryAttempt}/${maxRetries} starting...`, 'info');
  }

  await processT2VIOTasks(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay);

  if (!t2vIOCancelled) {
    const failed = t2vIOTasks.filter(t => t.status === 'error');

    if (failed.length > 0 && retryAttempt < maxRetries) {
      // Auto-retry failed tasks
      addLog('t2v-io-log', `⚠️ ${failed.length} prompts failed after attempt ${retryAttempt + 1}/${maxRetries}. Starting next retry...`, 'warning');

      // Reset failed tasks to pending
      failed.forEach(task => {
        task.status = 'pending';
      });

      updateT2VIOStats();

      // Add delay before retry
      await sleep(2000); // 2 seconds delay before retry

      // Retry failed tasks
      await processT2VIOTasksWithRetry(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay, maxRetries, retryAttempt + 1);
    } else if (failed.length > 0) {
      addLog('t2v-io-log', `❌ ${failed.length} prompts still failed after ${maxRetries} retry attempts`, 'error');
    } else if (retryAttempt > 0) {
      addLog('t2v-io-log', `✅ All failed prompts recovered after ${retryAttempt} retry attempt(s)`, 'success');
    }
  }
}

// Process T2V IO tasks with concurrency
async function processT2VIOTasks(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay) {
  const semaphore = new Array(concurrent).fill(null);

  const processTask = async (task) => {
    if (t2vIOCancelled || task.status === 'completed') {
      return;
    }

    task.status = 'creating';
    updateT2VIOStats();

    addLog('t2v-io-log', `🎥 Processing prompt #${task.index}: ${task.text.substring(0, 50)}...`, 'info');

    try {
      // Create video generation task
      const result = await ipcRenderer.invoke('create-t2v-task', {
        baseUrl,
        apiKey,
        accountName: 'io',
        prompt: task.text,
        aspectRatio
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      task.taskId = result.taskId;
      addLog('t2v-io-log', `✅ Task created: ${result.taskId}`, 'success');

      // Get video URL
      if (!result.videoUrl) {
        throw new Error('No video URL returned from API');
      }

      task.videoUrl = result.videoUrl;
      task.status = 'generated';
      updateT2VIOStats();

      addLog('t2v-io-log', `✅ Video ready, starting download...`, 'success');

      // Download video
      task.status = 'downloading';
      updateT2VIOStats();

      await downloadT2VIOVideo(task.videoUrl, outputDir, task.index, task.text);

      task.status = 'completed';
      addLog('t2v-io-log', `✅ Prompt #${task.index} completed`, 'success');

    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      addLog('t2v-io-log', `❌ Prompt #${task.index} failed: ${error.message}`, 'error');
    }

    updateT2VIOStats();
  };

  const processQueue = async (taskIndex) => {
    if (taskIndex >= t2vIOTasks.length) return;
    if (t2vIOCancelled) return;

    // Delay before processing (including first batch)
    if (delay > 0 && taskIndex > 0) {
      await sleep(delay);
    }

    const task = t2vIOTasks[taskIndex];
    await processTask(task);

    // Process next task in queue
    await processQueue(taskIndex + concurrent);
  };

  // Start concurrent processing
  const promises = semaphore.map((_, index) => processQueue(index));
  await Promise.all(promises);
}

// Download T2V IO video
async function downloadT2VIOVideo(videoUrl, outputDir, promptIndex, promptText = '') {
  const baseName = promptText ? sanitizeFilename(promptText) : `prompt_${promptIndex}`;
  const fileName = `${baseName}.mp4`;

  const result = await ipcRenderer.invoke('download-t2v-video', {
    videoUrl,
    outputDir,
    fileName
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  addLog('t2v-io-log', `💾 Downloaded: ${fileName}`, 'success');
}

// Update T2V IO statistics
function updateT2VIOStats() {
  const total = t2vIOTasks.length;
  const completed = t2vIOTasks.filter(t => t.status === 'completed').length;
  const failed = t2vIOTasks.filter(t => t.status === 'error').length;
  const processing = t2vIOTasks.filter(t =>
    t.status === 'creating' ||
    t.status === 'downloading' ||
    t.status === 'generated'
  ).length;

  document.getElementById('t2v-io-total').textContent = total;
  document.getElementById('t2v-io-completed').textContent = completed;
  document.getElementById('t2v-io-failed').textContent = failed;
  document.getElementById('t2v-io-processing').textContent = processing;

  // Update progress bar
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
  document.getElementById('t2v-io-progress-bar').style.width = `${progress}%`;

  // Update prompt status cards
  renderT2VIOPromptsStatus();
}

// Render T2V IO prompts status cards
function renderT2VIOPromptsStatus() {
  const container = document.getElementById('t2v-io-prompts-status');
  if (!container) return;

  if (t2vIOTasks.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #95a5a6;">No prompts to display</p>';
    return;
  }

  // Group tasks by status for better organization
  const statusGroups = {
    processing: t2vIOTasks.filter(t => t.status === 'creating' || t.status === 'downloading' || t.status === 'generated'),
    completed: t2vIOTasks.filter(t => t.status === 'completed'),
    error: t2vIOTasks.filter(t => t.status === 'error'),
    pending: t2vIOTasks.filter(t => t.status === 'pending')
  };

  let html = '';

  // Show processing first (most important)
  if (statusGroups.processing.length > 0) {
    html += '<div style="margin-bottom: 20px;"><h4 style="color: #f39c12; margin-bottom: 10px;">⏳ Processing</h4>';
    html += '<div class="prompts-status-grid">';
    statusGroups.processing.forEach(task => {
      html += renderPromptCard(task);
    });
    html += '</div></div>';
  }

  // Show failed (need attention)
  if (statusGroups.error.length > 0) {
    html += '<div style="margin-bottom: 20px;"><h4 style="color: #e74c3c; margin-bottom: 10px;">❌ Failed</h4>';
    html += '<div class="prompts-status-grid">';
    statusGroups.error.forEach(task => {
      html += renderPromptCard(task);
    });
    html += '</div></div>';
  }

  // Show completed (collapsed by default if many)
  if (statusGroups.completed.length > 0) {
    const showAll = statusGroups.completed.length <= 10;
    html += '<div style="margin-bottom: 20px;"><h4 style="color: #27ae60; margin-bottom: 10px;">✅ Completed (' + statusGroups.completed.length + ')</h4>';
    if (showAll) {
      html += '<div class="prompts-status-grid">';
      statusGroups.completed.forEach(task => {
        html += renderPromptCard(task);
      });
      html += '</div>';
    } else {
      html += '<p style="color: #95a5a6; font-style: italic;">Showing summary only. ' + statusGroups.completed.length + ' prompts completed successfully.</p>';
    }
    html += '</div>';
  }

  // Show pending (collapsed by default if many)
  if (statusGroups.pending.length > 0) {
    const showAll = statusGroups.pending.length <= 10;
    html += '<div style="margin-bottom: 20px;"><h4 style="color: #95a5a6; margin-bottom: 10px;">⏸️ Pending (' + statusGroups.pending.length + ')</h4>';
    if (showAll) {
      html += '<div class="prompts-status-grid">';
      statusGroups.pending.forEach(task => {
        html += renderPromptCard(task);
      });
      html += '</div>';
    } else {
      html += '<p style="color: #95a5a6; font-style: italic;">Showing summary only. ' + statusGroups.pending.length + ' prompts pending.</p>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

// Render individual prompt card
function renderPromptCard(task) {
  const statusConfig = {
    pending: { color: '#95a5a6', icon: '⏸️', label: 'Pending' },
    creating: { color: '#3498db', icon: '🎬', label: 'Creating' },
    generated: { color: '#9b59b6', icon: '✨', label: 'Generated' },
    downloading: { color: '#f39c12', icon: '⬇️', label: 'Downloading' },
    completed: { color: '#27ae60', icon: '✅', label: 'Completed' },
    error: { color: '#e74c3c', icon: '❌', label: 'Failed' }
  };

  const config = statusConfig[task.status] || statusConfig.pending;
  const truncatedText = task.text.length > 80 ? task.text.substring(0, 80) + '...' : task.text;

  return `
    <div class="prompt-status-card" style="border-left: 4px solid ${config.color};">
      <div class="prompt-card-header">
        <span class="prompt-number" style="background: ${config.color};">#${task.index}</span>
        <span class="prompt-status-badge" style="background: ${config.color};">${config.icon} ${config.label}</span>
      </div>
      <div class="prompt-card-body">
        <p class="prompt-text" title="${task.text.replace(/"/g, '&quot;')}">${truncatedText}</p>
        ${task.taskId ? `<small class="task-id">Task ID: ${task.taskId}</small>` : ''}
        ${task.error ? `<small class="prompt-error">Error: ${task.error}</small>` : ''}
      </div>
    </div>
  `;
}

// Stop T2V IO processing
function stopT2VIOProcessing() {
  if (!t2vIOProcessing) return;

  const confirmed = confirm('Are you sure you want to stop processing?');
  if (confirmed) {
    t2vIOCancelled = true;
    addLog('t2v-io-log', '⏹️ Stopping processing...', 'warning');
  }
}

// Show failed prompts for T2V IO
function showT2VIOFailedPrompts() {
  const failed = t2vIOTasks.filter(t => t.status === 'error');

  if (failed.length === 0) {
    return;
  }

  const section = document.getElementById('t2v-io-failed-section');
  const summary = document.getElementById('t2v-io-failed-summary');
  const list = document.getElementById('t2v-io-failed-list');

  summary.innerHTML = `<p><strong>⚠️ ${failed.length} prompts failed</strong></p>`;

  list.innerHTML = failed.map(task => `
    <div class="failed-prompt-item">
      <strong>#${task.index}</strong>: ${task.text}
      <br><small style="color: #e74c3c;">Error: ${task.error}</small>
    </div>
  `).join('');

  section.style.display = 'block';
}

// Hide T2V IO failed section
function hideT2VIOFailedSection() {
  document.getElementById('t2v-io-failed-section').style.display = 'none';
}

// Retry failed prompts for T2V IO
async function retryT2VIOFailedPrompts() {
  const failed = t2vIOTasks.filter(t => t.status === 'error');

  if (failed.length === 0) {
    alert('No failed prompts to retry');
    return;
  }

  // Get configuration
  const baseUrl = document.getElementById('t2v-io-base-url').value.trim();
  const apiKey = document.getElementById('t2v-io-api-key').value.trim();
  const outputDir = document.getElementById('t2v-io-output-dir').value.trim();
  const aspectRatio = document.getElementById('t2v-io-aspect-ratio').value;
  const concurrent = parseInt(document.getElementById('t2v-io-concurrent').value) || 3;
  const delay = parseInt(document.getElementById('t2v-io-delay').value) || 1000;

  // Reset failed tasks to pending
  failed.forEach(task => {
    task.status = 'pending';
    task.error = null;
  });

  hideT2VIOFailedSection();

  t2vIOProcessing = true;
  t2vIOCancelled = false;
  document.getElementById('start-t2v-io-btn').disabled = true;
  document.getElementById('stop-t2v-io-btn').style.display = 'inline-block';

  addLog('t2v-io-log', `🔄 Retrying ${failed.length} failed prompts...`, 'info');

  // Create a temporary task list with only failed tasks
  const originalTasks = t2vIOTasks;
  t2vIOTasks = failed;

  await processT2VIOTasks(baseUrl, apiKey, aspectRatio, outputDir, concurrent, delay);

  // Restore original task list
  t2vIOTasks = originalTasks;

  const stillFailed = failed.filter(t => t.status === 'error');
  if (stillFailed.length > 0) {
    showT2VIOFailedPrompts();
    addLog('t2v-io-log', `⚠️ ${stillFailed.length} prompts still failed after retry`, 'warning');
  } else {
    addLog('t2v-io-log', '✅ All retried prompts completed successfully!', 'success');
  }

  t2vIOProcessing = false;
  document.getElementById('start-t2v-io-btn').disabled = false;
  document.getElementById('stop-t2v-io-btn').style.display = 'none';

  updateT2VIOStats();
}

// Check missing T2V IO prompts (prompts without downloaded videos)
async function checkT2VIOMissingPrompts() {
  const outputDir = document.getElementById('t2v-io-output-dir').value.trim();

  if (!outputDir) {
    alert('Please select output directory first');
    return;
  }

  if (t2vIOTasks.length === 0) {
    alert('No prompts to check. Please add prompts first.');
    return;
  }

  addLog('t2v-io-log', '🔍 Checking for missing videos...', 'info');

  const fs = require('fs');
  const path = require('path');
  const missingPrompts = [];

  for (const task of t2vIOTasks) {
    const baseName = sanitizeFilename(task.text);
    const fileName = `${baseName}.mp4`;
    const filePath = path.join(outputDir, fileName);

    try {
      await fs.promises.access(filePath);
      // File exists
    } catch {
      // File doesn't exist
      missingPrompts.push(task);
    }
  }

  if (missingPrompts.length === 0) {
    addLog('t2v-io-log', '✅ All prompts have corresponding videos!', 'success');
    alert('All prompts have corresponding videos!');
  } else {
    addLog('t2v-io-log', `⚠️ Found ${missingPrompts.length} prompts without videos`, 'warning');

    // Show missing prompts in a modal or section
    const section = document.getElementById('t2v-io-failed-section');
    const summary = document.getElementById('t2v-io-failed-summary');
    const list = document.getElementById('t2v-io-failed-list');

    summary.innerHTML = `<p><strong>⚠️ ${missingPrompts.length} prompts missing videos</strong></p>`;

    list.innerHTML = missingPrompts.map(task => `
      <div class="failed-prompt-item">
        <strong>#${task.index}</strong>: ${task.text}
        <br><small style="color: #f39c12;">Status: ${task.status} - Video file not found in output directory</small>
      </div>
    `).join('');

    section.style.display = 'block';

    // Mark these prompts as pending for retry
    missingPrompts.forEach(task => {
      if (task.status !== 'error') {
        task.status = 'pending';
        task.error = 'Video file not found';
      }
    });

    updateT2VIOStats();
  }
}

// Show edit prompts modal for T2V IO
function showT2VIOEditPromptsModal() {
  if (t2vIOTasks.length === 0) {
    alert('No prompts to edit. Please add prompts first.');
    return;
  }

  const modal = document.getElementById('t2v-io-edit-modal');
  const list = document.getElementById('t2v-io-edit-list');

  list.innerHTML = t2vIOTasks.map((task, idx) => `
    <div class="edit-prompt-item" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
      <span style="min-width: 40px; font-weight: bold;">#${task.index}</span>
      <input 
        type="text" 
        id="t2v-io-edit-prompt-${idx}" 
        value="${task.text.replace(/"/g, '&quot;')}" 
        style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
      />
      <span style="min-width: 80px; font-size: 0.85rem; color: ${task.status === 'completed' ? '#27ae60' :
      task.status === 'error' ? '#e74c3c' :
        task.status === 'pending' ? '#95a5a6' :
          '#f39c12'
    };">
        ${task.status}
      </span>
      <button 
        onclick="deleteT2VIOPrompt(${idx})" 
        style="padding: 6px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        🗑️
      </button>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

// Close edit modal
function closeT2VIOEditModal() {
  document.getElementById('t2v-io-edit-modal').style.display = 'none';
}

// Delete a prompt from T2V IO
function deleteT2VIOPrompt(index) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    t2vIOTasks.splice(index, 1);
    // Re-index
    t2vIOTasks.forEach((task, idx) => {
      task.index = idx + 1;
    });
    showT2VIOEditPromptsModal();
    updateT2VIOStats();
  }
}

// Save edited prompts for T2V IO
function saveT2VIOEditedPrompts() {
  t2vIOTasks.forEach((task, idx) => {
    const input = document.getElementById(`t2v-io-edit-prompt-${idx}`);
    if (input) {
      task.text = input.value.trim();
    }
  });

  // Update textarea
  const promptsText = t2vIOTasks.map(t => t.text).join('\n');
  document.getElementById('t2v-io-prompts').value = promptsText;

  closeT2VIOEditModal();
  addLog('t2v-io-log', '✅ Prompts updated successfully', 'success');
}

// Export T2V IO prompts to file
async function exportT2VIOPrompts() {
  if (t2vIOTasks.length === 0) {
    alert('No prompts to export');
    return;
  }

  const exportData = t2vIOTasks.map(task => ({
    index: task.index,
    text: task.text,
    status: task.status,
    error: task.error || ''
  }));

  const result = await ipcRenderer.invoke('save-file-dialog', {
    title: 'Export T2V IO Prompts',
    defaultPath: `t2v-io-prompts-${Date.now()}.json`,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  const fs = require('fs');
  const filePath = result.filePath;

  try {
    if (filePath.endsWith('.json')) {
      await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
    } else {
      // Export as plain text
      const textContent = t2vIOTasks.map(t => t.text).join('\n');
      await fs.promises.writeFile(filePath, textContent, 'utf-8');
    }

    addLog('t2v-io-log', `✅ Exported ${t2vIOTasks.length} prompts to ${filePath}`, 'success');
    alert(`Exported successfully to:\n${filePath}`);
  } catch (error) {
    addLog('t2v-io-log', `❌ Export failed: ${error.message}`, 'error');
    alert(`Export failed: ${error.message}`);
  }
}

// Import T2V IO prompts from file
async function importT2VIOPrompts() {
  const result = await ipcRenderer.invoke('open-file-dialog', {
    title: 'Import T2V IO Prompts',
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return;
  }

  const fs = require('fs');
  const filePath = result.filePaths[0];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      const importedData = JSON.parse(content);

      if (!Array.isArray(importedData)) {
        throw new Error('Invalid JSON format. Expected an array of prompts.');
      }

      // Merge with existing prompts or replace
      const replace = confirm('Replace existing prompts?\nClick OK to replace, Cancel to append.');

      if (replace) {
        t2vIOTasks = importedData.map((item, idx) => ({
          index: idx + 1,
          text: item.text || item,
          status: 'pending',
          taskId: null,
          videoUrl: null,
          error: null
        }));
      } else {
        const startIndex = t2vIOTasks.length;
        const newTasks = importedData.map((item, idx) => ({
          index: startIndex + idx + 1,
          text: item.text || item,
          status: 'pending',
          taskId: null,
          videoUrl: null,
          error: null
        }));
        t2vIOTasks = [...t2vIOTasks, ...newTasks];
      }
    } else {
      // Import as plain text
      const prompts = content.split('\n').map(p => p.trim()).filter(p => p.length > 0);

      const replace = confirm('Replace existing prompts?\nClick OK to replace, Cancel to append.');

      if (replace) {
        t2vIOTasks = prompts.map((text, idx) => ({
          index: idx + 1,
          text,
          status: 'pending',
          taskId: null,
          videoUrl: null,
          error: null
        }));
      } else {
        const startIndex = t2vIOTasks.length;
        const newTasks = prompts.map((text, idx) => ({
          index: startIndex + idx + 1,
          text,
          status: 'pending',
          taskId: null,
          videoUrl: null,
          error: null
        }));
        t2vIOTasks = [...t2vIOTasks, ...newTasks];
      }
    }

    // Update textarea
    const promptsText = t2vIOTasks.map(t => t.text).join('\n');
    document.getElementById('t2v-io-prompts').value = promptsText;

    updateT2VIOStats();
    addLog('t2v-io-log', `✅ Imported ${t2vIOTasks.length} prompts from ${filePath}`, 'success');
    alert(`Imported successfully!\nTotal prompts: ${t2vIOTasks.length}`);
  } catch (error) {
    addLog('t2v-io-log', `❌ Import failed: ${error.message}`, 'error');
    alert(`Import failed: ${error.message}`);
  }
}

// Cleanup on close
window.addEventListener('beforeunload', () => {
  if (serverRunning) {
    stopCallbackServer();
  }
});
