import re
from typing import Optional, Dict, Any


def process_template(template: str, variables: Optional[Dict[str, Any]]) -> str:
    """
    Process message template and replace variables in {{key}} format.
    
    Args:
        template: Message template with {{variable}} placeholders
        variables: Dictionary of variables to substitute
        
    Returns:
        Processed message with variables replaced
    """
    if not variables:
        return template
    
    result = template
    for key, value in variables.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    
    return result


def generate_opt_out_secret(target: str, channel_name: str) -> str:
    """
    Generate a unique secret for opt-out functionality.
    
    Args:
        target: The notification target (phone/email)
        channel_name: The channel name
        
    Returns:
        Unique hash for opt-out
    """
    import hashlib
    from datetime import datetime
    
    timestamp = datetime.utcnow().timestamp()
    data = f"{target}:{channel_name}:{timestamp}"
    
    return hashlib.sha256(data.encode()).hexdigest()
