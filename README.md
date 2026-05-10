# HiDream-O1-Image-OminiUI

This is an UI Wrapper for HiDream-O1-Image : https://github.com/HiDream-ai/HiDream-O1-Image
 Required to have the Official Github for pipeline and model weights in order to run this.

HiDream-O1-Image: https://github.com/HiDream-ai/HiDream-O1-Image

HiDream-O1-Image Model: https://huggingface.co/HiDream-ai/HiDream-O1-Image
 
 Or
 
HiDream-O1-Image-Dev Model: https://huggingface.co/HiDream-ai/HiDream-O1-Image-Dev

A conversational AI interface for image generation and editing, powered by **HiDream-O1-Image** and **Ollama** tool calling.

Describe what you want in natural language. The LLM reasons through your request, then calls the appropriate image tool automatically.

## Features

- **Text-to-Image** — Generate images from detailed text prompts
- **Image Editing** — Upload a photo and describe modifications
- **Tool Calling** — Ollama decides when to invoke image tools based on conversation context
- **Enhance Prompt** — Toggle button to optionally refine prompts via OpenAI-compatible API before sending
- **Real-time Progress** — SSE streaming shows generation steps and preview thumbnails
- **Auto-save** — Generated images are saved with timestamped filenames
- **Chat History** — SQLite database persists all sessions, messages, and image references
- **Model Auto-unload** — HiDream model is released from GPU memory after 10 minutes of inactivity, and reloaded on demand
- **Multi-session** — Sidebar manages multiple independent conversations
- **Model Display** — Sidebar footer shows current Ollama model name
- **Lightbox** — Click any generated image for full-size viewing and download

## Architecture

```
Browser (React + TypeScript)
   │
   ├── /api/chat       →  Express server  →  Ollama (OpenAI-compatible)
   │                                        ↕ tool definitions
   ├── /api/generate    →  Express server  →  HiDream Flask API (port 7860)
   │                                        →  Python inference pipeline (CUDA)
   ├── /api/refine      →  Express server  →  OpenAI-compatible API (prompt enhancement)
   ├── /api/sessions    →  Express server  →  SQLite (chat history)
   └── /api/model/*     →  Express server  →  HiDream Flask API (unload/reload)
```

The Express backend acts as an orchestrator: it sends user messages plus tool schemas to Ollama, then executes any tool calls against the HiDream image API.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js     | 18+     | For the OminiUI server and frontend |
| Python      | 3.9+    | For HiDream-O1-Image inference |
| CUDA        | 12.x    | GPU inference requires NVIDIA CUDA |
| Ollama      | latest  | Local LLM server with OpenAI-compatible API |
| VRAM        | 24 GB+  | HiDream-O1-Image-Dev model |

## Setup

### 1. Install OminiUI

```bash
cd OminiUi
npm install
```

### 2. Pull an Ollama model with tool calling support

```bash
ollama pull <your-model>
```

Any model that supports function calling works (e.g., `qwen3:8b`, `llama3.1`, `mistral-nemo`). Set the model name in `.env` under `OLLAMA_MODEL`.

### 3. Start Ollama

```bash
ollama serve
```

Ollama listens on `http://localhost:11434` by default.

### 4. Start the HiDream Flask API

Clone and set up [HiDream-O1-Image](https://github.com/HiDream-ai/HiDream-O1-Image), then:

```bash
cd HiDream-O1-Image
venv\Scripts\activate
python app.py --model_path /path/to/model-HiDream-O1-Image-Dev --model_type dev --host 127.0.0.1 --port 7860
```

This loads the model onto GPU and exposes the image generation API on port 7860. Wait until you see `[app] Serving on http://127.0.0.1:7860` before proceeding.

> **First run** downloads model weights if not cached locally. This may take several minutes.

### 5. Configure environment

Copy the example and edit `.env`:

```bash
cp .env.example .env
```

See [Configuration](#configuration) below for all options.

### 6. Start OminiUI

```bash
cd OminiUi
npm run dev
```

This starts both:
- **Vite dev server** on `http://localhost:5173` (frontend with hot reload)
- **Express API server** on `http://localhost:3001` (backend)

Open `http://localhost:5173` in your browser.

## Configuration

All settings are in `.env` at the project root.

### Ollama Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_BASE_URL` | OpenAI-compatible endpoint for Ollama | `http://localhost:11434/v1` |
| `OLLAMA_API_KEY` | API key (Ollama doesn't validate this) | `ollama` |
| `OLLAMA_MODEL` | Model to use for chat and tool calling | — |

### OpenAI API Settings (Prompt Enhancement)

Optional. Used when the **Enhance Prompt** toggle is ON. The prompt is rewritten into a detailed image generation prompt before being sent to the LLM.

| Variable | Description |
|----------|-------------|
| `OPENAI_BASE_URL` | Any OpenAI-compatible API endpoint |
| `OPENAI_API_KEY` | Your API key (required for prompt enhancement) |
| `OPENAI_MODEL` | Model name on the endpoint |

Leave these empty to disable prompt enhancement.

### HiDream Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `HIDREAM_API_URL` | URL of the running HiDream Flask API | `http://localhost:7860` |
| `HIDREAM_MODEL_PATH` | Path to model checkpoint directory (used by Flask) | — |
| `HIDREAM_MODEL_TYPE` | `dev` (28 steps, faster) or `full` (50 steps, higher quality) | `dev` |
| `HIDREAM_RESULTS_DIR` | Directory to auto-save generated images | `../HiDream-O1-Image/results` |
| `MODEL_IDLE_TIMEOUT_MS` | Unload HiDream model after this many ms of inactivity | `600000` (10 min) |

### Server Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Express backend port | `3001` |

## Usage

### Generate an image

Type a description in the chat input:

```
A photorealistic cat wearing an astronaut helmet, floating in deep space
with Earth visible in the background. Cinematic lighting, 50mm lens.
```

The LLM will call the `create_image` tool automatically.

### Edit an image

1. Click **Attach image** and upload a source photo
2. Describe the edits you want:

```
Make this photo look like an oil painting in the style of Van Gogh
```

The LLM will call the `edit_image` tool with the attached image.

### Enhance Prompt

Click the **Enhance Prompt** toggle in the input toolbar before sending. When enabled, your prompt is sent to an OpenAI-compatible API which rewrites it into a detailed image generation prompt following the SCALIST framework (Subject, Composition, Action, Location, Image style, Specs, Text rendering).

This is optional — the LLM can also refine prompts on its own, but this gives you explicit control. Requires `OPENAI_API_KEY` to be set.

### Model Auto-unload

The HiDream model uses significant GPU memory. When no images are generated for 10 minutes, OminiUI automatically tells the Flask API to unload the model and release GPU memory. The next image generation request will reload the model automatically.

You can adjust the timeout with `MODEL_IDLE_TIMEOUT_MS` in `.env`.

## Project Structure

```
OminiUi/
├── .env.example                # Environment configuration template
├── index.html                  # Vite entry HTML
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (frontend)
├── tsconfig.node.json          # TypeScript config (server)
├── vite.config.ts              # Vite config with API proxy
├── data/
│   └── ominiui.db              # SQLite database (auto-created)
├── server/
│   ├── index.ts                # Express server entry point with all routes
│   ├── chat.ts                 # Chat endpoint — forwards to Ollama with tools
│   ├── tools.ts                # Tool definitions (create_image, edit_image)
│   ├── generate.ts             # Generation endpoint — proxies to HiDream API + auto-save
│   ├── db.ts                   # SQLite database layer
│   ├── model-tracker.ts        # HiDream model idle tracking and auto-unload
│   └── prompt-refine.ts        # Prompt enhancement via OpenAI-compatible API
└── src/
    ├── main.tsx                # React entry point
    ├── App.tsx                 # Root component — session management + DB sync
    ├── index.css               # Global styles (dark Omni theme)
    ├── vite-env.d.ts           # Vite type declarations
    └── components/
        ├── Chat.tsx            # Main chat interface + refine toggle + tool orchestration
        ├── MessageBubble.tsx   # Renders text, tool calls, images
        └── Sidebar.tsx         # Conversation list + model name display
```

## API Endpoints

### Chat & Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send messages to Ollama with tool definitions |
| `POST` | `/api/generate` | Direct image generation (internal) |
| `GET` | `/api/generate/stream/:jobId` | SSE progress stream |
| `POST` | `/api/refine` | Enhance a prompt via OpenAI-compatible API |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `PUT` | `/api/sessions/:id` | Rename a session |
| `DELETE` | `/api/sessions/:id` | Delete a session and its messages |
| `GET` | `/api/sessions/:id/messages` | Get messages for a session |
| `POST` | `/api/sessions/:id/messages` | Save a message |

### Model

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/model` | Get current Ollama model name |
| `GET` | `/api/model/status` | Get HiDream model load status and idle time |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `CUDA is required` | Ensure NVIDIA drivers and CUDA 12.x are installed |
| HiDream API not reachable | Verify the Flask server is running on port 7860 |
| Ollama connection refused | Run `ollama serve` and check port 11434 |
| Model not found | Run `ollama pull <your-model>` and set `OLLAMA_MODEL` in `.env` |
| Out of VRAM | The model auto-unloads after 10 min idle; or use `--model_type dev` |
| Generation hangs | Check HiDream Flask terminal for GPU errors |
| Prompt enhancement fails | Check `OPENAI_API_KEY` is set in `.env` |
| Images not saved | Check `HIDREAM_RESULTS_DIR` path exists |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend (5173) and backend (3001) |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run dev:server` | Start only the Express backend |
| `npm run build` | Production build to `dist/` |
