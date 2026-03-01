"""
Shared input validation utilities.

Imported by routers that need custom validation logic beyond simple Field constraints.
"""
import re

# ── Cron expression ────────────────────────────────────────────────────────────

_CRON_MACROS = frozenset({
    "@yearly", "@annually", "@monthly", "@weekly",
    "@daily", "@midnight", "@hourly", "@reboot",
})

# Permit only digits, whitespace, and standard cron punctuation.
# Rejects shell metacharacters: ; & | $ ` ( ) < > ! \ " '
_CRON_SAFE_RE = re.compile(r'^[\d\s,*/\-?LW#@]+$')


def validate_cron_expression(expr: str) -> str:
    """
    Validate a standard 5-field cron expression or a known @ macro.
    Returns the expression unchanged if valid; raises ValueError if not.

    Accepted forms:
      "* * * * *"        — every minute (5 fields)
      "0 9 * * 1-5"      — weekday mornings
      "*/15 * * * * *"   — every 15 s (6-field with leading seconds)
      "@daily"           — macro alias
    """
    if expr.startswith("@"):
        if expr not in _CRON_MACROS:
            allowed = ", ".join(sorted(_CRON_MACROS))
            raise ValueError(
                f"Unknown cron macro '{expr}'. Allowed macros: {allowed}"
            )
        return expr

    if not _CRON_SAFE_RE.match(expr):
        raise ValueError(
            "Cron expression contains invalid characters. "
            "Only digits, spaces, and cron punctuation (*/,-?LW#) are allowed."
        )

    parts = expr.split()
    if len(parts) not in (5, 6):
        raise ValueError(
            f"Cron expression must have 5 fields (min hr dom mon dow) "
            f"or 6 fields (sec min hr dom mon dow), got {len(parts)}."
        )
    return expr
