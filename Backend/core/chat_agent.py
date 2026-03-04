import os
import json
import asyncio
import warnings
from pathlib import Path
from typing import List, Dict, AsyncGenerator, Optional, Union

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import AzureChatOpenAI
from supabase import create_client
from utils.vector_store import VectorStoreManager
from config.settings import settings
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tavily import TavilyClient


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


class ToolPlan(BaseModel):
    """Planner output deciding which tools to use and with what queries."""
    use_rag: bool = Field(
        default=True,
        description="Whether to use the project RAG retrieval tool for this question.",
    )
    rag_query: Optional[str] = Field(
        default=None,
        description="Refined query to use for the RAG tool. If null, use the user's question.",
    )
    use_web: bool = Field(
        default=False,
        description="Whether to use the Tavily web search tool for this question.",
    )
    web_query: Optional[str] = Field(
        default=None,
        description="Refined query to use for the web search tool. If null, use the user's question.",
    )


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
            
        logger.info(f"ChatAgent initialized with Azure OpenAI endpoint: {self.azure_endpoint}")

        # Initialize shown images tracking
        self.shown_images = set()

        # Initialize base LLM for structured output using Azure OpenAI
        self.structured_llm = AzureChatOpenAI(
            azure_endpoint=self.azure_endpoint,
            api_key=self.azure_api_key,
            azure_deployment=settings.AZURE_OPENAI_CHAT_MODEL,
            api_version=self.azure_api_version,
            temperature=0.2,
        ).with_structured_output(ChatResponse)

        # Planner LLM that decides which tools (RAG, web) to use and how
        self.planner_llm = AzureChatOpenAI(
            azure_endpoint=self.azure_endpoint,
            api_key=self.azure_api_key,
            azure_deployment=settings.AZURE_OPENAI_CHAT_MODEL,
            api_version=self.azure_api_version,
            temperature=0.0,
        ).with_structured_output(ToolPlan)

        # Set paths
        self.image_dir = str(settings.get_project_image_dir(project_id))
        
        # Load vector store (Supabase/Qdrant)
        try:
            self.vector_manager = VectorStoreManager(embedding_model=settings.AZURE_OPENAI_EMBEDDING_MODEL)
            self.vectorstore = self.vector_manager.load_vector_store(
                collection_name=project_id
            )
            logger.info(f"Vector store loaded successfully for project: {project_id}")
        except Exception as e:
            logger.error(f"Error loading vector store for project {project_id}: {e}")
            raise Exception(
                f"Failed to initialize chat: Vector store not available for project '{project_id}'. "
                f"Make sure documents have been processed first."
            ) from e
        
        # Optimized system prompt for dual-tool (RAG + web search) agent
        self.system_prompt = """You are an AI research assistant with two main tools:

1) PROJECT RAG TOOL
   - Uses the provided project context (text, image descriptions, table descriptions) to answer questions.
   - This is your PRIMARY source whenever the question is about the project documents.

2) WEB SEARCH TOOL (Tavily)
   - Used only when the project context does NOT contain enough information (for example, general knowledge, up-to-date facts, or clearly external questions).
   - When web search is used, combine it carefully with any relevant project context and clearly explain the answer.

INSTRUCTIONS:
1. FIRST, try to answer using the project RAG context.
2. If the project context is clearly insufficient, mentally call the WEB SEARCH TOOL and use those results.
3. Always check the AVAILABLE IMAGES section and, whenever they would genuinely help the user understand the answer, INCLUDE image_references.
4. Return your response in structured format with:
   - answer: Your complete answer to the question.
   - image_references: List of image indices to show (see rules below).
5. Only reference images that directly support your answer and are factually consistent with the text.
6. When tables contain relevant data, describe the key information from the table descriptions provided.
7. If the answer isn't in the context or web search, say so honestly.
8. Be concise but thorough.
9. Reference page numbers when available.

IMPORTANT:
- Use image INDEX numbers from the "Available Images" list (0-based indexing).
- Prefer showing 1–3 of the MOST USEFUL images, but you may include up to 5 when clearly helpful.
- If no image clearly helps, leave image_references as an empty list.
- You have IMAGE DESCRIPTIONS and TABLE DESCRIPTIONS – use these to answer.
- If the same information appears in multiple images, only reference one.

CONTEXT:
{context}

CONVERSATION HISTORY:
{chat_history}

Answer the user's question based on the tools and context above."""


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
            logger.error(f"Error fetching history: {e}")
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
            logger.error(f"Error saving message: {e}")

    def search_relevant_context(self, query: str, k: int = 3) -> List[Dict]:
        """Search for relevant context in vector store"""
        results = self.vector_manager.search(
            vectorstore=self.vectorstore,
            query=query,
            k=k
        )

        context_chunks = []
        for doc in results:
            # Parse JSON fields with safety
            def parse_json(val, default):
                if isinstance(val, str):
                    try: return json.loads(val)
                    except: return default
                return val or default

            image_paths = parse_json(doc.metadata.get("image_paths"), [])
            image_base64 = parse_json(doc.metadata.get("image_base64"), [])
            page_numbers = parse_json(doc.metadata.get("page_numbers"), [])
            tables = parse_json(doc.metadata.get("raw_tables_html"), [])
            
            image_interpretation = parse_json(doc.metadata.get("image_interpretation"), [])
            table_interpretation = parse_json(doc.metadata.get("table_interpretation"), [])
            
            chunk_data = {
                "content": doc.page_content,
                "original_text": doc.metadata.get("original_text", ""),
                "ai_summary": doc.metadata.get("ai_summary", ""),
                "image_paths": image_paths,
                "image_base64": image_base64,
                "image_interpretation": image_interpretation,
                "table_interpretation": table_interpretation,
                "page_numbers": page_numbers,
                "tables": tables
            }
            context_chunks.append(chunk_data)
        
        return context_chunks
    
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
    
    def web_search(self, query: str, max_results: int = 5) -> List[Dict]:
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
            logger.error(f"Web search error: {e}")
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

            # Fetch history either from external source or Supabase
            if external_history is not None:
                history_msgs = external_history
            else:
                history_msgs = self._get_history()
            chat_history_text = self.format_chat_history(history_msgs)
            
            # Step 1: Ask planner LLM which tools to use and with what queries
            planner_prompt = (
                "You are a planning agent that decides which tools to use to answer a user question.\n"
                "Tools:\n"
                "1) RAG: Retrieve information from the project documents vector store.\n"
                "2) WEB: Use Tavily web search for up-to-date or external information.\n\n"
                "You must decide:\n"
                "- Whether to use RAG.\n"
                "- Whether to use WEB.\n"
                "- Optional refined queries for each tool.\n\n"
                "Be conservative with WEB: only use it when project documents are clearly insufficient.\n\n"
                f"User question:\n{user_message}\n\n"
                f"Recent conversation history:\n{chat_history_text}\n"
            )

            planner_messages = [SystemMessage(content="You output only a JSON plan."), HumanMessage(content=planner_prompt)]
            plan: ToolPlan = await self.planner_llm.ainvoke(planner_messages)

            yield {
                "type": "planner_plan",
                "data": {
                    "use_rag": plan.use_rag,
                    "use_web": plan.use_web,
                    "rag_query": plan.rag_query or user_message,
                    "web_query": plan.web_query or user_message,
                },
            }

            # Step 2: Run tools according to plan
            context_chunks: List[Dict] = []
            image_index: Dict[int, Dict] = {}

            if plan.use_rag:
                rag_query = (plan.rag_query or user_message).strip()
                yield {
                    "type": "search_start",
                    "data": {"message": f"Searching project documents for: {rag_query}"},
                }

                context_chunks = self.search_relevant_context(rag_query, k=3)
                image_index = self.build_image_index(context_chunks)

                yield {
                    "type": "search_complete",
                    "data": {
                        "message": f"Found {len(context_chunks)} relevant sections with {len(image_index)} images",
                        "chunks_count": len(context_chunks),
                        "images_available": len(image_index),
                    },
                }

            web_results: List[Dict] = []
            if plan.use_web:
                web_query = (plan.web_query or user_message).strip()
                yield {
                    "type": "web_search_start",
                    "data": {"message": f"Running Tavily web search for: {web_query}"},
                }
                web_results = self.web_search(web_query, max_results=5)
                yield {
                    "type": "web_search_complete",
                    "data": {
                        "message": f"Web search returned {len(web_results)} result(s)",
                        "results_count": len(web_results),
                    },
                }

            # Step 3: Format context (RAG + optional web results)
            context_text = self.format_context(context_chunks, image_index)

            if web_results:
                web_lines: List[str] = ["", "=== WEB SEARCH RESULTS ==="]
                for i, item in enumerate(web_results, 1):
                    title = item.get("title") or f"Result {i}"
                    snippet = item.get("content") or item.get("snippet") or ""
                    url = item.get("url") or ""
                    web_lines.append(f"- {title}: {snippet[:200]}{'...' if len(snippet) > 200 else ''}")
                    if url:
                        web_lines.append(f"  URL: {url}")
                context_text = context_text + "\n" + "\n".join(web_lines)
            
            prompt = self.system_prompt.format(
                context=context_text,
                chat_history=chat_history_text
            )
            
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=user_message)
            ]
            
            # Step 4: Get AI response
            yield {
                "type": "response_start",
                "data": {"message": "Generating response..."}
            }
            
            response: ChatResponse = await self.structured_llm.ainvoke(messages)

            # Step 4: Stream answer
            answer_text = response.answer
            chunk_size = 30
            
            for i in range(0, len(answer_text), chunk_size):
                chunk = answer_text[i:i + chunk_size]
                yield {
                    "type": "content",
                    "data": {"content": chunk}
                }
                await asyncio.sleep(0.01)
            
            # Step 5: Send images and collect filenames for persistence
            images_sent = 0
            sent_filenames: List[str] = []
            if response.image_references:
                # Unique image indices referenced by the model
                unique_indices = list(dict.fromkeys(ref.index for ref in response.image_references))
                # Keep only the most relevant 5 images
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
                        
                        # DEDUPLICATION: Check if image was already shown in this session
                        if img_path in self.shown_images:
                            continue
                            
                        # Mark as shown
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
                    else:
                        pass
            
            # Step 6: Save AI response including image_references and filenames for history display
            image_refs_payload = [
                {
                    "index": ref.index,
                    "reason": ref.reason,
                }
                for ref in (response.image_references or [])
            ]
            await self._save_message(
                "assistant",
                answer_text,
                metadata={
                    "image_references": image_refs_payload,
                    "image_filenames": sent_filenames,
                },
            )
            
            # Step 7: Completion
            yield {
                "type": "complete",
                "data": {
                    "message": "Response complete",
                    "images_shown": images_sent,
                    "context_chunks": len(context_chunks)
                }
            }
            
        except Exception as e:
            logger.error(f"Error in chat stream: {e}")
            yield {
                "type": "error",
                "data": {
                    "message": str(e),
                    "error": str(e)
                }
            }
