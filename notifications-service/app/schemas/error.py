from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: dict

    class Config:
        json_schema_extra = {
            "example": {
                "error": {
                    "message": "Resource not found",
                    "type": "NotFound",
                    "code": 404,
                }
            }
        }
