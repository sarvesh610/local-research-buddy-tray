/**
 * Analysis Handler
 * Manages the main analysis workflow and result processing
 */

import { createHealthDashboard, formatHealthOutput } from './health-dashboard.js';
import { $, setBusy, streamText, showSummaryView } from './ui-helpers.js';
import { modeConfig } from './mode-config.js';

export async function runAnalysis() {
  const selectedMode = document.querySelector('input[name="mode"]:checked')?.value || "summarizer";
  const config = modeConfig[selectedMode];
  const dirPath = $("#dir").value;
  const userPrompt = $("#prompt").value.trim();
  const statusEl = $("#status");
  const outEl = $("#out");

  // Validation
  if (!userPrompt) {
    statusEl.textContent = "Please enter a prompt.";
    return;
  }

  if (config.requiresFiles && !dirPath) {
    statusEl.textContent = `Please choose a ${config.directoryLabel.toLowerCase()}.`;
    return;
  }

  setBusy(true);
  outEl && (outEl.textContent = "");

  try {
    // Handle agent mode differently
    if (selectedMode === "agent") {
      console.log("[renderer] Starting agent mode with prompt:", userPrompt);
      const payload = { dirPath, userPrompt, maxSteps: 6 };
      
      try {
        const res = await window.api?.runAgent(payload);
        console.log("[renderer] Agent response:", res);
        
        if (!res || !res.ok) {
          statusEl.textContent = res?.error || "Agent failed.";
          console.error("[renderer] Agent failed:", res?.error);
        } else {
          statusEl.textContent = `Agent completed in ${res.steps || 0} steps.`;
          handleGenericResult(res, statusEl, outEl);
        }
      } catch (agentError) {
        console.error("[renderer] Agent error:", agentError);
        statusEl.textContent = `Agent error: ${agentError.message}`;
      }
    } else {
      // Handle other modes with existing logic
      const options = {
        include: {
          pdf: $("#includePdf")?.checked ?? true,
          docx: $("#includeDocx")?.checked ?? true,
          csv: $("#includeCsv")?.checked ?? true,
          md: $("#includeMd")?.checked ?? true,
        },
        mode: selectedMode,
      };

      const payload = { dirPath, userPrompt, options };
      const res = await window.api?.runSummary(payload);

      if (!res || !res.ok) {
        statusEl.textContent = res?.error || "Something went wrong.";
      } else {
        handleAnalysisResult(selectedMode, res, statusEl, outEl);
      }
    }
  } catch (e) {
    statusEl.textContent = e?.message || String(e);
  } finally {
    setBusy(false);
  }
}

function handleAnalysisResult(selectedMode, res, statusEl, outEl) {
  if (selectedMode === "security" && res.securityScore !== undefined) {
    handleSecurityResult(res, statusEl, outEl);
  } else if (selectedMode === "health" && res.healthMetrics && res.recovery) {
    handleHealthResult(res, statusEl, outEl);
  } else {
    handleGenericResult(res, statusEl, outEl);
  }
}

function handleSecurityResult(res, statusEl, outEl) {
  statusEl.textContent = `Security Analysis Complete. Score: ${res.securityScore}/100 (${res.riskLevel} Risk)`;
  
  if (outEl) {
    outEl.innerHTML = `
      <div class="security-dashboard">
        <div class="security-score ${res.riskLevel.toLowerCase()}">
          <div class="score-circle">
            <span class="score-value">${res.securityScore}</span>
            <span class="score-label">Security Score</span>
          </div>
          <div class="risk-level">
            <span class="risk-badge ${res.riskLevel.toLowerCase()}">${res.riskLevel} Risk</span>
          </div>
        </div>
      </div>
      <div class="summary-force"></div>
    `;
    
    const summaryDiv = outEl.querySelector(".summary-force");
    showSummaryView();
    streamText(summaryDiv, res.output || "");
  }
}

function handleHealthResult(res, statusEl, outEl) {
  statusEl.textContent = `Health Analysis Complete. Sleep Score: ${res.healthMetrics.sleep?.sleepScore || 0}/100`;
  
  if (outEl) {
    outEl.innerHTML = createHealthDashboard(res);
    const summaryDiv = outEl.querySelector(".health-output");
    showSummaryView();

    // Format the health output for end users
    const formattedOutput = formatHealthOutput(res.output || "");
    summaryDiv.innerHTML = formattedOutput;
  }
}

function handleGenericResult(res, statusEl, outEl) {
  statusEl.textContent = `Done. Files processed: ${res.fileCount}.`;
  
  if (outEl) {
    outEl.innerHTML = `<div class="summary-force"></div>`;
    const summaryDiv = outEl.querySelector(".summary-force");
    showSummaryView();
    streamText(summaryDiv, res.output || "");
  }
}