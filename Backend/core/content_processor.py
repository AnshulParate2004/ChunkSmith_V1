"""Content processing module with multi-API key async processing"""
import os
import base64
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from utils.storage import StorageManager
from dotenv import load_dotenv

load_dotenv()


class AIParser(BaseModel):
    """AI Parser Model for text, image and table information"""
    question: str = Field(description="List all potential questions that can be answered from this content (text, images, tables). Try to keep words similar to original content")
    summary: str = Field(description="Comprehensive summary of all data and information. it shoulde be short")
    image_interpretation: List[str] = Field(description="List matching the order of input images; image_interpretation[i] describes image i, use ***DO NOT USE THIS IMAGE*** for irrelevant images, and return an empty list if no images are provided.")
    table_interpretation: List[str] = Field(description="List matching the order of input tables; table_interpretation[i] describes table i, use ***DO NOT USE THIS TABLE*** for irrelevant tables, and return an empty list if no tables are provided.")

class ContentProcessor:
    """Processes document chunks with AI-enhanced summaries using multiple API keys"""
    
    def __init__(self, image_dir: str, model_name: str = None, temperature: float = 0, project_id: str = None):
        from config.settings import settings
        
        self.image_dir = image_dir
        self.model_name = model_name or settings.AZURE_OPENAI_CHAT_MODEL
        self.temperature = temperature
        self.project_id = project_id

        # Load Azure OpenAI configuration
        self.azure_api_key = settings.AZURE_OPENAI_API_KEY or os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_endpoint = settings.AZURE_OPENAI_ENDPOINT or os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_api_version = settings.AZURE_OPENAI_API_VERSION
        
        if not self.azure_api_key or not self.azure_endpoint:
            raise ValueError("AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be set in environment")
        
        Path(image_dir).mkdir(parents=True, exist_ok=True)
    
    def _get_llm_for_key(self, api_key: str = None):
        """
        Create LLM instance for Azure OpenAI
        
        Args:
            api_key: Azure API key (optional, uses instance key if not provided)
            
        Returns:
            LLM instance with structured output
        """
        from config.settings import settings
        
        llm = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,
            azure_endpoint=self.azure_endpoint,
            azure_deployment=self.model_name,
            api_key=api_key or self.azure_api_key,
            api_version=self.azure_api_version
        )
        return llm.with_structured_output(AIParser)


    def separate_content_types(self, chunk, image_counter: dict) -> Dict:
        """
        Analyze chunk content and extract text, tables, and images.
        
        Args:
            chunk: Document chunk to process
            image_counter: Mutable dict to track image counter
            
        Returns:
            Dictionary with separated content types
        """
        content_data = {
            'text': chunk.text,
            'tables': [],
            'image_base64': [],
            'images_dirpath': [],
            'page_no': [],
            'types': ['text']
        }

        for element in chunk.metadata.orig_elements:
            element_type = type(element).__name__

            # Handle page numbers
            if 'metadata' in element.to_dict():
                page_no = element.to_dict()['metadata'].get('page_number')
                if page_no and page_no not in content_data['page_no']:
                    content_data['page_no'].append(page_no)

            # Handle tables
            if element_type == 'Table':
                if 'table' not in content_data['types']:
                    content_data['types'].append('table')
                table_html = getattr(element.metadata, 'text_as_html', element.text)
                content_data['tables'].append(table_html)

            # Handle images by saving image in dir and storing relative path
            # Also keep base64 for AI processing
            elif element_type == 'Image':
                if hasattr(element.metadata, 'image_base64'):
                    if 'image' not in content_data['types']:
                        content_data['types'].append('image')

                    image_base64 = element.metadata.image_base64

                    try:
                        # Generate filename and path
                        image_filename = f"image_{image_counter['count']:04d}.png"
                        
                        # Upload to Supabase 
                        try:
                            if self.project_id:
                                storage_path = f"{self.project_id}/images/{image_filename}"
                            else:
                                # Fallback to previous logic (path based)
                                # Try to extract project_id/images/filename structure
                                path_parts = Path(self.image_dir).parts
                                if 'data' in path_parts:
                                    idx = path_parts.index('data')
                                    project_subpath = "/".join(path_parts[idx+1:])
                                    storage_path = f"{project_subpath}/{image_filename}"
                                else:
                                    # Fallback
                                    storage_path = f"images/{image_filename}"
                        except:
                             storage_path = f"images/{image_filename}"

                        storage_mgr = StorageManager()
                        public_url = storage_mgr.upload_bytes(
                            base64.b64decode(image_base64),
                            storage_path,
                            "image/png"
                        )

                        # Store public URL in place of relative path
                        content_data['images_dirpath'].append(public_url)

                        # Keep base64 for AI processing
                        content_data['image_base64'].append(image_base64)

                        # print(f"Uploaded: {public_url}")
                        image_counter['count'] += 1

                    except Exception as e:
                        print(f"Failed to save image {image_counter['count']}: {e}")

        return content_data
    
    async def create_ai_enhanced_summary_async(
        self, 
        text: str, 
        tables: List[str], 
        images: List[str],
        api_key: str,
        chunk_index: int
    ) -> Optional[AIParser]:
        """
        Create AI-enhanced summary asynchronously with specific API key
        
        Args:
            text: Text content to summarize
            tables: List of HTML tables
            images: List of base64 encoded images
            api_key: Google API key to use
            chunk_index: Index of chunk for logging
        
        Returns:
            AIParser object with structured summary, or None if failed (fallback to raw chunk)
        """
        
        try:
            # Build prompt
            # Counts for strict instruction
            num_tables = len(tables) if tables else 0
            num_images = len(images) if images else 0

            prompt_text = f"""You are creating a searchable description for document content retrieval.
YOUR TASK:
Generate a comprehensive, searchable description that covers:

1. Key facts, numbers, and data points from text and tables
2. Main topics and concepts discussed short discription.
3. Questions this content could answer
4. Visual content analysis (charts, diagrams, patterns in images)
5. Alternative search terms users might use

Make it detailed and searchable - prioritize findability over brevity.
Keep words similar to the original content for better search accuracy.

STRICT OUTPUT CONSTRAINTS:
- You received {num_images} images. You MUST return exactly {num_images} items in 'image_interpretation'.
- You received {num_tables} tables. You MUST return exactly {num_tables} items in 'table_interpretation'.
- If {num_images} is 0, 'image_interpretation' MUST be an empty list [].
- If {num_tables} is 0, 'table_interpretation' MUST be an empty list [].

IMPORTANT: Return structured output with these fields:
- question: All potential questions this content answers
- summary: Comprehensive summary of all information short summary 
- image_interpretation: List matching the order of input images; image_interpretation[i] describes image i, use ***DO NOT USE THIS IMAGE*** for irrelevant images, and return an empty list if no images are provided.
- table_interpretation: List matching the order of input tables; table_interpretation[i] describes table i, use ***DO NOT USE THIS TABLE*** for irrelevant tables, and return an empty list if no tables are provided.

CONTENT TO ANALYZE:

TEXT CONTENT:
{text}

"""
            if tables:
                prompt_text += "TABLES:\n"
                for i, table in enumerate(tables, 1):
                    prompt_text += f"Table {i}:\n{table}\n\n"
            
            message_content = [{"type": "text", "text": prompt_text}]
            
            for idx , img_b64 in enumerate(images,start=0):
                message_content.append({
                    "type": "text", 
                    "text": f"Image {idx + 1}:"
                })
                message_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{img_b64}"}
                })
            
            message = HumanMessage(content=message_content)
            
            # Get LLM instance
            llm_structured = self._get_llm_for_key(api_key)
            
            # Make async API call
            print(f"  > [AI] Chunk {chunk_index}: Sending to Azure OpenAI...")
            response = await llm_structured.ainvoke([message])
            print(f"  > [AI] Chunk {chunk_index}: Success.")
            
            return response
                
        except Exception as e:
            # On failure, return None to use raw chunk (no error messages)
            print(f"  > [AI] Chunk {chunk_index}: FAILED ({str(e)}), using raw chunk data")
            return None
    
    async def process_chunks_async(self, chunks_data: List[Dict]) -> List[Optional[AIParser]]:
        """
        Process multiple chunks asynchronously using Azure OpenAI
        
        Args:
            chunks_data: List of dictionaries containing chunk data
            
        Returns:
            List of AIParser responses (or None if failed, to use raw chunk)
        """
        tasks = []
        
        # Create async tasks for each chunk
        for i, chunk_data in enumerate(chunks_data):
            task = self.create_ai_enhanced_summary_async(
                text=chunk_data['text'],
                tables=chunk_data['tables'],
                images=chunk_data['image_base64'],
                api_key=None,  # Uses instance API key
                chunk_index=i + 1
            )
            tasks.append(task)
        
        # Run all tasks concurrently
        print(f"  ... Dispatching {len(tasks)} async AI tasks ...")
        responses = await asyncio.gather(*tasks)
        print(f"  ... All {len(responses)} AI tasks completed.")
        
        return responses
    
    async def summarise_chunks(self, chunks) -> List[Document]:
        """
        Process all chunks with AI Summaries using multiple API keys asynchronously.
        
        Args:
            chunks: List of document chunks to process
            
        Returns:
            List of LangChain Documents with enhanced summaries
        """
        print(f"\n=== [AI PROCESSING START] Processing {len(chunks)} chunks with Azure OpenAI ===")
        
        # No longer cleaning - project-based structure keeps data isolated
        
        # Find highest existing image number in the directory
        existing_images = list(Path(self.image_dir).glob("image_*.png"))
        if existing_images:
            # Extract numbers from filenames like "image_0001.png"
            existing_numbers = []
            for img in existing_images:
                try:
                    # Extract number from filename: image_0001.png -> 0001 -> 1
                    num_str = img.stem.split('_')[1]  # Get "0001" part
                    existing_numbers.append(int(num_str))
                except (IndexError, ValueError):
                    pass
            
            if existing_numbers:
                start_count = max(existing_numbers) + 1
                # print(f"Found {len(existing_images)} existing images, starting from image_{start_count:04d}.png")
            else:
                start_count = 1
        else:
            start_count = 1
        
        total_chunks = len(chunks)
        image_counter = {'count': start_count}
        
        # Step 1: Extract content from all chunks (synchronous)
        # print(f"\nExtracting content from {total_chunks} chunks...")
        chunks_data = []
        
        for i, chunk in enumerate(chunks, 1):
            # print(f"Extracting chunk {i}/{total_chunks}")
            
            # Analyze chunk content
            content_data = self.separate_content_types(chunk, image_counter)
            
            # Debug info
            # print(f"Types: {', '.join(content_data['types'])}, "
            #       f"Tables: {len(content_data['tables'])}, "
            #       f"Images: {len(content_data['image_base64'])}")
            if content_data['page_no']:
                # print(f"Pages: {content_data['page_no']}")
            
             chunks_data.append(content_data)
        
        # print(f"\nContent extraction complete!")
        # print(f"Total images saved: {image_counter['count'] - 1}")
        
        # Step 2: Process all chunks asynchronously with different API keys
        # print(f"\nStarting async AI processing...")
        # print(f"Using {len(self.api_keys)} API key(s)")
        # print(f"Processing {total_chunks} chunk(s)")
        
        # Await async processing directly (no asyncio.run since we're already in async context)
        ai_responses = await self.process_chunks_async(chunks_data)
        
        # Step 3: Create LangChain documents
        # print(f"\nCreating LangChain documents...")
        langchain_documents = []
        
        for idx, (content_data, ai_response) in enumerate(zip(chunks_data, ai_responses), 1):
            # If AI summary failed (None), use raw chunk data only
            if ai_response is None:
                # Create document with raw data AND fallback AI fields to ensure schema consistency
                combined_content = content_data['text']
                
                # print(f"Document {idx}: Using raw chunk data (AI summary failed)")
                
                # Generate fallback interpretations for images/tables if they exist
                fallback_image_interp = ["***IMAGE SUMMARY FAILED***"] * len(content_data['image_base64'])
                fallback_table_interp = ["***TABLE SUMMARY FAILED***"] * len(content_data['tables'])
                
                img_count = len(content_data['image_base64'])
                fallback_summary = f"[FALLBACK_SUMMARY]...\n[Contains {img_count} image(s)]" if img_count > 0 else "[FALLBACK_SUMMARY]..."

                doc = Document(
                    page_content=combined_content,
                    metadata={
                        "chunk_index": idx,
                        "original_text": content_data['text'],
                        "raw_tables_html": content_data['tables'],
                        "image_paths": content_data['images_dirpath'],
                        "image_base64": content_data['image_base64'],
                        "page_numbers": content_data['page_no'],
                        "content_types": content_data['types'],
                        # Fallback AI fields
                        "ai_questions": "Unable to generate questions due to processing error",
                        "ai_summary": fallback_summary,
                        "image_interpretation": fallback_image_interp,
                        "table_interpretation": fallback_table_interp
                    }
                )
            else:
                # Create combined searchable content with AI summary
                # Prepare image analysis text as string with image path and interpretation
                # For images
                img_analysis_text = "\n".join(
                    [f"Image Path {content_data['images_dirpath'][i]} : {ai_response.image_interpretation[i]}" 
                    for i in range(len(ai_response.image_interpretation))]
                ) if ai_response.image_interpretation else "No images present"

                # For tables
                table_analysis_text = "\n".join(
                    [f"Table index {i} : {ai_response.table_interpretation[i]}"
                    for i in range(len(ai_response.table_interpretation))]
                ) if ai_response.table_interpretation else "No tables present"

                combined_content = f"""QUESTIONS: {ai_response.question}
SUMMARY: {ai_response.summary}
IMAGE ANALYSIS: {img_analysis_text}
TABLE ANALYSIS: {table_analysis_text}
ORIGINAL TEXT: {content_data['text']}"""
                
                # print(f"Document {idx}: {ai_response.summary[:100]}...")
                
                # Create LangChain Document with metadata including AI fields
                doc = Document(
                    page_content=combined_content,
                    metadata={
                        "chunk_index": idx,
                        "original_text": content_data['text'],
                        "raw_tables_html": content_data['tables'],
                        "ai_questions": ai_response.question,
                        "ai_summary": ai_response.summary,
                        "image_interpretation": ai_response.image_interpretation,
                        "table_interpretation": ai_response.table_interpretation,
                        "image_paths": content_data['images_dirpath'],
                        "image_base64": content_data['image_base64'],
                        "page_numbers": content_data['page_no'],
                        "content_types": content_data['types'],
                    }
                )
            
            langchain_documents.append(doc)
        
        print(f"=== [AI PROCESSING END] Processed {len(langchain_documents)} chunks ===\n")
        # print(f"Used async processing with {len(self.api_keys)} API key(s)")
        
        return langchain_documents