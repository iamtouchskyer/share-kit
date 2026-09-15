"""Pydantic schemas for share kit API."""

from pydantic import BaseModel
from typing import Any


class ShareCreate(BaseModel):
    share_type: str
    payload: dict[str, Any] = {}


class ShareResponse(BaseModel):
    share_code: str
    share_type: str
    payload: dict[str, Any] = {}
    user_name: str | None = None
    view_count: int = 0


class ReferralStats(BaseModel):
    referral_code: str
    referral_count: int
    url: str
