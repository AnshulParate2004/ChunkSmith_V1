import os
import sys


def ensure_backend_on_path() -> None:
    """
    Ensure the Backend root directory is on sys.path so that
    'utils' imports work when this script is run directly.
    """
    here = os.path.abspath(os.path.dirname(__file__))
    backend_root = os.path.abspath(os.path.join(here, os.pardir))
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)


def print_divider(label: str = "") -> None:
    line = "=" * 80
    if label:
        print("\n" + line)
        print(label)
        print(line)
    else:
        print("\n" + line + "\n")


def run_single_retrieval(project_id: str, question: str, k: int = 3) -> None:
    """
    Run a single retrieval against the vector store for the given project
    and print the top-k chunks and their metadata.
    """
    from utils.vector_store import VectorStoreManager  # imported after sys.path setup

    # Initialize vector store manager and load collection for the project
    manager = VectorStoreManager(embedding_model="text-embedding-3-large")
    vectorstore = manager.load_vector_store(collection_name=project_id)

    print_divider("[RAG] Vector search")
    print("Project:", project_id)
    print("Question:", question)
    print("Top k:", k)

    results = manager.search(vectorstore=vectorstore, query=question, k=k)

    if not results:
        print_divider("No results found in Qdrant for this query.")
        return

    print_divider("Top retrieved chunks from Qdrant (full text)")
    for i, doc in enumerate(results, start=1):
        print("Chunk", i)
        print("-" * 40)
        text_full = doc.page_content or ""
        print("Text:")
        print(text_full)
        meta = doc.metadata or {}
        pages = meta.get("page_numbers")
        if pages:
            print("Pages:", pages)
        ai_summary = meta.get("ai_summary")
        if ai_summary:
            print("AI summary:", str(ai_summary)[:300])
        image_paths = meta.get("image_paths")
        if image_paths:
            print("Image paths:", image_paths)
        print()


def main() -> None:
    """
    CLI to run a fixed NCERT retrieval query.

    Usage:
      python tools/retrieval_cli.py
    """
    ensure_backend_on_path()

    # Fixed container/project id and question as requested
    project_id = "NCERT"
    question = (
        "What are cells and their significance in organisms?Who discovered cells and their components?What are the differences and similarities among various types of cells? What are unicellular and multicellular organisms?"
    )

    try:
        run_single_retrieval(project_id=project_id, question=question, k=3)
    except Exception as exc:
        print_divider("[ERROR]")
        print("Retrieval failed:", exc)


if __name__ == "__main__":
    main()

