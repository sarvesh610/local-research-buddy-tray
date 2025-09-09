/**
 * Main Renderer
 * Entry point for the renderer process - now modular and maintainable
 */

import { $, on, showControlsView } from './js/ui-helpers.js';
import { modeConfig, updateUIForMode } from './js/mode-config.js';
import { initializeWindowControls } from './js/window-controls.js';
import { runAnalysis } from './js/analysis-handler.js';

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
        updateUIForMode(e.target.value);
      }
    });
  });

  // Initialize with default mode
  // Default to agent mode only
  const agentRadio = document.querySelector('input[name="mode"][value="agent"]');
  if (agentRadio) agentRadio.checked = true;
  updateUIForMode("agent");
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
