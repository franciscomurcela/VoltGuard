import uuid
from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_token
from app.schemas import TokenRequest, TokenResponse
from app.state import db_tokens

logger = logging.getLogger("voltguard-api")
router = APIRouter(tags=["6. Token Management"])


@router.post("/v1/auth/tokens", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def create_token(token_request: TokenRequest, token: str = Depends(verify_token)):
    token_id = f"token_{uuid.uuid4().hex[:12]}"
    new_token = f"vg_{uuid.uuid4().hex}"

    db_tokens[new_token] = token_request.service_name
    logger.info(f"🔑 Novo token gerado para: {token_request.service_name}")

    return TokenResponse(
        token_id=token_id,
        token=new_token,
        service_name=token_request.service_name,
        created_at=datetime.now().isoformat(),
    )


@router.delete("/v1/auth/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: str, token: str = Depends(verify_token)):
    removed = False
    for tok in list(db_tokens.keys()):
        if tok.startswith("vg_"):
            del db_tokens[tok]
            removed = True
            logger.info(f"🗑️ Token revogado: {token_id}")
            break

    if not removed:
        logger.warning(f"⚠️ Tentativa de revogar token inexistente: {token_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token não encontrado.",
        )

    return None
