"""
AST‑based Python project analyzer.

Walks a directory, parses every .py file, and builds a JSON graph of:
  • modules (files)
  • functions / classes
  • imports
  • internal call relationships
"""

from __future__ import annotations
import ast
import os
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Core data structures
# ---------------------------------------------------------------------------

def _rel(path: str, root: str) -> str:
    """Return a forward‑slash relative path."""
    return str(Path(path).relative_to(root)).replace("\\", "/")


# ---------------------------------------------------------------------------
# AST visitors
# ---------------------------------------------------------------------------

class _FileVisitor(ast.NodeVisitor):
    """Extract functions, classes, imports, and intra‑project calls."""

    def __init__(self, source: str):
        self.source_lines = source.splitlines()
        self.functions: list[dict] = []
        self.classes: list[dict] = []
        self.imports: list[str] = []
        self.calls: list[str] = []
        self._current_func: str | None = None

    # --- functions --------------------------------------------------------
    def visit_FunctionDef(self, node: ast.FunctionDef):
        info = {
            "name": node.name,
            "start_line": node.lineno,
            "end_line": node.end_lineno or node.lineno,
            "args": [a.arg for a in node.args.args],
            "decorators": [self._decorator_name(d) for d in node.decorator_list],
            "docstring": ast.get_docstring(node) or "",
        }
        self.functions.append(info)
        old = self._current_func
        self._current_func = node.name
        self.generic_visit(node)
        self._current_func = old

    visit_AsyncFunctionDef = visit_FunctionDef  # treat async the same

    # --- classes ----------------------------------------------------------
    def visit_ClassDef(self, node: ast.ClassDef):
        methods: list[dict] = []
        for item in ast.walk(node):
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append({
                    "name": item.name,
                    "start_line": item.lineno,
                    "end_line": item.end_lineno or item.lineno,
                    "args": [a.arg for a in item.args.args],
                    "docstring": ast.get_docstring(item) or "",
                })
        self.classes.append({
            "name": node.name,
            "start_line": node.lineno,
            "end_line": node.end_lineno or node.lineno,
            "methods": methods,
            "docstring": ast.get_docstring(node) or "",
        })
        self.generic_visit(node)

    # --- imports ----------------------------------------------------------
    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self.imports.append(alias.name)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            self.imports.append(node.module)

    # --- calls ------------------------------------------------------------
    def visit_Call(self, node: ast.Call):
        name = self._call_name(node.func)
        if name:
            self.calls.append(name)
        self.generic_visit(node)

    # --- helpers ----------------------------------------------------------
    @staticmethod
    def _call_name(node: ast.expr) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parts = []
            cur = node
            while isinstance(cur, ast.Attribute):
                parts.append(cur.attr)
                cur = cur.value
            if isinstance(cur, ast.Name):
                parts.append(cur.id)
            return ".".join(reversed(parts))
        return None

    @staticmethod
    def _decorator_name(node: ast.expr) -> str:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return node.attr
        if isinstance(node, ast.Call):
            return _FileVisitor._decorator_name(node.func)
        return ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_file(filepath: str, root: str) -> dict[str, Any]:
    """Parse a single .py file and return its structure."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        source = f.read()
    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError:
        return {
            "module": _rel(filepath, root),
            "functions": [],
            "classes": [],
            "imports": [],
            "calls": [],
            "error": "SyntaxError – could not parse",
        }

    visitor = _FileVisitor(source)
    visitor.visit(tree)

    return {
        "module": _rel(filepath, root),
        "functions": visitor.functions,
        "classes": visitor.classes,
        "imports": visitor.imports,
        "calls": list(set(visitor.calls)),
    }


def analyze_project(root: str) -> dict[str, Any]:
    """Walk *root*, analyze every .py file, and return a project graph."""
    root = os.path.abspath(root)
    modules: list[dict] = []
    all_functions: dict[str, str] = {}  # func_name -> module

    for dirpath, _dirs, files in os.walk(root):
        # skip hidden / venv / __pycache__
        parts = Path(dirpath).parts
        if any(p.startswith(".") or p in ("__pycache__", "venv", "node_modules") for p in parts):
            continue
        for fname in sorted(files):
            if not fname.endswith(".py"):
                continue
            fullpath = os.path.join(dirpath, fname)
            info = analyze_file(fullpath, root)
            modules.append(info)
            for fn in info["functions"]:
                all_functions[fn["name"]] = info["module"]

    # Build edges: for each call in a module, if we know the target module, add edge
    edges: list[dict] = []
    for mod in modules:
        for call_name in mod.get("calls", []):
            base = call_name.split(".")[0]
            target_module = all_functions.get(base)
            if target_module and target_module != mod["module"]:
                edges.append({
                    "source": mod["module"],
                    "target": target_module,
                    "label": call_name,
                })

    return {
        "root": root.replace("\\", "/"),
        "modules": modules,
        "edges": edges,
        "stats": {
            "total_modules": len(modules),
            "total_functions": sum(len(m["functions"]) for m in modules),
            "total_classes": sum(len(m["classes"]) for m in modules),
        },
    }


def search_graph(graph: dict, keywords: list[str]) -> list[dict]:
    """Find modules / functions whose names match any keyword (case‑insensitive)."""
    results: list[dict] = []
    kw_lower = [k.lower() for k in keywords]
    for mod in graph.get("modules", []):
        mod_name_lower = mod["module"].lower()
        if any(k in mod_name_lower for k in kw_lower):
            results.append(mod)
            continue
        for fn in mod.get("functions", []):
            if any(k in fn["name"].lower() for k in kw_lower):
                results.append(mod)
                break
        for cls in mod.get("classes", []):
            if any(k in cls["name"].lower() for k in kw_lower):
                results.append(mod)
                break
    return results


def get_file_content(filepath: str) -> str:
    """Read a file and return its contents."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"# Error reading file: {e}"
