import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

client: AsyncIOMotorClient = None


def get_db():
    mongo_db = os.getenv("MONGO_DB", "front_office")
    return client[mongo_db]


async def init_db():
    global client
    load_dotenv()
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGO_DB", "front_office")
    client = AsyncIOMotorClient(mongo_url)
    db = client[mongo_db]
    await db.users.create_index("username", unique=True)
    await db.threads.create_index([("user_id", 1), ("created_at", -1)])
    await db.ingested_files.create_index([("filename", 1), ("etag", 1)], unique=True)
