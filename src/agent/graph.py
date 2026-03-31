import os
from typing import Annotated

from dotenv import load_dotenv
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import InjectedToolArg, tool
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent

from src.agent.search import QDRANT_COLLECTION, run_search

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:397b-cloud")

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful bank assistant. "
    "When the user asks a question, always use the search_documents tool first "
    "to find relevant information from the knowledge base, then provide a clear and accurate answer. "
    "Answer in the same language the user used."
)


def get_settings() -> dict:
    from pymongo import MongoClient
    mongo = MongoClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
    doc = mongo[os.getenv("MONGO_DB", "front_office")].settings.find_one({"_id": "global"})
    mongo.close()
    return doc or {}


def _system_prompt(state, config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("system_prompt", DEFAULT_SYSTEM_PROMPT)


llm = ChatOllama(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL, temperature=0)


@tool
def search_documents(
    query: str,
    config: Annotated[RunnableConfig, InjectedToolArg],
) -> str:
    """Search the knowledge base for relevant information to answer the user's question."""
    settings = get_settings()
    top_k = int(settings.get("top_k", 5))
    collection = config.get("configurable", {}).get("collection", QDRANT_COLLECTION)
    chunks = run_search(query, top_k=top_k, collection=collection)
    if not chunks:
        return "No relevant documents found."
    return "\n\n---\n\n".join(f"[Source: {c['source']}]\n{c['text']}" for c in chunks)


graph = create_react_agent(
    model=llm,
    tools=[search_documents],
    prompt=_system_prompt,
)
