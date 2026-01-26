import os
from pathlib import Path
from supabase import create_client, Client
from config.settings import settings
import mimetypes

class StorageManager:
    _instance = None
    _client: Client = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(StorageManager, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize Supabase client"""
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            # print("Warning: Supabase credentials not found. StorageManager will fail if used.")
            return

        try:
            self._client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        except Exception as e:
            # print(f"Failed to initialize Supabase client: {e}")
            pass

    def upload_file(self, file_path: str, destination_path: str, content_type: str = None, bucket_name: str = None) -> str:
        """
        Upload a file to Supabase storage
        
        Args:
            file_path: Local path to the file
            destination_path: Path in the bucket (e.g. 'project_id/image.png')
            content_type: MIME type of the file (optional, auto-detected if None)
            bucket_name: Target bucket (default: chunk_images)
            
        Returns:
            Public URL of the uploaded file
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")

        if content_type is None:
            content_type, _ = mimetypes.guess_type(file_path)
            if content_type is None:
                content_type = "application/octet-stream"

        try:
            with open(file_path, 'rb') as f:
                file_content = f.read()

            bucket = bucket_name or settings.SUPABASE_BUCKET_NAME
            
            # Upsert is safer to avoid errors on re-runs
            self._client.storage.from_(bucket).upload(
                path=destination_path,
                file=file_content,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            # Get public URL
            public_url = self._client.storage.from_(bucket).get_public_url(destination_path)
            return public_url

        except Exception as e:
            # print(f"Error uploading to Supabase: {e}")
            raise e

    def upload_bytes(self, file_content: bytes, destination_path: str, content_type: str = "application/octet-stream", bucket_name: str = None) -> str:
        """
        Upload bytes directly to Supabase storage
        
        Args:
            file_content: Raw bytes
            destination_path: Path in the bucket
            content_type: MIME type
            bucket_name: Target bucket (default: chunk_images)
            
        Returns:
            Public URL of the uploaded file
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")

        try:
            bucket = bucket_name or settings.SUPABASE_BUCKET_NAME
            
            self._client.storage.from_(bucket).upload(
                path=destination_path,
                file=file_content,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            public_url = self._client.storage.from_(bucket).get_public_url(destination_path)
            return public_url

        except Exception as e:
            # print(f"Error uploading bytes to Supabase: {e}")
            raise e

    def download_file(self, path: str, bucket_name: str = None) -> bytes:
        """
        Download a file from Supabase storage
        
        Args:
            path: Path in the bucket
            bucket_name: Optional specific bucket (default: chunk_data)
            
        Returns:
            File content as bytes
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")
            
        bucket = bucket_name or settings.SUPABASE_DATA_BUCKET_NAME
        
        try:
            return self._client.storage.from_(bucket).download(path)
        except Exception as e:
            # print(f"Error downloading from Supabase: {e}")
            raise e

    def upload_data(self, content: bytes, destination_path: str, content_type: str = "application/json", bucket_name: str = None) -> str:
        """
        Upload data file to specified bucket
        
        Args:
            content: Raw bytes
            destination_path: Path in the bucket
            content_type: MIME type
            bucket_name: Target bucket (default: chunk_data)
            
        Returns:
            Destination path
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")

        try:
            bucket = bucket_name or settings.SUPABASE_DATA_BUCKET_NAME
            
            self._client.storage.from_(bucket).upload(
                path=destination_path,
                file=content,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            return destination_path

        except Exception as e:
            # print(f"Error uploading data to Supabase: {e}")
            raise e

    def list_bucket_contents(self, bucket_name: str = None, path: str = None) -> list:
        """
        List contents of a bucket at a specific path
        
        Args:
            bucket_name: Target bucket (default: chunk_pdf)
            path: Path prefix to list (optional)
            
        Returns:
            List of objects/folders
        """
        if not self._client:
            raise ValueError("Supabase client not initialized")
            
        bucket = bucket_name or settings.SUPABASE_PDF_BUCKET_NAME
        
        try:
            return self._client.storage.from_(bucket).list(path)
        except Exception as e:
            # print(f"Error listing bucket contents: {e}")
            return []

    def delete_file(self, bucket_name: str, path: str):
        """Delete a single file from bucket"""
        if not self._client: return
        try:
            self._client.storage.from_(bucket_name).remove([path])
        except Exception as e:
            # print(f"Error deleting file {path}: {e}")
            pass

    def delete_folder(self, bucket_name: str, folder_path: str):
        """
        Delete all files with a specific prefix (folder), recursively.
        """
        if not self._client: return
        
        try:
            # List contents
            files = self.list_bucket_contents(bucket_name, folder_path)
            if not files:
                return
                
            paths_to_delete = []
            
            for item in files:
                name = item.get('name') if isinstance(item, dict) else getattr(item, 'name', None)
                item_id = item.get('id') if isinstance(item, dict) else getattr(item, 'id', None)
                
                if not name: continue
                
                # Check if it's a folder (Supabase storage usually returns folders with id=None)
                if item_id is None:
                    # Recursive call for subfolder
                    subfolder_path = f"{folder_path}{name}/" if folder_path.endswith('/') else f"{folder_path}/{name}/"
                    self.delete_folder(bucket_name, subfolder_path)
                else:
                    # It's a file
                    full_path = f"{folder_path}{name}" if folder_path.endswith('/') else f"{folder_path}/{name}"
                    paths_to_delete.append(full_path)
            
            # Delete files in this folder
            if paths_to_delete:
                # print(f"Deleting {len(paths_to_delete)} files from {bucket_name}/{folder_path}")
                # Batch delete (limit is usually 65536, we are fine)
                self._client.storage.from_(bucket_name).remove(paths_to_delete)
                
        except Exception as e:
            print(f"Error recursively deleting folder {folder_path} in {bucket_name}: {e}")
