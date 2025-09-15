import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Security Scanner - Safe system information gathering for AI analysis
 * Built for hackathon demo - production systems should use specialized security tools
 */

// Safe command execution with timeout and error handling
function safeExec(command, options = {}) {
	try {
		const result = execSync(command, {
			encoding: 'utf8',
			timeout: 5000, // 5 second timeout
			maxBuffer: 1024 * 1024, // 1MB max output
			...options
		});
		return result.trim();
	} catch (error) {
		console.warn(`[security-scanner] Command failed: ${command}`, error.message);
		return `Command failed: ${error.message}`;
	}
}

// System Information Gathering
export async function gatherSystemInfo() {
	const info = {
		timestamp: new Date().toISOString(),
		platform: os.platform(),
		arch: os.arch(),
		hostname: os.hostname(),
		uptime: os.uptime(),
		nodeVersion: process.version,
		findings: []
	};

	console.log('[security-scanner] Starting system security analysis...');

	try {
		// Basic system information
		info.osInfo = {
			platform: os.platform(),
			release: os.release(),
			arch: os.arch(),
			totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
			freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB'
		};

		// Network interfaces (safe - no external connections)
		info.networkInterfaces = Object.keys(os.networkInterfaces()).map(name => ({
			name,
			addresses: os.networkInterfaces()[name]
				?.filter(addr => addr.family === 'IPv4')
				?.map(addr => ({ address: addr.address, internal: addr.internal }))
		}));

		// Running processes (limited output for safety)
		if (os.platform() === 'darwin' || os.platform() === 'linux') {
			info.processes = safeExec('ps aux | head -20').split('\n').slice(1);
		} else if (os.platform() === 'win32') {
			info.processes = safeExec('tasklist /fo csv | findstr /i "exe"').split('\n').slice(0, 20);
		}

		// Open network connections (limited for security)
		if (os.platform() === 'darwin') {
			info.networkConnections = safeExec('lsof -i -n | head -20').split('\n').slice(1);
		} else if (os.platform() === 'linux') {
			info.networkConnections = safeExec('netstat -tuln | head -20').split('\n').slice(1);
		} else if (os.platform() === 'win32') {
			info.networkConnections = safeExec('netstat -an | findstr LISTEN').split('\n').slice(0, 20);
		}

		// Environment variables (filtered for security)
		info.environmentVars = Object.keys(process.env)
			.filter(key => !key.includes('KEY') && !key.includes('TOKEN') && !key.includes('PASSWORD'))
			.map(key => ({ name: key, value: process.env[key]?.substring(0, 50) + '...' }))
			.slice(0, 20);

		// File permissions check on sensitive areas (safe read-only checks)
		info.filePermissions = await checkFilePermissions();

		// Software versions (package managers)
		info.softwareVersions = await checkSoftwareVersions();

		console.log('[security-scanner] System analysis complete');
		return info;

	} catch (error) {
		console.error('[security-scanner] Error during system analysis:', error);
		info.error = error.message;
		return info;
	}
}

// Check file permissions on common sensitive locations
async function checkFilePermissions() {
	const permissions = [];
	const sensitiveFiles = [
		'/etc/passwd',
		'/etc/shadow', 
		'/etc/hosts',
		'~/.ssh/',
		'~/.aws/',
		process.cwd() // Current project directory
	];

	for (const filePath of sensitiveFiles) {
		try {
			const expandedPath = filePath.startsWith('~') ? 
				path.join(os.homedir(), filePath.substring(2)) : filePath;

			if (fs.existsSync(expandedPath)) {
				const stats = fs.statSync(expandedPath);
				permissions.push({
					path: filePath,
					exists: true,
					isDirectory: stats.isDirectory(),
					permissions: '0' + (stats.mode & parseInt('777', 8)).toString(8),
					owner: stats.uid,
					group: stats.gid
				});
			} else {
				permissions.push({
					path: filePath,
					exists: false
				});
			}
		} catch (error) {
			permissions.push({
				path: filePath,
				error: error.message
			});
		}
	}

	return permissions;
}

// Check software versions for known vulnerabilities
async function checkSoftwareVersions() {
	const versions = [];

	const commands = {
		node: 'node --version',
		npm: 'npm --version',
		git: 'git --version',
		python: 'python3 --version',
		docker: 'docker --version',
		curl: 'curl --version | head -1',
		ssh: 'ssh -V'
	};

	for (const [software, command] of Object.entries(commands)) {
		const version = safeExec(command);
		versions.push({
			software,
			version: version.substring(0, 100), // Limit output length
			command
		});
	}

	return versions;
}

// Analyze security findings and generate risk scores
export function analyzeSecurityRisks(systemInfo) {
	const risks = [];
	let totalRiskScore = 0;

	// Check for common security issues
	
	// 1. Open network connections analysis
	if (systemInfo.networkConnections?.length > 15) {
		risks.push({
			type: 'network',
			severity: 'medium',
			title: 'Many Open Network Connections',
			description: `Found ${systemInfo.networkConnections.length} network connections. Review for unnecessary services.`,
			recommendation: 'Close unused network services and ports'
		});
		totalRiskScore += 30;
	}

	// 2. Environment variable exposure
	const suspiciousEnvVars = systemInfo.environmentVars?.filter(env => 
		env.name.toLowerCase().includes('api') || 
		env.name.toLowerCase().includes('secret') ||
		env.name.toLowerCase().includes('config')
	) || [];

	if (suspiciousEnvVars.length > 0) {
		risks.push({
			type: 'configuration',
			severity: 'high',
			title: 'Potentially Sensitive Environment Variables',
			description: `Found ${suspiciousEnvVars.length} environment variables that may contain sensitive data.`,
			recommendation: 'Review environment variables for exposed secrets'
		});
		totalRiskScore += 50;
	}

	// 3. File permission analysis
	const worldWritableFiles = systemInfo.filePermissions?.filter(file => 
		file.permissions?.endsWith('7') || file.permissions?.endsWith('6')
	) || [];

	if (worldWritableFiles.length > 0) {
		risks.push({
			type: 'filesystem',
			severity: 'high',
			title: 'World-Writable Files Detected',
			description: `Found ${worldWritableFiles.length} files with overly permissive write permissions.`,
			recommendation: 'Restrict file permissions to minimum required access'
		});
		totalRiskScore += 60;
	}

	// 4. Software version analysis
	const outdatedSoftware = systemInfo.softwareVersions?.filter(sw => 
		sw.version.includes('error') || sw.version.includes('not found')
	) || [];

	if (outdatedSoftware.length > 0) {
		risks.push({
			type: 'software',
			severity: 'medium', 
			title: 'Missing Security Tools',
			description: `Some security-related software appears to be missing or inaccessible.`,
			recommendation: 'Ensure essential security tools are installed and updated'
		});
		totalRiskScore += 25;
	}

	// Calculate overall security score (0-100, higher is better)
	const securityScore = Math.max(0, 100 - totalRiskScore);

	return {
		risks,
		totalRiskScore,
		securityScore,
		riskLevel: securityScore > 80 ? 'Low' : securityScore > 60 ? 'Medium' : 'High',
		scanTimestamp: new Date().toISOString()
	};
}