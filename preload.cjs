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

// Voice API for voice-agent integration
contextBridge.exposeInMainWorld("electronAPI", {
	// Voice input controls
	startVoice: (options) => ipcRenderer.invoke("voice:start", options),
	stopVoice: () => ipcRenderer.invoke("voice:stop"),
	getVoiceStatus: () => ipcRenderer.invoke("voice:status"),
	voiceAvailable: () => ipcRenderer.invoke("voice:available"),
	
	// Agent integration
	runAgent: (payload) => ipcRenderer.invoke("agent:run", payload),
	
	// Event listeners for voice events
	onVoiceEvent: (callback) => {
		const handler = (event, data) => callback(data);
		ipcRenderer.on("voice:event", handler);
		// Return cleanup function
		return () => ipcRenderer.removeListener("voice:event", handler);
	},
	
	onAgentResponse: (callback) => {
		const handler = (event, data) => callback(data);
		ipcRenderer.on("agent:response", handler);
		// Return cleanup function  
		return () => ipcRenderer.removeListener("agent:response", handler);
	}
});

console.log(
	"[preload] api exposed: pickDir, runSummary, runAgent, minimize, close, togglePin"
);

console.log(
	"[preload] electronAPI exposed: startVoice, stopVoice, getVoiceStatus, onVoiceEvent, onAgentResponse"
);
