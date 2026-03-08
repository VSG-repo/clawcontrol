#!/usr/bin/env python3
"""
brain_query.py — WAGZ Open Brain semantic search
Operator: m0rph3u$ | AI: Kernel (Claude)

Embeds a query and searches across all five brain tables:
thoughts, people, projects, ideas, admin.

Calls each table's match_* function individually (avoids search_all RPC
which has a SQL UNION ORDER BY limitation) and merges results by similarity.

Usage:
  python3 brain_query.py "AXE CAP project status"
  python3 brain_query.py --table thoughts "recon engine"
  python3 brain_query.py --threshold 0.3 --count 15 "mercury 2"
"""

import os
import sys
import json
import argparse
from pathlib import Path
from openai import OpenAI
from supabase import create_client, Client

# ── Key resolution ─────────────────────────────────────────────────────────────
def _load_env_file() -> dict:
    env_file = Path(__file__).parent / "backend" / ".env"
    result = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                result[k.strip()] = v.strip()
    return result

_env = _load_env_file()

def _get(key: str, fallback: str = "") -> str:
    return os.environ.get(key) or _env.get(key) or fallback

SUPABASE_URL   = _get("SUPABASE_URL",
    "https://xjgxphahykaxgkekopjb.supabase.co")
SUPABASE_KEY   = _get("SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZ3hwaGFoeWtheGdrZWtvcGpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkyNTM4MywiZXhwIjoyMDg4NTAxMzgzfQ.3pj94IkR23D_8cVFn5GXAUXTFPQ9kA3rEn9NASUYZT4")
OPENROUTER_KEY = _get("OPENROUTER_API_KEY",
    "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")
EMBED_MODEL    = "openai/text-embedding-3-small"

TABLES = ["thoughts", "people", "projects", "ideas", "admin"]

# ── Clients ───────────────────────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai_client = OpenAI(api_key=OPENROUTER_KEY, base_url="https://openrouter.ai/api/v1")

# ── Core ──────────────────────────────────────────────────────────────────────
def embed(text: str) -> list:
    return openai_client.embeddings.create(model=EMBED_MODEL, input=text).data[0].embedding

def _match_table(table: str, emb: list, threshold: float, count: int) -> list:
    """Call match_<table> RPC and normalize output to common shape."""
    func = f"match_{table}"
    params = {"query_embedding": emb, "match_threshold": threshold, "match_count": count}
    if table == "thoughts":
        params["filter"] = {}
    try:
        rows = supabase.rpc(func, params).execute().data or []
    except Exception as e:
        # Don't let one table failure kill the whole search
        return []

    # Normalize to common fields: table_name, label, detail, similarity
    normalized = []
    for r in rows:
        normalized.append({
            "table_name": table,
            "record_id":  r.get("id", ""),
            "label":      (r.get("name") or r.get("title") or r.get("content", "")[:80]),
            "detail":     (r.get("context") or r.get("notes") or r.get("summary")
                           or r.get("elaboration") or r.get("content", "")[:300]),
            "metadata":   r.get("metadata") or {},
            "similarity": r.get("similarity", 0),
            "created_at": r.get("created_at", ""),
        })
    return normalized

def search_all(query: str, threshold: float = 0.4, count: int = 10) -> list:
    """Cross-table search: query each table individually, merge by similarity."""
    emb = embed(query)
    results = []
    for table in TABLES:
        results.extend(_match_table(table, emb, threshold, count))
    results.sort(key=lambda r: r.get("similarity", 0), reverse=True)
    return results[:count]

def search_table(query: str, table: str, threshold: float = 0.4, count: int = 10) -> list:
    if table not in TABLES:
        print(f"ERROR: unknown table '{table}'. Choose from: {', '.join(TABLES)}", file=sys.stderr)
        sys.exit(1)
    emb = embed(query)
    return _match_table(table, emb, threshold, count)

def format_results(results: list, query: str) -> str:
    if not results:
        return f'Nothing found in the Second Brain for: "{query}"'
    lines = [f'Second Brain results for: "{query}" ({len(results)} match{"es" if len(results) != 1 else ""})\n']
    for r in results:
        table  = r.get("table_name", "?")
        label  = r.get("label", "")
        sim    = r.get("similarity", 0)
        detail = r.get("detail", "")
        meta   = r.get("metadata") or {}
        if isinstance(meta, str):
            try: meta = json.loads(meta)
            except: meta = {}
        topics = meta.get("topics") or meta.get("tags") or []

        lines.append(f"[{table}] {label}  (similarity: {sim:.3f})")
        if detail:
            lines.append(f"  {str(detail)[:300]}")
        if topics:
            lines.append(f"  tags: {', '.join(topics)}")
        lines.append("")
    return "\n".join(lines).rstrip()

# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="WAGZ Open Brain semantic search")
    parser.add_argument("query", nargs="+", help="Search query")
    parser.add_argument("--table", "-t", default=None,
                        help=f"Limit to one table: {', '.join(TABLES)}")
    parser.add_argument("--threshold", "-s", type=float, default=0.4,
                        help="Similarity threshold 0-1 (default: 0.4)")
    parser.add_argument("--count", "-n", type=int, default=10,
                        help="Max results (default: 10)")
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON instead of formatted text")
    args = parser.parse_args()

    q = " ".join(args.query).strip()
    if not q:
        print("ERROR: empty query", file=sys.stderr)
        sys.exit(1)

    try:
        if args.table:
            results = search_table(q, args.table, args.threshold, args.count)
        else:
            results = search_all(q, args.threshold, args.count)

        if args.json:
            print(json.dumps(results, indent=2, default=str))
        else:
            print(format_results(results, q))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
