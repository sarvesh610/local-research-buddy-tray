import {
	app,
	BrowserWindow,
	Tray,
	Menu,
	ipcMain,
	dialog,
	nativeImage,
	screen,
} from "electron";

import path from "path";
import url from "url";
import fs from "fs";
import "dotenv/config";

// Ensure single instance; focus existing window if app is launched again
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	app.quit();
	process.exit(0);
} else {
	app.on("second-instance", () => {
		if (win) showWidget();
	});
}

let tray = null;
let win = null;

const createWindow = () => {
	const appPath = app.getAppPath();
	const preloadPath = path.join(appPath, "preload.cjs");
	const rendererPath = path.join(appPath, "renderer.html");

	console.log("[main] appPath:", appPath);
	console.log("[main] preload exists:", fs.existsSync(preloadPath));
	console.log("[main] versions:", {
		electron: process.versions.electron,
		node: process.versions.node,
		chrome: process.versions.chrome,
	});

	const { workAreaSize } = screen.getPrimaryDisplay();
	const maxH = Math.max(400, Math.floor(workAreaSize.height * 0.8));
	const desiredWidth = 500;
	const desiredHeight = Math.min(520, maxH);

	win = new BrowserWindow({
		width: desiredWidth,
		height: desiredHeight,
		minWidth: 420,
		minHeight: 420,
		show: false, // show after ready-to-show
		resizable: true,
		frame: false, // ✅ no system titlebar or traffic lights
		transparent: true, // ✅ allows organic shape
		backgroundColor: "#00000000",
		fullscreenable: false,
		hasShadow: false,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	// macOS: explicitly hide native traffic lights
	if (
		process.platform === "darwin" &&
		typeof win.setWindowButtonVisibility === "function"
	) {
		try {
			win.setWindowButtonVisibility(false);
		} catch {}
	}

	win.loadURL(
		url.format({ pathname: rendererPath, protocol: "file:", slashes: true })
	);

	win.once("ready-to-show", () => {
		win.center();
		win.show();
	});

	// Keep commented while debugging
	// win.on('blur', () => { if (process.platform !== 'darwin') win.hide(); });
};

function showWidget() {
	if (!win) return;
	try {
		if (win.isMinimized()) win.restore();
		win.center();
		win.showInactive();
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		win.focus();
		win.setAlwaysOnTop(true, "status");
		setTimeout(() => {
			win.setAlwaysOnTop(false);
			win.setVisibleOnAllWorkspaces(false);
		}, 300);
	} catch (e) {
		console.error("showWidget error:", e);
	}
}

const createTray = () => {
	const image = getTrayImage();
	tray = new Tray(image);
	tray.setToolTip("Local Research Buddy");
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: "Open", click: () => showWidget() },
			{ type: "separator" },
			{ label: "Quit", click: () => app.quit() },
		])
	);
	tray.on("click", () => showWidget());
	tray.setIgnoreDoubleClickEvents(true);
};

app.whenReady().then(() => {
	console.log("Electron app ready");
	createWindow();
	createTray();
	setTimeout(() => showWidget(), 50);
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (!win) {
		createWindow();
		createTray();
		setTimeout(() => showWidget(), 50);
	} else {
		showWidget();
	}
});

// Lightweight check for presence of voice transcription binary
ipcMain.handle("voice:available", async () => {
    try {
        const possible = [
            path.join(process.cwd(), 'src/voice/whisper-binary/LucidTalkStreamer'),
            path.join(app.getAppPath(), 'src/voice/whisper-binary/LucidTalkStreamer'),
            path.join(process.resourcesPath || '', 'app.asar.unpacked/src/voice/whisper-binary/LucidTalkStreamer')
        ].filter(Boolean);
        for (const p of possible) {
            try {
                const st = fs.statSync(p);
                if (st.isFile()) return { available: true, path: p };
            } catch {}
        }
        return { available: false };
    } catch (e) {
        return { available: false, error: e?.message };
    }
});

ipcMain.handle("pick-dir", async () => {
	console.log("[ipc] pick-dir invoked");
	const result = await dialog.showOpenDialog(win, {
		properties: ["openDirectory"],
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	console.log("[ipc] pick-dir selected:", result.filePaths[0]);
	return result.filePaths[0];
});

import { summarizeDirectory } from "./src/core/summarizer.js";
import { runAgent } from "./src/agent/agent.js";
import { voiceManager } from "./src/voice/transcription-manager.js";

ipcMain.handle("run-summary", async (_evt, payload) => {
	const { dirPath, userPrompt, options } = payload || {};
	console.log("[ipc] run-summary payload:", {
		dirPath,
		userPromptLen: (userPrompt || "").length,
		options,
	});
	console.time("[ipc] run-summary time");
	
	// Let the summarizer handle directory validation based on mode
	try {
		const result = await summarizeDirectory(
			dirPath,
			userPrompt || "",
			options || {}
		);
		console.log("[ipc] run-summary result meta:", {
			ok: result?.ok,
			fileCount: result?.fileCount,
			tokens: result?.tokens,
			error: result?.error,
		});
		console.timeEnd("[ipc] run-summary time");
		return { ok: true, ...result };
	} catch (err) {
		console.timeEnd("[ipc] run-summary time");
		console.error("run-summary error:", err);
		return { ok: false, error: err?.message || String(err) };
	}
});


ipcMain.handle("app/minimize", () => {
	if (win) win.minimize();
});
ipcMain.handle("app/close", () => {
	if (win) win.hide();
});
ipcMain.handle("app/toggle-pin", () => {
	if (!win) return false;
	const newVal = !win.isAlwaysOnTop();
	win.setAlwaysOnTop(newVal, "screen-saver");
	return newVal;
});

// Voice Integration IPC Handlers
ipcMain.handle("voice:start", async (_evt, options = {}) => {
	console.log("[ipc] voice:start invoked with options:", options);
	
	try {
		// Resolve default Whisper model path if not provided
		let modelPath = options.modelPath || process.env.WHISPER_MODEL_PATH || process.env.WHISPER_MODEL;
        if (!modelPath) {
            const candidates = [
                path.join(app.getPath('documents'), 'models/ggml-base.en.bin'),
                path.join(app.getPath('documents'), 'models/ggml-small.en.bin'),
                path.join(app.getPath('documents'), 'models/ggml-base.bin'),
                path.join(app.getPath('documents'), 'models/ggml-small.bin'),
                path.join(process.cwd(), 'src/voice/models/ggml-base.en.bin'),
                path.join(process.cwd(), 'src/voice/models/ggml-small.en.bin'),
                path.join(process.cwd(), 'src/voice/models/ggml-base.bin'),
                path.join(process.cwd(), 'src/voice/models/ggml-small.bin')
            ];
			for (const c of candidates) {
				try { if (fs.existsSync(c)) { modelPath = c; break; } } catch {}
			}
		}
		const startOpts = { ...options, ...(modelPath ? { modelPath } : {}) };
		if (modelPath) console.log('[voice] Using Whisper model:', modelPath);
		else console.warn('[voice] No Whisper model path resolved. The streamer may fail to start.');
		await voiceManager.startVoiceInput(startOpts);
		
		// Set up voice event forwarding to renderer
		const forwardVoiceEvent = (eventType, data) => {
			if (win && !win.isDestroyed()) {
				win.webContents.send("voice:event", { type: eventType, data });
			}
		};
		
		// Forward voice events to renderer
		voiceManager.on('voice:transcription', (data) => forwardVoiceEvent('transcription', data));
		voiceManager.on('voice:status', (data) => forwardVoiceEvent('status', data));
		voiceManager.on('voice:error', (error) => forwardVoiceEvent('error', { message: error.message }));
		voiceManager.on('voice:stopped', (data) => forwardVoiceEvent('stopped', data));
		
		// Handle voice commands and forward to agent
		voiceManager.on('voice:command', async (commandData) => {
			console.log("[voice] Processing voice command:", commandData.transcript);
			
			try {
				// Process voice command through agent
				const agentResult = await runAgent({
					messages: [{ role: 'user', content: commandData.transcript }],
					maxSteps: 6
				});
				
				// Forward agent response to renderer
				if (win && !win.isDestroyed()) {
					win.webContents.send("agent:response", {
						final: agentResult.final || "No response generated.",
						steps: agentResult.steps,
						success: agentResult.ok
					});
				}
				
			} catch (error) {
				console.error("[voice] Agent processing failed:", error);
				if (win && !win.isDestroyed()) {
					win.webContents.send("agent:response", {
						final: `Error processing command: ${error.message}`,
						steps: 0,
						success: false
					});
				}
			}
		});
		
		return { success: true };
		
	} catch (error) {
		console.error("[ipc] voice:start failed:", error);
		return { success: false, error: error.message };
	}
});

ipcMain.handle("voice:stop", async (_evt) => {
	console.log("[ipc] voice:stop invoked");
	
	try {
		const result = await voiceManager.stopVoiceInput();
		const finalTranscript = voiceManager.getFinalTranscript();
		
		// Remove all listeners to prevent memory leaks
		voiceManager.removeAllListeners();
		
		return { 
			success: true, 
			finalTranscript,
			transcripts: result?.transcripts || []
		};
		
	} catch (error) {
		console.error("[ipc] voice:stop failed:", error);
		return { success: false, error: error.message };
	}
});

ipcMain.handle("voice:status", async (_evt) => {
	return voiceManager.getVoiceStatus();
});

// Enhanced agent handler to support voice integration
ipcMain.handle("agent:run", async (_evt, payload) => {
	const { messages, maxSteps = 6, dirPath, userPrompt } = payload || {};
	console.log("[ipc] agent:run payload:", {
		messagesCount: messages?.length || 0,
		userPromptLen: (userPrompt || "").length,
		dirPath,
		maxSteps,
	});
	console.time("[ipc] agent:run time");
	
	try {
		// Use provided messages or construct from userPrompt
		const agentMessages = messages || [
			{ 
				role: 'user', 
				content: `Task: ${userPrompt || 'Analyze this directory for key themes and findings.'}
Directory: ${dirPath || 'Not specified'}

If the directory is provided, you can use tools like list_files, read_text, or summarize_dir. 
Provide a final answer with specific citations and actionable insights.` 
			}
		];

		const result = await runAgent({ 
			messages: agentMessages, 
			maxSteps 
		});
		
		console.log("[ipc] agent:run result meta:", {
			ok: result?.ok,
			steps: result?.steps,
			finalLength: (result?.final || "").length,
		});
		console.timeEnd("[ipc] agent:run time");
		
		return { 
			ok: result.ok,
			output: result.final || "No final answer provided.",
			steps: result.steps,
			fileCount: 0 // Agents don't have a fixed file count
		};
	} catch (err) {
		console.timeEnd("[ipc] agent:run time");
		console.error("agent:run error:", err);
		return { 
			ok: false, 
			error: err?.message || String(err),
			output: "",
			steps: 0
		};
	}
});

function getTrayImage() {
	// Try app icon; if not found, use a 16x16 blank PNG so Tray always initializes.
	const iconPath = path.join(process.cwd(), "icon.png");
	if (fs.existsSync(iconPath)) {
		const img = nativeImage.createFromPath(iconPath);
		if (!img.isEmpty()) return img;
	}
	// tiny transparent png fallback
	const png1x1 =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgQ2+1hEAAAAASUVORK5CYII=";
	return nativeImage.createFromDataURL(`data:image/png;base64,${png1x1}`);
}
