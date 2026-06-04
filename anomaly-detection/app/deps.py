import logging
from fastapi import Header, HTTPException, status
from .state import db_tokens

logger = logging.getLogger("voltguard-api")


def verify_token(x_app_token: str = Header(alias="X-App-Token")):
    if x_app_token not in db_tokens:
        logger.warning("⚠️ Tentativa de acesso com token inválido")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou revogado.",
        )
    logger.debug(f"Token validado: {db_tokens[x_app_token]}")
    return x_app_token
