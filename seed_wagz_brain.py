#!/usr/bin/env python3
"""
seed_wagz_brain.py — v2 (schema-corrected)
Full VSG/WAGZ Open Brain seed --- all 5 tables
Operator: m0rph3u$ | AI: Kernel (Claude)
Date: 2026-03-07

Schema pattern: id, content/name/title, embedding, metadata (JSON), created_at, updated_at
All extra fields (tags, status, source, etc.) go into metadata.

Usage (Terminal on GMKtec):
  source ~/.bashrc
  python3 seed_wagz_brain.py
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

from openai import OpenAI
from supabase import create_client, Client

# ── Credentials ─────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, OPENROUTER_API_KEY]):
    print("❌ Missing env vars. Run: source ~/.bashrc")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

EMBED_MODEL = "openai/text-embedding-3-small"

def now():
    return datetime.now(timezone.utc).isoformat()

def embed(text: str) -> list[float]:
    response = openai_client.embeddings.create(model=EMBED_MODEL, input=text)
    return response.data[0].embedding

def insert(table: str, row: dict, label: str):
    try:
        supabase.table(table).insert(row).execute()
        print(f"  ✓ {table} → {label}")
    except Exception as e:
        print(f"  ✗ {table} → {label} | {e}")
    time.sleep(0.3)

# ══════════════════════════════════════════════════════════════════════════════════
# SEED DATA
# ══════════════════════════════════════════════════════════════════════════════════

THOUGHTS = [
    {"content": "WAGZ Open Brain is live. Supabase wagz-brain project provisioned, pgvector enabled, all 5 tables deployed, pipeline tested end-to-end with OpenRouter text-embedding-3-small.", "metadata": {"tags": ["wagz", "open-brain", "milestone"], "source": "session-handover-2026-03-07"}},
    {"content": "Next priorities: seed brain with real VSG/WAGZ context, build Telegram ingest pipeline, wire Sorter/Bouncer/Receipt flow, test semantic search via search_all.", "metadata": {"tags": ["wagz", "open-brain", "next-steps"], "source": "session-handover-2026-03-07"}},
    {"content": "ClawControl v1.0 shipped February 28. Public GitHub release. Posted to OpenClaw Discord. Launches via clawcontrol.sh or desktop icon in Brave standalone mode.", "metadata": {"tags": ["clawcontrol", "milestone", "shipped"], "source": "memory"}},
    {"content": "AXE CAP Architecture v5 locked. Full spec in AXE_CAP_Architecture_v5.docx. 14 sections. Build order: Open Brain first, then Orchestration Layer, then Agent Fleet.", "metadata": {"tags": ["axe-cap", "architecture", "locked"], "source": "memory"}},
    {"content": "WAGZ Telegram bot double-reply bug fixed. Root cause: stream mode enabled + invalid fallback model. Both resolved.", "metadata": {"tags": ["wagz", "telegram", "bugfix"], "source": "memory"}},
    {"content": "Gmail App Password auth for yt_digest.py pipeline is an open issue. Script: scripts/yt_digest.py on WAGZ. IMAP polling fastpace888@gmail.com, parsing YouTube/Instagram links, summarizing with Qwen, saving to ~/Desktop/yt_digests/.", "metadata": {"tags": ["wagz", "pipeline", "open-issue"], "source": "memory"}},
    {"content": "Dugout tab proof of concept validated by TeemuTeemuTee on Polymarket: $500 to $230K, 1100+ predictions, 60%+ win rate, LoL in-play scalping via Riot Games real-time API.", "metadata": {"tags": ["dugout", "polymarket", "validation"], "source": "memory"}},
    {"content": "Harness > Model principle confirmed. Same Claude model = 78% in good harness vs 42% in bad harness. AXE CAP IS the harness. Every skill, CLAUDE.md, Open Brain memory accumulated compounds weekly.", "metadata": {"tags": ["axe-cap", "principle", "harness"], "source": "memory"}},
    {"content": "Open Brain core rule: anything not in Open Brain at runtime does not exist for agents.", "metadata": {"tags": ["open-brain", "principle", "core-rule"], "source": "memory"}},
    {"content": "Council skill for AXE CAP: Claude Code + OpenRouter mega skill routing tasks to best model. Bug fixes to Codex, frontend to Gemini, architecture to council vote. Trigger: /council. Build this early.", "metadata": {"tags": ["axe-cap", "council-skill", "planned"], "source": "memory"}},
]

PEOPLE = [
    {
        "name": "m0rph3u$",
        "content": "Operator. Builds VSG — an agentic engineering firm. Runs WAGZ (trading desk) and AXE CAP (business command center) on GMKtec mini PC. Direct, surgical communication style. Step-by-step execution. Comfortable with Linux, Python, terminal.",
        "metadata": {"role": "operator", "hardware": "GMKtec mini PC, Linux Mint, 24GB RAM", "remote_access": "NoMachine", "projects": ["WAGZ", "AXE CAP", "ClawControl", "Upwork", "Dugout"], "trading": ["Hyperliquid", "Polymarket", "meme sniping"], "comms": ["Telegram", "Gmail fastpace888@gmail.com"], "tags": ["operator", "vsg"]}
    },
    {
        "name": "Kernel",
        "content": "Claude. Primary AI engineer for VSG. Architecture, engineering, primary decision-maker. Runs inside AXE CAP harness.",
        "metadata": {"role": "primary-ai", "model": "Claude Sonnet", "responsibilities": ["architecture", "engineering", "code", "system design"], "known_limitations": ["20% introspection accuracy", "declare victory failure", "one-shotting", "amnesia between sessions"], "tags": ["crew", "ai"]}
    },
    {
        "name": "Ricky Bobby",
        "content": "GPT. Advisory role. Copywriting, second opinions, Upwork profile work.",
        "metadata": {"role": "advisory", "model": "GPT-4", "used_for": ["copywriting", "upwork", "second opinions"], "tags": ["crew", "ai"]}
    },
    {
        "name": "Tex",
        "content": "Grok. Real-time intel. X/Twitter scraping, live market data, esports intel for Dugout tab.",
        "metadata": {"role": "real-time-intel", "model": "Grok", "used_for": ["twitter", "market data", "esports", "polymarket"], "tags": ["crew", "ai"]}
    },
    {
        "name": "Faceless Man",
        "content": "Gemini. Bulk research, large context tasks. Frontend generation in council routing.",
        "metadata": {"role": "bulk-research", "model": "Gemini", "used_for": ["research", "large context", "frontend"], "tags": ["crew", "ai"]}
    },
    {
        "name": "WAGZ",
        "content": "Trading desk agent. Bobby Axelrod persona. Hyperliquid + Polymarket. Telegram reporting. Runs on OpenClaw with tiered model routing via OpenRouter. MiniMax M2.5 primary workhorse.",
        "metadata": {"role": "trading-agent", "persona": "Bobby Axelrod", "platforms": ["Hyperliquid", "Polymarket"], "model_routing": {"primary": "MiniMax M2.5", "tier2": ["Claude Sonnet", "Claude Opus", "Grok"], "fallback": "free models"}, "integrations": ["Telegram", "email IMAP", "Brave web search"], "tags": ["crew", "agent", "trading"]}
    },
]

PROJECTS = [
    {
        "name": "WAGZ Open Brain",
        "content": "Supabase + pgvector second brain on WAGZ. Proving ground for Open Brain patterns before AXE CAP build. Nate B Jones skill installed. Pipeline live. Brain seeded with full VSG/WAGZ context.",
        "metadata": {"status": "active", "next_action": "Telegram ingest pipeline → Sorter/Bouncer/Receipt flow → semantic search test", "tags": ["wagz", "open-brain", "active"]}
    },
    {
        "name": "AXE CAP",
        "content": "Multi-agent agentic OS for VSG. Architecture v5 locked. 14 sections. Routes tasks across specialized agents via Orchestration Layer. Claude Code + Computer Use for complex tasks, Codebuff for routine coding, Gemini CLI for bulk research.",
        "metadata": {"status": "planned", "next_action": "Build Open Brain first after WAGZ proving ground. Then Orchestration Layer. Then Agent Fleet.", "tags": ["axe-cap", "planned"]}
    },
    {
        "name": "ClawControl",
        "content": "Community-facing dashboard for OpenClaw. v1.0 shipped Feb 28. React 18 + Vite, Tailwind, Shadcn/ui, FastAPI, Zustand, WebSocket. 21 passing tests. Public GitHub release. Launches via clawcontrol.sh.",
        "metadata": {"status": "shipped", "next_action": "Locked. Future: Dashboard tab enhancements, Phase 7 breakdown, Swarm view, Change approval queue.", "tags": ["clawcontrol", "shipped"]}
    },
    {
        "name": "WAGZ Trading Desk",
        "content": "OpenClaw agent on GMKtec. Tiered model routing via OpenRouter. MiniMax M2.5 primary. Connected to Telegram, IMAP email, Brave search. Bobby Axelrod persona.",
        "metadata": {"status": "active", "next_action": "Fix Gmail App Password auth for yt_digest.py. Then Nate B Jones Open Brain integration.", "tags": ["wagz", "trading", "active"]}
    },
    {
        "name": "Upwork Freelance Profile",
        "content": "VSG freelance presence. ClawControl as portfolio differentiator. OpenClaw production experience as key differentiator. Skills: n8n, OpenAI API, FastAPI, multi-model AI systems. Profile built, GPT handled copywriting.",
        "metadata": {"status": "active", "next_action": "Top targets: OpenClaw coaching job, FastAPI debug, AI-native vibe coder role. Build Upwork scraper.", "tags": ["upwork", "vsg", "active"]}
    },
    {
        "name": "Dugout Tab",
        "content": "Esports betting bot. LoL in-play scalping via Polymarket + Riot Games real-time API. Validated by TeemuTeemuTee: $500 to $230K, 1100+ predictions, 60%+ win rate. LoL starting niche #15 ranked, 66.5% win rate.",
        "metadata": {"status": "planned", "next_action": "Stack: Riot API feed, Polymarket API execution, event-to-market signal layer, Tex as real-time intel.", "tags": ["dugout", "polymarket", "planned"]}
    },
    {
        "name": "VSG Endgame",
        "content": "AXE CAP v1 runs VSG. AXE CAP v2 clones itself for other businesses — feed client context, system self-builds. Zero-touch deployment. Each client makes system smarter. VSG becomes the agentic engineering firm that builds and runs these systems.",
        "metadata": {"status": "vision", "next_action": "Execute AXE CAP v1 build first.", "tags": ["vsg", "vision"]}
    },
]

IDEAS = [
    {
        "title": "Harness > Model",
        "content": "Same model in good harness = 78% vs 42% in bad harness. AXE CAP IS the harness. Every skill, CLAUDE.md, Open Brain memory accumulated compounds weekly. Model swaps are trivial once harness is solid. Bash is sufficient. Open Brain = only permanent investment.",
        "metadata": {"tags": ["principle", "axe-cap", "architecture"]}
    },
    {
        "title": "Progressive Disclosure Doc Structure",
        "content": "Agent context injection = short table of contents only (~100 lines max). Full knowledge in structured Postgres schema. Key docs: ARCHITECTURE.md, PLANS.md, QUALITY_SCORE.md. Golden principles = enforced rules. Sunday synthesis = doc-gardening agent. Core rule: anything not in Open Brain at runtime doesn't exist for agents.",
        "metadata": {"tags": ["principle", "open-brain", "architecture"]}
    },
    {
        "title": "Council Skill — Multi-Model Routing",
        "content": "Claude Code + OpenRouter mega skill routing tasks to the best model per task type. Bug fixes to Codex. Frontend to Gemini 3.1 Pro. Architecture to council vote. Claude synthesizes and stays as decision-maker. Uses existing OpenRouter API key. Trigger: /council or get a second opinion. Build early in AXE CAP.",
        "metadata": {"tags": ["axe-cap", "council-skill", "architecture"]}
    },
    {
        "title": "AXE CAP Tool Design Principles",
        "content": "Tools = contract between deterministic system and non-deterministic agent. Build high-leverage consolidated tools not API wrappers. Namespace tools by service+resource. Return natural language not UUIDs. response_format enum concise/detailed. 25k token cap. Error messages = prompt engineering. Tool descriptions = describe like new hire onboarding.",
        "metadata": {"tags": ["axe-cap", "tools", "principle"]}
    },
    {
        "title": "Self-Annealing Skills",
        "content": "Skill fails → Codebuff repair agent reads skill.md + error log → patches → re-queues → fix logged to Postgres. Deferred until runtime stable. Auto-healing loop reduces maintenance overhead as system matures.",
        "metadata": {"tags": ["axe-cap", "skills", "future"]}
    },
    {
        "title": "Mercury 2 — High Volume Low Latency Tier",
        "content": "Inception Labs diffusion model. 1000+ t/s, 128k context, OpenAI API compatible, $0.25/$0.75 per million tokens. Tier 1 candidate for Recon Engine, Rhythm Engine, parallel chains. Evaluate after Open Brain stable.",
        "metadata": {"tags": ["models", "axe-cap", "candidate"]}
    },
    {
        "title": "AXE CAP Recon Engine",
        "content": "Proactive 24/7 discovery layer. RSS/web/GovCon/grants/GitHub/market feeds. Opportunity Records with 0-100 confidence scores. Approval gate before any action. MVP-1: RSS+scrape+GitHub. MVP-2: GovCon+Tex. MVP-3: scoring+synthesis.",
        "metadata": {"tags": ["axe-cap", "recon", "architecture"]}
    },
    {
        "title": "Global Mission Ledger",
        "content": "UUID mission_id chain anchor tying WAGZ trades + AXE CAP missions + Recon discoveries. Schema: origin, agent_id, tool_used, action_taken, outcome, capital_deployed, revenue_impact, decision_log. SQL only, never vectorized.",
        "metadata": {"tags": ["axe-cap", "ledger", "architecture"]}
    },
    {
        "title": "Kernel Session Startup Ritual",
        "content": "Before any new work: read progress file → read feature list JSON → check git log → run init.sh → smoke test → then work. Feature list in JSON not markdown. Default = incomplete, require proof. One feature per session max. Force e2e verification. Fixes amnesia, declare-victory, one-shotting failure modes.",
        "metadata": {"tags": ["kernel", "sop", "principle"]}
    },
    {
        "title": "Open Brain Embedding Strategy",
        "content": "Current WAGZ: OpenRouter text-embedding-3-small 1536-dim. AXE CAP target: Google embedding-001 free 1500 req/day via aistudio.google.com. Migration = re-embed script only, no schema change. Keep OpenRouter for WAGZ to avoid disrupting live system.",
        "metadata": {"tags": ["open-brain", "embeddings", "strategy"]}
    },
]

ADMIN = [
    {"name": "Fix Gmail App Password auth for yt_digest.py", "content": "IMAP auth broken for fastpace888@gmail.com in yt_digest.py pipeline on WAGZ.", "metadata": {"status": "open", "tags": ["wagz", "pipeline", "bug"]}},
    {"name": "Build Telegram ingest pipeline for WAGZ Open Brain", "content": "Auto-capture thoughts from Telegram messages into thoughts table.", "metadata": {"status": "open", "tags": ["wagz", "open-brain", "pipeline"]}},
    {"name": "Wire Sorter/Bouncer/Receipt flow", "content": "Classify → route → confirm pipeline for WAGZ Open Brain ingestion.", "metadata": {"status": "open", "tags": ["wagz", "open-brain", "pipeline"]}},
    {"name": "Test semantic search via search_all curl", "content": "Verify cross-table semantic search works via curl against Supabase search_all function.", "metadata": {"status": "open", "tags": ["wagz", "open-brain", "test"]}},
    {"name": "Install Council skill in AXE CAP", "content": "Multi-model routing skill. Trigger: /council.", "metadata": {"status": "planned", "tags": ["axe-cap", "council-skill"]}},
    {"name": "Build AXE CAP Open Brain — self-hosted Postgres + pgvector", "content": "Full production Open Brain after WAGZ proving ground complete.", "metadata": {"status": "planned", "tags": ["axe-cap", "open-brain"]}},
    {"name": "Build Dugout Tab — LoL in-play Polymarket bot", "content": "Riot API + Polymarket execution + Tex intel layer.", "metadata": {"status": "planned", "tags": ["dugout", "polymarket"]}},
    {"name": "Evaluate Mercury 2 for high-volume AXE CAP tasks", "content": "Inception Labs diffusion model. 1000+ t/s. Evaluate for Recon + Rhythm Engine.", "metadata": {"status": "planned", "tags": ["axe-cap", "models"]}},
    {"name": "Complete Anthropic Skilljar courses", "content": "Agent Skills, Claude Code in Action, Building with Claude API, Intro + Advanced MCP.", "metadata": {"status": "planned", "tags": ["learning", "axe-cap"]}},
    {"name": "Build Upwork scraper", "content": "Scrape relevant Upwork jobs for VSG proposal targeting.", "metadata": {"status": "planned", "tags": ["upwork", "vsg"]}},
]

# ══════════════════════════════════════════════════════════════════════════════════
# RUNNERS
# ══════════════════════════════════════════════════════════════════════════════════

def seed_thoughts():
    print("\n── THOUGHTS ──────────────────────────────────────")
    for item in THOUGHTS:
        embedding = embed(item["content"])
        insert("thoughts", {"content": item["content"], "embedding": embedding, "metadata": item["metadata"], "created_at": now(), "updated_at": now()}, item["content"][:60])

def seed_people():
    print("\n── PEOPLE ────────────────────────────────────────")
    for item in PEOPLE:
        text = f"{item['name']}. {item['content']}"
        embedding = embed(text)
        insert("people", {"name": item["name"], "content": item["content"], "embedding": embedding, "metadata": item["metadata"], "created_at": now(), "updated_at": now()}, item["name"])

def seed_projects():
    print("\n── PROJECTS ──────────────────────────────────────")
    for item in PROJECTS:
        text = f"{item['name']}. {item['content']}"
        embedding = embed(text)
        insert("projects", {"name": item["name"], "content": item["content"], "embedding": embedding, "metadata": item["metadata"], "created_at": now(), "updated_at": now()}, item["name"])

def seed_ideas():
    print("\n── IDEAS ─────────────────────────────────────────")
    for item in IDEAS:
        text = f"{item['title']}. {item['content']}"
        embedding = embed(text)
        insert("ideas", {"title": item["title"], "content": item["content"], "embedding": embedding, "metadata": item["metadata"], "created_at": now(), "updated_at": now()}, item["title"])

def seed_admin():
    print("\n── ADMIN ─────────────────────────────────────────")
    for item in ADMIN:
        embedding = embed(item["name"] + ". " + item["content"])
        insert("admin", {"name": item["name"], "content": item["content"], "embedding": embedding, "metadata": item["metadata"], "created_at": now(), "updated_at": now()}, item["name"])

if __name__ == "__main__":
    print("═" * 55)
    print("  WAGZ Open Brain — Full Seed v2")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("═" * 55)
    seed_thoughts()
    seed_people()
    seed_projects()
    seed_ideas()
    seed_admin()
    print("\n" + "═" * 55)
    print("  Seed complete. Verify in Supabase Table Editor.")
    print("═" * 55)
