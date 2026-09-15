"""SQL placeholder rendering.

The router writes its statements in one neutral form — `?`, the same shape
`sqlite3` takes — and this module translates them to whatever the *driver* the
host app actually uses expects. 0.1.x hard-coded `?` in every statement, so the
"generic" FastAPI backend could not run against Postgres at all (psycopg wants
`%s`), which is exactly the app class this package was extracted from.

Supported styles:

    qmark    ?        sqlite3, MySQLdb
    format   %s       psycopg 2/3, psycopg2.pool, SQLAlchemy raw connections
    numeric  $1, $2   asyncpg, psycopg3's `$n`-style if you build it that way

Named styles (`:name`, `%(name)s`) are deliberately NOT supported: they change the
binding contract from a positional tuple to a mapping, which is a decision the
caller has to make, not something a placeholder rewrite can fake.
"""

from __future__ import annotations

PLACEHOLDERS = {
    "qmark": "?",
    "format": "%s",
    "numeric": "$",
}

NEUTRAL = "?"


def validate_paramstyle(paramstyle: str) -> str:
    """Return the style unchanged, or raise with the list of supported styles."""
    if paramstyle not in PLACEHOLDERS:
        supported = ", ".join(sorted(PLACEHOLDERS))
        raise ValueError(f"Unsupported paramstyle {paramstyle!r}; supported: {supported}")
    return paramstyle


def count_placeholders(sql: str) -> int:
    """Count the neutral `?` placeholders in a statement."""
    return sql.count(NEUTRAL)


def render_sql(sql: str, paramstyle: str = "qmark") -> str:
    """Translate a neutral `?` statement into the driver's placeholder style.

    The neutral form is a literal `?`, so a statement must not contain a `?`
    inside a string literal or a comment — tests/test_sql.py scans the router for
    both that and placeholder/parameter mismatches.
    """
    validate_paramstyle(paramstyle)
    if paramstyle == "qmark":
        return sql
    if paramstyle == "format":
        return sql.replace(NEUTRAL, "%s")

    # numeric: positional numbering has to be per-statement, which is why this
    # walks the string instead of using str.replace.
    counter = 0
    out = []
    for char in sql:
        if char == NEUTRAL:
            counter += 1
            out.append(f"${counter}")
        else:
            out.append(char)
    return "".join(out)
