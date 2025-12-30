import os
import asyncio
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage


async def check_key(name: str, api_key: str):
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",
            temperature=0,
            google_api_key="AIzaSyBucwuIi-36QdHu6jEcnBKPMCvKFEhpntw",
        )

        response = await llm.ainvoke([
            HumanMessage(content="hello")
        ])

        print(f"[VALID] {name} works")
        return True

    except Exception as e:
        print(f"[INVALID] {name} failed → {str(e)[:120]}")
        return False


async def main():
    load_dotenv()

    key_names = [
        "GOOGLE_API_KEY",
        # "GOOGLE_API_KEY_1",
        # "GOOGLE_API_KEY_2",
        # "GOOGLE_API_KEY_3",
        # "GOOGLE_API_KEY_4",
        # "GOOGLE_API_KEY_5",
        # "GOOGLE_API_KEY_6",
        # "GOOGLE_API_KEY_7",
    ]

    tasks = []

    for name in key_names:
        key = os.getenv(name)
        if key and key.strip():
            tasks.append(check_key(name, key.strip()))
        else:
            print(f"[SKIPPED] {name} not found or empty")

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
