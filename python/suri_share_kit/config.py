"""ShareKitConfig — all project-specific behavior injected here."""

from dataclasses import dataclass, field
from typing import Any, Callable


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
