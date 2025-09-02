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
			placeholder: "e.g., Summarize key themes and list top 5 findings with citations.",
			directoryLabel: "Directory",
			buttonText: "Summarize",
			requiresFiles: true
		},
		email: {
			placeholder: "e.g., Write a professional follow-up email based on these meeting notes.",
			directoryLabel: "Documents (optional)",
			buttonText: "Generate Email",
			requiresFiles: false
		},
		analyzer: {
			placeholder: "e.g., Analyze the codebase structure and identify key components and dependencies.",
			directoryLabel: "Project Directory",
			buttonText: "Analyze Code",
			requiresFiles: true
		},
		generator: {
			placeholder: "e.g., Generate a React component for user authentication with form validation.",
			directoryLabel: "Reference Code (optional)",
			buttonText: "Generate Code",
			requiresFiles: false
		}
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
		document.documentElement.setAttribute('data-mode', mode);
		
		promptEl.placeholder = config.placeholder;
		runBtn.innerHTML = `<span class="dot"></span> ${config.buttonText}`;
		
		// Update directory label and show/hide directory section
		const dirLabel = Array.from(document.querySelectorAll('label.small')).find(label => 
			label.textContent.includes('Directory') || label.nextElementSibling?.querySelector('#dir')
		);
		if (dirLabel) {
			dirLabel.textContent = config.directoryLabel;
		}
		
		// Show/hide directory section based on mode requirements
		const dirRow = dirLabel?.nextElementSibling;
		if (dirRow) {
			if (config.requiresFiles) {
				dirRow.style.opacity = '1';
				dirRow.style.pointerEvents = 'auto';
			} else {
				dirRow.style.opacity = '0.5';
				dirRow.style.pointerEvents = 'auto'; // Keep functional but dimmed
			}
		}
	}
	
	// Handle mode changes
	document.querySelectorAll('input[name="mode"]').forEach(radio => {
		radio.addEventListener('change', (e) => {
			if (e.target.checked) {
				updateUIForMode(e.target.value);
			}
		});
	});
	
	// Initialize with default mode
	updateUIForMode('summarizer');

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
		element.textContent = '';
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
		const selectedMode = document.querySelector('input[name="mode"]:checked')?.value || 'summarizer';
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
			const options = {
				include: {
					pdf: $("#includePdf")?.checked ?? true,
					docx: $("#includeDocx")?.checked ?? true,
					csv: $("#includeCsv")?.checked ?? true,
					md: $("#includeMd")?.checked ?? true,
				},
				mode: selectedMode
			};
			const payload = { dirPath, userPrompt, options };
			const res = await window.api?.runSummary(payload);
			if (!res || !res.ok) {
				statusEl.textContent = res?.error || "Something went wrong.";
			} else {
				statusEl.textContent = `Done. Files processed: ${res.fileCount}.`;
				if (outEl) {
					outEl.innerHTML = `<div class="summary-force"></div>`;
					const summaryDiv = outEl.querySelector('.summary-force');
					showSummaryView();
					// Stream the text with typing effect
					streamText(summaryDiv, res.output || '');
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
