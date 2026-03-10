from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class SendResult:
    """Result of sending a notification"""
    provider_id: str
    status: str
    error: Optional[str] = None


class NotificationProvider(ABC):
    """Base class for notification providers"""

    @abstractmethod
    async def send(self, target: str, message: str) -> SendResult:
        """
        Send a notification to the target.
        
        Args:
            target: The recipient (phone number, email, etc.)
            message: The message to send
            
        Returns:
            SendResult with provider ID and status
        """
        pass

    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name"""
        pass
