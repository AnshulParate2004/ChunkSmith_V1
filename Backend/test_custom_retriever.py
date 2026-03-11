import asyncio
import os
from dotenv import load_dotenv

# Ensure we're running from the Backend directory so imports work
import sys
from pathlib import Path

# Add Backend to python path if not already there
backend_dir = Path(__file__).parent.parent.absolute()
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.chat_agent import ChatAgent
from tools.chat_tools import get_customized_retriever_tool

load_dotenv()

async def test_custom_retriever():
    print("--------------------------------------------------")
    print("Testing customized_retriever tool")
    print("--------------------------------------------------")

    # We need a project_id that actually has a collection in your Qdrant/Supabase
    # Please replace 'YOUR_TEST_PROJECT_ID' with an actual project ID you have processed documents for!
    # For now, we will ask the user to provide it or assume a specific one if known.
    # We will use a dummy project ID to show the structure, but it will likely fail if it doesn't exist.
    project_id = os.getenv("TEST_PROJECT_ID", "NCERT") # Change this locally!
    
    print(f"Initializing ChatAgent for project: {project_id}...")
    try:
        agent = ChatAgent(project_id=project_id)
    except Exception as e:
        print(f"\n[ERROR] Failed to initialize agent. Make sure you set a valid project_id!\n")
        print(f"Error details: {e}")
        print("\nTo fix this: Edit this file and change 'project_id' to an actual processed document's project_id,")
        print("or set the TEST_PROJECT_ID environment variable.")
        return

    # Get the tool
    custom_retriever = get_customized_retriever_tool(agent)
    
    # 1. Test finding tables
    print("\n\n--- Test 1: Searching for Tables ---")
    query_tables = "financial data"
    print(f"Query: '{query_tables}' | needs_table=True, needs_image=False, needs_text=False")
    
    try:
        # Call the tool directly (Langchain @tool objects can be invoked directly)
        result_table = custom_retriever.invoke({
            "query": query_tables,
            "needs_text": False,
            "needs_image": False,
            "needs_table": True,
            "search_depth": 20,
            "return_limit": 5
        })
        print("\nResult:")
        print(result_table)
    except Exception as e:
        print(f"Error running tool: {e}")
        
    # 2. Test finding images
    print("\n\n--- Test 2: Searching for Images ---")
    query_images = "diagrams or charts"
    print(f"Query: '{query_images}' | needs_table=False, needs_image=True, needs_text=False")
    
    try:
        result_image = custom_retriever.invoke({
            "query": query_images,
            "needs_text": False,
            "needs_image": True,
            "needs_table": False,
            "search_depth": 10,
            "return_limit": 2
        })
        print("\nResult:")
        print(result_image)
    except Exception as e:
        print(f"Error running tool: {e}")

if __name__ == "__main__":
    asyncio.run(test_custom_retriever())
