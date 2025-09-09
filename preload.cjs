const { contextBridge, ipcRenderer } = require("electron");

console.log("[preload] loaded");

contextBridge.exposeInMainWorld("api", {
	pickDir: () => ipcRenderer.invoke("pick-dir"),
	runSummary: (payload) => ipcRenderer.invoke("run-summary", payload),
	runAgent: (payload) => ipcRenderer.invoke("agent:run", payload),
	minimize: () => ipcRenderer.invoke("app/minimize"),
	close: () => ipcRenderer.invoke("app/close"),
	togglePin: () => ipcRenderer.invoke("app/toggle-pin"),
});

console.log(
	"[preload] api exposed: pickDir, runSummary, runAgent, minimize, close, togglePin"
);
