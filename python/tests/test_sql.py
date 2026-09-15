"""Placeholder + statement guards for the FastAPI router.

These run without a database and without FastAPI: the point is that a
placeholder-dialect bug is a *string* bug, so it must be catchable in a plain
unit test instead of only showing up as a Postgres syntax error in production.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

from share_kit.config import ShareKitConfig
from share_kit.sql import (
    PLACEHOLDERS,
    count_placeholders,
    render_sql,
    validate_paramstyle,
)

ROUTER_PATH = pathlib.Path(__file__).resolve().parent.parent / "share_kit" / "router.py"


def test_renders_each_supported_style():
    statement = "SELECT a FROM t WHERE b = ? AND c = ?"
    assert render_sql(statement, "qmark") == "SELECT a FROM t WHERE b = ? AND c = ?"
    assert render_sql(statement, "format") == "SELECT a FROM t WHERE b = %s AND c = %s"
    assert render_sql(statement, "numeric") == "SELECT a FROM t WHERE b = $1 AND c = $2"


def test_qmark_is_the_default_and_a_no_op():
    statement = "UPDATE t SET a = ? WHERE id = ?"
    assert render_sql(statement) == statement


def test_numeric_numbering_restarts_per_statement():
    first = render_sql("INSERT INTO t (a, b) VALUES (?, ?)", "numeric")
    second = render_sql("SELECT * FROM t WHERE a = ?", "numeric")
    assert first == "INSERT INTO t (a, b) VALUES ($1, $2)"
    assert second == "SELECT * FROM t WHERE a = $1"


def test_statement_without_placeholders_is_untouched():
    statement = "SELECT COUNT(*) FROM t"
    for style in PLACEHOLDERS:
        assert render_sql(statement, style) == statement


def test_unknown_style_is_rejected_with_the_supported_list():
    with pytest.raises(ValueError) as error:
        validate_paramstyle("pyformat")
    message = str(error.value)
    assert "pyformat" in message
    assert "format" in message and "qmark" in message


def test_count_placeholders():
    assert count_placeholders("INSERT INTO t (a, b) VALUES (?, ?)") == 2
    assert count_placeholders("SELECT 1") == 0


def test_config_defaults_to_the_old_behaviour_and_accepts_others():
    assert ShareKitConfig().paramstyle == "qmark"
    assert ShareKitConfig(paramstyle="format").paramstyle == "format"
    with pytest.raises(ValueError):
        ShareKitConfig(paramstyle="named")


def _joined_str_text(node: ast.JoinedStr) -> str:
    """Rebuild an f-string's literal text, marking interpolations."""
    out = []
    for value in node.values:
        if isinstance(value, ast.Constant):
            out.append(str(value.value))
        elif isinstance(value, ast.FormattedValue):
            out.append("«expr»")
        else:  # pragma: no cover - defensive
            out.append("«?»")
    return "".join(out)


def _router_calls():
    tree = ast.parse(ROUTER_PATH.read_text())
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "execute":
            yield node


def test_every_statement_goes_through_the_placeholder_renderer():
    calls = list(_router_calls())
    assert calls, "the router should execute statements"

    for call in calls:
        assert isinstance(call.args[0], ast.Call), (
            "every db.execute() statement must be wrapped in _sql(..., config) so it is "
            f"translated for the host driver (line {call.lineno})"
        )
        wrapper = call.args[0]
        assert isinstance(wrapper.func, ast.Name) and wrapper.func.id == "_sql"


def test_statements_are_neutral_and_match_their_parameters():
    """`?` placeholders only, and exactly one per bound parameter.

    This is the guard that keeps the refactor honest: a new statement that pastes
    `%s` (or forgets a placeholder for a new parameter) fails here instead of at
    runtime against whichever driver the host app uses.
    """
    checked = 0
    for call in _router_calls():
        wrapper = call.args[0]
        sql_node = wrapper.args[0]
        assert isinstance(sql_node, ast.JoinedStr), f"line {call.lineno}: expected an f-string statement"
        template = _joined_str_text(sql_node)

        assert "%s" not in template, f"line {call.lineno}: %s is not neutral; use ?"
        assert "$" not in template, f"line {call.lineno}: $n is not neutral; use ?"
        assert "'?'" not in template, f"line {call.lineno}: a literal ? inside quotes is ambiguous"

        params = call.args[1] if len(call.args) > 1 else None
        if isinstance(params, ast.Tuple):
            assert count_placeholders(template) == len(params.elts), (
                f"line {call.lineno}: {count_placeholders(template)} placeholders for "
                f"{len(params.elts)} parameters"
            )
        checked += 1

    assert checked >= 10, f"expected the router's statements to be checked, saw {checked}"
