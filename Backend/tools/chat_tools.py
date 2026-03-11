import json
from typing import TYPE_CHECKING
from langchain_core.tools import tool

if TYPE_CHECKING:
    from core.chat_agent import ChatAgent

def get_project_search_tool(agent: "ChatAgent"):
    @tool
    def project_search(query: str) -> str:
        """
        Search the project's processed documents for context regarding the user's query.
        Call this tool ONCE for the user's question. Do NOT call it again with a similar query.
        """
        results = agent.vector_manager.search(
            vectorstore=agent.vectorstore, query=query, k=3
        )

        def parse_json(val, default):
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return default
            return val or default

        context_chunks = []
        for doc in results:
            context_chunks.append({
                "content": doc.page_content,
                "original_text": doc.metadata.get("original_text", ""),
                "ai_summary": doc.metadata.get("ai_summary", ""),
                "image_paths": parse_json(doc.metadata.get("image_paths"), []),
                "image_base64": parse_json(doc.metadata.get("image_base64"), []),
                "image_interpretation": parse_json(doc.metadata.get("image_interpretation"), []),
                "table_interpretation": parse_json(doc.metadata.get("table_interpretation"), []),
                "page_numbers": parse_json(doc.metadata.get("page_numbers"), []),
                "tables": parse_json(doc.metadata.get("raw_tables_html"), [])
            })

        # Persist to instance-level shared dicts so chat_stream can read them
        agent._current_chunks.extend(context_chunks)
        new_images = agent.build_image_index(context_chunks)
        agent._current_image_index.update(new_images)

        # Return the formatted context so the LLM can use it
        formatted = agent.format_context(context_chunks, agent._current_image_index)
        return f"Found {len(context_chunks)} sections from project documents:\n\n{formatted}"

    return project_search


def get_customized_retriever_tool(agent: "ChatAgent"):
    @tool
    def customized_retriever(
        query: str, 
        needs_text: bool = True, 
        needs_image: bool = False, 
        needs_table: bool = False,
        search_depth: int = 15,
        return_limit: int = 3
    ) -> str:
        """
        Search the project documents specifically looking for text, images, or tables based on user preference.
        Use this tool instead of `project_search` when the user explicitly asks for tables or images.
        `search_depth` controls how many chunks to retrieve from the vector database (default 15).
        `return_limit` controls the maximum number of filtered chunks to return to the LLM (default 3).
        """
        # Fetch a larger pool of results to ensure we have enough after filtering
        results = agent.vector_manager.search(
            vectorstore=agent.vectorstore, query=query, k=search_depth
        )

        def parse_json(val, default):
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return default
            return val or default

        context_chunks = []
        for doc in results:
            chunk = {
                "content": doc.page_content,
                "original_text": doc.metadata.get("original_text", ""),
                "ai_summary": doc.metadata.get("ai_summary", ""),
                "image_paths": parse_json(doc.metadata.get("image_paths"), []),
                "image_base64": parse_json(doc.metadata.get("image_base64"), []),
                "image_interpretation": parse_json(doc.metadata.get("image_interpretation"), []),
                "table_interpretation": parse_json(doc.metadata.get("table_interpretation"), []),
                "page_numbers": parse_json(doc.metadata.get("page_numbers"), []),
                "tables": parse_json(doc.metadata.get("raw_tables_html"), [])
            }
            
            # Apply filtering
            keep = False
            
            # Check for tables
            if needs_table:
                # Keep if there are sensible tables
                if chunk["tables"] and chunk["table_interpretation"]:
                    has_valid_table = any(
                        "DO NOT USE" not in desc.upper() 
                        for desc in chunk["table_interpretation"]
                    )
                    if has_valid_table:
                        keep = True
                        
            # Check for images
            if needs_image and not keep:
                if chunk["image_paths"] and chunk["image_interpretation"]:
                    has_valid_image = any(
                        "DO NOT USE" not in desc.upper() 
                        for desc in chunk["image_interpretation"]
                    )
                    if has_valid_image:
                        keep = True
                        
            # Check for text (if no table/image specifically requested, or if explicitly requested)
            if needs_text and not keep:
                if chunk["original_text"] and len(chunk["original_text"].strip()) > 50:
                    keep = True
                    
            if keep:
                context_chunks.append(chunk)
                
            # Limit results based on the return_limit parameter
            if len(context_chunks) >= return_limit:
                break

        # Persist to instance-level shared dicts so chat_stream can read them
        agent._current_chunks.extend(context_chunks)
        new_images = agent.build_image_index(context_chunks)
        agent._current_image_index.update(new_images)

        # Return the formatted context so the LLM can use it
        formatted = agent.format_context(context_chunks, agent._current_image_index)
        return f"Found {len(context_chunks)} specialized sections from project documents based on your criteria:\n\n{formatted}"

    return customized_retriever


def get_web_search_tool(agent: "ChatAgent"):
    @tool
    def web_search(query: str) -> str:
        """
        Search the web for general knowledge or up-to-date facts.
        ONLY use this when project_search explicitly returned no useful results.
        Do NOT use this for questions about the project content.
        """
        results = agent.web_search_logic(query, max_results=3)
        if not results:
            return "No web results found."

        formatted = ["=== WEB SEARCH RESULTS ==="]
        for i, item in enumerate(results, 1):
            title = item.get("title") or f"Result {i}"
            snippet = item.get("content") or item.get("snippet") or ""
            url = item.get("url") or ""
            formatted.append(f"- {title}: {snippet} (URL: {url})")
        return "\n".join(formatted)

    return web_search


def get_chat_tools(agent: "ChatAgent"):
    return [
        get_project_search_tool(agent), 
        get_customized_retriever_tool(agent),
        get_web_search_tool(agent)
    ]
