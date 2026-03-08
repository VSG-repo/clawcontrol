#!/usr/bin/env python3
"""
yt_digest.py — Email-triggered YouTube transcript summarizer
Polls Gmail (IMAP) for self-sent emails from fastpace888@gmail.com containing
YouTube or Instagram links, fetches YT transcripts, summarizes via OpenRouter/Qwen,
and saves timestamped .txt files to ~/Desktop/yt_digests/

Runs every 8 hours via cron.
"""

import imaplib
import email
import email.header
import re
import json
import pathlib
import datetime
import traceback
import urllib.request
import urllib.error

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

# ── Config ────────────────────────────────────────────────────────────────────

GMAIL_USER = "fastpace888@gmail.com"
GMAIL_APP_PASSWORD = "cfppfoydgqzeoseg"
IMAP_HOST = "imap.gmail.com"
IMAP_PORT = 993

# OpenRouter API key — read from backend/.env or set directly here
_ENV_FILE = pathlib.Path.home() / "wagz-dashboard" / "backend" / ".env"
def _load_openrouter_key() -> str:
    if _ENV_FILE.exists():
        for line in _ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("OPENROUTER_API_KEY=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip()
    return ""

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
SUMMARIZE_MODEL = "openrouter/qwen/qwen3.5-flash-02-23"  # primary
HEAVY_MODEL = "openrouter/openai/gpt-oss-20b"            # >10k tokens

# ~10k tokens ≈ 40k chars at ~4 chars/token
TOKEN_THRESHOLD_CHARS = 40_000
TRANSCRIPT_HARD_CAP = 320_000  # char cap for absurdly long transcripts

OUTPUT_DIR = pathlib.Path.home() / "Desktop" / "yt_digests"
RUN_LOG = OUTPUT_DIR / "run_log.txt"
STATE_FILE = OUTPUT_DIR / ".processed_ids.json"

YOUTUBE_RE = re.compile(
    r"https?://(?:www\.)?(?:youtube\.com/watch\?[^\s<>\"']*v=|youtu\.be/)([A-Za-z0-9_-]{11})",
    re.IGNORECASE,
)
INSTAGRAM_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:p|reel|tv)/([A-Za-z0-9_-]+)",
    re.IGNORECASE,
)


# ── Logging ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(RUN_LOG, "a") as f:
        f.write(line + "\n")


# ── State ─────────────────────────────────────────────────────────────────────

def load_processed() -> set:
    if STATE_FILE.exists():
        try:
            return set(json.loads(STATE_FILE.read_text()))
        except Exception:
            return set()
    return set()


def save_processed(ids: set):
    STATE_FILE.write_text(json.dumps(sorted(ids)))


# ── Gmail IMAP ────────────────────────────────────────────────────────────────

def fetch_emails_from_self() -> list[tuple[str, str, str]]:
    """
    Fetch unprocessed self-sent emails from Gmail IMAP.
    Returns list of (uid, subject, body_text).
    """
    results = []
    with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
        imap.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        imap.select("INBOX")

        status, data = imap.uid("SEARCH", None, f'FROM "{GMAIL_USER}"')
        if status != "OK" or not data[0]:
            return results

        uids = data[0].split()
        processed = load_processed()
        new_uids = [u.decode() for u in uids if u.decode() not in processed]

        for uid in new_uids:
            status, msg_data = imap.uid("FETCH", uid, "(RFC822)")
            if status != "OK" or not msg_data[0]:
                continue

            msg = email.message_from_bytes(msg_data[0][1])

            subject_parts = email.header.decode_header(msg.get("Subject", ""))
            subject = ""
            for part, charset in subject_parts:
                if isinstance(part, bytes):
                    subject += part.decode(charset or "utf-8", errors="replace")
                else:
                    subject += part

            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if (part.get_content_type() == "text/plain"
                            and "attachment" not in part.get("Content-Disposition", "")):
                        charset = part.get_content_charset() or "utf-8"
                        body += part.get_payload(decode=True).decode(charset, errors="replace")
            else:
                charset = msg.get_content_charset() or "utf-8"
                body = msg.get_payload(decode=True).decode(charset, errors="replace")

            results.append((uid, subject, body))

    return results


# ── URL Extraction ────────────────────────────────────────────────────────────

def extract_youtube_ids(text: str) -> list[str]:
    return list(dict.fromkeys(YOUTUBE_RE.findall(text)))


def extract_instagram_urls(text: str) -> list[str]:
    return list(dict.fromkeys(m.group(0) for m in INSTAGRAM_RE.finditer(text)))


# ── Transcript ────────────────────────────────────────────────────────────────

def get_transcript(video_id: str) -> str | None:
    """Fetch YouTube transcript. Returns plain text or None."""
    api = YouTubeTranscriptApi()
    try:
        # Try English first, fall back to any available language
        try:
            fetched = api.fetch(video_id, languages=["en"])
        except NoTranscriptFound:
            transcript_list = api.list(video_id)
            fetched = transcript_list.find_generated_transcript(
                [t.language_code for t in transcript_list]
            ).fetch()
        return " ".join(s.text for s in fetched)
    except (TranscriptsDisabled, NoTranscriptFound):
        return None
    except Exception as e:
        log(f"  Transcript error for {video_id}: {e}")
        return None


# ── LLM Summarization ─────────────────────────────────────────────────────────

def summarize(transcript: str, video_id: str) -> str:
    api_key = _load_openrouter_key()
    if not api_key:
        return "[Summarization skipped — OPENROUTER_API_KEY not found in backend/.env]"

    model = HEAVY_MODEL if len(transcript) > TOKEN_THRESHOLD_CHARS else SUMMARIZE_MODEL
    capped = transcript[:TRANSCRIPT_HARD_CAP]

    prompt = (
        f"Summarize the following YouTube video transcript (ID: {video_id}).\n\n"
        "Format:\n"
        "**Topic**: (infer from content)\n"
        "**Key Points**:\n- ...\n- ...\n"
        "**Takeaway**: (1-2 sentences)\n\n"
        f"Transcript:\n{capped}"
    )

    # Strip "openrouter/" prefix — OpenRouter API uses bare model IDs
    api_model = model.removeprefix("openrouter/")

    payload = json.dumps({
        "model": api_model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }).encode()

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://github.com/VSG-repo/clawcontrol",
            "X-Title": "ClawControl yt_digest",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        return f"[Summarization failed HTTP {e.code}: {body[:200]}]"
    except Exception as e:
        return f"[Summarization failed: {e}]"


# ── File Output ───────────────────────────────────────────────────────────────

def save_digest(video_id: str, subject: str, transcript: str, summary: str) -> pathlib.Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"{ts}_{video_id}.txt"
    path.write_text(
        f"YouTube Digest\n"
        f"{'='*60}\n"
        f"Video ID : {video_id}\n"
        f"URL      : https://youtube.com/watch?v={video_id}\n"
        f"Source   : {subject}\n"
        f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"{'='*60}\n\n"
        f"SUMMARY\n"
        f"{'-'*60}\n"
        f"{summary}\n\n"
        f"FULL TRANSCRIPT\n"
        f"{'-'*60}\n"
        f"{transcript}\n",
        encoding="utf-8",
    )
    return path


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    log("=" * 60)
    log("yt_digest run started")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    processed = load_processed()
    new_processed = set(processed)
    total_videos = 0
    total_ig = 0

    try:
        emails = fetch_emails_from_self()
        log(f"Found {len(emails)} new email(s) to process")
    except imaplib.IMAP4.error as e:
        log(f"Gmail IMAP auth failed: {e}")
        log("  -> Check GMAIL_APP_PASSWORD is a valid 16-char Google App Password")
        log("     (Account > Security > 2-Step Verification > App passwords)")
        return
    except Exception as e:
        log(f"Gmail fetch failed: {e}")
        log(traceback.format_exc())
        return

    for uid, subject, body in emails:
        log(f"Processing email UID={uid} subject='{subject}'")

        yt_ids = extract_youtube_ids(body)
        ig_urls = extract_instagram_urls(body)

        if not yt_ids and not ig_urls:
            log("  No YouTube/Instagram URLs found — skipping")
            new_processed.add(uid)
            continue

        for vid_id in yt_ids:
            log(f"  YouTube: {vid_id}")
            transcript = get_transcript(vid_id)

            if transcript is None:
                log(f"  No transcript available for {vid_id}")
                out = save_digest(
                    vid_id, subject,
                    "(no transcript available — captions disabled or private)",
                    "(could not summarize — no transcript)",
                )
            else:
                log(f"  Transcript: ~{len(transcript)//4:,} tokens ({len(transcript):,} chars)")
                summary = summarize(transcript, vid_id)
                out = save_digest(vid_id, subject, transcript, summary)

            log(f"  Saved: {out.name}")
            total_videos += 1

        for ig_url in ig_urls:
            log(f"  Instagram (no transcript support): {ig_url}")
            total_ig += 1

        new_processed.add(uid)

    save_processed(new_processed)
    log(f"Done — {total_videos} video(s) processed, {total_ig} Instagram link(s) noted")
    log("=" * 60)


if __name__ == "__main__":
    run()
