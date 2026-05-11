"""MCP Server for HiDream-O1-Image — HTTP Streamable Transport.

Exposes HiDream-O1-Image capabilities as MCP tools over HTTP.
Supports text-to-image, image editing, subject-driven generation,
prompt refinement, and model management.

Run
---
    python mcp_server.py --model_path /path/to/HiDream-O1-Image --model_type full

The MCP endpoint is served at POST /mcp (HTTP Streamable transport).
"""

import argparse
import base64
import io
import json
import os
import tempfile
import threading
import uuid

import torch
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from PIL import Image

load_dotenv()

from models.pipeline import DEFAULT_TIMESTEPS, generate_image
from models.qwen3_vl_transformers import Qwen3VLForConditionalGeneration
from prompt_agent import build_local_agent, rewrite_prompt_api, rewrite_prompt_local
from transformers import AutoProcessor


# ── Globals ──────────────────────────────────────────────────────────────────

app = Flask(__name__)
_GEN_LOCK = threading.Lock()
_STATE = {
    "model": None,
    "processor": None,
    "model_type": "full",
    "model_path": None,
    "agent": None,
}

MCP_PROTOCOL_VERSION = "2025-03-26"
MCP_SERVER_INFO = {
    "name": "hidream-o1-image",
    "version": "1.0.0",
}


def _add_special_tokens(tokenizer):
    tokenizer.boi_token = "<|boi_token|>"
    tokenizer.bor_token = "<|bor_token|>"
    tokenizer.eor_token = "<|eor_token|>"
    tokenizer.bot_token = "<|bot_token|>"
    tokenizer.tms_token = "<|tms_token|>"


def _get_tokenizer(processor):
    from transformers import PreTrainedTokenizerBase
    if isinstance(processor, PreTrainedTokenizerBase):
        return processor
    return processor.tokenizer


def load_image_model(model_path):
    print(f"[mcp] Loading checkpoint from {model_path} ...")
    processor = AutoProcessor.from_pretrained(model_path)
    model = Qwen3VLForConditionalGeneration.from_pretrained(
        model_path, torch_dtype=torch.float32, device_map="cuda"
    ).eval()
    _add_special_tokens(_get_tokenizer(processor))
    return processor, model


# ── MCP Tool Definitions ─────────────────────────────────────────────────────

MCP_TOOLS = [
    {
        "name": "generate_image",
        "description": (
            "Generate an image using HiDream-O1-Image. "
            "Supports three modes: text-to-image (t2i), image editing (edit), "
            "and multi-reference subject-driven generation (subject). "
            "Blocks until generation completes, then returns the image."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Text prompt describing the desired image.",
                },
                "mode": {
                    "type": "string",
                    "enum": ["t2i", "edit", "subject"],
                    "description": (
                        "Generation mode. "
                        "t2i: text-to-image (no reference needed). "
                        "edit: edit a source image (exactly 1 reference). "
                        "subject: subject-driven generation (2+ references)."
                    ),
                    "default": "t2i",
                },
                "width": {
                    "type": "integer",
                    "description": "Output image width in pixels.",
                    "default": 2048,
                },
                "height": {
                    "type": "integer",
                    "description": "Output image height in pixels.",
                    "default": 2048,
                },
                "seed": {
                    "type": "integer",
                    "description": "Random seed for reproducibility.",
                    "default": 32,
                },
                "ref_images": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Base64-encoded reference images (PNG/JPEG). "
                        "Required for edit (1 image) and subject (2+) modes."
                    ),
                },
                "keep_original_aspect": {
                    "type": "boolean",
                    "description": (
                        "When true and exactly one reference is provided in edit mode, "
                        "resize reference to 2048px max side and derive output dimensions "
                        "to preserve the original aspect ratio."
                    ),
                    "default": False,
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "refine_prompt",
        "description": (
            "Refine a text prompt for better image generation results. "
            "Uses either a local Gemma model or an OpenAI-compatible API backend."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The original prompt to refine.",
                },
                "backend": {
                    "type": "string",
                    "enum": ["local", "api"],
                    "description": "Refinement backend: local Gemma or OpenAI-compatible API.",
                    "default": "local",
                },
                "api_base_url": {
                    "type": "string",
                    "description": "Base URL for the OpenAI-compatible API (required when backend=api).",
                },
                "api_key": {
                    "type": "string",
                    "description": "API key (required when backend=api).",
                },
                "api_model": {
                    "type": "string",
                    "description": "Model name for the API (required when backend=api).",
                },
            },
            "required": ["prompt"],
        },
    },
    {
        "name": "get_model_status",
        "description": "Check whether the HiDream model is currently loaded on GPU.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "unload_model",
        "description": (
            "Unload the HiDream model from GPU memory. "
            "Useful to free VRAM for other tasks."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "reload_model",
        "description": "Reload the HiDream model to GPU after it has been unloaded.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
]


# ── MCP Tool Implementations ─────────────────────────────────────────────────

def _handle_generate_image(args):
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return {"content": [{"type": "text", "text": json.dumps({"error": "Empty prompt"})}], "isError": True}

    mode = args.get("mode", "t2i")
    width = int(args.get("width", 2048))
    height = int(args.get("height", 2048))
    seed = int(args.get("seed", 32))
    refs_b64 = args.get("ref_images") or []
    keep_original_aspect = bool(args.get("keep_original_aspect", False))

    if mode == "edit" and len(refs_b64) != 1:
        return {"content": [{"type": "text", "text": json.dumps({"error": "Edit mode requires exactly one reference image"})}], "isError": True}
    if mode == "subject" and len(refs_b64) < 2:
        return {"content": [{"type": "text", "text": json.dumps({"error": "Subject mode requires at least two reference images"})}], "isError": True}
    if keep_original_aspect and len(refs_b64) != 1:
        keep_original_aspect = False

    tmp_paths = []
    try:
        for b64 in refs_b64:
            raw = base64.b64decode(b64)
            path = os.path.join(tempfile.gettempdir(), f"hidream_{uuid.uuid4().hex}.png")
            with open(path, "wb") as f:
                f.write(raw)
            tmp_paths.append(path)

        def progress_cb(step, total, get_preview=None):
            pct = round((step + 1) / total * 100)
            print(f"[mcp] Generating: step {step + 1}/{total} ({pct}%)")

        with _GEN_LOCK:
            if _STATE["model_type"] == "full":
                kwargs = dict(
                    num_inference_steps=50,
                    guidance_scale=5.0,
                    shift=3.0,
                    timesteps_list=None,
                    scheduler_name="default",
                )
            else:
                kwargs = dict(
                    num_inference_steps=28,
                    guidance_scale=0.0,
                    shift=1.0,
                    timesteps_list=DEFAULT_TIMESTEPS,
                    scheduler_name="flash",
                    noise_scale_start=7.5,
                    noise_scale_end=7.5,
                    noise_clip_std=2.5,
                )
            image = generate_image(
                model=_STATE["model"],
                processor=_STATE["processor"],
                prompt=prompt,
                ref_image_paths=tmp_paths if tmp_paths else None,
                height=height,
                width=width,
                seed=seed,
                keep_original_aspect=keep_original_aspect,
                callback=progress_cb,
                **kwargs,
            )
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {
            "content": [
                {"type": "image", "data": img_b64, "mimeType": "image/png"},
                {"type": "text", "text": json.dumps({
                    "status": "done",
                    "prompt": prompt,
                    "mode": mode,
                    "width": image.size[0],
                    "height": image.size[1],
                    "seed": seed,
                })},
            ]
        }
    except Exception as e:
        return {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}], "isError": True}
    finally:
        for p in tmp_paths:
            try:
                os.remove(p)
            except OSError:
                pass


def _handle_refine_prompt(args):
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return {"content": [{"type": "text", "text": json.dumps({"error": "Empty prompt"})}], "isError": True}

    backend = args.get("backend", "local")

    try:
        if backend == "local":
            if _STATE["agent"] is None:
                model_id = os.environ.get("HIDREAM_AGENT_MODEL", "google/gemma-4-31B-it")
                _STATE["agent"] = build_local_agent(model_id)
            refined = rewrite_prompt_local(*_STATE["agent"], prompt)
        elif backend == "api":
            base_url = args.get("api_base_url") or os.environ.get("OPENAI_BASE_URL", "")
            api_key = args.get("api_key") or os.environ.get("OPENAI_API_KEY", "")
            model = args.get("api_model") or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
            if not all([base_url, api_key]):
                return {"content": [{"type": "text", "text": json.dumps({"error": "API requires api_base_url and api_key"})}], "isError": True}
            refined = rewrite_prompt_api(prompt, base_url=base_url, api_key=api_key, model_name=model)
        else:
            return {"content": [{"type": "text", "text": json.dumps({"error": f"Unknown backend: {backend}"})}], "isError": True}
        return {"content": [{"type": "text", "text": json.dumps(refined)}]}
    except Exception as e:
        return {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}], "isError": True}


def _handle_get_model_status(_args):
    result = {"loaded": _STATE["model"] is not None, "model_type": _STATE["model_type"]}
    return {"content": [{"type": "text", "text": json.dumps(result)}]}


def _handle_unload_model(_args):
    with _GEN_LOCK:
        if _STATE["model"] is not None:
            del _STATE["model"]
            _STATE["model"] = None
        if _STATE["processor"] is not None:
            del _STATE["processor"]
            _STATE["processor"] = None
        if _STATE["agent"] is not None:
            del _STATE["agent"]
            _STATE["agent"] = None
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return {"content": [{"type": "text", "text": json.dumps({"status": "unloaded", "message": "Model unloaded, GPU memory released."})}]}


def _handle_reload_model(_args):
    model_path = _STATE.get("model_path") or os.environ.get("HIDREAM_MODEL_PATH")
    if not model_path:
        return {"content": [{"type": "text", "text": json.dumps({"error": "HIDREAM_MODEL_PATH not set"})}], "isError": True}
    with _GEN_LOCK:
        if _STATE["model"] is not None:
            return {"content": [{"type": "text", "text": json.dumps({"status": "already_loaded"})}]}
        processor, model = load_image_model(model_path)
        _STATE["processor"] = processor
        _STATE["model"] = model
    return {"content": [{"type": "text", "text": json.dumps({"status": "reloaded", "message": "Model reloaded to GPU."})}]}


TOOL_HANDLERS = {
    "generate_image": _handle_generate_image,
    "refine_prompt": _handle_refine_prompt,
    "get_model_status": _handle_get_model_status,
    "unload_model": _handle_unload_model,
    "reload_model": _handle_reload_model,
}


# ── MCP JSON-RPC Dispatcher ──────────────────────────────────────────────────

def _mcp_handle_request(body):
    """Dispatch a single JSON-RPC 2.0 request and return (result, is_sse)."""
    method = body.get("method")
    req_id = body.get("id")
    params = body.get("params") or {}

    if method == "initialize":
        result = {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {"listChanged": False},
            },
            "serverInfo": MCP_SERVER_INFO,
        }
        return _jsonrpc_ok(req_id, result), False

    if method == "notifications/initialized":
        return None, False

    if method == "ping":
        return _jsonrpc_ok(req_id, {}), False

    if method == "tools/list":
        return _jsonrpc_ok(req_id, {"tools": MCP_TOOLS}), False

    if method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments") or {}
        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            return _jsonrpc_error(req_id, -32601, f"Unknown tool: {tool_name}"), False
        result = handler(tool_args)
        return _jsonrpc_ok(req_id, result), False

    return _jsonrpc_error(req_id, -32601, f"Method not found: {method}"), False


def _jsonrpc_ok(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _jsonrpc_error(req_id, code, message):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


# ── Flask Routes ──────────────────────────────────────────────────────────────

@app.route("/mcp", methods=["POST"])
def mcp_endpoint():
    """MCP HTTP Streamable transport endpoint.

    Accepts JSON-RPC 2.0 messages. Returns either:
    - application/json for single responses
    - text/event-stream for streaming responses
    """
    content_type = request.content_type or ""

    if "application/json" in content_type:
        try:
            body = request.get_json(force=True)
        except Exception:
            return jsonify(_jsonrpc_error(None, -32700, "Parse error")), 400

        result, is_sse = _mcp_handle_request(body)
        if result is None:
            return Response(status=202)

        if is_sse:
            def generate():
                yield f"event: message\ndata: {json.dumps(result)}\n\n"
            return Response(generate(), mimetype="text/event-stream",
                            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

        return jsonify(result)

    elif "text/event-stream" in content_type:
        return jsonify({"error": "Batch streaming not supported, send individual JSON-RPC requests"}), 400

    return jsonify({"error": "Content-Type must be application/json"}), 415


@app.route("/mcp", methods=["GET"])
def mcp_sse_transport():
    """SSE transport fallback — returns an endpoint event for clients that discover via GET."""
    def generate():
        yield f"event: endpoint\ndata: /mcp\n\n"
    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "service": "hidream-o1-image-mcp",
        "status": "ok",
        "model_loaded": _STATE["model"] is not None,
        "mcp_endpoint": "/mcp",
    })


# ── Entrypoint ───────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser("HiDream-O1-Image MCP Server")
    p.add_argument("--model_path", type=str,
                   default=os.environ.get("HIDREAM_MODEL_PATH"),
                   help="Path to HiDream-O1-Image checkpoint. Defaults to $HIDREAM_MODEL_PATH.")
    p.add_argument("--model_type", type=str,
                   default=os.environ.get("HIDREAM_MODEL_TYPE", "full"),
                   choices=["full", "dev"])
    p.add_argument("--host", type=str,
                   default=os.environ.get("HIDREAM_MCP_HOST", "0.0.0.0"))
    p.add_argument("--port", type=int,
                   default=int(os.environ.get("HIDREAM_MCP_PORT", "8080")))
    args = p.parse_args()

    if not args.model_path:
        p.error("--model_path is required (or set HIDREAM_MODEL_PATH in .env)")

    assert torch.cuda.is_available(), "CUDA is required for inference."
    processor, model = load_image_model(args.model_path)
    _STATE["processor"] = processor
    _STATE["model"] = model
    _STATE["model_type"] = args.model_type
    _STATE["model_path"] = args.model_path

    print(f"[mcp] HiDream-O1-Image MCP Server")
    print(f"[mcp] MCP endpoint: http://{args.host}:{args.port}/mcp")
    print(f"[mcp] Health check: http://{args.host}:{args.port}/")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
