"""File handling utilities"""
import os
import json
import pickle
from pathlib import Path
from typing import List
from langchain_core.documents import Document


class FileHandler:
    """Handles file save/load operations"""
    
    @staticmethod
    def save_pickle(data, filepath: str):
        """Save data to pickle file"""
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        with open(filepath, "wb") as f:
            pickle.dump(data, f)
        # print(f"Saved pickle: {filepath}")
    
    @staticmethod
    def load_pickle(filepath: str):
        """Load data from pickle file"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Pickle file not found: {filepath}")
        
        with open(filepath, "rb") as f:
            data = pickle.load(f)
        # print(f"Loaded pickle: {filepath}")
        return data
    
    @staticmethod
    def save_json(data: List[Document], filepath: str):
        """Save LangChain documents to JSON"""
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        clean_json = [
            {
                "chunk_index": doc.metadata.get("chunk_index"),
                "enhanced_content": doc.page_content,
                "original_text": doc.metadata.get("original_text", ""),
                "raw_tables_html": doc.metadata.get("raw_tables_html", []),
                "ai_questions": doc.metadata.get("ai_questions", ""),
                "ai_summary": doc.metadata.get("ai_summary", ""),
                "image_interpretation": doc.metadata.get("image_interpretation", []),
                "table_interpretation": doc.metadata.get("table_interpretation", []),
                "image_paths": doc.metadata.get("image_paths", []),
                "image_base64": doc.metadata.get("image_base64", []),
                "page_numbers": doc.metadata.get("page_numbers", []),
                "content_types": doc.metadata.get("content_types", []),
            }
            for doc in data
        ]
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(clean_json, f, indent=4, ensure_ascii=False)
        
        # print(f"Saved JSON: {filepath}")
   
    @staticmethod
    def validate_pdf(filepath: str, max_size_mb: int = 50) -> tuple[bool, str]:
        """
        Validate PDF file
        
        Returns:
            (is_valid, error_message)
        """
        if not os.path.exists(filepath):
            return False, "File not found"
        
        if not filepath.lower().endswith('.pdf'):
            return False, "File must be a PDF"
        
        file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
        if file_size_mb > max_size_mb:
            return False, f"File size ({file_size_mb:.2f}MB) exceeds limit ({max_size_mb}MB)"
        
        return True, ""
    
    @staticmethod
    def get_unique_filename(directory: str, filename: str) -> str:
        """Generate unique filename if file already exists"""
        base_path = Path(directory) / filename
        
        if not base_path.exists():
            return str(base_path)
        
        # Add counter to filename
        stem = base_path.stem
        suffix = base_path.suffix
        counter = 1
        
        while True:
            new_name = f"{stem}_{counter}{suffix}"
            new_path = Path(directory) / new_name
            if not new_path.exists():
                return str(new_path)
            counter += 1