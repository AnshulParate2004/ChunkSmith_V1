import os
import json
from pathlib import Path
from typing import List, Dict, AsyncGenerator, Optional, Union
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from supabase import create_client
from utils.vector_store import VectorStoreManager
from config.settings import settings
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import asyncio

load_dotenv()


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
        
        # Initialize base LLM for structured output
        self.structured_llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            temperature=0.2,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        ).with_structured_output(ChatResponse)
        
        # Set paths
        self.image_dir = str(settings.get_project_image_dir(project_id))
        
        # Load vector store (Supabase/Qdrant)
        self.vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        self.vectorstore = self.vector_manager.load_vector_store(
            collection_name=project_id
        )
        
        # Optimized system prompt
        self.system_prompt = """You are a helpful AI assistant that answers questions based on document content.

INSTRUCTIONS:
1. Use the provided context (text, image descriptions, table descriptions) to answer questions
2. Return your response in structured format with:
   - answer: Your complete answer to the question
   - image_references: List of image indices (if images would help)
3. Only reference images that directly support your answer
4. When tables contain relevant data, describe the key information from the table descriptions provided
5. If the answer isn't in the context, say so honestly
6. Be concise but thorough
7. Reference page numbers when available

IMPORTANT: 
- Use image INDEX numbers from the "Available Images" list (0-based indexing)
- Only include image_references if images would genuinely help answer the question
- You have IMAGE DESCRIPTIONS and TABLE DESCRIPTIONS - use these to answer
- If the same information appears in multiple images, only reference one

CONTEXT:
{context}

CONVERSATION HISTORY:
{chat_history}

Answer the user's question based on the context and conversation history."""

    def _get_history(self) -> List[HumanMessage | AIMessage]:
        """Fetch conversation history from Supabase"""
        if not self.conversation_id or not self.supabase:
            return []
            
        try:
            # Fetch last 10 messages from 'messages' table
            response = self.supabase.table("messages") \
                .select("*") \
                .eq("conversation_id", self.conversation_id) \
                .order("created_at", desc=True) \
                .limit(10) \
                .execute()
            
            # Convert to LangChain messages (reverse order to be chronological)
            history = []
            for msg in reversed(response.data):
                if msg["role"] == "user":
                    history.append(HumanMessage(content=msg["content"]))
                else:
                    history.append(AIMessage(content=msg["content"]))
            
            return history
        except Exception as e:
            print(f"Error fetching history: {e}")
            return []

    async def _save_message(self, role: str, content: str):
        """Save a message to Supabase history"""
        if not self.conversation_id or not self.supabase:
            return
            
        try:
            self.supabase.table("messages").insert({
                "conversation_id": self.conversation_id,
                "role": role,
                "content": content
            }).execute()
        except Exception as e:
            print(f"Error saving message: {e}")

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
    
    async def chat_stream(
        self, 
        user_message: str
    ) -> AsyncGenerator[Dict, None]:
        """Stream chat responses with SSE"""
        try:
            # Step 0: Save User Message (Fire and forget, or await?)
            # Await to ensure consistency
            await self._save_message("user", user_message)

            # Step 1: Search for relevant context
            yield {
                "type": "search_start",
                "data": {"message": "Searching document for relevant information..."}
            }
            
            context_chunks = self.search_relevant_context(user_message, k=3)
            image_index = self.build_image_index(context_chunks)
            
            yield {
                "type": "search_complete",
                "data": {
                    "message": f"Found {len(context_chunks)} relevant sections with {len(image_index)} images",
                    "chunks_count": len(context_chunks),
                    "images_available": len(image_index)
                }
            }
            
            # Step 2: Format context and history
            context_text = self.format_context(context_chunks, image_index)
            
            # Fetch fresh history from DB
            history_msgs = self._get_history()
            chat_history_text = self.format_chat_history(history_msgs)
            
            prompt = self.system_prompt.format(
                context=context_text,
                chat_history=chat_history_text
            )
            
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=user_message)
            ]
            
            # Step 3: Get AI response
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
            
            # Step 5: Send images
            images_sent = 0
            if response.image_references:
                unique_indices = list(set(ref.index for ref in response.image_references))
                
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
                        ext = Path(img_data['path']).suffix.lower()
                        mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                        data_uri = f"data:{mime_type};base64,{img_data['base64']}"
                        
                        yield {
                            "type": "image",
                            "data": {
                                "filename": img_data['filename'],
                                "data": data_uri,
                                "path": img_data['path'],
                                "index": img_idx,
                                "description": img_data['description']
                            }
                        }
                        images_sent += 1
                    else:
                        pass
            
            # Step 6: Save AI response
            await self._save_message("assistant", answer_text)
            
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
            yield {
                "type": "error",
                "data": {
                    "message": str(e),
                    "error": str(e)
                }
            }
