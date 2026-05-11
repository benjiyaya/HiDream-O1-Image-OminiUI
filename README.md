# OminiUI

A conversational AI interface for image and video generation, powered by **MCP (Model Context Protocol)** servers and any **OpenAI-compatible LLM**.

Describe what you want in natural language. The LLM reasons through your request, then calls the appropriate image/video tool automatically via MCP servers.

More Ongoing update and other development, feel free to check out in Patreon: https://patreon.com/aifuturetech

<img width="1595" height="1061" alt="Screenshot 2026-05-12 060615" src="https://github.com/user-attachments/assets/4d540ff2-51d5-4673-85d9-b1086a1d5f9e" />

<img width="1878" height="1056" alt="Screenshot 2026-05-12 060456" src="https://github.com/user-attachments/assets/69e9ac61-507b-41e2-a38b-81c2a9b5d86b" />


## Features

- **Multi-Engine Support** — Connect multiple MCP servers (HiDream, Flux, Kling, etc.) for different generation tasks
- **Text-to-Image** — Generate images from detailed text prompts
- **Image Editing** — Upload a photo and describe modifications
- **Tool Calling** — LLM decides when to invoke tools based on conversation context
- **Agent Workflow** — Multi-step creative tasks with planning and execution (stories, character references, scene composition)
- **Enhance Prompt** — Toggle to refine prompts via OpenAI-compatible API before sending
- **File Attachments** — Attach images, audio, and video files to your messages
- **Add to Attachment** — Attach generated outputs back to composer for iterative editing
- **Real-time Progress** — SSE streaming shows generation steps and preview thumbnails
- **Auto-save** — Generated images are saved with timestamped filenames
- **Chat History** — SQLite database persists all sessions, messages, and image references
- **Model Auto-unload** — MCP server models are released from GPU after idle timeout, reloaded on demand
- **MCP Settings Page** — Dedicated settings page with expandable server panels showing tool details
- **Multi-session** — Sidebar manages multiple independent conversations
- **Lightbox** — Click any generated image for full-size viewing and download

## Architecture

```
Browser (React + TypeScript)
   │
   ├── /api/chat        →  Express server  →  OpenAI-compatible LLM (tool calling)
   │
   ├── /api/workflow    →  Express server  →  DeepAgent (multi-step creative tasks)
   │
   ├── /api/tools/execute → Express server →  MCP Client  →  MCP Servers (HiDream, Flux, etc.)
   │                                             ↕
   │                                         Tool Registry
   │
   ├── /api/mcp-servers →  Express server  →  MCP Client Manager (connect/reconnect/status)
   │
   ├── /api/refine      →  Express server  →  OpenAI-compatible API (prompt enhancement)
   └── /api/sessions    →  Express server  →  SQLite (chat history)
```

The Express backend orchestrates between the LLM and MCP servers. It sends user messages to the LLM with tool schemas, then routes any tool calls to the appropriate MCP server. Multiple MCP servers can be connected simultaneously.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js     | 18+     | For the OminiUI server and frontend |
| VRAM        | varies  | Depends on which MCP server models you run |

> **Note:** You no longer need Python or CUDA locally. Image/video generation runs on separate MCP servers that can be on the same machine or remote.

## Setup

### 1. Install OminiUI

```bash
cd OminiUi
npm install
```

### 2. Configure environment

Copy the example and edit `.env`:

```bash
cp .env.example .env
```

Set your LLM endpoint (any OpenAI-compatible API):

```env
# Examples:
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o

# Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen3:8b

# Groq
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile

# Together
LLM_BASE_URL=https://api.together.xyz/v1
LLM_API_KEY=...
LLM_MODEL=meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
```

See [Configuration](#configuration) below for all options.

### 3. Start OminiUI

```bash
cd OminiUi
npm run dev
```

This starts both:
- **Vite dev server** on `http://localhost:5173` (frontend with hot reload)
- **Express API server** on `http://localhost:3001` (backend)

Open `http://localhost:5173` in your browser.

### 4. Connect MCP Servers

1. Click **Settings** in the sidebar
2. Click **+ Add MCP Server**
3. Enter the server details:
   - **Name**: unique identifier (e.g., `hidream`, `flux`, `kling`)
   - **Display Name**: human-readable name (e.g., `HiDream-O1-Image`)
   - **MCP URL**: the server's MCP endpoint (e.g., `http://localhost:8085/mcp`)
4. Click **Connect**

The server will connect and list its available tools. You can expand the server panel to see all tools with their parameters.

### MCP Server Examples

Any MCP-compatible image/video generation server works. Common options:

| Server | Description | Default Port |
|--------|-------------|--------------|
| HiDream-O1-Image | Text-to-image, image editing | 8085 |
| Flux | Fast image generation | 8085 |
| Kling | Video generation | 8085 |

> **Note:** Each MCP server runs its own model. Make sure you have enough VRAM for the models you connect.

## Configuration

All settings are in `.env` at the project root.

### LLM Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `http://localhost:11434/v1` |
| `LLM_API_KEY` | API key | `ollama` |
| `LLM_MODEL` | Model for chat and tool calling | `qwen3:8b` |

### Prompt Enhancement (Optional)

Used when the **Enhance Prompt** toggle is ON. Rewrites prompts into detailed image generation prompts.

| Variable | Description |
|----------|-------------|
| `OPENAI_BASE_URL` | Any OpenAI-compatible API endpoint |
| `OPENAI_API_KEY` | Your API key |
| `OPENAI_MODEL` | Model name on the endpoint |

Leave empty to disable prompt enhancement.

### MCP Server Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_CONFIG_PATH` | Path to MCP servers config file | `./mcp-servers.json` |
| `MODEL_IDLE_TIMEOUT_MS` | Unload model after ms of inactivity | `600000` (10 min) |

### Server Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Express backend port | `3001` |
| `RESULTS_DIR` | Directory to save generated images | `results` |

## Usage

### Generate an image

Type a description in the chat input:

```
A photorealistic cat wearing an astronaut helmet, floating in deep space
with Earth visible in the background. Cinematic lighting, 50mm lens.
```

The LLM will call the appropriate image generation tool automatically.

### Edit an image

1. Click **Attach files** and upload a source photo
2. Describe the edits you want:

```
Make this photo look like an oil painting in the style of Van Gogh
```

The LLM will call the edit tool with the attached image.

### Agent Workflow

Click **Workflow** in the input toolbar to enable agent mode. This is for complex, multi-step creative tasks:

```
Create a story with 3 scenes: a knight in a forest, then fighting a dragon,
then celebrating in a castle. Generate reference images for each scene.
```

The agent will plan the workflow, generate character references, and compose each scene step by step.

### Enhance Prompt

Click **Enhance Prompt** in the input toolbar. Your prompt is rewritten into a detailed image generation prompt following the SCALIST framework (Subject, Composition, Action, Location, Image style, Specs, Text rendering).

Requires `OPENAI_API_KEY` to be set.

### Attach Files

Click **Attach files** to upload images, audio, or video. You can attach up to 6 files. These are sent along with your message to the LLM for context.

### Add Generated Output to Attachment

When an image is generated, click **Add to attachment** to attach it to the composer for iterative editing.

## MCP Settings Page

Click **Settings** in the sidebar to open the MCP Settings page. Here you can:

- **View all connected servers** with their status (connected/connecting/error/disconnected)
- **Expand server panels** to see individual tools, descriptions, and input parameters
- **Add/remove servers** dynamically
- **Toggle servers** on/off without removing them
- **Reconnect** failed servers

## Project Structure

```
OminiUi/
├── .env.example                # Environment configuration template
├── .gitignore                  # Git ignore rules
├── mcp-servers.json            # MCP server configurations
├── package.json                # Dependencies and scripts
├── index.html                  # Vite entry HTML
├── vite.config.ts              # Vite config with API proxy
├── tsconfig.json               # TypeScript config (frontend)
├── tsconfig.node.json          # TypeScript config (server)
├── server/
│   ├── index.ts                # Express server with all routes
│   ├── chat.ts                 # Chat endpoint — forwards to LLM with tools
│   ├── generate.ts             # Tool execution — routes to MCP servers
│   ├── agent.ts                # DeepAgent workflow (multi-step creative tasks)
│   ├── mcp-client.ts           # MCP client manager (connections, tool registry)
│   ├── mcp-config.ts           # MCP server config persistence
│   ├── model-tracker.ts        # Model idle tracking and auto-unload
│   ├── db.ts                   # SQLite database layer
│   └── prompt-refine.ts        # Prompt enhancement via OpenAI API
└── src/
    ├── main.tsx                # React entry point
    ├── App.tsx                 # Root component — view routing + session management
    ├── index.css               # Global styles (dark theme)
    └── components/
        ├── Chat.tsx            # Main chat interface + tool orchestration
        ├── MessageBubble.tsx   # Renders text, tool calls, images
        ├── Sidebar.tsx         # Conversation list + engine status
        ├── McpSettings.tsx     # MCP Settings page with expandable panels
        └── Settings.tsx        # Legacy settings dialog (deprecated)
```

## API Endpoints

### Chat & Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send messages to LLM with tool definitions |
| `POST` | `/api/workflow` | Execute multi-step agent workflow |
| `POST` | `/api/tools/execute` | Execute a tool call via MCP server |
| `POST` | `/api/refine` | Enhance a prompt via OpenAI API |

### MCP Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/mcp-servers` | List all servers and their statuses |
| `POST` | `/api/mcp-servers` | Add a new MCP server |
| `PUT` | `/api/mcp-servers/:name` | Update server config (enable/disable, URL) |
| `DELETE` | `/api/mcp-servers/:name` | Remove a server |
| `POST` | `/api/mcp-servers/:name/reconnect` | Force reconnect a server |
| `GET` | `/api/mcp-servers/:name/tools` | Get tools for a specific server |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `PUT` | `/api/sessions/:id` | Rename a session |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `GET` | `/api/sessions/:id/messages` | Get messages for a session |
| `POST` | `/api/sessions/:id/messages` | Save a message |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MCP server won't connect | Check the MCP URL and ensure the server is running |
| `MCP error -32001: Request timed out` | Tool call exceeded 10min timeout — check MCP server logs |
| Tool not found | Ensure the MCP server exposes the tool — check Settings page |
| No tools available | Connect at least one MCP server in Settings |
| Generation hangs | Check MCP server terminal for GPU errors |
| Model stays in VRAM | Agent workflow auto-unloads; MCP servers unload after idle timeout |
| Prompt enhancement fails | Check `OPENAI_API_KEY` is set in `.env` |
| SSE reconnection spam | Already fixed — SSE retries disabled in transport config |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend (5173) and backend (3001) |
| `npm run dev:client` | Start only the Vite frontend |
| `npm run dev:server` | Start only the Express backend |
| `npm run build` | Production build to `dist/` |
