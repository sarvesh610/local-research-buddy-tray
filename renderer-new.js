/**
 * Main Renderer
 * Entry point for the renderer process - now modular and maintainable
 */

import { $, on, showControlsView, clearVoiceTranscript } from './src/ui/renderer/ui-helpers.js';
import { modeConfig, updateUIForMode } from './src/ui/renderer/mode-config.js';
import { initializeWindowControls } from './src/ui/renderer/window-controls.js';
import { runAnalysis } from './src/ui/renderer/analysis-handler.js';

document.addEventListener("DOMContentLoaded", () => {
  console.log("[renderer] script loaded, binding UI…");

  // Initialize all modules
  initializeApp();
});

function initializeApp() {
  // Initialize window controls
  initializeWindowControls();
  
  // Initialize mode switching
  initializeModeHandling();
  
  // Initialize directory browser
  initializeDirectoryBrowser();
  
  // Initialize analysis runner
  initializeAnalysisRunner();
  
  // Initialize keyboard shortcuts
  initializeKeyboardShortcuts();
  
  // Initialize copy/export functionality
  initializeCopyExport();
  
  // Initialize back button
  initializeBackButton();
}

function initializeModeHandling() {
  // Handle mode changes
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        // Clear voice transcript when switching modes
        clearVoiceTranscript();
        updateUIForMode(e.target.value);
      }
    });
  });

  // Initialize with default mode
  // Default to agent mode only
  const agentRadio = document.querySelector('input[name="mode"][value="agent"]');
  if (agentRadio) agentRadio.checked = true;
  updateUIForMode("agent");

  // Probe voice availability to enable/disable Voice tile gracefully
  checkVoiceAvailability();
  
  // Initialize voice functionality
  initializeVoiceHandling();
}

async function checkVoiceAvailability() {
  try {
    const res = await window.electronAPI?.voiceAvailable?.();
    const voiceRadio = document.querySelector('input[name="mode"][value="voice"]');
    const voiceLabel = voiceRadio?.closest('label.mode-option');
    if (!res?.available) {
      // Keep it clickable, but hint why it may fail
      voiceLabel?.setAttribute('title', 'Voice binary not found. Place at src/voice/whisper-binary/LucidTalkStreamer');
    }
  } catch (e) {
    // If check fails, leave as-is
    console.warn('[renderer] voice availability check failed:', e);
  }
}

function initializeDirectoryBrowser() {
  on("#browse", "click", async () => {
    try {
      if (!window.api || !window.api.pickDir) {
        console.error("[renderer] window.api.pickDir is missing");
        const statusEl = $("#status");
        statusEl && (statusEl.textContent = "Internal error: preload API not available.");
        return;
      }
      
      const dir = await window.api.pickDir();
      if (dir) $("#dir").value = dir;
    } catch (e) {
      const statusEl = $("#status");
      statusEl && (statusEl.textContent = e?.message || String(e));
    }
  });
}

function initializeAnalysisRunner() {
  const runBtn = $("#run");
  if (runBtn) {
    runBtn.addEventListener("click", runAnalysis);
  } else {
    console.warn("[renderer] #run button not found");
  }
}

function initializeKeyboardShortcuts() {
  // ⌘/Ctrl + Enter to run
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const summarySection = document.getElementById("summarySection");
      if (!summarySection?.classList.contains("hidden")) return;
      runAnalysis();
    }
  });
}

function initializeCopyExport() {
  // Copy functionality
  on("#copy", "click", async () => {
    const outEl = $("#out");
    const text = outEl?.innerText || "";
    const statusEl = $("#status");
    
    try {
      await navigator.clipboard.writeText(text);
      statusEl && (statusEl.textContent = "Copied to clipboard.");
    } catch {
      statusEl && (statusEl.textContent = "Copy failed.");
    }
  });

  // Export functionality
  on("#export", "click", () => {
    const outEl = $("#out");
    const content = outEl?.innerText || "";
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    
    a.href = url;
    a.download = "local-research-buddy-summary.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    const statusEl = $("#status");
    statusEl && (statusEl.textContent = "Exported as Markdown.");
  });
}

function initializeBackButton() {
  const backBtn = document.getElementById("back");
  backBtn?.addEventListener("click", () => {
    showControlsView();
  });
}

function initializeVoiceHandling() {
  let isRecording = false;
  
  const voiceStartBtn = document.getElementById('voiceStart');
  const voiceStopBtn = document.getElementById('voiceStop');
  const liveTranscriptEl = document.getElementById('liveTranscript');
  const voiceStatusEl = document.getElementById('voiceStatusText');
  const voiceSpinnerEl = document.getElementById('voiceSpinner');
  const voiceBackBtn = document.getElementById('voiceBackBtn');
  const voiceWaves = document.getElementById('voiceWaves');
  
  if (!voiceStartBtn || !voiceStopBtn) {
    console.warn('[voice] Voice UI elements not found');
    return;
  }
  
  // Back button functionality
  if (voiceBackBtn) {
    voiceBackBtn.addEventListener('click', () => {
      // Stop recording if active
      if (isRecording) {
        voiceStopBtn.click();
      }
      
      // Clear transcript when going back
      clearVoiceTranscript();
      
      // Switch back to default mode (agent)
      const agentRadio = document.querySelector('input[name="mode"][value="agent"]');
      if (agentRadio) {
        agentRadio.checked = true;
        updateUIForMode('agent');
      }
    });
  }
  
  // Start recording
  voiceStartBtn.addEventListener('click', async () => {
    if (isRecording) return;
    
    try {
      isRecording = true;
      voiceStatusEl.textContent = 'Starting...';
      voiceSpinnerEl.classList.add('show');
      
      // Clear transcript history for new session
      liveTranscriptEl.textContent = 'Listening...';
      
      // Start voice input
      const result = await window.electronAPI?.startVoice?.();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to start voice recording');
      }
      
      // Update UI
      voiceStartBtn.classList.add('hidden');
      voiceStopBtn.classList.remove('hidden');
      if (voiceWaves) voiceWaves.classList.remove('hidden');
      voiceStatusEl.textContent = 'Recording';
      voiceSpinnerEl.classList.remove('show');
      
    } catch (error) {
      console.error('[voice] Failed to start recording:', error);
      isRecording = false;
      voiceStatusEl.textContent = `Error: ${error.message}`;
      voiceSpinnerEl.classList.remove('show');
    }
  });
  
  // Stop recording
  voiceStopBtn.addEventListener('click', async () => {
    if (!isRecording) return;
    
    try {
      voiceStatusEl.textContent = 'Stopping...';
      voiceSpinnerEl.classList.add('show');
      
      // Stop voice input
      const result = await window.electronAPI?.stopVoice?.();
      
      // Update UI
      isRecording = false;
      voiceStartBtn.classList.remove('hidden');
      voiceStopBtn.classList.add('hidden');
      if (voiceWaves) voiceWaves.classList.add('hidden');
      voiceSpinnerEl.classList.remove('show');
      
      if (result?.success && result?.finalTranscript) {
        liveTranscriptEl.textContent = `Final: ${result.finalTranscript}`;
        voiceStatusEl.textContent = 'Processing command...';
        
        // Process the final transcript as a voice command through the agent
        try {
          const agentResult = await window.electronAPI?.runAgent?.({
            messages: [{ role: 'user', content: result.finalTranscript }],
            maxSteps: 6
          });
          
          if (agentResult?.ok && agentResult?.output) {
            // Show agent response in the main output area
            const outEl = document.getElementById('out');
            if (outEl) {
              outEl.innerHTML = agentResult.output;
              document.getElementById('summarySection')?.classList.remove('hidden');
              document.getElementById('controls')?.classList.add('hidden');
            }
            voiceStatusEl.textContent = 'Command processed successfully';
          } else {
            voiceStatusEl.textContent = 'Failed to process command';
          }
        } catch (error) {
          console.error('[voice] Failed to process voice command:', error);
          voiceStatusEl.textContent = `Error: ${error.message}`;
        }
      } else {
        liveTranscriptEl.textContent = 'No transcript captured';
        voiceStatusEl.textContent = 'Ready';
      }
      
    } catch (error) {
      console.error('[voice] Failed to stop recording:', error);
      isRecording = false;
      voiceStatusEl.textContent = `Error: ${error.message}`;
      voiceSpinnerEl.classList.remove('show');
      
      // Reset UI state
      voiceStartBtn.classList.remove('hidden');
      voiceStopBtn.classList.add('hidden');
      if (voiceWaves) voiceWaves.classList.add('hidden');
    }
  });
  
  // Listen for voice events from main process
  window.electronAPI?.onVoiceEvent?.((event) => {
    console.log('[voice] Received event:', event);
    
    switch (event.type) {
      case 'transcription':
        if (event.data?.text) {
          // For partials, append; for finals, replace
          if (event.data.partial) {
            liveTranscriptEl.textContent = event.data.text;
          } else {
            // Final transcript - show only current session
            liveTranscriptEl.textContent = event.data.text;
          }
          // Auto-scroll to show latest transcription
          liveTranscriptEl.parentElement?.scrollTo(0, liveTranscriptEl.parentElement.scrollHeight);
        }
        break;
        
      case 'status':
        voiceStatusEl.textContent = event.data?.message || 'Recording';
        break;
        
      case 'error':
        console.error('[voice] Voice error:', event.data);
        voiceStatusEl.textContent = `Error: ${event.data?.message || 'Unknown error'}`;
        break;
        
      case 'stopped':
        // Voice session ended
        isRecording = false;
        voiceStartBtn.classList.remove('hidden');
        voiceStopBtn.classList.add('hidden');
        if (voiceWaves) voiceWaves.classList.add('hidden');
        voiceSpinnerEl.classList.remove('show');
        voiceStatusEl.textContent = 'Ready';
        break;
    }
  });
  
  // Listen for agent responses
  window.electronAPI?.onAgentResponse?.((response) => {
    console.log('[voice] Agent response:', response);
    
    if (response.final) {
      // Show agent response in the main output area
      const outEl = document.getElementById('out');
      if (outEl) {
        outEl.innerHTML = response.final;
        document.getElementById('summarySection')?.classList.remove('hidden');
        document.getElementById('controls')?.classList.add('hidden');
      }
    }
  });
}
