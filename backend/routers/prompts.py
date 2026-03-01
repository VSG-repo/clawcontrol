"""
Prompts & Templates router — Phase 7
Stores under ~/.openclaw/clawcontrol_prompts.json (separate from clawcontrol.json).
"""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from auth import require_auth

router = APIRouter()

PROMPTS_CONFIG = Path.home() / ".openclaw" / "clawcontrol_prompts.json"

STARTER_TEMPLATES = {
    "skill": {
        "title": "SKILL.md",
        "template_type": "skill",
        "content": """# Skill Name

Brief one-line description of what this skill does.

## Description

A longer description of this skill, its purpose, and when to use it.

## Requirements

- List any dependencies or prerequisites here
- External tools, APIs, or services required

## Usage

```
/skill-name [arguments]
```

Describe how to invoke this skill and what arguments it accepts.

### Examples

```
/skill-name example-argument
```

## Configuration

Describe any configuration options or environment variables needed.

## Security

Note any security considerations, permissions required, or data handling details.
""",
    },
    "readme": {
        "title": "README.md",
        "template_type": "readme",
        "content": """# Project Name

> Short project tagline or description.

## Overview

Describe what this project does and why it exists.

## Installation

```bash
# Clone the repository
git clone https://github.com/user/project.git
cd project

# Install dependencies
npm install
```

## Usage

```bash
npm start
```

Describe the main usage patterns and common workflows.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |

## License

MIT © [Your Name]
""",
    },
    "system_prompt": {
        "title": "SYSTEM_PROMPT.md",
        "template_type": "system_prompt",
        "content": """# Agent System Prompt

## Identity

You are [Agent Name], a [role description]. You were created to [primary purpose].

## Capabilities

You can help with:
- Task type 1
- Task type 2
- Task type 3

## Constraints

- Never do X
- Always verify Y before proceeding
- Do not access Z without explicit permission

## Tone & Style

- Be concise and direct
- Use technical language appropriate to the audience
- Ask clarifying questions when requirements are ambiguous

## Output Format

Prefer structured responses with clear sections. Use markdown formatting for
code blocks, lists, and headings where appropriate.
""",
    },
}


# ── Pydantic models ────────────────────────────────────────────────────────────

_TemplateType = Literal["skill", "readme", "system_prompt", "custom"]


class PromptCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=64_000)
    category: Optional[str] = Field("custom", max_length=50)


class PromptUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1, max_length=64_000)
    category: Optional[str] = Field(None, max_length=50)


class PromptSend(BaseModel):
    variables: Optional[dict[str, Any]] = Field(default={})

    @field_validator("variables")
    @classmethod
    def validate_variables(cls, v: dict | None) -> dict:
        if not v:
            return {}
        if len(v) > 50:
            raise ValueError("Too many variables (max 50)")
        result: dict[str, str] = {}
        for key, value in v.items():
            if len(str(key)) > 100:
                raise ValueError(f"Variable key too long (max 100 chars): {str(key)[:40]!r}")
            str_val = str(value)
            if len(str_val) > 10_000:
                raise ValueError(f"Variable value too long for key {str(key)[:40]!r} (max 10 000 chars)")
            result[str(key)] = str_val
        return result


class TemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=0, max_length=128_000)
    template_type: Optional[_TemplateType] = "custom"


class TemplateUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=0, max_length=128_000)
    template_type: Optional[_TemplateType] = None


class TemplateExport(BaseModel):
    path: str = Field(min_length=1, max_length=500)


# ── IO helpers ─────────────────────────────────────────────────────────────────

def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    tmp_path.replace(path)


def _load_data() -> dict:
    if not PROMPTS_CONFIG.exists():
        return {"prompts": [], "templates": []}
    try:
        with PROMPTS_CONFIG.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read prompts config: {e}")
    if not isinstance(data, dict):
        return {"prompts": [], "templates": []}
    data.setdefault("prompts", [])
    data.setdefault("templates", [])
    return data


def _save_data(data: dict) -> None:
    _atomic_write_json(PROMPTS_CONFIG, data)


# ── Variable extraction ────────────────────────────────────────────────────────

def _extract_variables(content: str) -> list[str]:
    """Extract unique {{variable}} names from content, preserving order."""
    seen = set()
    out = []
    for match in re.finditer(r"\{\{(\w+)\}\}", content):
        name = match.group(1)
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _fill_variables(content: str, variables: dict) -> str:
    """Replace {{variable}} placeholders with provided values."""
    for key, value in variables.items():
        content = content.replace(f"{{{{{key}}}}}", str(value))
    return content


# ── Prompt endpoints ───────────────────────────────────────────────────────────

@router.get("/api/prompts", dependencies=[Depends(require_auth)])
def get_prompts():
    data = _load_data()
    return {"prompts": data["prompts"], "count": len(data["prompts"])}


@router.post("/api/prompts", dependencies=[Depends(require_auth)])
def create_prompt(body: PromptCreate):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title must not be empty")
    content = body.content
    now = datetime.now(tz=timezone.utc).isoformat()
    entry = {
        "id":         str(uuid4()),
        "title":      title,
        "content":    content,
        "category":   (body.category or "custom").strip().lower(),
        "variables":  _extract_variables(content),
        "created_at": now,
        "updated_at": now,
    }
    data = _load_data()
    data["prompts"].append(entry)
    _save_data(data)
    return {"ok": True, "prompt": entry}


@router.put("/api/prompts/{prompt_id}", dependencies=[Depends(require_auth)])
def update_prompt(prompt_id: str, body: PromptUpdate):
    data = _load_data()
    for prompt in data["prompts"]:
        if prompt["id"] == prompt_id:
            if body.title is not None:
                t = body.title.strip()
                if not t:
                    raise HTTPException(status_code=400, detail="title must not be empty")
                prompt["title"] = t
            if body.content is not None:
                prompt["content"] = body.content
                prompt["variables"] = _extract_variables(body.content)
            if body.category is not None:
                prompt["category"] = body.category.strip().lower()
            prompt["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
            _save_data(data)
            return {"ok": True, "prompt": prompt}
    raise HTTPException(status_code=404, detail=f"Prompt not found: {prompt_id}")


@router.delete("/api/prompts/{prompt_id}", dependencies=[Depends(require_auth)])
def delete_prompt(prompt_id: str):
    data = _load_data()
    before = len(data["prompts"])
    data["prompts"] = [p for p in data["prompts"] if p["id"] != prompt_id]
    if len(data["prompts"]) == before:
        raise HTTPException(status_code=404, detail=f"Prompt not found: {prompt_id}")
    _save_data(data)
    return {"ok": True, "id": prompt_id}


@router.post("/api/prompts/{prompt_id}/send", dependencies=[Depends(require_auth)])
def send_prompt(prompt_id: str, body: PromptSend):
    data = _load_data()
    for prompt in data["prompts"]:
        if prompt["id"] == prompt_id:
            resolved = _fill_variables(prompt["content"], body.variables or {})
            return {
                "ok":       True,
                "prompt_id": prompt_id,
                "resolved": resolved,
                "variables_used": list((body.variables or {}).keys()),
            }
    raise HTTPException(status_code=404, detail=f"Prompt not found: {prompt_id}")


# ── Template endpoints ─────────────────────────────────────────────────────────

@router.get("/api/templates", dependencies=[Depends(require_auth)])
def get_templates():
    data = _load_data()
    return {"templates": data["templates"], "count": len(data["templates"])}


@router.post("/api/templates", dependencies=[Depends(require_auth)])
def create_template(body: TemplateCreate):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title must not be empty")
    now = datetime.now(tz=timezone.utc).isoformat()
    entry = {
        "id":            str(uuid4()),
        "title":         title,
        "content":       body.content,
        "template_type": (body.template_type or "custom").strip().lower(),
        "created_at":    now,
        "updated_at":    now,
    }
    data = _load_data()
    data["templates"].append(entry)
    _save_data(data)
    return {"ok": True, "template": entry}


@router.put("/api/templates/{template_id}", dependencies=[Depends(require_auth)])
def update_template(template_id: str, body: TemplateUpdate):
    data = _load_data()
    for tmpl in data["templates"]:
        if tmpl["id"] == template_id:
            if body.title is not None:
                t = body.title.strip()
                if not t:
                    raise HTTPException(status_code=400, detail="title must not be empty")
                tmpl["title"] = t
            if body.content is not None:
                tmpl["content"] = body.content
            if body.template_type is not None:
                tmpl["template_type"] = body.template_type.strip().lower()
            tmpl["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
            _save_data(data)
            return {"ok": True, "template": tmpl}
    raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")


@router.delete("/api/templates/{template_id}", dependencies=[Depends(require_auth)])
def delete_template(template_id: str):
    data = _load_data()
    before = len(data["templates"])
    data["templates"] = [t for t in data["templates"] if t["id"] != template_id]
    if len(data["templates"]) == before:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    _save_data(data)
    return {"ok": True, "id": template_id}


@router.post("/api/templates/{template_id}/export", dependencies=[Depends(require_auth)])
def export_template(template_id: str, body: TemplateExport):
    # Security: path must resolve to somewhere under ~/.openclaw/
    openclaw_root = Path.home() / ".openclaw"
    raw_path = Path(body.path.replace("~", str(Path.home())))
    try:
        resolved = raw_path.resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not str(resolved).startswith(str(openclaw_root.resolve())):
        raise HTTPException(status_code=400, detail="Export path must be under ~/.openclaw/")

    data = _load_data()
    for tmpl in data["templates"]:
        if tmpl["id"] == template_id:
            resolved.parent.mkdir(parents=True, exist_ok=True)
            resolved.write_text(tmpl["content"], encoding="utf-8")
            return {"ok": True, "path": str(resolved)}
    raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")


@router.get("/api/templates/starters", dependencies=[Depends(require_auth)])
def get_starters():
    return {
        "starters": [
            {"key": k, "title": v["title"], "template_type": v["template_type"], "content": v["content"]}
            for k, v in STARTER_TEMPLATES.items()
        ]
    }
