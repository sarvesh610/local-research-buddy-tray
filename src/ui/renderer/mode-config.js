/**
 * Mode Configuration
 * Defines settings and behaviors for different AI modes
 */

export const modeConfig = {
  summarizer: {
    placeholder: "e.g., Summarize key themes and list top 5 findings with citations.",
    directoryLabel: "Directory",
    buttonText: "Analyze Folder",
    requiresFiles: true,
  },
  email: {
    placeholder: "e.g., Write a professional follow-up email based on these meeting notes.",
    directoryLabel: "Documents (optional)",
    buttonText: "Generate Email",
    requiresFiles: false,
  },
  analyzer: {
    placeholder: "e.g., Analyze the codebase structure and identify key components and dependencies.",
    directoryLabel: "Project Directory",
    buttonText: "Analyze Code",
    requiresFiles: true,
  },
  generator: {
    placeholder: "e.g., Generate a React component for user authentication with form validation.",
    directoryLabel: "Reference Code (optional)",
    buttonText: "Generate Code",
    requiresFiles: false,
  },
  security: {
    placeholder: "e.g., Scan my system for security vulnerabilities and provide recommendations.",
    directoryLabel: "System Analysis",
    buttonText: "Analyze Security",
    requiresFiles: false,
  },
  health: {
    placeholder: "e.g., Analyze my Fitbit data and create a personalized health optimization plan.",
    directoryLabel: "Fitbit Data Folder",
    buttonText: "Analyze Health",
    requiresFiles: true,
  },
  agent: {
    placeholder: "e.g., List all PDF files mentioning 'budget', read two of them, and summarize key findings.",
    directoryLabel: "Working Directory (optional)",
    buttonText: "Run Agent",
    requiresFiles: false,
  },
  voice: {
    placeholder: "Use voice commands to interact with your AI assistant",
    directoryLabel: "Voice Mode",
    buttonText: "Start Recording",
    requiresFiles: false,
    isVoiceMode: true,
  },
};

export function updateUIForMode(mode) {
  const config = modeConfig[mode];
  if (!config) return;

  // Apply mode-specific colors
  document.documentElement.setAttribute("data-mode", mode);

  // Handle voice mode interface switching
  const defaultControls = document.querySelector("#controls .col");
  const voiceInterface = document.querySelector("#voiceInterface");
  
  if (config.isVoiceMode) {
    // Show voice interface, hide default controls
    if (defaultControls) defaultControls.style.display = "none";
    if (voiceInterface) voiceInterface.classList.remove("hidden");
    
    // Clear transcript when entering voice mode
    const liveTranscriptEl = document.getElementById('liveTranscript');
    if (liveTranscriptEl) {
      liveTranscriptEl.textContent = '';
    }
  } else {
    // Show default controls, hide voice interface
    if (defaultControls) defaultControls.style.display = "flex";
    if (voiceInterface) voiceInterface.classList.add("hidden");
    
    // Update default controls
    const promptEl = document.querySelector("#prompt");
    const runBtn = document.querySelector("#run");
    
    if (promptEl) promptEl.placeholder = config.placeholder;
    if (runBtn) runBtn.innerHTML = `<span class="dot"></span> ${config.buttonText}`;

    // Update directory label and show/hide directory section
    const dirLabel = Array.from(document.querySelectorAll("label.small")).find(
      (label) =>
        label.textContent.includes("Directory") ||
        label.nextElementSibling?.querySelector("#dir")
    );
    
    if (dirLabel) {
      dirLabel.textContent = config.directoryLabel;
    }

    // Show/hide directory section based on mode requirements
    const dirRow = dirLabel?.nextElementSibling;
    if (dirRow) {
      if (config.requiresFiles) {
        dirRow.style.opacity = "1";
        dirRow.style.pointerEvents = "auto";
      } else {
        dirRow.style.opacity = "0.5";
        dirRow.style.pointerEvents = "auto"; // Keep functional but dimmed
      }
    }

    // Show file-type Options only for folder analyzer (summarizer)
    const optionsDetails = document.querySelector('details#options');
    if (optionsDetails) {
      if (mode === 'summarizer') {
        optionsDetails.style.display = 'block';
      } else {
        optionsDetails.style.display = 'none';
      }
    }
  }
}
