"""Configuration settings for the application with project-based structure"""
from pathlib import Path
from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    # Base paths
    BASE_DIR: Path = Path(__file__).parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    
    # PDF Processing settings
    MAX_CHARACTERS: int = 3000
    NEW_AFTER_N_CHARS: int = 3800
    COMBINE_TEXT_UNDER_N_CHARS: int = 200
    EXTRACT_IMAGES: bool = True
    EXTRACT_TABLES: bool = True
    LANGUAGES: list = ["eng"]
    SPLIT_PDF_CONCURRENCY_LEVEL: int = 15  # Concurrency level for PDF splitting
    
    # AI Model settings
    GEMINI_MODEL: str = "gemini-2.5-pro"
    EMBEDDING_MODEL: str = "models/gemini-embedding-001"
    TEMPERATURE: float = 0.0
    
    # API settings
    API_TITLE: str = "MultiModal RAG API"
    API_VERSION: str = "1.0.0"
    ALLOWED_EXTENSIONS: set = {".pdf"}
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50 MB
    UNSTRUCTURED_API_KEY: str = ""  # Unstructured API key (loaded from env)
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"
    
    def __init__(self, **kwargs ):#/* any argument can be passed */
        super().__init__(**kwargs)
        # Create base data directory
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    def get_project_dir(self, project_id: str) -> Path:
        """Get project-specific directory"""
        return self.DATA_DIR / project_id
    
    def get_project_upload_dir(self, project_id: str) -> Path:
        """Get project-specific upload directory"""
        path = self.get_project_dir(project_id) / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_project_image_dir(self, project_id: str) -> Path:
        """Get project-specific image directory"""
        path = self.get_project_dir(project_id) / "images"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_project_pickle_dir(self, project_id: str) -> Path:
        """Get project-specific pickle directory"""
        path = self.get_project_dir(project_id) / "pickle"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_project_json_dir(self, project_id: str) -> Path:
        """Get project-specific JSON directory"""
        path = self.get_project_dir(project_id) / "json"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def get_project_chroma_dir(self, project_id: str) -> Path:
        """Get project-specific ChromaDB directory"""
        path = self.get_project_dir(project_id) / "chroma_db"
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def list_projects(self) -> list:
        """List all existing projects"""
        if not self.DATA_DIR.exists():
            return []
        
        projects = []
        for item in self.DATA_DIR.iterdir():
            if item.is_dir():
                # Get project stats
                uploads_dir = item / "uploads"
                file_count = len(list(uploads_dir.glob("*.pdf"))) if uploads_dir.exists() else 0
                
                projects.append({
                    "project_id": item.name,
                    "project_path": str(item),
                    "file_count": file_count,
                    "created_at": item.stat().st_ctime
                })
        
        return sorted(projects, key=lambda x: x["created_at"], reverse=True)

settings = Settings()
