/**
 * SpaghettiMap — API Client (Full IDE)
 * All backend calls go through the Vite dev proxy (/api → localhost:8000).
 */

const BASE = '/api';

async function request(path, options = {}) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// ---- Project management ----

export function openProject(root) {
    return request('/open-project', {
        method: 'POST',
        body: JSON.stringify({ root }),
    });
}

export function newProject(path, name) {
    return request('/new-project', {
        method: 'POST',
        body: JSON.stringify({ path, name }),
    });
}

export function getRecentProjects() {
    return request('/recent-projects');
}

// ---- File tree ----

export function loadFiles(root) {
    const params = root ? `?root=${encodeURIComponent(root)}` : '';
    return request(`/files${params}`);
}

// ---- File operations ----

export function readFile(path) {
    return request(`/file?path=${encodeURIComponent(path)}`);
}

export function saveFile(path, content) {
    return request('/file', {
        method: 'POST',
        body: JSON.stringify({ path, content }),
    });
}

export function createFile(path, isDirectory = false) {
    return request('/file/create', {
        method: 'POST',
        body: JSON.stringify({ path, is_directory: isDirectory }),
    });
}

export function renameFile(oldPath, newPath) {
    return request('/file/rename', {
        method: 'POST',
        body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    });
}

export function deleteFile(path) {
    return request('/file/delete', {
        method: 'POST',
        body: JSON.stringify({ path }),
    });
}

// ---- Analysis & AI ----

export function analyzeProject(root) {
    return request('/analyze', {
        method: 'POST',
        body: JSON.stringify({ root: root || null }),
    });
}

export function explainCode({ filePath, selectedCode, functionName, question }) {
    return request('/explain', {
        method: 'POST',
        body: JSON.stringify({
            file_path: filePath,
            selected_code: selectedCode,
            function_name: functionName || null,
            question: question || null,
        }),
    });
}

export function askProject(question) {
    return request('/ask-project', {
        method: 'POST',
        body: JSON.stringify({ question }),
    });
}

// ---- Run Python ----

export function runPython(path) {
    return request(`/run?path=${encodeURIComponent(path)}`, { method: 'POST' });
}

export function visualizeFile(path) {
    return request(`/visualize?path=${encodeURIComponent(path)}`, { method: 'POST' });
}

// ---- Utilities ----

export function listModels() {
    return request('/models');
}

export function healthCheck() {
    return request('/health');
}

/**
 * Get the language identifier for Monaco from a file extension.
 */
export function getLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript',
        tsx: 'typescript', json: 'json', md: 'markdown', html: 'html',
        css: 'css', yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql',
        sh: 'shell', bash: 'shell', txt: 'plaintext', cfg: 'ini',
        ini: 'ini', toml: 'ini', gitignore: 'plaintext',
    };
    return map[ext] || 'plaintext';
}
