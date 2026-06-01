"""Route factory — create_share_router(config) → APIRouter.

Generic share + referral endpoints. All project-specific logic
lives in ShareKitConfig (DB access, reward strategy, table names).
"""

import json
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from .config import ShareKitConfig
from .schemas import ShareCreate, ShareResponse, ReferralStats


class ReferralApply(BaseModel):
    code: str


def create_share_router(config: ShareKitConfig) -> APIRouter:
    """Create a FastAPI router with share + referral endpoints."""
    router = APIRouter(tags=["share-kit"])

    # --- Share endpoints ---

    @router.post("/shares", response_model=ShareResponse)
    async def create_share(
        body: ShareCreate,
        db=Depends(config.get_db),
        user=Depends(config.get_current_user),
    ):
        if body.share_type not in config.allowed_share_types:
            raise HTTPException(400, "Invalid share_type")

        share_code = secrets.token_urlsafe(6)
        user_id = getattr(user, config.user_id_field, None) or user.get(config.user_id_field)

        db.execute(
            f"INSERT INTO {config.shares_table} (share_code, user_id, share_type, payload) VALUES (?, ?, ?, ?)",
            (share_code, user_id, body.share_type, json.dumps(body.payload)),
        )
        db.commit()

        return ShareResponse(share_code=share_code, share_type=body.share_type, payload=body.payload)

    @router.get("/shares/{share_code}", response_model=ShareResponse)
    async def get_share(share_code: str, db=Depends(config.get_db)):
        row = db.execute(
            f"""SELECT s.share_code, s.share_type, s.payload, s.view_count,
                       u.{config.user_name_field} as user_name
                FROM {config.shares_table} s
                LEFT JOIN {config.users_table} u ON s.user_id = u.{config.user_id_field}
                WHERE s.share_code = ?""",
            (share_code,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Share not found")

        # Atomic increment
        db.execute(
            f"UPDATE {config.shares_table} SET view_count = view_count + 1 WHERE share_code = ?",
            (share_code,),
        )
        db.commit()

        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)

        return ShareResponse(
            share_code=row["share_code"],
            share_type=row["share_type"],
            payload=payload,
            user_name=row["user_name"],
            view_count=row["view_count"] + 1,
        )

    # --- Referral endpoints ---

    @router.get("/referral/code", response_model=ReferralStats)
    async def get_referral_code(
        db=Depends(config.get_db),
        user=Depends(config.get_current_user),
    ):
        user_id = getattr(user, config.user_id_field, None) or user.get(config.user_id_field)

        row = db.execute(
            f"SELECT {config.user_referral_code_field} FROM {config.users_table} WHERE {config.user_id_field} = ?",
            (user_id,),
        ).fetchone()

        code = row[config.user_referral_code_field] if row else None
        if not code:
            code = secrets.token_hex(4)
            db.execute(
                f"UPDATE {config.users_table} SET {config.user_referral_code_field} = ? WHERE {config.user_id_field} = ?",
                (code, user_id),
            )
            db.commit()

        return ReferralStats(referral_code=code, referral_count=0, url=f"/?ref={code}")

    @router.get("/referral/stats", response_model=ReferralStats)
    async def get_referral_stats(
        db=Depends(config.get_db),
        user=Depends(config.get_current_user),
    ):
        user_id = getattr(user, config.user_id_field, None) or user.get(config.user_id_field)

        row = db.execute(
            f"SELECT {config.user_referral_code_field} FROM {config.users_table} WHERE {config.user_id_field} = ?",
            (user_id,),
        ).fetchone()
        code = row[config.user_referral_code_field] if row else ""

        count_row = db.execute(
            f"SELECT COUNT(*) as cnt FROM {config.referral_rewards_table} WHERE referrer_id = ?",
            (user_id,),
        ).fetchone()
        count = count_row["cnt"] if count_row else 0

        return ReferralStats(referral_code=code, referral_count=count, url=f"/?ref={code}")

    @router.post("/referral/apply", response_model=dict)
    async def apply_referral(
        body: ReferralApply,
        db=Depends(config.get_db),
        user=Depends(config.get_current_user),
    ):
        user_id = getattr(user, config.user_id_field, None) or user.get(config.user_id_field)

        # Find referrer
        referrer = db.execute(
            f"SELECT {config.user_id_field} FROM {config.users_table} WHERE {config.user_referral_code_field} = ?",
            (body.code,),
        ).fetchone()
        if not referrer:
            raise HTTPException(404, "Invalid referral code")

        referrer_id = referrer[config.user_id_field]
        if referrer_id == user_id:
            raise HTTPException(400, "Cannot refer yourself")

        # 🔴 FIX: Idempotency check — prevent duplicate referral rewards
        existing = db.execute(
            f"SELECT 1 FROM {config.referral_rewards_table} WHERE referee_id = ?",
            (user_id,),
        ).fetchone()
        if existing:
            raise HTTPException(409, "Referral already applied")

        # Apply reward strategy
        result = None
        if config.reward_strategy:
            result = await config.reward_strategy(referrer_id, user_id, db)

        # Record
        db.execute(
            f"INSERT INTO {config.referral_rewards_table} (referrer_id, referee_id, reward_type) VALUES (?, ?, ?)",
            (referrer_id, user_id, "referral"),
        )
        db.commit()

        return {"status": "ok", "reward": result}

    return router
