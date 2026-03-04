import argparse
import asyncio
import os
import sys
from typing import List, Set

from langchain_core.messages import HumanMessage, AIMessage

# Ensure project root (Backend) is on sys.path so `core` package imports work
CURRENT_DIR = os.path.dirname(__file__)
BACKEND_ROOT = os.path.dirname(CURRENT_DIR)
if BACKEND_ROOT not in sys.path:
  sys.path.insert(0, BACKEND_ROOT)

from core.chat_agent import ChatAgent


async def chat_loop(project_id: str) -> None:
  """
  Interactive CLI chat for the ChunkSmith bot.

  - Maintains an in-memory conversation window (last 10 turns).
  - Streams answers token-by-token to stdout.
  - Shows which internal tools were used (RAG, web search).
  - Shows referenced image filenames for each assistant reply.
  """
  agent = ChatAgent(project_id=project_id)
  history: List[HumanMessage | AIMessage] = []

  print(f"\n=== ChunkSmith CLI Chat ===")
  print(f"Project: {project_id}")
  print("Type your question and press Enter. Type '/exit' to quit.\n")

  while True:
    user_input = input("You: ").strip()
    if not user_input:
      continue
    if user_input.lower() in {"/exit", "/quit"}:
      print("Exiting chat.")
      break

    # Append user message to history (limit to last 10 messages)
    history.append(HumanMessage(content=user_input))
    history[:] = history[-10:]

    answer_chunks: List[str] = []
    image_filenames: Set[str] = set()
    rag_used = False
    web_used = False
    rag_query: str | None = None
    web_query: str | None = None
    assistant_started = False

    async for event in agent.chat_stream(user_input, external_history=history):
      event_type = event.get("type")
      data = event.get("data", {}) or {}

      if event_type == "planner_plan":
        rag_used = bool(data.get("use_rag"))
        web_used = bool(data.get("use_web"))
        rag_query = data.get("rag_query") or user_input
        web_query = data.get("web_query") or user_input
        print("[PLAN] Tool plan decided:")
        print(f"       - use_rag = {rag_used}, rag_query = {rag_query!r}")
        print(f"       - use_web = {web_used}, web_query = {web_query!r}")

      elif event_type == "search_start":
        rag_used = True
        msg = data.get("message") or f"Searching project documents for: {rag_query or user_input}"
        print(f"[RAG] {msg}")

      elif event_type == "search_complete":
        chunks = data.get("chunks_count")
        imgs = data.get("images_available")
        print(f"[RAG] Search complete – chunks: {chunks}, images: {imgs}")

      elif event_type == "web_search_start":
        web_used = True
        msg = data.get("message") or f"Running Tavily web search for: {web_query or user_input}"
        print(f"[WEB] {msg}")

      elif event_type == "web_search_complete":
        count = data.get("results_count")
        print(f"[WEB] Web search complete – results: {count}")

      elif event_type == "response_start":
        print("[LLM] Generating answer...")
        print("Assistant: ", end="", flush=True)
        assistant_started = True

      elif event_type == "images_found":
        count = data.get("count")
        print(f"\n[IMAGES] Model referenced {count} relevant image(s). Streaming them below...")

      elif event_type == "content":
        chunk = data.get("content", "")
        if chunk:
          answer_chunks.append(chunk)
          print(chunk, end="", flush=True)

      elif event_type == "image":
        filename = data.get("filename")
        if filename:
          image_filenames.add(filename)
          # Show each image filename as it streams
          print(f"\n[IMAGE] {filename}")

      elif event_type == "error":
        print(f"\n[ERROR] {data.get('message', 'Unknown error')}")

    full_answer = "".join(answer_chunks)
    print()  # newline after streaming

    # Append assistant message to history (limit to last 10 messages)
    history.append(AIMessage(content=full_answer))
    history[:] = history[-10:]

    # Summarize tools used for this turn
    print("Tools used this turn:")
    print(f"  - RAG (project vector search): {'YES' if rag_used else 'NO'}")
    print(f"  - Web search (Tavily):        {'YES' if web_used else 'NO'}")

    if image_filenames:
      print("Images:")
      for name in sorted(image_filenames):
        print(f"  - {name}")
    print()  # blank line between turns


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Interactive CLI chat with the ChunkSmith bot."
  )
  parser.add_argument(
    "--project",
    "-p",
    required=True,
    help="Project ID to chat with (e.g. NCERT)",
  )

  args = parser.parse_args()
  asyncio.run(chat_loop(args.project))


if __name__ == "__main__":
  main()

