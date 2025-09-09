import fs from "fs";
import path from "path";
import fg from "fast-glob";
import OpenAI from "openai";
import { gatherSystemInfo, analyzeSecurityRisks } from "./security-scanner.js";
import { analyzeHealthData } from "./health-analyzer.js";

// AI Provider Configuration - Ready for Qvac SDK
const PROVIDER = process.env.AI_PROVIDER || "openai";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const QVAC_API_KEY = process.env.QVAC_API_KEY || "";
const QVAC_MODEL = process.env.QVAC_MODEL || "default";

const MAX_FILES = Number(process.env.MAX_FILES || 40);
const MAX_CHARS = Number(process.env.MAX_CHARS || 120_000);

const shortPath = (p) => p.replaceAll("\\", "/");
const ext = (p) => path.extname(p).toLowerCase();

async function readTextFile(fp) {
	try {
		return fs.readFileSync(fp, "utf8");
	} catch {
		return "";
	}
}
async function readPdf(fp) {
	// Try pdf-parse first (fast + simple)
	try {
		const mod = await import("pdf-parse");
		const pdfParse = mod.default || mod;
		const buf = fs.readFileSync(fp);
		const d = await pdfParse(buf);
		if (d && d.text) return d.text;
	} catch (e) {
		console.warn(
			"[summarizer] pdf-parse failed, will try pdfjs-dist fallback:",
			e?.message || e
		);
	}

	// Fallback to pdfjs-dist (robust)
	try {
		// Set up pdfjs-dist for Node.js
		const pdfjs = await import("pdfjs-dist");
		const pdf_lib = pdfjs.default || pdfjs;
		
		const data = new Uint8Array(fs.readFileSync(fp));
		const loadingTask = pdf_lib.getDocument({
			data,
			useSystemFonts: true,
			standardFontDataUrl: undefined // Disable loading external fonts
		});
		const pdf = await loadingTask.promise;

		let fullText = "";
		const numPages = Math.min(pdf.numPages, 50);
		for (let i = 1; i <= numPages; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			const strings = content.items?.map((it) => it.str).filter(Boolean) || [];
			fullText += `\n\n[Page ${i}]\n` + strings.join(" ");
		}
		return fullText.trim();
	} catch (e2) {
		console.warn("[summarizer] pdfjs-dist fallback failed:", e2?.message || e2);
		return "";
	}
}
async function readDocx(fp) {
	try {
		const mod = await import("mammoth");
		const mammoth = mod.default || mod;
		const r = await mammoth.extractRawText({ path: fp });
		return r?.value || "";
	} catch (e) {
		console.warn("[summarizer] DOCX read skipped:", e?.message || e);
		return "";
	}
}
async function readCsv(fp) {
	try {
		const mod = await import("csv-parse/sync");
		const parse = mod.parse || mod.default || mod;
		const raw = fs.readFileSync(fp, "utf8");
		const rows = parse(raw, { skip_empty_lines: true });
		return rows
			.slice(0, 20)
			.map((r) => r.join("\t"))
			.join("\n");
	} catch (e) {
		console.warn("[summarizer] CSV read skipped:", e?.message || e);
		return "";
	}
}
async function extractTextForFile(fp) {
	const e = ext(fp);
	if (e === ".pdf") return await readPdf(fp);
	if (e === ".docx") return await readDocx(fp);
	if (e === ".csv") return await readCsv(fp);
	if (e === ".md" || e === ".txt" || e === ".log")
		return await readTextFile(fp);
	return "";
}
function fileMatcher(options) {
	const inc = options?.include || {
		pdf: true,
		docx: true,
		csv: true,
		md: true,
	};
	const globs = [];
	if (inc.pdf) globs.push("**/*.pdf");
	if (inc.docx) globs.push("**/*.docx");
	if (inc.csv) globs.push("**/*.csv");
	if (inc.md) globs.push("**/*.{md,txt,log}");
	return globs.length ? globs : ["**/*.{md,txt}"];
}

function getModePrompts(mode, userPrompt, docs) {
	const headers = docs.map((d) => `• ${d.rel}`).join("\n");
	const combined = docs
		.map((d) => `\n\n===== BEGIN ${d.rel} =====\n${d.text}\n===== END ${d.rel} =====`)
		.join("");

	const prompts = {
		summarizer: {
			system: "You are Local Research Buddy, a precise document summarizer. Analyze and summarize documents with clear structure and citations.",
			guidance: `Summarize the provided documents.\n\nUser request: ${userPrompt}\n\nGuidelines:\n- Use bullet points and clear structure\n- Always cite sources: (source: filename.ext)\n- End with Key Findings and Sources list\n\nFiles:\n${headers}`
		},
		email: {
			system: "You are an expert email writer. Create professional, well-structured emails based on the provided context and requirements.",
			guidance: `Write a professional email based on the context below.\n\nUser request: ${userPrompt}\n\nContext from files:\n${headers}\n\nInstructions:\n- Use professional email format (Subject, greeting, body, closing)\n- Be concise and actionable\n- Reference sources when relevant`
		},
		analyzer: {
			system: "You are a senior software architect and code analyst. Analyze codebases, identify patterns, architecture, and provide technical insights.",
			guidance: `Analyze the codebase structure and provide technical insights.\n\nUser request: ${userPrompt}\n\nFiles to analyze:\n${headers}\n\nProvide:\n- Architecture overview\n- Key components and their relationships\n- Technologies and frameworks used\n- Code quality observations\n- Recommendations`
		},
		generator: {
			system: "You are an expert software engineer. Generate clean, well-documented code based on requirements and reference materials.",
			guidance: `Generate code based on the requirements below.\n\nUser request: ${userPrompt}\n\nReference materials:\n${headers}\n\nGenerate:\n- Clean, well-commented code\n- Follow best practices\n- Include usage examples if applicable\n- Explain key design decisions`
		},
		security: {
			system: "You are a cybersecurity expert specializing in system security analysis and threat detection. Analyze system information for security vulnerabilities and provide actionable remediation advice.",
			guidance: `Perform a comprehensive security analysis of the system information provided.\n\nUser request: ${userPrompt}\n\nSystem data to analyze:\n${headers}\n\nProvide:\n- Risk assessment with severity levels\n- Specific security vulnerabilities identified\n- Prioritized remediation steps\n- Security best practices recommendations\n- Compliance considerations\n- Overall security score and rationale`
		},
		health: {
			system: "You are a health coach generating a 7-day sleep, training, and diet plan based on biometric data. Be specific but safe and realistic. Avoid medical claims.",
			guidance: `Generate personalized health coaching based on the Fitbit data provided.\n\nUser request: ${userPrompt}\n\nHealth metrics to analyze:\n${headers}\n\nConstraints:\n- Be specific but safe and realistic\n- If recovery is yellow/red or sleep efficiency <85%, reduce intensity and prioritize sleep\n- Use defined blocks: Sleep Plan, Training Plan, Diet Plan, Daily Card (for today), and Why (brief rationale with the metrics you used)\n- Keep diet suggestions generic and culturally flexible. Avoid medical claims.\n\nOutput sections:\n1) Daily Card (today's priority action)\n2) 7-Day Sleep Plan (specific bedtime schedule with rationale)\n3) 7-Day Training Plan (auto-adjust intensity based on recovery)\n4) Diet Plan (calories/macros + 4-6 meal ideas)\n5) Why (list the specific metrics that drove each recommendation)`
		}
	};

	return prompts[mode] || prompts.summarizer;
}

async function callOpenAI(userPrompt, docs, mode = 'summarizer') {
	if (!OPENAI_API_KEY) {
		return {
			error: "OPENAI_API_KEY is not set. Create a .env with OPENAI_API_KEY=...",
		};
	}
	console.log(
		`[summarizer] Calling OpenAI in ${mode} mode with`,
		docs.length,
		"docs and prompt length",
		(userPrompt || "").length
	);
	const client = new OpenAI({ apiKey: OPENAI_API_KEY });

	const combined = docs
		.map((d) => `\n\n===== BEGIN ${d.rel} =====\n${d.text}\n===== END ${d.rel} =====`)
		.join("");
	const ctx = combined.slice(0, MAX_CHARS);

	const modePrompts = getModePrompts(mode, userPrompt, docs);

	const messages = [
		{ role: "system", content: modePrompts.system },
		{ role: "user", content: modePrompts.guidance },
		{ role: "user", content: ctx },
	];
	console.log(
		"[summarizer] Sending request to OpenAI model",
		OPENAI_MODEL,
		"with",
		messages.length,
		"messages"
	);

	const resp = await client.chat.completions.create({
		model: OPENAI_MODEL,
		messages,
		temperature: 0.2,
	});
	console.log("[summarizer] OpenAI response received. Usage:", resp.usage);

	const text = resp.choices?.[0]?.message?.content?.trim() || "(no content)";
	return { output: text, tokens: resp.usage?.total_tokens || 0 };
}

// Qvac SDK integration placeholder
async function callQvac(userPrompt, docs, mode = 'summarizer') {
	// TODO: Implement when Qvac SDK is available
	console.log(`[summarizer] Qvac SDK not yet available, using fallback for ${mode} mode`);
	
	// Placeholder implementation - replace with actual Qvac SDK calls
	const modePrompts = getModePrompts(mode, userPrompt, docs);
	
	// For hackathon demo - simulate Qvac response structure
	return {
		output: `[Qvac SDK Mode: ${mode}]\n\n${modePrompts.guidance}\n\nThis is a placeholder for Qvac SDK integration. The full implementation will be added when the SDK is available.`,
		tokens: 0
	};
}

async function summarizeWithProvider(provider, userPrompt, docs, mode = 'summarizer') {
	console.log(`[summarizer] Using provider: ${provider} for mode: ${mode}`);
	
	switch (provider) {
		case "qvac":
			return await callQvac(userPrompt, docs, mode);
		case "openai":
			const r = await callOpenAI(userPrompt, docs, mode);
			if (r && r.error) return r;
			return r;
		default:
			// Fallback for unsupported providers
			const joined = docs
				.map((d) => `# ${d.rel}\n${d.text.slice(0, 2000)}`)
				.join("\n\n");
			return { output: `Local summary (fallback)\n\n${joined}` };
	}
}

export async function summarizeDirectory(
	dirPath,
	userPrompt = "",
	options = {}
) {
	const mode = options.mode || 'summarizer';
	const noFileModes = ['email', 'generator', 'security'];
	
	// Handle security mode with system scanning
	if (mode === 'security') {
		console.log('[summarizer] Running security analysis...');
		try {
			const systemInfo = await gatherSystemInfo();
			const riskAnalysis = analyzeSecurityRisks(systemInfo);
			
			// Create security documents for AI analysis
			const securityDocs = [
				{
					rel: 'system-info.json',
					text: JSON.stringify(systemInfo, null, 2)
				},
				{
					rel: 'risk-analysis.json', 
					text: JSON.stringify(riskAnalysis, null, 2)
				}
			];
			
			const res = await summarizeWithProvider(PROVIDER, userPrompt, securityDocs, mode);
			if (res && res.error) {
				return { ok: false, error: res.error, fileCount: 0 };
			}
			return {
				ok: true,
				fileCount: 2,
				tokens: res.tokens || 0,
				output: res.output,
				securityScore: riskAnalysis.securityScore,
				riskLevel: riskAnalysis.riskLevel
			};
		} catch (error) {
			console.error('[summarizer] Security analysis failed:', error);
			return { ok: false, error: `Security analysis failed: ${error.message}`, fileCount: 0 };
		}
	}
	
	// Handle health mode with Fitbit data analysis
	if (mode === 'health') {
		console.log('[summarizer] Running health coaching analysis...');
		try {
			if (!dirPath || !fs.existsSync(dirPath)) {
				return { ok: false, error: "Please select your Fitbit data folder." };
			}
			
			const healthAnalysis = await analyzeHealthData(dirPath);
			if (!healthAnalysis.success) {
				return { ok: false, error: `Health analysis failed: ${healthAnalysis.error}` };
			}
			
			// Create health coaching documents for AI analysis
			const healthDocs = [
				{
					rel: 'health-metrics.json',
					text: JSON.stringify(healthAnalysis.data, null, 2)
				},
				{
					rel: 'coaching-data.json',
					text: JSON.stringify(healthAnalysis.data.coachingData, null, 2)
				}
			];
			
			const res = await summarizeWithProvider(PROVIDER, userPrompt, healthDocs, mode);
			if (res && res.error) {
				return { ok: false, error: res.error, fileCount: 0 };
			}
			
			return {
				ok: true,
				fileCount: 2,
				tokens: res.tokens || 0,
				output: res.output,
				healthMetrics: healthAnalysis.data.metrics,
				recovery: healthAnalysis.data.recovery,
				coachingData: healthAnalysis.data.coachingData
			};
		} catch (error) {
			console.error('[summarizer] Health coaching analysis failed:', error);
			return { ok: false, error: `Health analysis failed: ${error.message}`, fileCount: 0 };
		}
	}
	
	// For other modes that don't require files, we can work without a directory
	if (noFileModes.includes(mode) && !dirPath) {
		const res = await summarizeWithProvider(PROVIDER, userPrompt, [], mode);
		if (res && res.error) {
			return { ok: false, error: res.error, fileCount: 0 };
		}
		return {
			ok: true,
			fileCount: 0,
			tokens: res.tokens || 0,
			output: res.output,
		};
	}

	if (!dirPath || !fs.existsSync(dirPath)) {
		return { ok: false, error: "Please select a valid directory." };
	}

	const root = shortPath(dirPath);
	const patterns = fileMatcher(options);
	const files = await fg(patterns, {
		cwd: root,
		absolute: true,
		dot: false,
		onlyFiles: true,
	});

	if (!files || files.length === 0) {
		return {
			ok: false,
			error: "No supported files found in the selected folder.",
			fileCount: 0,
		};
	}

	const selected = files.slice(0, MAX_FILES);
	const docs = [];
	for (const fp of selected) {
		const text = await extractTextForFile(fp);
		if (!text) continue;
		const rel = shortPath(path.relative(root, fp)) || path.basename(fp);
		docs.push({ rel, text });
	}

	if (docs.length === 0) {
		return {
			ok: false,
			error:
				"Could not extract text from any files (unsupported type or parser error).",
			fileCount: 0,
		};
	}

	docs.sort((a, b) => a.text.length - b.text.length);

	let total = 0;
	const packed = [];
	for (const d of docs) {
		if (total >= MAX_CHARS) break;
		const take = d.text.slice(0, Math.max(0, MAX_CHARS - total));
		packed.push({ rel: d.rel, text: take });
		total += take.length;
	}

	const res = await summarizeWithProvider(PROVIDER, userPrompt, packed, mode);
	if (res && res.error) {
		return { ok: false, error: res.error, fileCount: docs.length };
	}
	console.log(
		"[summarizer] Summary complete. ok:",
		!res.error,
		"files:",
		docs.length,
		"tokens:",
		res.tokens || 0
	);
	return {
		ok: true,
		fileCount: docs.length,
		tokens: res.tokens || 0,
		output: res.output,
	};
}
