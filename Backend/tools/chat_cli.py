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
  - Streams answers to stdout.
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

    print("Assistant: ", end="", flush=True)

    answer_chunks: List[str] = []
    image_filenames: Set[str] = set()

    async for event in agent.chat_stream(user_input, external_history=history):
      event_type = event.get("type")
      data = event.get("data", {}) or {}

      if event_type == "content":
        chunk = data.get("content", "")
        if chunk:
          answer_chunks.append(chunk)
          print(chunk, end="", flush=True)

      elif event_type == "image":
        filename = data.get("filename")
        if filename:
          image_filenames.add(filename)

      elif event_type == "error":
        print(f"\n[ERROR] {data.get('message', 'Unknown error')}")

    full_answer = "".join(answer_chunks)
    print()  # newline after streaming

    # Append assistant message to history (limit to last 10 messages)
    history.append(AIMessage(content=full_answer))
    history[:] = history[-10:]

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

