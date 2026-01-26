import os
import json
from pathlib import Path
from typing import List, Dict, AsyncGenerator, Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
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
    """Chat agent with RAG capabilities"""
    
    def __init__(self, project_id: str, chroma_dir: str = None, image_dir: str = None):
        """
        Initialize chat agent for a specific project
        
        Args:
            project_id: ID of the project to chat about
            chroma_dir: Path to ChromaDB directory (optional, uses settings if not provided)
            image_dir: Path to images directory (optional, uses settings if not provided)
        """
        self.project_id = project_id
        self.conversation_history = []
        
        # Initialize base LLM for structured output
        self.structured_llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            temperature=0.2,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        ).with_structured_output(ChatResponse)
        
        # Set paths
        if image_dir is None:
            image_dir = str(settings.get_project_image_dir(project_id))
        
        self.image_dir = image_dir
        
        # Load vector store (Supabase)
        self.vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        self.vectorstore = self.vector_manager.load_vector_store(
            collection_name=project_id
        )
        
        # Optimized system prompt with structured output instructions
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
    
    def search_relevant_context(self, query: str, k: int = 3) -> List[Dict]:
        """
        Search for relevant context in vector store
        
        Args:
            query: User's question
            k: Number of results to retrieve
            
        Returns:
            List of relevant document chunks with metadata (including base64 images)
        """
        results = self.vector_manager.search(
            vectorstore=self.vectorstore,
            query=query,
            k=k
        )

        # print(f"Found {len(results)} relevant context chunks for query: '{query}'")
        
        context_chunks = []
        for doc in results:
            # Parse JSON fields
            image_paths = json.loads(doc.metadata.get("image_paths", "[]")) if isinstance(doc.metadata.get("image_paths"), str) else doc.metadata.get("image_paths", [])
            image_base64 = json.loads(doc.metadata.get("image_base64", "[]")) if isinstance(doc.metadata.get("image_base64"), str) else doc.metadata.get("image_base64", [])
            page_numbers = json.loads(doc.metadata.get("page_numbers", "[]")) if isinstance(doc.metadata.get("page_numbers"), str) else doc.metadata.get("page_numbers", [])
            tables = json.loads(doc.metadata.get("raw_tables_html", "[]")) if isinstance(doc.metadata.get("raw_tables_html"), str) else doc.metadata.get("raw_tables_html", [])
            
            # Parse interpretation fields
            image_interpretation = json.loads(doc.metadata.get("image_interpretation", "[]")) if isinstance(doc.metadata.get("image_interpretation"), str) else doc.metadata.get("image_interpretation", [])
            table_interpretation = json.loads(doc.metadata.get("table_interpretation", "[]")) if isinstance(doc.metadata.get("table_interpretation"), str) else doc.metadata.get("table_interpretation", [])
            
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
        """
        Build global image index from all context chunks
        Filters out irrelevant images
        
        Args:
            context_chunks: List of context chunks
            
        Returns:
            Dict mapping index -> {path, base64, description, chunk_idx}
        """
        image_index = {}
        global_idx = 0
        
        for chunk_idx, chunk in enumerate(context_chunks):
            for local_idx, (img_path, img_base64, img_desc) in enumerate(
                zip(chunk['image_paths'], chunk['image_base64'], chunk['image_interpretation'])
            ):
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
        """
        Format context chunks for prompt - OPTIMIZED
        Only sends summaries and descriptions to AI, not full images/tables
        Includes image index for reference
        """
        formatted_context = []
        
        # Add available images list at the top
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
            
            # Send table descriptions (not full HTML tables)
            if chunk['tables'] and chunk['table_interpretation']:
                chunk_text += f"\nTABLES IN THIS SECTION:\n"
                for idx, (table_html, table_desc) in enumerate(zip(chunk['tables'], chunk['table_interpretation'])):
                    if "DO NOT USE" not in table_desc.upper():
                        chunk_text += f"  Table {idx + 1}: {table_desc}\n"
            
            # Send original text (truncated)
            chunk_text += f"\nTEXT CONTENT:\n{chunk['original_text'][:800]}...\n"
            formatted_context.append(chunk_text)
        
        return "\n".join(formatted_context)
    
    def format_chat_history(self) -> str:
        """Format conversation history"""
        if not self.conversation_history:
            return "No previous conversation"
        
        history = []
        for msg in self.conversation_history[-6:]:
            role = "User" if isinstance(msg, HumanMessage) else "Assistant"
            content = msg.content[:200] if len(msg.content) > 200 else msg.content
            history.append(f"[{role}]: {content}")
        
        return "\n".join(history)
    
    async def chat_stream(
        self, 
        user_message: str
    ) -> AsyncGenerator[Dict, None]:
        """
        Stream chat responses with SSE (compatible with existing routes)
        
        Args:
            user_message: User's message
            
        Yields:
            Dict with event type and data
        """
        try:
            # Step 1: Search for relevant context
            yield {
                "type": "search_start",
                "data": {"message": "Searching document for relevant information..."}
            }
            
            # Retrieve context with base64 images
            context_chunks = self.search_relevant_context(user_message, k=3)
            
            # Build global image index (deduplicates and filters)
            image_index = self.build_image_index(context_chunks)
            
            yield {
                "type": "search_complete",
                "data": {
                    "message": f"Found {len(context_chunks)} relevant sections with {len(image_index)} images",
                    "chunks_count": len(context_chunks),
                    "images_available": len(image_index)
                }
            }
            
            # Step 2: Format context (only summaries) and generate response
            context_text = self.format_context(context_chunks, image_index)
            chat_history_text = self.format_chat_history()
            
            # Create prompt with summaries only
            prompt = self.system_prompt.format(
                context=context_text,
                chat_history=chat_history_text
            )
            
            # Prepare messages
            messages = [
                SystemMessage(content=prompt),
                HumanMessage(content=user_message)
            ]
            
            # Step 3: Get structured AI response (fast, but not streaming)
            yield {
                "type": "response_start",
                "data": {"message": "Generating response..."}
            }
            
            # Get structured response
            response: ChatResponse = await self.structured_llm.ainvoke(messages)
            
            # Step 4: Pseudo-stream the answer text (character by character for smooth UI)
            answer_text = response.answer
            chunk_size = 30  # Characters per chunk
            
            for i in range(0, len(answer_text), chunk_size):
                chunk = answer_text[i:i + chunk_size]
                yield {
                    "type": "content",
                    "data": {"content": chunk}
                }
                await asyncio.sleep(0.01)  # Small delay for smooth streaming effect
            
            # Step 5: Send referenced images (deduplicated by index)
            images_sent = 0
            if response.image_references:
                # Deduplicate by index
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
                        
                        # Determine MIME type
                        ext = Path(img_data['path']).suffix.lower()
                        mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                        
                        # Format as data URI (from pre-stored base64)
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
                        # print(f"Sent image {img_idx}: {img_data['filename']} (from memory)")
                    else:
                        # print(f"Warning: AI referenced invalid image index: {img_idx}")
                        pass

            # Step 6: Update conversation history
            self.conversation_history.append(HumanMessage(content=user_message))
            self.conversation_history.append(AIMessage(content=answer_text))
            
            # Keep only last 10 messages
            if len(self.conversation_history) > 10:
                self.conversation_history = self.conversation_history[-10:]
            
            # Step 7: Send completion
            yield {
                "type": "complete",
                "data": {
                    "message": "Response complete",
                    "images_shown": images_sent,
                    "context_chunks": len(context_chunks)
                }
            }
            
        except Exception as e:
            # print(f"Error in chat_stream: {str(e)}")
            yield {
                "type": "error",
                "data": {
                    "message": str(e),
                    "error": str(e)
                }
            }
    
    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
        # print("Conversation history cleared")