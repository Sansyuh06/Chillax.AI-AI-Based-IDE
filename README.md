# 🍝 SpaghettiMap

**Offline AI-powered Python IDE** — a standalone desktop app that helps developers understand legacy Python codebases using a local LLM via Ollama.

Built with Electron (like VS Code!) for a native desktop experience.

---

## Features

- 📁 **File Explorer** — browse and open `.py` files
- ✏️ **Monaco Editor** — Python syntax highlighting, Ctrl+S save
- 🧠 **AI Assistant** — explain selected code, ask project-level questions
- 🗺️ **Code Map** — visualize modules, functions, classes, and their relationships
- 🖥️ **Desktop App** — runs as a native window via Electron
- 🔒 **Fully Offline** — powered by Ollama, no cloud APIs

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.10+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Ollama | latest | [ollama.com](https://ollama.com) |

After installing Ollama, pull a model:

```bash
ollama pull llama3
```

---

## Quick Start (Windows)

### Option A: One-click
```
Double-click start.cmd
```
This installs all dependencies, starts the backend + frontend, and opens the desktop app.

### Option B: Manual

```bash
# Terminal 1 — Start Ollama
ollama serve

# Terminal 2 — Install & run everything
cd d:\fyeshi\project\IDE

# Install all deps
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
npm install

# Start backend
cd backend
python -m uvicorn main:app --port 8000 --reload

# (in another terminal) Start frontend
cd frontend
npm run dev

# (in another terminal) Launch desktop app
npx electron .
```

### Option C: All-in-one dev mode
```bash
npm run electron:dev
```
This starts backend, frontend, and Electron all at once.

---

## Demo Flow (3–5 minutes)

1. **Launch the app** → the SpaghettiMap desktop window opens with a 3-pane layout
2. **Click "Analyze Project"** → the bundled sample e-commerce project is scanned
3. **Explore the Code Map** → switch to the Code Map tab to see modules, functions, and relationships
4. **Click a file** (e.g., `app/auth.py`) → view the code in the Monaco editor
5. **Select a function** → click **"Explain Selection"** → AI explains the code in context
6. **Ask a question** like *"How does checkout work?"* → get an end-to-end explanation with references

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Electron |
| Frontend | React 18 + Vite + Monaco Editor |
| Backend | FastAPI (Python) |
| Code Analysis | Python `ast` module |
| AI | Ollama (local LLM) |
| Styling | Custom CSS (VS Code dark theme) |

---

## Project Structure

```
IDE/
├── electron/
│   └── main.js              # Electron main process
├── backend/
│   ├── main.py              # FastAPI server
│   ├── analyzer.py           # AST parsing + graph
│   ├── ollama_client.py      # Ollama API wrapper
│   ├── requirements.txt
│   └── sample_project/       # Demo legacy Python project
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # 3-pane layout
│   │   ├── components/       # FileExplorer, CodeEditor, Assistant, CodeMap
│   │   ├── api/client.js     # API helpers
│   │   └── index.css         # Dark theme
│   ├── package.json
│   └── vite.config.js
├── package.json              # Root — ties Electron + frontend + backend
├── start.cmd                 # One-click launcher
└── README.md
```

---

## License

MIT — built for hackathons 🚀
