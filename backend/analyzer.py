"""
AST‑based Python project analyzer.

Walks a directory, parses every .py file, and builds a JSON graph of:
  • modules (files)
  • functions / classes
  • imports
  • internal call relationships
  • **NEW**: in_degree (dependency heat), dead code flags, and heuristic bug scanner.
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

    def _get_max_depth(self, node: ast.AST, current_depth: int = 0) -> int:
        if not hasattr(node, "body") and not hasattr(node, "orelse"):
            return current_depth
        
        max_d = current_depth
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.If, ast.For, ast.While, ast.With, ast.Try, ast.ExceptHandler)):
                d = self._get_max_depth(child, current_depth + 1)
                max_d = max(max_d, d)
            else:
                d = self._get_max_depth(child, current_depth)
                max_d = max(max_d, d)
        return max_d

    # --- functions --------------------------------------------------------
    def visit_FunctionDef(self, node: ast.FunctionDef):
        length = (node.end_lineno or node.lineno) - node.lineno
        args_count = len(node.args.args)
        max_depth = self._get_max_depth(node)
        
        issues = []
        if length > 50:
            issues.append(f"God Function (>{50} lines)")
        if args_count > 6:
            issues.append(f"Too many arguments ({args_count})")
        if max_depth > 4:
            issues.append(f"Deep Nesting (depth {max_depth})")

        info = {
            "name": node.name,
            "start_line": node.lineno,
            "end_line": node.end_lineno or node.lineno,
            "args": [a.arg for a in node.args.args],
            "decorators": [self._decorator_name(d) for d in node.decorator_list],
            "docstring": ast.get_docstring(node) or "",
            "issues": issues,
            "length": length,
            "max_depth": max_depth,
            "in_degree": 0, # Calculated later
            "is_dead": False # Calculated later
        }
        self.functions.append(info)
        old = self._current_func
        self._current_func = node.name
        self.generic_visit(node)
        self._current_func = old

    visit_AsyncFunctionDef = visit_FunctionDef

    # --- classes ----------------------------------------------------------
    def visit_ClassDef(self, node: ast.ClassDef):
        methods: list[dict] = []
        issues = []
        length = (node.end_lineno or node.lineno) - node.lineno
        if length > 200:
             issues.append(f"God Class (>{200} lines)")

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
            "issues": issues,
            "length": length,
            "in_degree": 0, # Calculated later
            "is_dead": False
        })
        # FIX: Do NOT call self.generic_visit(node) here.
        # Calling it would cause visit_FunctionDef to fire for every method
        # inside the class, adding them to self.functions a second time and
        # inflating function counts / dead-code analysis results.

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
            "issues": ["SyntaxError – could not parse"],
        }

    visitor = _FileVisitor(source)
    visitor.visit(tree)

    return {
        "module": _rel(filepath, root),
        "functions": visitor.functions,
        "classes": visitor.classes,
        "imports": visitor.imports,
        "calls": list(set(visitor.calls)),
        "issues": []
    }


def analyze_project(root: str) -> dict[str, Any]:
    """Walk *root*, analyze every .py file, and return a project graph."""
    root = os.path.abspath(root)
    modules: list[dict] = []
    
    # Track items for establishing relationships
    # Maps function/class name to a list of (module_id, obj_dict)
    all_exports: dict[str, list[tuple[str, dict]]] = {}

    for dirpath, _dirs, files in os.walk(root):
        parts = Path(dirpath).parts
        if any(p.startswith(".") or p in ("__pycache__", "venv", "node_modules") for p in parts):
            continue
        for fname in sorted(files):
            if not fname.endswith(".py"):
                continue
            fullpath = os.path.join(dirpath, fname)
            info = analyze_file(fullpath, root)
            modules.append(info)

            # Register exports for linking dependencies
            mod_id = info["module"]
            for fn in info["functions"]:
                all_exports.setdefault(fn["name"], []).append((mod_id, fn))
            for cls in info["classes"]:
                all_exports.setdefault(cls["name"], []).append((mod_id, cls))

    edges: list[dict] = []
    # Build edges and calculate in_degree
    for mod in modules:
        for call_name in mod.get("calls", []):
            base = call_name.split(".")[0]
            # Simple heuristic: if the base name matches a known export
            targets = all_exports.get(base, [])
            for target_mod, target_obj in targets:
                if target_mod != mod["module"]:
                    # Inter-module edge
                    edges.append({
                        "source": mod["module"],
                        "target": target_mod,
                        "label": call_name,
                    })
                # Bump in_degree for the specific function/class
                target_obj["in_degree"] += 1

    # Mark dead code (0 in_degree) EXCEPT special functions 
    MAGIC_ENTRY = {"main", "run", "setup", "__init__"}
    for mod in modules:
        for fn in mod["functions"]:
            if fn["in_degree"] == 0 and fn["name"] not in MAGIC_ENTRY and not fn["name"].startswith("__"):
                fn["is_dead"] = True
        for cls in mod["classes"]:
            if cls["in_degree"] == 0 and not cls["name"].startswith("__"):
                cls["is_dead"] = True

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
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"# Error reading file: {e}"
