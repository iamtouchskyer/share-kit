"""ShareKitConfig — all project-specific behavior injected here."""

import re
from dataclasses import dataclass, field
from typing import Any, Callable

_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def _validate_identifier(name: str, field_name: str):
    """Validate SQL identifier to prevent injection."""
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier for {field_name}: {name!r}")


@dataclass
class ShareKitConfig:
    """Configuration for share kit router factory.

    All project-specific logic is injected via this config:
    - get_db: FastAPI dependency that returns a DB connection/session
    - get_current_user: FastAPI dependency that returns the authenticated user
    - reward_strategy: async (referrer_id, referred_id, db) -> dict | None
    """

    # Share types this app supports (arbitrary strings)
    allowed_share_types: list[str] = field(
        default_factory=lambda: ["streak", "result", "rank"]
    )

    # Referral reward logic — injected strategy
    # Signature: async (referrer_id: str, referred_id: str, db) -> dict | None
    reward_strategy: Callable | None = None

    # Branding (returned in responses, used by frontend)
    branding: dict = field(
        default_factory=lambda: {"name": "App", "domain": "example.com"}
    )

    # FastAPI dependencies (injected)
    get_db: Any = None
    get_current_user: Any = None

    # Table names (for raw SQL projects)
    shares_table: str = "shares"
    users_table: str = "users"
    referral_rewards_table: str = "referral_rewards"

    # User model field names
    user_id_field: str = "id"
    user_name_field: str = "name"
    user_referral_code_field: str = "referral_code"

    def __post_init__(self):
        """Validate all identifier fields to prevent SQL injection."""
        for field_name in (
            "shares_table", "users_table", "referral_rewards_table",
            "user_id_field", "user_name_field", "user_referral_code_field",
        ):
            _validate_identifier(getattr(self, field_name), field_name)
