document.addEventListener("DOMContentLoaded", () => {
	const $ = (sel) => document.querySelector(sel);

	function on(sel, evt, handler) {
		const el = $(sel);
		if (!el) {
			console.warn("[renderer] missing element for selector", sel);
			return;
		}
		el.addEventListener(evt, handler);
	}
	console.log("[renderer] script loaded, binding UI…");

	// Mode-specific configurations
	const modeConfig = {
		summarizer: {
			placeholder:
				"e.g., Summarize key themes and list top 5 findings with citations.",
			directoryLabel: "Directory",
			buttonText: "Summarize",
			requiresFiles: true,
		},
		email: {
			placeholder:
				"e.g., Write a professional follow-up email based on these meeting notes.",
			directoryLabel: "Documents (optional)",
			buttonText: "Generate Email",
			requiresFiles: false,
		},
		analyzer: {
			placeholder:
				"e.g., Analyze the codebase structure and identify key components and dependencies.",
			directoryLabel: "Project Directory",
			buttonText: "Analyze Code",
			requiresFiles: true,
		},
		generator: {
			placeholder:
				"e.g., Generate a React component for user authentication with form validation.",
			directoryLabel: "Reference Code (optional)",
			buttonText: "Generate Code",
			requiresFiles: false,
		},
		security: {
			placeholder:
				"e.g., Scan my system for security vulnerabilities and provide recommendations.",
			directoryLabel: "System Analysis",
			buttonText: "Analyze Security",
			requiresFiles: false,
		},
		health: {
			placeholder:
				"e.g., Analyze my Fitbit data and create a personalized health optimization plan.",
			directoryLabel: "Fitbit Data Folder",
			buttonText: "Analyze Health",
			requiresFiles: true,
		},
		agent: {
			placeholder:
				"e.g., List all PDF files mentioning 'budget', read two of them, and summarize key findings.",
			directoryLabel: "Working Directory (optional)",
			buttonText: "Run Agent",
			requiresFiles: false,
		},
	};

	// Status elements
	const statusEl = $("#status");
	const outEl = $("#out");
	const spinnerEl = $("#spinner");
	const runBtn = $("#run");
	const promptEl = $("#prompt");
	const dirLabelEl = $("label[for='dir']") || $("label.small");

	// Mode switching
	function updateUIForMode(mode) {
		const config = modeConfig[mode];
		if (!config) return;

		// Apply mode-specific colors
		document.documentElement.setAttribute("data-mode", mode);

		promptEl.placeholder = config.placeholder;
		runBtn.innerHTML = `<span class="dot"></span> ${config.buttonText}`;

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
	}

	// Handle mode changes
	document.querySelectorAll('input[name="mode"]').forEach((radio) => {
		radio.addEventListener("change", (e) => {
			if (e.target.checked) {
				updateUIForMode(e.target.value);
			}
		});
	});

	// Initialize with default mode
	updateUIForMode("summarizer");

	// Window controls
	const minBtn = document.getElementById("minBtn");
	const closeBtn = document.getElementById("closeBtn");
	const pinBtn = document.getElementById("pinBtn");
	if (minBtn) minBtn.addEventListener("click", () => window.api?.minimize());
	if (closeBtn) closeBtn.addEventListener("click", () => window.api?.close());
	if (pinBtn)
		pinBtn.addEventListener("click", async () => {
			try {
				const pinned = await window.api?.togglePin();
				if (pinned) pinBtn.classList.add("active");
				else pinBtn.classList.remove("active");
			} catch {}
		});

	// View containers
	const controls = document.getElementById("controls");
	const summarySection = document.getElementById("summarySection");
	const backBtn = document.getElementById("back");

	// Helpers
	function setBusy(b) {
		if (b) {
			runBtn && (runBtn.disabled = true);
			spinnerEl.classList.add("show");
			statusEl.textContent = "Working…";
		} else {
			runBtn && (runBtn.disabled = false);
			spinnerEl.classList.remove("show");
		}
	}

	// Streaming text effect
	function streamText(element, text, speed = 20) {
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

	// === Drop-in replacement ===
	function createHealthDashboard(res) {
	  // One-time style injection (compact dark theme)
	  if (!document.getElementById('health-dashboard-styles')) {
	    const style = document.createElement('style');
	    style.id = 'health-dashboard-styles';
	    style.textContent = `
      :root{
        --hx-bg:#0b0c11;          /* app bg */
        --hx-card:#10131a;        /* card bg */
        --hx-card-2:#0d1017;      /* alt bg */
        --hx-border:#1a2030;      /* border */
        --hx-text:#f2f5fa;        /* text */
        --hx-muted:#9da7ba;       /* muted */
        --hx-accent:#ff4d5a;      /* coral red */
        --hx-indigo:#6d6cff;      /* indigo */
        --hx-teal:#32d4a4;        /* teal */
        --hx-good:#2edb8a; --hx-warn:#ffb020; --hx-bad:#ff6b6b;
      }
      .health-dashboard{color:var(--hx-text); font-size:13px; line-height:1.35; max-width:100%; overflow-x:hidden}
      .hd-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
      .hd-card{ background:linear-gradient(180deg,var(--hx-card),var(--hx-card-2)); border:1px solid var(--hx-border); border-radius:14px; padding:12px; box-shadow:0 6px 20px rgba(0,0,0,.22); }
      .pill{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; background:#131826; border:1px solid var(--hx-border); font-weight:700; }
      .pill .sub{ font-size:11px; color:var(--hx-muted); font-weight:600 }
      /* Ring */
      .ring-wrap{ display:flex; align-items:center; gap:12px; }
      .ring{ --p:0; width:92px; height:92px; border-radius:50%; background:conic-gradient(var(--hx-accent) calc(var(--p)*1%), #2a2f3b 0); display:grid; place-items:center; position:relative }
      .ring::after{ content:""; width:74px; height:74px; border-radius:50%; background:linear-gradient(180deg,var(--hx-card),var(--hx-card-2)); box-shadow: inset 0 0 0 1px var(--hx-border) }
      .ring-val{ position:absolute; font-weight:800; font-size:14px }
      .note{ color:var(--hx-muted); font-size:11px }
      /* KPIs */
      .kpi-grid{ display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; }
      .kpi{ text-align:center; padding:10px 6px; border-radius:12px; background:#0f1320; border:1px solid var(--hx-border); }
      .kpi .name{ font-size:10px; color:var(--hx-muted); margin-bottom:2px }
      .kpi .val{ font-weight:800; font-size:16px }
      .kpi .unit{ font-size:10px; color:var(--hx-muted) }
      /* Recovery */
      .recovery{ display:flex; align-items:center; gap:10px; padding:10px; border-radius:12px; background:linear-gradient(180deg,#121522,#0f131e); border:1px solid var(--hx-border) }
      .recovery .dot{ width:10px; height:10px; border-radius:50% }
      .recovery.green .dot{ background:var(--hx-good) }
      .recovery.yellow .dot{ background:var(--hx-warn) }
      .recovery.red .dot{ background:var(--hx-bad) }
      .recovery .lbl{ font-weight:800 }
      /* Sleep stages tiny bars */
      .sleep .bars{ display:flex; align-items:flex-end; gap:2px; height:54px }
      .sbar{ width:5px; border-radius:3px; background:#2a3a63 }
      .sbar.d{ background:#7a63ff } .sbar.l{ background:#97b0ff } .sbar.r{ background:#c0dcff } .sbar.a{ background:#ff6b6b }
      .legend{ display:flex; gap:12px; margin-top:6px; color:var(--hx-muted); font-size:10px }
      .legend i{ width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px }
      /* Trend bars */
      .trend{ display:flex; gap:6px; align-items:flex-end; height:66px }
      .tbar{ width:9px; background:linear-gradient(180deg,#1a2233,#121a2a); border:1px solid #263146; border-radius:6px }
      .tbar.f{ background:linear-gradient(180deg,var(--hx-indigo),#3046c9 70%, #1b2a7a); border-color:#3b52d6 }
      .title{ font-weight:800; margin-bottom:6px }
      .daily{ margin-top:10px; padding:10px; border-radius:12px; background:linear-gradient(180deg,#121725,#0f131f); border:1px solid var(--hx-border) }
    `;
	    document.head.appendChild(style);
	  }

	  // Data
	  const health = res.healthMetrics || {};
	  const rec = res.recovery || {};
	  const coach = res.coachingData || {};

	  // Ring progress (prefer calories; else steps)
	  const calories = health.activity?.calories || 0;
	  const calGoal = health.activity?.calorieGoal || 1500;
	  const steps = health.activity?.avgDailySteps || 8000;
	  const stepGoal = health.activity?.stepsGoal || 10000;
	  const ringPct = Math.max(0, Math.min(100, Math.round((calories && calGoal ? calories/calGoal : steps/stepGoal) * 100)));
	  const ringLabel = calories ? `${calories}/${calGoal} kcal` : `${steps}/${stepGoal} steps`;

	  // Sleep bars (deterministic)
	  const heights = [14,10,18,8,19,12,21,10,17,15,19,11];
	  const types = ['d','l','r','a'];
	  const sleepBars = Array.from({length:48}, (_,i)=>`<div class="sbar ${types[i%4]}" style="height:${heights[i%heights.length]}px"></div>`).join('');

	  // Trend bars
	  const series = health.activity?.last7DaysSteps || [];
	  const avg = steps;
	  const vals = Array.from({length:7}, (_,i)=> series[i] ?? avg * (0.8 + (i%3)*0.1));
	  const mx = Math.max(15000, ...vals);
	  const tBars = vals.map(v=>`<div class="tbar f" style="height:${Math.max(6, Math.min(100, Math.round(v/mx*100)))}%"></div>`).join('');

	  // KPIs (only render what exists)
	  const kpis = [];
	  if (health.sleep?.avgDurationMin) kpis.push({name:'Avg Sleep', val:`${(health.sleep.avgDurationMin/60).toFixed(1)}`, unit:'h'});
	  if (typeof health.sleep?.efficiencyPct === 'number') kpis.push({name:'Sleep Eff.', val:`${Math.round(health.sleep.efficiencyPct)}%`});
	  if (health.activity?.avgDailySteps) kpis.push({name:'Steps / day', val:`${Math.round(health.activity.avgDailySteps/1000)}k`});
	  if (typeof health.activity?.activeDaysOver8k === 'number') kpis.push({name:'Active Days', val:`${health.activity.activeDaysOver8k}`});
	  const kpiHtml = kpis.map(k=>`<div class="kpi"><div class="name">${k.name}</div><div class="val">${k.val} <span class="unit">${k.unit||''}</span></div></div>`).join('');

	  // Recovery
	  const recColor = (rec.recoveryColor || 'green').toLowerCase();
	  const sleepDebt = coach.sleepDebt || `${Math.round((health.sleep?.weeklyDebtMin||240)/60)}h debt`;
	  const strain = rec.currentStrain || 'low';

	  // Header pills (like reference: total kcal + days completed)
	  const totalKcal = health.activity?.weekCalories; // optional
	  const daysDone = coach.daysCompleted; // optional

	  // HTML
	  return `
    <div class="health-dashboard">
      <div class="hd-grid">
        <div class="pill"><span class="sub">Total kcal burned</span><span>${totalKcal ?? '—'}</span></div>
        <div class="pill"><span class="sub">Days completed</span><span>${daysDone ?? '—'} days</span></div>
      </div>

      <div class="hd-card" style="margin-top:10px;">
        <div class="ring-wrap">
          <div class="ring" style="--p:${ringPct};"><span class="ring-val">${ringPct}%</span></div>
          <div>
            <div class="title">Today</div>
            <div class="note">${ringLabel}</div>
          </div>
        </div>
        ${kpiHtml ? `<div class="kpi-grid" style="margin-top:12px;">${kpiHtml}</div>` : ''}
      </div>

      <div class="recovery ${recColor}" style="margin-top:10px;">
        <div class="dot"></div>
        <div>
          <div class="lbl">${recColor==='green'?'Optimal Recovery':recColor==='yellow'?'Moderate Recovery':'Low Recovery'}</div>
          <div class="note"><strong>Sleep debt:</strong> ${sleepDebt} &nbsp;|&nbsp; <strong>Strain:</strong> ${strain}</div>
        </div>
      </div>

      <div class="hd-card sleep" style="margin-top:10px;">
        <div class="title">Sleep Stages (last night)</div>
        <div class="bars">${sleepBars}</div>
        <div class="legend"><span><i style="background:#7a63ff"></i>Deep</span><span><i style="background:#97b0ff"></i>Light</span><span><i style="background:#c0dcff"></i>REM</span><span><i style="background:#ff6b6b"></i>Awake</span></div>
      </div>

      <div class="hd-card" style="margin-top:10px;">
        <div class="title">Activity Trend (7 days)</div>
        <div class="trend">${tBars}</div>
      </div>

      <div class="daily"><strong>Today’s plan:</strong> ${coach.todayPlan || `Keep bedtime near ${coach.weekdayBedtime || '10:30 pm'} and add a ${coach.z2Mins||35}–${(coach.z2Mins?coach.z2Mins+10:45)} min Zone‑2.`}</div>
    </div>
    <div class="summary-force health-output"></div>
  `;
	}

	function parseSleepPlanTable(content) {
		// Extract table data and format as proper HTML table
		const tableMatch = content.match(/\| Day.*?\|[\s\S]*?(?=\n\n|$)/);
		if (!tableMatch)
			return `<div style="font-size: 10px;">${content.replace(
				/\n/g,
				"<br>"
			)}</div>`;

		const rows = tableMatch[0]
			.split("\n")
			.filter((row) => row.includes("|") && !row.includes("---"));
		let table = '<table class="health-table">';

		rows.forEach((row, index) => {
			const cells = row
				.split("|")
				.map((cell) => cell.trim())
				.filter((cell) => cell);
			if (index === 0) {
				table +=
					"<tr>" + cells.map((cell) => `<th>${cell}</th>`).join("") + "</tr>";
			} else {
				table +=
					"<tr>" + cells.map((cell) => `<td>${cell}</td>`).join("") + "</tr>";
			}
		});

		table += "</table>";
		return table;
	}

	function parseTrainingPlan(content) {
		const lines = content.split("\n").filter((l) => l.trim());
		let result = '<div style="font-size: 10px; line-height: 1.4;">';

		lines.forEach((line) => {
			if (line.includes("Day ")) {
				result += `<div style="margin: 8px 0 4px 0; font-weight: 600; color: var(--accent);">${line.replace(
					/\*\*/g,
					""
				)}</div>`;
			} else if (line.trim().startsWith("-") || line.trim().startsWith("•")) {
				result += `<div style="margin-left: 12px; margin: 2px 0; color: var(--muted);">${line.replace(
					/^\s*[-•]\s*/,
					"• "
				)}</div>`;
			} else if (line.trim()) {
				result += `<div style="margin: 4px 0; color: var(--muted);">${line}</div>`;
			}
		});

		result += "</div>";
		return result;
	}

	function parseDietPlan(content) {
		const lines = content.split("\n").filter((l) => l.trim());
		let result = '<div style="font-size: 10px; line-height: 1.4;">';

		lines.forEach((line) => {
			if (
				line.includes("Calories") ||
				line.includes("Protein") ||
				line.includes("Carbs")
			) {
				result += `<div style="margin: 4px 0; font-weight: 600; color: var(--accent);">${line.replace(
					/\*\*/g,
					""
				)}</div>`;
			} else if (line.trim().startsWith("-") || line.trim().startsWith("•")) {
				result += `<div style="margin-left: 12px; margin: 2px 0; color: var(--muted);">${line.replace(
					/^\s*[-•]\s*/,
					"• "
				)}</div>`;
			} else if (line.trim()) {
				result += `<div style="margin: 4px 0; color: var(--muted);">${line}</div>`;
			}
		});

		result += "</div>";
		return result;
	}
	function showSummaryView() {
		controls.classList.add("hidden");
		summarySection.classList.remove("hidden");
	}
	function showControlsView() {
		summarySection.classList.add("hidden");
		controls.classList.remove("hidden");
		statusEl.textContent = "Idle";
		spinnerEl.classList.remove("show");
	}

	// Directory browse
	on("#browse", "click", async () => {
		try {
			if (!window.api || !window.api.pickDir) {
				console.error("[renderer] window.api.pickDir is missing");
				statusEl &&
					(statusEl.textContent = "Internal error: preload API not available.");
				return;
			}
			const dir = await window.api.pickDir();
			if (dir) $("#dir").value = dir;
		} catch (e) {
			statusEl && (statusEl.textContent = e?.message || String(e));
		}
	});

	// Run analysis based on selected mode
	async function runSummary() {
		const selectedMode =
			document.querySelector('input[name="mode"]:checked')?.value ||
			"summarizer";
		const config = modeConfig[selectedMode];
		const dirPath = $("#dir").value;
		const userPrompt = $("#prompt").value.trim();

		if (!userPrompt) {
			statusEl.textContent = "Please enter a prompt.";
			return;
		}

		// Only check for directory if the mode requires files AND no directory is provided
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
						if (outEl) {
							outEl.innerHTML = `<div class="summary-force"></div>`;
							const summaryDiv = outEl.querySelector(".summary-force");
							showSummaryView();
							streamText(summaryDiv, res.output || "");
						}
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
					// Handle security mode with special visualization
					if (selectedMode === "security" && res.securityScore !== undefined) {
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
											<span class="risk-badge ${res.riskLevel.toLowerCase()}">${
								res.riskLevel
							} Risk</span>
										</div>
									</div>
								</div>
								<div class="summary-force"></div>
							`;
							const summaryDiv = outEl.querySelector(".summary-force");
							showSummaryView();
							streamText(summaryDiv, res.output || "");
						}
					} else if (
						selectedMode === "health" &&
						res.healthMetrics &&
						res.recovery
					) {
						// Handle health mode with comprehensive dashboard
						statusEl.textContent = `Health Analysis Complete. Sleep Score: ${
							res.healthMetrics.sleep?.sleepScore || 0
						}/100`;
						if (outEl) {
							outEl.innerHTML = createHealthDashboard(res);
							const summaryDiv = outEl.querySelector(".health-output");
							showSummaryView();

							// Format the health output for end users
							const formattedOutput = formatHealthOutput(res.output || "");
							summaryDiv.innerHTML = formattedOutput;
						}
					} else {
						statusEl.textContent = `Done. Files processed: ${res.fileCount}.`;
						if (outEl) {
							outEl.innerHTML = `<div class="summary-force"></div>`;
							const summaryDiv = outEl.querySelector(".summary-force");
							showSummaryView();
							// Stream the text with typing effect
							streamText(summaryDiv, res.output || "");
						}
					}
				}
			}
		} catch (e) {
			statusEl.textContent = e?.message || String(e);
		} finally {
			setBusy(false);
		}
	}

	// Wire buttons
	if (runBtn) runBtn.addEventListener("click", runSummary);
	else console.warn("[renderer] #run not found");

	// ⌘/Ctrl + Enter to run
	window.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			if (!summarySection.classList.contains("hidden")) return;
			runSummary();
		}
	});

	// Back to edit
	backBtn?.addEventListener("click", () => {
		showControlsView();
	});

	// Copy & Export in summary view
	on("#copy", "click", async () => {
		const text = outEl?.innerText || "";
		try {
			await navigator.clipboard.writeText(text);
			statusEl && (statusEl.textContent = "Copied to clipboard.");
		} catch {
			statusEl && (statusEl.textContent = "Copy failed.");
		}
	});

	on("#export", "click", () => {
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
		statusEl && (statusEl.textContent = "Exported as Markdown.");
	});
});
