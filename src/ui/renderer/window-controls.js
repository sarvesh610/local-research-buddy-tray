/**
 * Window Controls
 * Handles window minimize, close, and pin functionality
 */

export function initializeWindowControls() {
  const minBtn = document.getElementById("minBtn");
  const closeBtn = document.getElementById("closeBtn");
  const pinBtn = document.getElementById("pinBtn");

  if (minBtn) {
    minBtn.addEventListener("click", () => window.api?.minimize());
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => window.api?.close());
  }

  if (pinBtn) {
    pinBtn.addEventListener("click", async () => {
      try {
        const pinned = await window.api?.togglePin();
        if (pinned) {
          pinBtn.classList.add("active");
        } else {
          pinBtn.classList.remove("active");
        }
      } catch (error) {
        console.warn("Pin toggle failed:", error);
      }
    });
  }
}