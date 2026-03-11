import logging
import os

logger = logging.getLogger(__name__)


def check_AuthTokenQuery(api_key, required_scopes):
    """Validate the auth_token query parameter against AUTH_TOKEN env var."""
    expected = os.environ.get('AUTH_TOKEN', '')
    if not expected:
        logger.warning("AUTH_TOKEN env var is not set — rejecting all requests")
        return None
    if api_key == expected:
        return {'client': 'authenticated'}
    logger.warning("Invalid auth_token received (length=%d)", len(api_key) if api_key else 0)
    return None
