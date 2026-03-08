#!/usr/bin/env python3
"""
brain_ingest.py
WAGZ Open Brain — Session File Watcher
Operator: m0rph3u$ | AI: Kernel (Claude)

Watches OpenClaw's agent session JSONL files for new user messages starting
with "brain:". When found, embeds and inserts the thought into Supabase.

This approach eliminates the Telegram getUpdates 409 conflict — OpenClaw
owns the bot polling; brain_ingest reads locally from the session files.

Trigger prefix: "brain:" — only user messages starting with this are captured.
Example: "brain: need to look into Mercury 2 for Recon Engine"

Usage (service):
  sudo systemctl enable --now brain-ingest.service

Usage (single-shot, for testing):
  python3 brain_ingest.py --once "your thought here"
"""

import os
import sys
import time
import json
import logging
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI
from supabase import create_client, Client

# ── Config ───────────────────────────────────────────────────────────────────
# Sessions directory — where OpenClaw writes conversation JSONL files
SESSIONS_DIR  = Path("/home/wagz/.openclaw/agents/main/sessions")
SESSIONS_JSON = SESSIONS_DIR / "sessions.json"
STATE_FILE    = Path("/home/wagz/.openclaw/workspace/.brain_ingest_state.json")
TRIGGER       = "brain:"
POLL_INTERVAL = 2           # seconds between checks

# Telegram — only used for acknowledgment replies
BOT_TOKEN     = "8490641049:AAEqBeppINUQv6BcUSmz2ubI-S9jRCPSjSk"
OPERATOR_CHAT = 6513209811

# Env vars — fall back to known values so service works without sourcing bashrc
SUPABASE_URL  = os.environ.get("SUPABASE_URL",
    "https://xjgxphahykaxgkekopjb.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZ3hwaGFoeWtheGdrZWtvcGpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkyNTM4MywiZXhwIjoyMDg4NTAxMzgzfQ.3pj94IkR23D_8cVFn5GXAUXTFPQ9kA3rEn9NASUYZT4")
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY",
    "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")
EMBED_MODEL   = "openai/text-embedding-3-small"

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [brain_ingest] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
log = logging.getLogger(__name__)

# ── Clients ──────────────────────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(api_key=OPENROUTER_KEY, base_url="https://openrouter.ai/api/v1")

# ── State ─────────────────────────────────────────────────────────────────────
def load_state() -> dict:
    """Load file positions and processed message IDs."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"file_positions": {}, "processed_ids": []}

def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state))

# ── Telegram ─────────────────────────────────────────────────────────────────
def tg_send(chat_id: int, text: str):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning(f"sendMessage error: {e}")

# ── Embed + Insert ────────────────────────────────────────────────────────────
def embed(text: str) -> list:
    return openai_client.embeddings.create(model=EMBED_MODEL, input=text).data[0].embedding

def insert_thought(content: str, source: str = "telegram"):
    embedding = embed(content)
    supabase.table("thoughts").insert({
        "content": content,
        "embedding": embedding,
        "metadata": {"source": source, "tags": ["telegram", "operator-input"]},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    log.info(f"Inserted thought: {content[:80]}")

# ── Session file scanning ─────────────────────────────────────────────────────
def extract_text(content) -> str:
    """Pull plain text from a JSONL content field (string or list)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                return part.get("text", "")
    return ""

def get_active_session_files() -> list[Path]:
    """Return all active (non-reset, non-deleted) session JSONL files."""
    if not SESSIONS_DIR.exists():
        return []
    return [
        p for p in SESSIONS_DIR.glob("*.jsonl")
        if not any(x in p.name for x in (".reset.", ".deleted.", ".bak"))
    ]

def scan_file_for_new_thoughts(path: Path, state: dict) -> list[tuple[str, str]]:
    """
    Read new lines from the session JSONL file since last scan.
    Returns list of (message_id, thought_text) for brain: messages.
    """
    found = []
    file_key = str(path)
    last_pos = state["file_positions"].get(file_key, 0)
    processed_ids = set(state.get("processed_ids", []))

    try:
        current_size = path.stat().st_size
        if current_size <= last_pos:
            return found

        with open(path, "r") as f:
            f.seek(last_pos)
            new_lines = f.readlines()
            state["file_positions"][file_key] = f.tell()

        for line in new_lines:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Only look at user messages
            if entry.get("type") != "message":
                continue
            msg = entry.get("message", {})
            if msg.get("role") != "user":
                continue

            msg_id = entry.get("id", "")
            if msg_id in processed_ids:
                continue

            text = extract_text(msg.get("content", "")).strip()

            # Strip any timestamp prefix OpenClaw injects, e.g. "[Sat 2026-03-07 21:34 EST] brain: ..."
            if "]" in text and text.startswith("["):
                bracket_end = text.find("]")
                text = text[bracket_end + 1:].strip()

            if text.lower().startswith(TRIGGER):
                thought = text[len(TRIGGER):].strip()
                if thought:
                    found.append((msg_id, thought))

    except Exception as e:
        log.warning(f"Error scanning {path.name}: {e}")

    return found

# ── Single-shot mode ──────────────────────────────────────────────────────────
def capture_once(thought: str):
    """Embed and insert a single thought directly. No file watching."""
    if not thought:
        print("ERROR: empty thought", file=sys.stderr)
        sys.exit(1)
    try:
        insert_thought(thought)
        print(f"OK: {thought[:100]}")
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

# ── Main loop ─────────────────────────────────────────────────────────────────
def main():
    log.info("Brain ingest started — watching OpenClaw session files.")
    log.info(f"Sessions dir: {SESSIONS_DIR}")
    log.info(f"Trigger prefix: '{TRIGGER}'")

    state = load_state()

    # Initialize positions for all existing files (don't reprocess old content)
    for path in get_active_session_files():
        key = str(path)
        if key not in state["file_positions"]:
            state["file_positions"][key] = path.stat().st_size
    save_state(state)

    log.info(f"Initialized positions for {len(state['file_positions'])} session file(s).")

    while True:
        try:
            for path in get_active_session_files():
                key = str(path)
                # Initialize new files that appeared since startup
                if key not in state["file_positions"]:
                    state["file_positions"][key] = 0  # scan from beginning for new files

                new_thoughts = scan_file_for_new_thoughts(path, state)

                for msg_id, thought in new_thoughts:
                    log.info(f"New brain: message — {thought[:80]}")
                    try:
                        insert_thought(thought)
                        tg_send(OPERATOR_CHAT, f"🧠 Captured: {thought[:100]}")
                        state.setdefault("processed_ids", []).append(msg_id)
                        # Keep processed_ids from growing unbounded (keep last 500)
                        if len(state["processed_ids"]) > 500:
                            state["processed_ids"] = state["processed_ids"][-500:]
                    except Exception as e:
                        log.error(f"Insert failed: {e}")
                        tg_send(OPERATOR_CHAT, f"❌ Brain insert failed: {e}")

            save_state(state)

        except Exception as e:
            log.error(f"Main loop error: {e}")

        time.sleep(POLL_INTERVAL)

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--once":
        thought = " ".join(sys.argv[2:]).strip()
        capture_once(thought)
    else:
        main()
