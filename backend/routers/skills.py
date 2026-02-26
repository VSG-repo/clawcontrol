from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from auth import require_auth

router = APIRouter()

SKILLS_DIR = Path.home() / ".openclaw" / "workspace" / "skills"


def _read_skill_meta(skill_dir: Path) -> dict:
    files = [f.name for f in skill_dir.iterdir() if f.is_file()]
    readme = skill_dir / "SKILL.md"
    has_readme = readme.exists()

    description = "No description"
    if has_readme:
        try:
            lines = readme.read_text(encoding="utf-8").splitlines()
            # Skip blank lines and headings to find first descriptive line
            for line in lines:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    description = stripped
                    break
        except Exception:
            pass

    return {
        "name": skill_dir.name,
        "description": description,
        "path": str(skill_dir),
        "has_readme": has_readme,
        "files": sorted(files),
    }


@router.get("/api/skills")
def list_skills(_=Depends(require_auth)):
    if not SKILLS_DIR.exists():
        return {"skills": [], "count": 0}

    skills = []
    for entry in sorted(SKILLS_DIR.iterdir()):
        if entry.is_dir():
            try:
                skills.append(_read_skill_meta(entry))
            except Exception:
                continue

    return {"skills": skills, "count": len(skills)}


@router.get("/api/skills/{name}")
def get_skill(name: str, _=Depends(require_auth)):
    # Prevent path traversal
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid skill name")

    skill_dir = SKILLS_DIR / name
    if not skill_dir.exists() or not skill_dir.is_dir():
        raise HTTPException(status_code=404, detail="Skill not found")

    readme = skill_dir / "SKILL.md"
    content = None
    if readme.exists():
        try:
            content = readme.read_text(encoding="utf-8")
        except Exception:
            content = None

    return {
        "name": name,
        "content": content,
        "has_readme": content is not None,
    }
