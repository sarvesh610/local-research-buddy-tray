const { contextBridge, ipcRenderer } = require("electron");

console.log("[preload] loaded");

contextBridge.exposeInMainWorld("api", {
	pickDir: () => ipcRenderer.invoke("pick-dir"),
	runSummary: (payload) => ipcRenderer.invoke("run-summary", payload),
	minimize: () => ipcRenderer.invoke("app/minimize"),
	close: () => ipcRenderer.invoke("app/close"),
	togglePin: () => ipcRenderer.invoke("app/toggle-pin"),
});

console.log(
	"[preload] api exposed: pickDir, runSummary, minimize, close, togglePin"
);
