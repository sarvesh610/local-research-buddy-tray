import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, isAbsolute } from 'path';
import { summarizeDirectory } from '../summarizer.js';

// Remember the most recent directory used by list_files/summarize_dir
let lastDirectory = null;

function expandHomeDir(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || p;
  if (p.startsWith('~/')) return join(process.env.HOME || '', p.slice(2));
  return p;
}

export const tools = {
  summarize_dir: {
    desc: "Analyze and summarize documents in a directory with optional user prompt",
    schema: { dir: "string", prompt: "string?", include: "object?", mode: "string?" },
    run: async ({ dir, prompt = "Summarize key themes and findings.", include, mode }) => {
      // Resolve and track the last working directory for convenience
      const resolvedDir = expandHomeDir(dir);
      if (resolvedDir) {
        lastDirectory = resolvedDir;
      }
      const options = { 
        include: include || { pdf: true, docx: true, csv: true, md: true },
        ...(mode ? { mode } : {})
      };
      
      const res = await summarizeDirectory(resolvedDir, prompt, options);
      if (!res.ok) {
        throw new Error(res.error || "Summarization failed");
      }
      
      return { 
        summary: (res.output || "").slice(0, 8000), 
        fileCount: res.fileCount || 0,
        tokens: res.tokens || 0
      };
    }
  },

  list_files: {
    desc: "Recursively list files in a directory with smart filtering. Excludes node_modules, .git, and other dev directories. Use pattern to filter by regex (e.g., '\\.(js|ts)$' for JS/TS files).",
    schema: { dir: "string", pattern: "string?", maxFiles: "number?" },
    run: async ({ dir, pattern, maxFiles = 300 }) => {
      const resolvedDir = expandHomeDir(dir);
      if (!existsSync(resolvedDir)) {
        throw new Error(`Directory does not exist: ${resolvedDir}`);
      }
      // Track the last working directory
      lastDirectory = resolvedDir;
      
      const excludeDirs = new Set([
        'node_modules', '.git', '.next', 'dist', 'build', '.cache',
        'coverage', '.nyc_output', 'tmp', 'temp', '.tmp',
        'vendor', '.vscode', '.idea', '__pycache__', '.pytest_cache'
      ]);
      
      const excludeFiles = new Set([
        '.DS_Store', 'Thumbs.db', '.gitignore', '.env', '.env.local',
        'package-lock.json', 'yarn.lock', 'npm-debug.log'
      ]);
      
      try {
        const rx = pattern ? new RegExp(pattern, 'i') : null;
        const files = [];
        
        function walkDirectory(currentDir, relativePath = '') {
          if (files.length >= maxFiles) return;
          
          const items = readdirSync(currentDir, { withFileTypes: true });
          
          for (const item of items) {
            if (files.length >= maxFiles) break;
            
            const itemPath = join(currentDir, item.name);
            const relativeItemPath = relativePath ? join(relativePath, item.name) : item.name;
            
            if (item.isDirectory()) {
              // Skip excluded directories
              if (!excludeDirs.has(item.name)) {
                walkDirectory(itemPath, relativeItemPath);
              }
            } else if (item.isFile()) {
              // Skip excluded files
              if (!excludeFiles.has(item.name)) {
                // Apply pattern filter if provided
                if (!rx || rx.test(item.name) || rx.test(relativeItemPath)) {
                  try {
                    const stats = statSync(itemPath);
                    files.push({
                      path: relativeItemPath,
                      size: stats.size,
                      extension: item.name.split('.').pop() || '',
                      modified: stats.mtime.toISOString().split('T')[0] // Just date part
                    });
                  } catch (statError) {
                    // Skip files we can't stat
                    files.push({
                      path: relativeItemPath,
                      size: 0,
                      extension: item.name.split('.').pop() || '',
                      error: 'Cannot access file stats'
                    });
                  }
                }
              }
            }
          }
        }
        
        walkDirectory(resolvedDir);
        
        // Sort by path for consistent output
        files.sort((a, b) => a.path.localeCompare(b.path));
        
        return {
          files: files.map(f => f.path), // Simple array for LLM
          fileDetails: files.slice(0, 100), // Detailed info for first 100 files
          totalCount: files.length,
          directory: dir,
          pattern: pattern || 'all files',
          excluded: Array.from(excludeDirs),
          truncated: files.length >= maxFiles
        };
      } catch (error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }
    }
  },

  read_text: {
    desc: "Read text content from a file with size limits",
    schema: { path: "string", maxBytes: "number?" },
    run: async ({ path, maxBytes = 20000 }) => {
      let resolvedPath = path;
      // If a relative path was provided, try resolving against lastDirectory
      if (!existsSync(resolvedPath)) {
        if (!isAbsolute(resolvedPath) && lastDirectory) {
          const candidate = join(lastDirectory, resolvedPath);
          if (existsSync(candidate)) {
            resolvedPath = candidate;
          }
        }
      }
      if (!existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${path}`);
      }
      
      try {
        const buf = readFileSync(resolvedPath);
        const text = buf.slice(0, maxBytes).toString('utf8');
        const truncated = buf.length > maxBytes;
        
        return { 
          text, 
          size: buf.length, 
          truncated,
          path: resolvedPath 
        };
      } catch (error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
    }
  }
};
