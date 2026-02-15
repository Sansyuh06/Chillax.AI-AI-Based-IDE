"""
Chillax.AI — Backend API (Full IDE)
FastAPI server providing code analysis, AI explanations, file operations,
integrated terminal via WebSocket, and Python execution.
"""

from __future__ import annotations
import asyncio
import os
import re
import shutil
import subprocess
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import analyze_project, search_graph, get_file_content, analyze_file
from ollama_client import generate, list_models

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Chillax.AI API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state
_project_graph: dict | None = None
_project_root: str | None = None
_recent_projects: list[str] = []

SAMPLE_PROJECT = str(Path(__file__).resolve().parent / "sample_project")
RECENT_FILE = str(Path(__file__).resolve().parent / ".recent_projects.json")


def _load_recent():
    global _recent_projects
    try:
        if os.path.exists(RECENT_FILE):
            with open(RECENT_FILE, "r") as f:
                _recent_projects = json.load(f)
    except Exception:
        _recent_projects = []

def _save_recent():
    try:
        with open(RECENT_FILE, "w") as f:
            json.dump(_recent_projects[:10], f)
    except Exception:
        pass

def _add_recent(path: str):
    global _recent_projects
    path = path.replace("\\", "/")
    if path in _recent_projects:
        _recent_projects.remove(path)
    _recent_projects.insert(0, path)
    _recent_projects = _recent_projects[:10]
    _save_recent()

_load_recent()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    root: Optional[str] = None

class ExplainRequest(BaseModel):
    file_path: str
    selected_code: str
    function_name: Optional[str] = None
    question: Optional[str] = None

class AskProjectRequest(BaseModel):
    question: str

class SaveFileRequest(BaseModel):
    path: str
    content: str

class CreateFileRequest(BaseModel):
    path: str
    is_directory: bool = False

class RenameRequest(BaseModel):
    old_path: str
    new_path: str

class DeleteRequest(BaseModel):
    path: str

class OpenProjectRequest(BaseModel):
    root: str

class NewProjectRequest(BaseModel):
    path: str
    name: str


# ---------------------------------------------------------------------------
# Endpoints — Project management
# ---------------------------------------------------------------------------

@app.post("/open-project")
async def open_project(req: OpenProjectRequest):
    global _project_root, _project_graph
    root = os.path.abspath(req.root)
    if not os.path.isdir(root):
        raise HTTPException(404, f"Directory not found: {root}")
    _project_root = root
    _project_graph = None
    _add_recent(root)
    return {"root": root.replace("\\", "/"), "status": "opened"}

@app.post("/new-project")
async def new_project(req: NewProjectRequest):
    global _project_root, _project_graph
    full_path = os.path.join(os.path.abspath(req.path), req.name)
    os.makedirs(full_path, exist_ok=True)
    # Create a basic main.py
    main_file = os.path.join(full_path, "main.py")
    if not os.path.exists(main_file):
        with open(main_file, "w") as f:
            f.write('"""\\nNew Python project created with Chillax.AI.\\n"""\\n\\n\\ndef main():\\n    print("Hello, World!")\\n\\n\\nif __name__ == "__main__":\\n    main()\\n')
    _project_root = full_path
    _project_graph = None
    _add_recent(full_path)
    return {"root": full_path.replace("\\", "/"), "status": "created"}

@app.get("/recent-projects")
async def recent_projects():
    # Filter out non-existent dirs
    valid = [p for p in _recent_projects if os.path.isdir(p)]
    return {"projects": valid}

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    global _project_graph, _project_root
    root = req.root or _project_root or SAMPLE_PROJECT
    if not os.path.isdir(root):
        raise HTTPException(404, f"Directory not found: {root}")
    _project_root = os.path.abspath(root)
    _project_graph = analyze_project(_project_root)
    _add_recent(_project_root)
    return _project_graph


# ---------------------------------------------------------------------------
# Endpoints — AI
# ---------------------------------------------------------------------------

@app.post("/explain")
async def explain(req: ExplainRequest):
    global _project_graph, _project_root
    if _project_graph is None:
        raise HTTPException(400, "Run /analyze first")

    rel_path = req.file_path.replace("\\", "/")
    module_info = None
    for mod in _project_graph["modules"]:
        if mod["module"] == rel_path:
            module_info = mod
            break

    context_parts: list[str] = []
    if module_info:
        func_names = [f["name"] for f in module_info.get("functions", [])]
        class_names = [c["name"] for c in module_info.get("classes", [])]
        imports = module_info.get("imports", [])
        context_parts.append(f"**Module:** `{module_info['module']}`")
        if func_names:
            context_parts.append(f"**Functions in this file:** {', '.join(func_names)}")
        if class_names:
            context_parts.append(f"**Classes in this file:** {', '.join(class_names)}")
        if imports:
            context_parts.append(f"**Imports:** {', '.join(imports)}")

        callers = [e["source"] for e in _project_graph["edges"] if e["target"] == rel_path]
        callees = [e["target"] for e in _project_graph["edges"] if e["source"] == rel_path]
        if callers:
            context_parts.append(f"**Called by modules:** {', '.join(set(callers))}")
        if callees:
            context_parts.append(f"**Calls into modules:** {', '.join(set(callees))}")

    context_str = "\n".join(context_parts) if context_parts else "No graph context available."
    fn_label = f" (function `{req.function_name}`)" if req.function_name else ""
    user_q = f"\n\nThe developer specifically asks: \"{req.question}\"" if req.question else ""

    prompt = f"""Here is a code snippet from the file `{rel_path}`{fn_label}.

### Project Context
{context_str}

### Code
```python
{req.selected_code}
```
{user_q}

Explain what this code does, its inputs and outputs, any side effects, and how it connects to the rest of the project. Be concise but thorough."""

    explanation = await generate(prompt)
    return {"explanation": explanation}


@app.post("/ask-project")
async def ask_project(req: AskProjectRequest):
    global _project_graph, _project_root
    if _project_graph is None:
        raise HTTPException(400, "Run /analyze first")

    stop_words = {"how", "does", "do", "the", "what", "is", "a", "an", "in",
                  "of", "to", "and", "or", "if", "this", "that", "work",
                  "works", "about", "can", "i", "it", "when", "where", "why",
                  "which", "are", "was", "be", "has", "have", "will", "would",
                  "could", "should", "my", "me", "for", "with", "on", "at",
                  "from", "by", "not", "but", "all", "any", "each", "every"}
    words = re.findall(r"[a-zA-Z_]\w*", req.question.lower())
    keywords = [w for w in words if w not in stop_words and len(w) > 2]
    if not keywords:
        keywords = words[:3]

    relevant_modules = search_graph(_project_graph, keywords)

    snippets: list[str] = []
    referenced_files: list[dict] = []
    for mod in relevant_modules[:5]:
        filepath = os.path.join(_project_root, mod["module"])
        code = get_file_content(filepath)
        if len(code) > 3000:
            code = code[:3000] + "\n# ... (truncated)"
        snippets.append(f"### File: `{mod['module']}`\n```python\n{code}\n```")
        referenced_files.append({
            "module": mod["module"],
            "functions": [f["name"] for f in mod.get("functions", [])],
            "classes": [c["name"] for c in mod.get("classes", [])],
        })

    if not snippets:
        snippets.append("(No directly matching modules found.)")
        all_mods = [m["module"] for m in _project_graph["modules"]]
        snippets.append(f"All modules: {', '.join(all_mods)}")

    project_desc = (
        f"This Python project has {_project_graph['stats']['total_modules']} modules, "
        f"{_project_graph['stats']['total_functions']} functions, and "
        f"{_project_graph['stats']['total_classes']} classes."
    )

    prompt = f"""A developer is asking about a Python project:

**Question:** "{req.question}"

### Project Overview
{project_desc}

### Relevant Code
{"".join(snippets)}

Based on the code above, answer the developer's question. Explain the end-to-end flow, mention key files and functions, and highlight external dependencies or side effects. Use markdown."""

    answer = await generate(prompt)
    return {
        "answer": answer,
        "referenced_files": referenced_files,
        "keywords_used": keywords,
    }


# ---------------------------------------------------------------------------
# Endpoints — File operations
# ---------------------------------------------------------------------------

@app.get("/files")
async def list_files(root: str | None = None):
    """Return a recursive tree of files."""
    target = root or _project_root or SAMPLE_PROJECT
    if not os.path.isdir(target):
        raise HTTPException(404, "Directory not found")

    def build_tree(dir_path: str) -> list[dict]:
        entries: list[dict] = []
        try:
            items = sorted(os.listdir(dir_path))
        except PermissionError:
            return entries
        for name in items:
            if name.startswith(".") or name in ("__pycache__", "venv", "node_modules", ".git"):
                continue
            full = os.path.join(dir_path, name)
            rel = _rel_to_root(full, target)
            if os.path.isdir(full):
                children = build_tree(full)
                entries.append({"name": name, "path": rel, "type": "directory", "children": children})
            else:
                entries.append({"name": name, "path": rel, "type": "file"})
        return entries

    return {"root": target.replace("\\", "/"), "tree": build_tree(target)}


def _rel_to_root(path: str, root: str) -> str:
    return str(Path(path).relative_to(root)).replace("\\", "/")


@app.get("/file")
async def read_file(path: str):
    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if not os.path.isfile(full):
        raise HTTPException(404, "File not found")
    content = get_file_content(full)
    return {"path": path, "content": content}


@app.post("/file")
async def save_file(req: SaveFileRequest):
    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, req.path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"status": "saved", "path": req.path}


@app.post("/file/create")
async def create_file(req: CreateFileRequest):
    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, req.path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if req.is_directory:
        os.makedirs(full, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write("")
    return {"status": "created", "path": req.path}


@app.post("/file/rename")
async def rename_file(req: RenameRequest):
    root = _project_root or SAMPLE_PROJECT
    old = os.path.normpath(os.path.join(root, req.old_path))
    new = os.path.normpath(os.path.join(root, req.new_path))
    if not old.startswith(os.path.normpath(root)) or not new.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if not os.path.exists(old):
        raise HTTPException(404, "File not found")
    os.makedirs(os.path.dirname(new), exist_ok=True)
    os.rename(old, new)
    return {"status": "renamed", "old_path": req.old_path, "new_path": req.new_path}


@app.post("/file/delete")
async def delete_file(req: DeleteRequest):
    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, req.path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if not os.path.exists(full):
        raise HTTPException(404, "Not found")
    if os.path.isdir(full):
        shutil.rmtree(full)
    else:
        os.remove(full)
    return {"status": "deleted", "path": req.path}


# ---------------------------------------------------------------------------
# Endpoints — Run Python
# ---------------------------------------------------------------------------

@app.post("/run")
async def run_python(path: str = Query(...)):
    """Run a Python file and return stdout/stderr."""
    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if not os.path.isfile(full):
        raise HTTPException(404, "File not found")

    try:
        result = subprocess.run(
            ["python", full],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=root,
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Execution timed out (30s limit)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}


# ---------------------------------------------------------------------------
# Endpoints — Visualize execution flow
# ---------------------------------------------------------------------------

@app.post("/visualize")
async def visualize_file(path: str = Query(...)):
    """Analyze a Python file and return Mermaid flowchart + raw steps."""
    import ast

    root = _project_root or SAMPLE_PROJECT
    full = os.path.normpath(os.path.join(root, path))
    if not full.startswith(os.path.normpath(root)):
        raise HTTPException(403, "Path traversal blocked")
    if not os.path.isfile(full):
        raise HTTPException(404, "File not found")

    try:
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            source = f.read()
        tree = ast.parse(source)
    except SyntaxError as e:
        raise HTTPException(400, f"Syntax error: {e}")

    steps = []
    step_id = 0
    mermaid_lines = ["flowchart TD"]
    mermaid_edges = []

    def _esc(text):
        """Escape text for Mermaid labels — strip ALL shape-conflicting chars."""
        return (text
                .replace('"', "'")
                .replace('<', "‹").replace('>', "›")
                .replace('&', "+")
                .replace('(', "❨").replace(')', "❩")
                .replace('[', "⟦").replace(']', "⟧")
                .replace('{', "❴").replace('}', "❵")
                .replace('#', "♯")
                )

    def add_step(kind, label, detail="", line=0, parent=None, color=None):
        nonlocal step_id
        step_id += 1
        sid = f"n{step_id}"
        steps.append({
            "id": step_id, "sid": sid, "kind": kind,
            "label": label, "detail": detail,
            "line": line, "parent": parent, "color": color,
        })

        # Build escaped label
        esc_label = _esc(label)
        line_str = f"  L{line}" if line else ""
        full_label = f"{esc_label}{line_str}"

        # Use only basic universally-supported Mermaid shapes
        if kind == "condition":
            mermaid_lines.append(f'    {sid}{{"{full_label}"}}')
        elif kind == "loop":
            mermaid_lines.append(f'    {sid}(["{full_label}"])')
        elif kind == "define":
            mermaid_lines.append(f'    {sid}(["{full_label}"])')
        elif kind == "class":
            mermaid_lines.append(f'    {sid}[["{full_label}"]]')
        elif kind == "return":
            mermaid_lines.append(f'    {sid}[/"{full_label}"/]')
        elif kind == "start":
            mermaid_lines.append(f'    {sid}(("{full_label}"))')
        else:
            mermaid_lines.append(f'    {sid}["{full_label}"]')

        # Style class
        mermaid_lines.append(f'    class {sid} {kind}Style')

        # Edge from parent
        if parent:
            parent_sid = f"n{parent}"
            mermaid_edges.append(f"    {parent_sid} --> {sid}")

        return step_id

    def walk(node, parent_id=None):
        if isinstance(node, ast.Module):
            sid = add_step("start", os.path.basename(path), "Module entry", 1, color="#58a6ff")
            for child in ast.iter_child_nodes(node):
                walk(child, sid)

        elif isinstance(node, ast.Import):
            names = ", ".join(a.name for a in node.names)
            add_step("import", f"import {names}", "", node.lineno, parent_id, "#39d2c0")

        elif isinstance(node, ast.ImportFrom):
            names = ", ".join(a.name for a in node.names[:3])
            mod = node.module or "?"
            add_step("import", f"from {mod} import {names}", "", node.lineno, parent_id, "#39d2c0")

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = ", ".join(a.arg for a in node.args.args[:4])
            sid = add_step("define", f"def {node.name}({args})", f"{len(node.body)} stmts", node.lineno, parent_id, "#bc8cff")
            for child in node.body[:6]:
                walk(child, sid)

        elif isinstance(node, ast.ClassDef):
            bases = ", ".join(getattr(b, 'id', '?') for b in node.bases[:2])
            sid = add_step("class", f"class {node.name}" + (f"({bases})" if bases else ""),
                          f"{len(node.body)} members", node.lineno, parent_id, "#d29922")
            for child in node.body[:5]:
                walk(child, sid)

        elif isinstance(node, ast.Assign):
            targets = ", ".join(getattr(t, 'id', '...') for t in node.targets[:2])
            if isinstance(node.value, ast.Constant):
                val = repr(node.value.value)[:25]
            elif isinstance(node.value, ast.Call):
                val = getattr(node.value.func, 'id', getattr(node.value.func, 'attr', '?')) + "(...)"
            else:
                val = "..."
            add_step("assign", f"{targets} = {val}", "", node.lineno, parent_id, "#8b949e")

        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            fn = getattr(call.func, 'id', getattr(call.func, 'attr', '?'))
            add_step("call", f"{fn}(...)", "function call", node.lineno, parent_id, "#3fb950")

        elif isinstance(node, ast.Return):
            val = ""
            if node.value:
                if isinstance(node.value, ast.Constant):
                    val = repr(node.value.value)[:20]
                else:
                    val = "..."
            add_step("return", f"return {val}" if val else "return", "", node.lineno, parent_id, "#f85149")

        elif isinstance(node, ast.If):
            test_str = "condition"
            if isinstance(node.test, ast.Compare):
                test_str = getattr(node.test.left, 'id', '?') + " ..."
            elif isinstance(node.test, ast.Call):
                test_str = getattr(node.test.func, 'id', '?') + "(...)"
            elif isinstance(node.test, ast.Name):
                test_str = node.test.id
            sid = add_step("condition", f"if {test_str}", "", node.lineno, parent_id, "#d29922")
            for child in node.body[:3]:
                walk(child, sid)
            if node.orelse:
                eid = add_step("condition", "else", "", node.orelse[0].lineno if node.orelse else node.lineno, sid, "#d29922")
                for child in node.orelse[:3]:
                    walk(child, eid)

        elif isinstance(node, ast.For):
            target = getattr(node.target, 'id', '?')
            iter_s = getattr(node.iter, 'id', '...')
            sid = add_step("loop", f"for {target} in {iter_s}", "", node.lineno, parent_id, "#f778ba")
            for child in node.body[:3]:
                walk(child, sid)

        elif isinstance(node, ast.While):
            sid = add_step("loop", "while loop", "", node.lineno, parent_id, "#f778ba")
            for child in node.body[:3]:
                walk(child, sid)

        elif isinstance(node, ast.Try):
            sid = add_step("condition", "try", "", node.lineno, parent_id, "#d29922")
            for child in node.body[:3]:
                walk(child, sid)
            for handler in node.handlers[:2]:
                exc = getattr(handler.type, 'id', 'Exception') if handler.type else 'Exception'
                hid = add_step("condition", f"except {exc}", "", handler.lineno, sid, "#f85149")
                for child in handler.body[:2]:
                    walk(child, hid)

        elif isinstance(node, ast.With):
            sid = add_step("call", "with ...", "context manager", node.lineno, parent_id, "#39d2c0")
            for child in node.body[:3]:
                walk(child, sid)

    walk(tree)

    # Build final Mermaid string
    mermaid_str = "\n".join(mermaid_lines + mermaid_edges)

    # Add style classes
    mermaid_str += """
    classDef startStyle fill:#1a3a5c,stroke:#58a6ff,stroke-width:2px,color:#58a6ff
    classDef importStyle fill:#1a3a3a,stroke:#39d2c0,stroke-width:1px,color:#39d2c0
    classDef defineStyle fill:#2a1f3a,stroke:#bc8cff,stroke-width:2px,color:#bc8cff
    classDef classStyle fill:#3a2a1a,stroke:#d29922,stroke-width:2px,color:#d29922
    classDef assignStyle fill:#1a1f24,stroke:#484f58,stroke-width:1px,color:#8b949e
    classDef callStyle fill:#1a2f1a,stroke:#3fb950,stroke-width:1px,color:#3fb950
    classDef conditionStyle fill:#3a2a1a,stroke:#d29922,stroke-width:1px,color:#d29922
    classDef loopStyle fill:#2a1a2a,stroke:#f778ba,stroke-width:1px,color:#f778ba
    classDef returnStyle fill:#2a1a1a,stroke:#f85149,stroke-width:1px,color:#f85149
"""

    edges = [{"from": s["parent"], "to": s["id"]} for s in steps if s["parent"]]

    return {
        "file": path,
        "total_steps": len(steps),
        "steps": steps,
        "edges": edges,
        "mermaid": mermaid_str,
    }

# ---------------------------------------------------------------------------
# WebSocket — Integrated Terminal
# ---------------------------------------------------------------------------

@app.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    await websocket.accept()
    root = _project_root or SAMPLE_PROJECT

    import sys
    import threading

    shell = "cmd.exe" if sys.platform == "win32" else "/bin/bash"

    try:
        proc = subprocess.Popen(
            [shell],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=root,
            bufsize=0,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    except Exception as e:
        await websocket.send_text(f"Failed to start shell: {e}\r\n")
        await websocket.close()
        return

    closed = threading.Event()

    def read_stdout():
        """Read process output in a thread and send via WebSocket."""
        try:
            while not closed.is_set():
                data = proc.stdout.read(1)
                if not data:
                    break
                try:
                    text = data.decode("utf-8", errors="replace")
                    asyncio.run_coroutine_threadsafe(
                        websocket.send_text(text),
                        asyncio.get_event_loop()
                    )
                except Exception:
                    break
        except Exception:
            pass

    reader_thread = threading.Thread(target=read_stdout, daemon=True)
    reader_thread.start()

    try:
        while True:
            msg = await websocket.receive_text()
            if proc.stdin and proc.poll() is None:
                proc.stdin.write(msg.encode("utf-8"))
                proc.stdin.flush()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        closed.set()
        try:
            proc.kill()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

@app.get("/models")
async def get_models():
    models = await list_models()
    return {"models": models}

@app.get("/health")
async def health():
    return {"status": "ok", "project_loaded": _project_root is not None, "project_root": _project_root}
