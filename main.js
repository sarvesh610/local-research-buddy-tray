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

ipcMain.handle("pick-dir", async () => {
	console.log("[ipc] pick-dir invoked");
	const result = await dialog.showOpenDialog(win, {
		properties: ["openDirectory"],
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	console.log("[ipc] pick-dir selected:", result.filePaths[0]);
	return result.filePaths[0];
});

import { summarizeDirectory } from "./summarizer.js";

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
