"""Simple document extractor with optional AI processing"""
import os
import sys
import base64
import json
import pickle
import argparse
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
from unstructured.chunking.title import chunk_by_title

from core.document_parser import DocumentParser
from config.settings import settings
from utils.storage import StorageManager
from dotenv import load_dotenv

# Optional AI imports

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field



# Load environment variables (try Backend and parent directories)
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")



class AIParser(BaseModel):
    """AI Parser Model for text, image and table information"""
    question: str = Field(description="List all potential questions that can be answered from this content (text, images, tables). Try to keep words similar to original content")
    summary: str = Field(description="Comprehensive summary of all data and information. Try to keep words similar to original content")
    image_interpretation: List[str] = Field(description="List matching the order of input images; image_interpretation[i] describes image i, use ***DO NOT USE THIS IMAGE*** for irrelevant images, and return an empty list if no images are provided.")
    table_interpretation: List[str] = Field(description="List matching the order of input tables; table_interpretation[i] describes table i, use ***DO NOT USE THIS TABLE*** for irrelevant tables, and return an empty list if no tables are provided.")


class SimpleExtractor:
    """Extracts document content with optional AI processing"""
    
    def __init__(self, image_dir: str, use_ai: bool = False, model_name: str = "gemini-2.0-flash-exp", temperature: float = 0):
        """
        Initialize simple extractor
        
        Args:
            image_dir: Directory to save extracted images
            use_ai: Whether to use AI summaries (default: False)
            model_name: AI model name (default: gemini-2.0-flash-exp)
            temperature: AI model temperature (default: 0)
        """
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        print(f"Image directory: {self.image_dir}")
        
        self.use_ai = use_ai
        if self.use_ai:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                print("Warning: GOOGLE_API_KEY not found. AI summaries disabled.")
                self.use_ai = False
            else:
                self.model_name = model_name
                self.temperature = temperature
                self.api_key = api_key
                print(f"AI summaries enabled with model: {model_name}")
        else:
            if use_ai and not AI_AVAILABLE:
                print("Warning: AI libraries not available. AI summaries disabled.")
    
    def separate_content_types(self, chunk, image_counter: dict) -> Dict:
        """
        Analyze chunk content and extract text, tables, and images.
        Similar to ContentProcessor.separate_content_types but without AI.
        
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
            # Also keep base64 for storage
            elif element_type == 'Image':
                if hasattr(element.metadata, 'image_base64'):
                    if 'image' not in content_data['types']:
                        content_data['types'].append('image')

                    image_base64 = element.metadata.image_base64

                    try:
                        # Generate filename and path
                        image_filename = f"image_{image_counter['count']:04d}.png"
                        
                        # Upload to Supabase
                        # Use the folder name from image_dir as part of the path
                        folder_name = self.image_dir.name
                        # Assuming image_dir is like .../project_id/images, we want project_id/images/filename
                        # Or just use the folder name provided
                        
                        # Try to get project_id from the path if possible, or just use folder_name
                        # simpler: use the full path relative to data dir if possible, or just folder_name/filename
                        storage_path = f"{folder_name}/{image_filename}"
                        
                        storage_mgr = StorageManager()
                        public_url = storage_mgr.upload_bytes(
                            base64.b64decode(image_base64),
                            storage_path,
                            "image/png"
                        )

                        # Store public URL as relative path (for compatibility)
                        content_data['images_dirpath'].append(public_url)

                        # Keep base64 for storage
                        content_data['image_base64'].append(image_base64)

                        print(f"Uploaded: {public_url}")
                        image_counter['count'] += 1

                    except Exception as e:
                        print(f"Failed to save image {image_counter['count']}: {e}")

        return content_data
    
    async def _create_ai_summary_async(
        self,
        text: str,
        tables: List[str],
        images: List[str],
        chunk_index: int
    ) -> Optional[Dict]:
        """
        Create AI-enhanced summary asynchronously with fallback
        
        Args:
            text: Text content to summarize
            tables: List of HTML tables
            images: List of base64 encoded images
            chunk_index: Index of chunk for logging
        
        Returns:
            Dictionary with AI summary or None if failed (fallback to raw chunk)
        """
        if not self.use_ai:
            return None
        
        try:
            # Build prompt
            prompt_text = f"""You are creating a searchable description for document content retrieval.
YOUR TASK:
Generate a comprehensive, searchable description that covers:

1. Key facts, numbers, and data points from text and tables
2. Main topics and concepts discussed  
3. Questions this content could answer
4. Visual content analysis (charts, diagrams, patterns in images)
5. Alternative search terms users might use

Make it detailed and searchable - prioritize findability over brevity.
Keep words similar to the original content for better search accuracy.

IMPORTANT: Return structured output with these fields:
- question: All potential questions this content answers
- summary: Comprehensive summary of all information
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
            
            for idx, img_b64 in enumerate(images, start=0):
                message_content.append({
                    "type": "text", 
                    "text": f"Image {idx + 1}:"
                })
                message_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{img_b64}"}
                })
            
            message = HumanMessage(content=message_content)
            
            # Get LLM
            llm = ChatGoogleGenerativeAI(
                model=self.model_name,
                temperature=self.temperature,
                google_api_key=self.api_key
            )
            llm_structured = llm.with_structured_output(AIParser)
            
            # Make async API call
            print(f"Chunk {chunk_index}: Generating AI summary...")
            response = await llm_structured.ainvoke([message])
            print(f"Chunk {chunk_index}: AI summary generated")
            
            return {
                'ai_question': response.question,
                'ai_summary': response.summary,
                'ai_image_interpretation': response.image_interpretation,
                'ai_table_interpretation': response.table_interpretation
            }
                
        except Exception as e:
            # On failure, return None to use raw chunk (no error messages)
            print(f"Chunk {chunk_index}: AI summary failed, using raw chunk data")
            return None
    
    def extract_document(
        self,
        pdf_path: str,
        max_characters: int = 3000,
        new_after_n_chars: int = 3800,
        combine_text_under_n_chars: int = 200,
        extract_images: bool = True,
        extract_tables: bool = True,
        languages: List[str] = None
    ) -> List[Dict]:
        """
        Extract document content without AI processing
        
        Args:
            pdf_path: Path to PDF file
            max_characters: Maximum characters per chunk
            new_after_n_chars: Start new chunk after this many characters
            combine_text_under_n_chars: Combine small text blocks
            extract_images: Whether to extract images
            extract_tables: Whether to extract tables
            languages: List of language names for OCR
            
        Returns:
            List of dictionaries with extracted content
        """
        if languages is None:
            languages = ['english']
        
        print(f"\n=== Simple Document Extraction ===")
        print(f"PDF: {pdf_path}")
        print(f"Image directory: {self.image_dir}")
        
        # Step 1: Parse PDF
        print("\nStep 1: Parsing PDF document...")
        parser = DocumentParser(
            image_output_dir=str(self.image_dir),
            api_key=os.getenv("UNSTRUCTURED_API_KEY")
        )
        
        elements = parser.partition_pdf_document(
            file_path=pdf_path,
            max_characters=max_characters,
            new_after_n_chars=new_after_n_chars,
            combine_text_under_n_chars=combine_text_under_n_chars,
            extract_images=extract_images,
            extract_tables=extract_tables,
            languages=languages,
            split_pdf_concurrency_level=settings.SPLIT_PDF_CONCURRENCY_LEVEL
        )
        
        print(f"[OK] Extracted {len(elements)} elements")
        
        # Step 2: Chunk elements by title
        print("\nStep 2: Chunking elements by title...")
        chunks = chunk_by_title(
            elements=elements,
            max_characters=max_characters,
            new_after_n_chars=new_after_n_chars,
            combine_text_under_n_chars=combine_text_under_n_chars
        )
        
        print(f"[OK] Created {len(chunks)} chunks")
        
        # Step 3: Extract content from chunks
        print("\nStep 3: Extracting content from chunks...")
        
        # Find highest existing image number in the directory
        existing_images = list(self.image_dir.glob("image_*.png"))
        if existing_images:
            existing_numbers = []
            for img in existing_images:
                try:
                    num_str = img.stem.split('_')[1]
                    existing_numbers.append(int(num_str))
                except (IndexError, ValueError):
                    pass
            
            if existing_numbers:
                start_count = max(existing_numbers) + 1
                print(f"Found {len(existing_images)} existing images, starting from image_{start_count:04d}.png")
            else:
                start_count = 1
        else:
            start_count = 1
        
        image_counter = {'count': start_count}
        extracted_data = []
        
        if self.use_ai:
            # Process with AI summaries (async)
            print(f"\nProcessing chunks with AI summaries...")
            chunks_data = []
            
            # First, extract all content
            for idx, chunk in enumerate(chunks, 1):
                print(f"Extracting content from chunk {idx}/{len(chunks)}")
                content_data = self.separate_content_types(chunk, image_counter)
                chunks_data.append((idx, content_data))
            
            # Then, process AI summaries asynchronously
            async def process_all_chunks():
                tasks = []
                task_data = []
                for idx, content_data in chunks_data:
                    task = self._create_ai_summary_async(
                        text=content_data['text'],
                        tables=content_data['tables'],
                        images=content_data['image_base64'],
                        chunk_index=idx
                    )
                    tasks.append(task)
                    task_data.append((idx, content_data))
                
                # Run all tasks concurrently
                ai_results = await asyncio.gather(*tasks)
                
                # Combine results with chunk data
                results = []
                for (idx, content_data), ai_result in zip(task_data, ai_results):
                    results.append((idx, content_data, ai_result))
                
                return results
            
            # Run async processing
            ai_results = asyncio.run(process_all_chunks())
            
            # Build final data structure
            for idx, content_data, ai_result in ai_results:
                chunk_data = {
                    'chunk_index': idx,
                    'original_text': content_data['text'],
                    'raw_tables_html': content_data['tables'],
                    'image_paths': content_data['images_dirpath'],
                    'image_base64': content_data['image_base64'],
                    'page_numbers': content_data['page_no'],
                    'content_types': content_data['types']
                }
                
                # Add AI summary if available (if None, chunk is saved as-is)
                if ai_result:
                    chunk_data.update(ai_result)
                
                extracted_data.append(chunk_data)
                
                print(f"  Types: {', '.join(content_data['types'])}, "
                      f"Tables: {len(content_data['tables'])}, "
                      f"Images: {len(content_data['image_base64'])}")
                if content_data['page_no']:
                    print(f"  Pages: {content_data['page_no']}")
        else:
            # Process without AI summaries
            for idx, chunk in enumerate(chunks, 1):
                print(f"Processing chunk {idx}/{len(chunks)}")
                
                # Extract content types
                content_data = self.separate_content_types(chunk, image_counter)
                
                # Build data structure with only required fields
                chunk_data = {
                    'chunk_index': idx,
                    'original_text': content_data['text'],
                    'raw_tables_html': content_data['tables'],
                    'image_paths': content_data['images_dirpath'],
                    'image_base64': content_data['image_base64'],
                    'page_numbers': content_data['page_no'],
                    'content_types': content_data['types']
                }
                
                extracted_data.append(chunk_data)
                
                print(f"  Types: {', '.join(content_data['types'])}, "
                      f"Tables: {len(content_data['tables'])}, "
                      f"Images: {len(content_data['image_base64'])}")
                if content_data['page_no']:
                    print(f"  Pages: {content_data['page_no']}")
        
        print(f"\n[OK] Extraction complete!")
        print(f"Total chunks: {len(extracted_data)}")
        print(f"Total images saved: {image_counter['count'] - start_count}")
        
        return extracted_data
    
    def save_output(self, data: List[Dict], output_dir: str, filename_base: str):
        """
        Save extracted data to Supabase (JSON and Pickle)
        
        Args:
            data: List of extracted chunk data
            output_dir: Used as folder prefix for Supabase path
            filename_base: Base filename
        """
        # Determine storage path
        # If output_dir is absolute path, try to make it relative or just use filename
        # Simpler: just use filename_base as folder or prefix
        # We will use: output_dir (last folder name) / filename
        
        try:
            folder_name = Path(output_dir).name
            storage_mgr = StorageManager()
            
            # 1. Save JSON (DATA Bucket)
            json_content = json.dumps(data, indent=4, ensure_ascii=False).encode('utf-8')
            json_path = f"{folder_name}/{filename_base}.json"
            
            storage_mgr.upload_data(
                json_content, 
                json_path, 
                "application/json",
                bucket_name=settings.SUPABASE_DATA_BUCKET_NAME
            )
            print(f"[OK] Uploaded JSON to Supabase '{settings.SUPABASE_DATA_BUCKET_NAME}': {json_path}")
            
            # 2. Save Pickle (PKL Bucket)
            pickle_content = pickle.dumps(data)
            pickle_path = f"{folder_name}/{filename_base}.pkl"
            
            storage_mgr.upload_data(
                pickle_content, 
                pickle_path, 
                "application/octet-stream",
                bucket_name=settings.SUPABASE_PKL_BUCKET_NAME
            )
            print(f"[OK] Uploaded Pickle to Supabase '{settings.SUPABASE_PKL_BUCKET_NAME}': {pickle_path}")
            
        except Exception as e:
            print(f"Error saving to Supabase: {e}")
            # Fallback to local if needed, but for migration we want to force Supabase
            pass


def main():
    """Command-line interface for simple extractor"""
    parser = argparse.ArgumentParser(
        description="Extract document content without AI processing or ChromaDB"
    )
    
    parser.add_argument(
        "pdf_path",
        type=str,
        nargs="?",
        help="Path to PDF file to extract (or use --folder for batch processing)"
    )
    
    parser.add_argument(
        "--folder",
        type=str,
        help="Process all PDFs in this folder (batch mode)"
    )
    
    parser.add_argument(
        "--image-dir",
        type=str,
        help="Directory to save extracted images (default: D:\\Jayraj\\ChunkSmith\\jayraj_images)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory to save JSON and Pickle files (default: same as PDF directory)"
    )
    
    parser.add_argument(
        "--output-name",
        type=str,
        default=None,
        help="Base name for output files (default: PDF filename without extension)"
    )
    
    parser.add_argument(
        "--max-characters",
        type=int,
        default=3000,
        help="Maximum characters per chunk (default: 3000)"
    )
    
    parser.add_argument(
        "--new-after-n-chars",
        type=int,
        default=3800,
        help="Start new chunk after this many characters (default: 3800)"
    )
    
    parser.add_argument(
        "--combine-text-under-n-chars",
        type=int,
        default=200,
        help="Combine small text blocks under this many characters (default: 200)"
    )
    
    parser.add_argument(
        "--languages",
        type=str,
        default="english",
        help="Comma-separated list of languages for OCR (default: english)"
    )
    
    parser.add_argument(
        "--no-images",
        action="store_true",
        help="Skip image extraction"
    )
    
    parser.add_argument(
        "--no-tables",
        action="store_true",
        help="Skip table extraction"
    )
    
    parser.add_argument(
        "--use-ai",
        action="store_true",
        help="Enable AI summaries (requires GOOGLE_API_KEY). If AI fails, chunk is saved as-is without error messages."
    )
    
    parser.add_argument(
        "--ai-model",
        type=str,
        default="gemini-2.0-flash-exp",
        help="AI model name for summaries (default: gemini-2.0-flash-exp)"
    )
    
    parser.add_argument(
        "--ai-temperature",
        type=float,
        default=0,
        help="AI model temperature (default: 0)"
    )
    
    args = parser.parse_args()
    
    # Check if batch mode (folder) or single file mode
    if args.folder:
        # Batch processing mode
        folder_path = Path(args.folder)
        if not folder_path.exists() or not folder_path.is_dir():
            # print(f"Error: Folder not found: {folder_path}")
            sys.exit(1)
        
        # Find all PDF files in folder
        pdf_files = sorted(folder_path.glob("*.pdf"))
        if not pdf_files:
            # print(f"Error: No PDF files found in folder: {folder_path}")
            sys.exit(1)
        
        # print(f"\n=== Batch Processing Mode ===")
        # print(f"Found {len(pdf_files)} PDF file(s) in: {folder_path}")
        # print(f"Images will be saved to: {args.image_dir}")
        
        # Parse languages
        languages = [lang.strip() for lang in args.languages.split(',')]
        
        # Create extractor (shared across all PDFs for continuous image numbering)
        extractor = SimpleExtractor(
            image_dir=args.image_dir,
            use_ai=args.use_ai,
            model_name=args.ai_model,
            temperature=args.ai_temperature
        )
        
        # Process each PDF
        total_chunks = 0
        successful = 0
        failed = []
        
        for idx, pdf_path in enumerate(pdf_files, 1):
            # print(f"\n{'='*60}")
            # print(f"Processing PDF {idx}/{len(pdf_files)}: {pdf_path.name}")
            # print(f"{'='*60}")
            
            # Set output directory
            if args.output_dir:
                output_dir = args.output_dir
            else:
                output_dir = str(pdf_path.parent)
            
            # Set output filename
            if args.output_name:
                filename_base = f"{args.output_name}_{pdf_path.stem}"
            else:
                filename_base = pdf_path.stem
            
            try:
                extracted_data = extractor.extract_document(
                    pdf_path=str(pdf_path),
                    max_characters=args.max_characters,
                    new_after_n_chars=args.new_after_n_chars,
                    combine_text_under_n_chars=args.combine_text_under_n_chars,
                    extract_images=not args.no_images,
                    extract_tables=not args.no_tables,
                    languages=languages
                )
                
                # Save output
                # print(f"\n=== Saving Output ===")
                extractor.save_output(extracted_data, output_dir, filename_base)
                
                total_chunks += len(extracted_data)
                successful += 1
                
                # print(f"\n[OK] Successfully processed: {pdf_path.name}")
                # print(f"  Chunks: {len(extracted_data)}")
                # print(f"  JSON: {Path(output_dir) / f'{filename_base}.json'}")
                # print(f"  Pickle: {Path(output_dir) / f'{filename_base}.pkl'}")
                
            except Exception as e:
                # print(f"\nX Error processing {pdf_path.name}: {str(e)}")
                import traceback
                traceback.print_exc()
                failed.append((pdf_path.name, str(e)))
        
        # Summary
        # print(f"\n{'='*60}")
        # print(f"=== Batch Processing Complete ===")
        # print(f"{'='*60}")
        # print(f"Total PDFs processed: {successful}/{len(pdf_files)}")
        # print(f"Total chunks extracted: {total_chunks}")
        # print(f"Images saved to: {args.image_dir}")
        if failed:
            # print(f"\nFailed PDFs ({len(failed)}):")
            for pdf_name, error in failed:
                # print(f"  - {pdf_name}: {error}")
        
    else:
        # Single file mode
        if not args.pdf_path:
            parser.error("Either pdf_path or --folder must be provided")
        
        pdf_path = Path(args.pdf_path)
        if not pdf_path.exists():
            # print(f"Error: PDF file not found: {pdf_path}")
            sys.exit(1)
        
        if not pdf_path.suffix.lower() == '.pdf':
            # print(f"Error: File must be a PDF: {pdf_path}")
            sys.exit(1)
        
        # Set output directory
        if args.output_dir:
            output_dir = args.output_dir
        else:
            output_dir = str(pdf_path.parent)
        
        # Set output filename
        if args.output_name:
            filename_base = args.output_name
        else:
            filename_base = pdf_path.stem
        
        # Parse languages
        languages = [lang.strip() for lang in args.languages.split(',')]
        
        # Create extractor
        extractor = SimpleExtractor(
            image_dir=args.image_dir,
            use_ai=args.use_ai,
            model_name=args.ai_model,
            temperature=args.ai_temperature
        )
        
        # Extract document
        try:
            extracted_data = extractor.extract_document(
                pdf_path=str(pdf_path),
                max_characters=args.max_characters,
                new_after_n_chars=args.new_after_n_chars,
                combine_text_under_n_chars=args.combine_text_under_n_chars,
                extract_images=not args.no_images,
                extract_tables=not args.no_tables,
                languages=languages
            )
            
            # Save output
            # print(f"\n=== Saving Output ===")
            extractor.save_output(extracted_data, output_dir, filename_base)
            
            # print(f"\n=== Extraction Complete ===")
            # print(f"Chunks extracted: {len(extracted_data)}")
            # print(f"Images saved to: {args.image_dir}")
            # print(f"JSON saved to: {Path(output_dir) / f'{filename_base}.json'}")
            # print(f"Pickle saved to: {Path(output_dir) / f'{filename_base}.pkl'}")
            
        except Exception as e:
            # print(f"\nError during extraction: {str(e)}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


if __name__ == "__main__":
    main()
