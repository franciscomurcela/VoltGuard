from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

# MongoDB client instance
client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


async def connect_db():
    """Connect to MongoDB on startup"""
    global client, db
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_database]
    
    # Create indexes for better query performance
    await db.notifications.create_index("client_id")
    await db.notifications.create_index("created_at")
    await db.notifications.create_index([("client_id", 1), ("created_at", -1)])


async def disconnect_db():
    """Disconnect from MongoDB on shutdown"""
    global client
    if client:
        client.close()


def get_db() -> AsyncIOMotorDatabase:
    """Get database instance for dependency injection"""
    return db
