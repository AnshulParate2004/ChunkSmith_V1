import os
import json
import asyncio
import warnings
from pathlib import Path
from typing import List, Dict, AsyncGenerator, Optional, Union, Annotated, Literal
from typing_extensions import TypedDict
import operator

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from langchain_openai import AzureChatOpenAI
from supabase import create_client
from utils.vector_store import VectorStoreManager
from config.settings import settings
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tavily import TavilyClient
import logging
from tools.chat_tools import get_chat_tools


load_dotenv()

# Suppress noisy Pydantic serializer warnings coming from pydantic.main
# (they do not affect correctness of ChatResponse parsing)
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module="pydantic.main",
)


class ImageReference(BaseModel):
    """Model for image references in AI response"""
    index: int = Field(description="Index of the image to show (0-based)")
    reason: Optional[str] = Field(default=None, description="Brief reason why this image is relevant")


class ChatResponse(BaseModel):
    """Structured response from AI with image references"""
    answer: str = Field(description="The actual answer to the user's question")
    image_references: List[ImageReference] = Field(
        default=[],
        description="List of image indices to show. Use index from the available images list. Only include if images would help answer the question."
    )


class AgentState(TypedDict):
    """LangGraph State object"""
    messages: Annotated[list[BaseMessage], add_messages]
    context_chunks: List[Dict]
    image_index: Dict[int, Dict]
    project_id: str  # For the RAG tool to know which collection to hit
    vector_manager: VectorStoreManager
    vectorstore: object


class ChatAgent:
    """ChatAgent with RAG capabilities and Supabase-backed persistent history"""
    
    def __init__(self, project_id: str, conversation_id: str = None, user_id: str = None):
        """
        Initialize chat agent for a specific project and conversation
        
        Args:
            project_id: ID of the project to chat about
            conversation_id: ID of the persistent conversation (Supabase UUID)
            user_id: ID of the user (for ownership checks/logging)
        """
        self.project_id = project_id
        self.conversation_id = conversation_id
        self.user_id = user_id
        
        # Initialize Supabase client for history management
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
             self.supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        else:
             self.supabase = None
        
        # Load Azure OpenAI configuration
        self.azure_api_key = settings.AZURE_OPENAI_API_KEY or os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_endpoint = settings.AZURE_OPENAI_ENDPOINT or os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_api_version = settings.AZURE_OPENAI_API_VERSION
        
        if not self.azure_api_key or not self.azure_endpoint:
            raise ValueError("AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set in environment")


        # Initialize shown images tracking
        self.shown_images = set()

        # Initialize Model (No structured output globally here, we bind tools instead)
        self.llm = AzureChatOpenAI(
            azure_endpoint=self.azure_endpoint,
            api_key=self.azure_api_key,
            azure_deployment=settings.AZURE_OPENAI_CHAT_MODEL,
            api_version=self.azure_api_version,
            temperature=0.2,
        )

        # Set paths
        self.image_dir = str(settings.get_project_image_dir(project_id))

        # Load vector store (Supabase/Qdrant)
        try:
            self.vector_manager = VectorStoreManager(embedding_model=settings.AZURE_OPENAI_EMBEDDING_MODEL)
            self.vectorstore = self.vector_manager.load_vector_store(
                collection_name=project_id
            )

        except Exception as e:

            raise Exception(
                f"Failed to initialize chat: Vector store not available for project '{project_id}'. "
                f"Make sure documents have been processed first."
            ) from e

        # Build the LangGraph Application
        self.graph = self._build_graph()

    def _build_graph(self):
        """Construct the LangGraph StateGraph"""
        # Shared mutable containers written by tools, read by chat_stream after the
        # graph finishes.  They survive LangGraph's internal state copies because they
        # are referenced through `self`, not through the copied state dict.
        self._current_chunks: List[Dict] = []
        self._current_image_index: Dict[int, Dict] = {}

        # ── Tool Definitions ──────────────────────────────────────────────────
        tools = get_chat_tools(self)
        tool_node = ToolNode(tools)
        llm_with_tools = self.llm.bind_tools(tools)
        final_answer_llm = self.llm.with_structured_output(ChatResponse)

        # ── Nodes ─────────────────────────────────────────────────────────────
        def call_model(state: AgentState):
            """Decide whether to call a tool or proceed to final answer."""
            messages = state["messages"]

            # Count how many times each tool has already been called so we can
            # prevent the agent from calling the same tool twice.
            tool_call_counts: Dict[str, int] = {}
            for msg in messages:
                if isinstance(msg, AIMessage) and msg.tool_calls:
                    for tc in msg.tool_calls:
                        tool_call_counts[tc["name"]] = tool_call_counts.get(tc["name"], 0) + 1

            already_searched = tool_call_counts.get("project_search", 0) > 0
            already_custom = tool_call_counts.get("customized_retriever", 0) > 0
            already_web = tool_call_counts.get("web_search", 0) > 0

            system_content = (
                "You are an AI research assistant with three tools:\n"
                "  1. project_search – searches the user's uploaded project documents for general questions.\n"
                "  2. customized_retriever - searches the project documents specifically for tables, images, or text based on flags. You can also specify `search_depth` (default 15) and `return_limit` (default 3).\n"
                "  3. web_search – searches the live web via Tavily.\n"
                "\nRULES (follow strictly):\n"
                "- USE customized_retriever INSTEAD OF project_search if the user EXPLICITLY asks for tables, images, or specific content types.\n"
                "- Call EITHER project_search OR customized_retriever EXACTLY ONCE per user question. Never both, and never repeat them.\n"
                "- Only call web_search if the project tools returned no useful results AND the question requires external facts.\n"
                "- Call web_search at most ONCE.\n"
                "- Once you have tool results, stop calling tools and go straight to your answer.\n"
            )
            if already_searched or already_custom:
                system_content += (
                    "\n⚠ You have ALREADY searched the project documents. Do NOT call project_search or customized_retriever again. "
                    "Use the results you already received to answer the question.\n"
                )
            if already_web:
                system_content += (
                    "\n⚠ You have ALREADY called web_search. Do NOT call it again.\n"
                )
            if (already_searched or already_custom) and already_web:
                system_content += (
                    "\n⚠ You have used both internal and external tools. DO NOT call any more tools. "
                    "Generate your final answer now.\n"
                )

            response = llm_with_tools.invoke(
                [SystemMessage(content=system_content)] + messages
            )
            return {"messages": [response]}

        def generate_final(state: AgentState):
            """Force structured ChatResponse output once the tool loop is complete."""
            system_msg = SystemMessage(content=(
                "You are a final response compiler. "
                "Review the conversation including tool outputs and answer the user's question concisely. "
                "Reference page numbers when known. "
                "If tool outputs mention 'Image N:' entries, include the relevant indices in image_references."
            ))
            response: ChatResponse = final_answer_llm.invoke(
                [system_msg] + state["messages"]
            )
            return {
                "messages": [
                    AIMessage(
                        content=response.answer,
                        additional_kwargs={"chat_response": response.model_dump()}
                    )
                ]
            }

        def should_continue(state: AgentState) -> Literal["tools", "generate_final"]:
            last = state["messages"][-1]
            if isinstance(last, AIMessage) and last.tool_calls:
                return "tools"
            return "generate_final"

        # ── Graph Assembly ────────────────────────────────────────────────────
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", call_model)
        workflow.add_node("tools", tool_node)
        workflow.add_node("generate_final", generate_final)
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges("agent", should_continue, ["tools", "generate_final"])
        workflow.add_edge("tools", "agent")
        workflow.add_edge("generate_final", END)
        return workflow.compile()


    def _get_history(self) -> List[HumanMessage | AIMessage]:
        """
        Fetch recent conversation history from Supabase.
        We keep at most the last 10 turns (5 user + 5 assistant messages)
        to control context length.
        """
        if not self.conversation_id or not self.supabase:
            return []

        try:
            # Fetch last 10 messages from 'messages' table (newest first)
            response = (
                self.supabase.table("messages")
                .select("*")
                .eq("conversation_id", self.conversation_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            )

            rows = list(reversed(response.data or []))  # oldest -> newest

            # If there are more than 10, trim to last 10 messages explicitly
            rows = rows[-10:]

            history: List[HumanMessage | AIMessage] = []
            for msg in rows:
                role = msg.get("role")
                content = msg.get("content", "")
                if role == "user":
                    history.append(HumanMessage(content=content))
                elif role == "assistant":
                    history.append(AIMessage(content=content))

            return history
        except Exception as e:

            return []

    async def _save_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """
        Save a message to Supabase history.

        `metadata` is used to persist structured fields such as
        image_references from the ChatResponse model.
        """
        if not self.conversation_id or not self.supabase:
            return

        try:
            self.supabase.table("messages").insert({
                "conversation_id": self.conversation_id,
                "role": role,
                "content": content,
                "metadata": metadata or {},
            }).execute()
        except Exception as e:
            pass
    def build_image_index(self, context_chunks: List[Dict]) -> Dict[int, Dict]:
        """Build global image index from all context chunks"""
        image_index = {}
        global_idx = 0
        
        for chunk_idx, chunk in enumerate(context_chunks):
            # Ensure lists are aligned
            paths = chunk['image_paths']
            b64s = chunk['image_base64']
            descs = chunk['image_interpretation']
            
            # Truncate to shortest length to avoid index errors
            min_len = min(len(paths), len(b64s), len(descs))
            
            for i in range(min_len):
                img_path = paths[i]
                img_base64 = b64s[i]
                img_desc = descs[i]

                # Skip irrelevant images
                if "DO NOT USE" not in img_desc.upper():
                    image_index[global_idx] = {
                        "path": img_path,
                        "base64": img_base64,
                        "description": img_desc,
                        "chunk_idx": chunk_idx,
                        "filename": Path(img_path).name
                    }
                    global_idx += 1
        
        return image_index
    
    def format_context(self, context_chunks: List[Dict], image_index: Dict[int, Dict]) -> str:
        """Format context chunks for prompt"""
        formatted_context = []
        
        if image_index:
            formatted_context.append("\n=== AVAILABLE IMAGES ===")
            for idx, img_data in image_index.items():
                formatted_context.append(f"Image {idx}: {img_data['filename']} - {img_data['description']}")
            formatted_context.append("")
        
        for i, chunk in enumerate(context_chunks, 1):
            chunk_text = f"\n--- Context Chunk {i} ---\n"
            chunk_text += f"Summary: {chunk['ai_summary']}\n"
            
            if chunk['page_numbers']:
                chunk_text += f"Pages: {chunk['page_numbers']}\n"
            
            if chunk['tables'] and chunk['table_interpretation']:
                chunk_text += f"\nTABLES IN THIS SECTION:\n"
                # Safe zip
                for idx, (table_html, table_desc) in enumerate(zip(chunk['tables'], chunk['table_interpretation'])):
                    if "DO NOT USE" not in table_desc.upper():
                        chunk_text += f"  Table {idx + 1}: {table_desc}\n"
            
            chunk_text += f"\nTEXT CONTENT:\n{chunk['original_text'][:800]}...\n"
            formatted_context.append(chunk_text)
        
        return "\n".join(formatted_context)
    
    def format_chat_history(self, history: List[HumanMessage | AIMessage]) -> str:
        """Format conversation history"""
        if not history:
            return "No previous conversation"
        
        formatted = []
        for msg in history:
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            content = msg.content[:200] if len(msg.content) > 200 else msg.content
            formatted.append(f"[{role}]: {content}")
        
        return "\n".join(formatted)
    
    def web_search_logic(self, query: str, max_results: int = 5) -> List[Dict]:
        """
        Run a web search using Tavily when available.
        Returns a list of result dicts with title/content/url when possible.
        """
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key or TavilyClient is None:
            return []

        try:
            client = TavilyClient(api_key=api_key)
            resp = client.search(query=query, max_results=max_results)
            # Tavily returns a dict with "results" key
            if isinstance(resp, dict):
                return resp.get("results", []) or []
            return resp or []
        except Exception as e:

            return []

    async def chat_stream(
        self,
        user_message: str,
        external_history: Optional[List[HumanMessage | AIMessage]] = None,
    ) -> AsyncGenerator[Dict, None]:
        """
        Stream chat responses with SSE-style events.

        If `external_history` is provided, it is used as the conversation
        history instead of loading from Supabase. This is useful for
        ephemeral CLI chats that don't persist to the database.
        """
        try:
            # Step 0: Save User Message (await to ensure consistency)
            await self._save_message("user", user_message)

            # Format history for state
            # Convert self._get_history() to LangChain messages if needed. It already yields HumanMessage/AIMessage.
            if external_history is not None:
                history_msgs = external_history
            else:
                history_msgs = self._get_history()
            
            # Reset shared chunk/image containers at the start of each request
            self._current_chunks = []
            self._current_image_index = {}

            # Initial state dict
            state = {
                "messages": history_msgs + [HumanMessage(content=user_message)],
                "context_chunks": [],
                "image_index": {},
                "project_id": self.project_id,
                "vector_manager": self.vector_manager,
                "vectorstore": self.vectorstore
            }

            # Map LangGraph events to Frontend SSE stream by simulating an initial plan
            yield {
                "type": "planner_plan",
                "data": {
                    "use_rag": True,
                    "use_web": True,
                    "rag_query": "Analyzing request",
                    "web_query": "Ready if needed"
                }
            }

            # Store the final parsed response locally
            final_chat_response = None
            
            async for event in self.graph.astream_events(state, version="v2"):
                kind = event["event"]
                
                if kind == "on_chain_start":
                    if event["name"] == "generate_final":
                        yield {
                            "type": "response_start",
                            "data": {"message": "Agent compiling answer"}
                        }
                
                # Yield Tool tracking events (Search & Web)
                elif kind == "on_tool_start":
                    tool_name = event["name"]
                    tool_input = event["data"].get("input", {})
                    query = tool_input.get("query", "...")
                    
                    if tool_name in ["project_search", "customized_retriever"]:
                        yield {
                            "type": "search_start",
                            "data": {
                                "message": f"Searching project documents for: {query}...",
                                "query": query
                            }
                        }
                    elif tool_name == "web_search":
                        yield {
                            "type": "web_search_start",
                            "data": {
                                "message": f"Running Tavily web search for: {query}",
                                "query": query
                            }
                        }
                        
                elif kind == "on_tool_end":
                    tool_name = event["name"]
                    if tool_name in ["project_search", "customized_retriever"]:
                        yield {
                            "type": "search_complete",
                            "data": {
                                "message": f"Completed document search.",
                                "chunks_count": 0,    # Updated later from state diff if possible, or omit
                                "images_available": 0,
                            }
                        }
                    elif tool_name == "web_search":
                        yield {
                            "type": "web_search_complete",
                            "data": {"message": "Web search complete", "results_count": 0}
                        }
                
                # Stream the final answer chunks from the generate_final node
                elif kind == "on_chat_model_stream":
                    # Only stream if we are inside the generate_final node (or if you want to stream the agent's thoughts)
                    
                    # Because we use with_structured_output in generate_final, streaming direct string chunks is tricky in v2 
                    # without checking Run parameters. If it's yielding standard tokens:
                    chunk = event["data"]["chunk"]
                    if isinstance(chunk, AIMessage) and chunk.content:
                        # Langchain with_structured_output might aggregate this. For now, we simulate streaming 
                        # below when it finishes, or stream raw tokens if available here.
                        pass
                
                elif kind == "on_chain_end":
                    if event["name"] == "generate_final":
                        # Obtain the final state
                        # Because astream_events yields end of chain events, we can look at the output payload
                        output = event["data"].get("output", {})
                        if isinstance(output, dict) and "messages" in output:
                            last_msg = output["messages"][-1]
                            if isinstance(last_msg, AIMessage) and "chat_response" in last_msg.additional_kwargs:
                                final_chat_response = last_msg.additional_kwargs["chat_response"]

            # If we didn't capture the final format somehow, fallback to state
            # We must run state query
            if final_chat_response:
                answer_text = final_chat_response["answer"]
                chunk_size = 30
                for i in range(0, len(answer_text), chunk_size):
                    chunk = answer_text[i:i + chunk_size]
                    yield {
                        "type": "content",
                        "data": {"content": chunk}
                    }
                    await asyncio.sleep(0.01)
                
                # Use the instance-level shared dicts populated by project_search tool
                image_index = self._current_image_index
                context_chunks = self._current_chunks
                
                images_sent = 0
                sent_filenames: List[str] = []
                image_references = final_chat_response.get("image_references", [])
                
                if image_references:
                    unique_indices = list(dict.fromkeys(ref["index"] for ref in image_references))
                    unique_indices = unique_indices[:5]
                    
                    yield {
                        "type": "images_found",
                        "data": {
                            "message": f"AI referenced {len(unique_indices)} image(s)",
                            "count": len(unique_indices)
                        }
                    }
                    
                    for img_idx in unique_indices:
                        if img_idx in image_index:
                            img_data = image_index[img_idx]
                            img_path = img_data['path']
                            
                            if img_path in self.shown_images:
                                continue
                                
                            self.shown_images.add(img_path)
                            sent_filenames.append(img_data['filename'])
                            
                            ext = Path(img_path).suffix.lower()
                            mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                            data_uri = f"data:{mime_type};base64,{img_data['base64']}"
                            
                            yield {
                                "type": "image",
                                "data": {
                                    "filename": img_data['filename'],
                                    "data": data_uri,
                                    "path": img_path,
                                    "index": img_idx,
                                    "description": img_data['description']
                                }
                            }
                            images_sent += 1

                await self._save_message(
                    "assistant",
                    answer_text,
                    metadata={
                        "image_references": image_references,
                        "image_filenames": sent_filenames,
                    },
                )
                
                yield {
                    "type": "complete",
                    "data": {
                        "message": "Response complete",
                        "images_shown": images_sent,
                        "context_chunks": len(context_chunks)
                    }
                }
            else:
                yield {"type": "error", "data": {"message": "Failed to parse structured model response."}}
            
        except Exception as e:

            yield {
                "type": "error",
                "data": {
                    "message": str(e),
                    "error": str(e)
                }
            }
