# HiDream-O1-Image MCP Tools Reference

## Server

```
POST http://localhost:8080/mcp   ← MCP endpoint (JSON-RPC 2.0)
GET  http://localhost:8080/      ← Health check
```

Start: `python mcp_server.py --model_path /path/to/HiDream-O1-Image --model_type full`

---

## Tools

### `generate_image`

Generate an image. Blocks until complete, then returns the image directly.

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `prompt` | string | yes | — | Text description |
| `mode` | string | no | `t2i` | `t2i` / `edit` / `subject` |
| `width` | int | no | 2048 | |
| `height` | int | no | 2048 | |
| `seed` | int | no | 32 | |
| `ref_images` | string[] | no | — | Base64 PNG/JPEG. Required: edit=1, subject=2+ |
| `keep_original_aspect` | bool | no | false | Edit mode only, 1 ref image |

**Modes:**
- `t2i` — text-to-image, no references needed
- `edit` — edit one source image (needs exactly 1 ref)
- `subject` — subject-driven from 2+ references

**Response:**
```json
{
  "content": [
    {"type": "image", "data": "<base64 PNG>", "mimeType": "image/png"},
    {"type": "text", "text": "{\"status\":\"done\",\"prompt\":\"...\",\"mode\":\"t2i\",\"width\":2048,\"height\":2048,\"seed\":42}"}
  ]
}
```

---

### `refine_prompt`

Rewrite a prompt for better generation results.

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `prompt` | string | yes | — | Original prompt |
| `backend` | string | no | `local` | `local` (Gemma) or `api` (OpenAI-compat) |
| `api_base_url` | string | conditional | — | Required when backend=api |
| `api_key` | string | conditional | — | Required when backend=api |
| `api_model` | string | no | gpt-4o-mini | Model for API backend |

**Response:**
```json
{ "prompt": "A majestic dragon soaring above..." }
```

---

### `get_model_status`

Check if the HiDream model is loaded on GPU.

**Params:** none

**Response:**
```json
{ "loaded": true, "model_type": "full" }
```

---

### `unload_model`

Release GPU memory by unloading the model.

**Params:** none

**Response:**
```json
{ "status": "unloaded", "message": "Model unloaded, GPU memory released." }
```

---

### `reload_model`

Reload the model to GPU after it was unloaded.

**Params:** none

**Response:**
```json
{ "status": "reloaded", "message": "Model reloaded to GPU." }
```

---

## Example Flow (text-to-image)

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
      "name": "generate_image",
      "arguments": {
        "prompt": "A serene mountain lake at sunset",
        "mode": "t2i",
        "width": 1024, "height": 1024, "seed": 42
      }
    }
  }'
```

Response contains the image as base64 PNG in `content[0].data` and metadata in `content[1].text`.

## MCP Client Discovery

```
POST /mcp  → initialize → tools/list → tools/call
```
