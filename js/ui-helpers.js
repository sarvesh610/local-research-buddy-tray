/**
 * UI Helper Functions
 * General utility functions for DOM manipulation and UI updates
 */

export const $ = (sel) => document.querySelector(sel);

export function on(sel, evt, handler) {
  const el = $(sel);
  if (!el) {
    console.warn("[renderer] missing element for selector", sel);
    return;
  }
  el.addEventListener(evt, handler);
}

export function setBusy(isLoading) {
  const runBtn = $("#run");
  const spinnerEl = $("#spinner");
  const statusEl = $("#status");
  const outEl = document.getElementById("out");
  const currentMode = document.querySelector('input[name="mode"]:checked')?.value;
  
  if (isLoading) {
    runBtn && (runBtn.disabled = true);
    spinnerEl?.classList.add("show");
    statusEl && (statusEl.textContent = "Working…");
    // Add subtle scanlines when Agent runs
    if (currentMode === 'agent') {
      outEl?.classList.add('scanlines');
    }
  } else {
    runBtn && (runBtn.disabled = false);
    spinnerEl?.classList.remove("show");
    outEl?.classList.remove('scanlines');
  }
}

export function streamText(element, text, speed = 20) {
  element.textContent = "";
  let index = 0;

  function typeNext() {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
      setTimeout(typeNext, speed);
    }
  }

  typeNext();
}

export function showSummaryView() {
  const controls = document.getElementById("controls");
  const summarySection = document.getElementById("summarySection");
  
  controls?.classList.add("hidden");
  summarySection?.classList.remove("hidden");
}

export function showControlsView() {
  const controls = document.getElementById("controls");
  const summarySection = document.getElementById("summarySection");
  const statusEl = $("#status");
  const spinnerEl = $("#spinner");
  
  summarySection?.classList.add("hidden");
  controls?.classList.remove("hidden");
  statusEl && (statusEl.textContent = "Idle");
  spinnerEl?.classList.remove("show");
}
