"""Vector store operations using Qdrant (Cloud Native)"""
import json
import logging
import os
import uuid
from typing import List, Optional
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from config.settings import settings

class VectorStoreManager:
    """Manages Qdrant vector store operations"""
    
    def __init__(self, embedding_model: str = None):
        """
        Initialize embedding model for Qdrant using ONLY Google Gemini embeddings.
        """
        google_api_key = settings.GOOGLE_API_KEY or os.getenv("GOOGLE_API_KEY")
        if not google_api_key:
            raise ValueError("GOOGLE_API_KEY must be set for embeddings")
            
        model_name = settings.GOOGLE_EMBEDDING_MODEL or "models/gemini-embedding-001"
        self.embedding_provider = "google"
        self.embedding_model_name = model_name
        self.embedding_model = GoogleGenerativeAIEmbeddings(
            model=model_name,
            google_api_key=google_api_key,
        )
        
        self.url = settings.QDRANT_URL
        self.api_key = settings.QDRANT_API_KEY
        self.client = QdrantClient(url=self.url, api_key=self.api_key)
    
    def create_vector_store(
        self, 
        documents: List[Document], 
        persist_directory: str = None, # Unused
        collection_name: str = "multimodal_rag" # Maps to project_id (One collection per project)
    ):
        """
        Create (or append to) Qdrant collection using langchain-qdrant.
        """
        # Prepare metadata
        for doc in documents:
            doc.metadata["project_id"] = collection_name
            # Ensure complex metadata fields are strings
            for key in ["raw_tables_html", "image_interpretation", 
                        "table_interpretation", "image_paths", 
                        "image_base64", "page_numbers", "content_types"]:
                if key in doc.metadata and not isinstance(doc.metadata[key], (str, type(None))):
                    doc.metadata[key] = json.dumps(doc.metadata[key])
        
        vectorstore = QdrantVectorStore.from_documents(
            documents,
            self.embedding_model,
            url=self.url,
            api_key=self.api_key,
            collection_name=collection_name,
        )
        
        return vectorstore
    
    def append_to_vector_store(
        self,
        documents: List[Document],
        persist_directory: str = None,
        collection_name: str = "multimodal_rag"
    ):
        """Append to vector store"""
        return self.create_vector_store(documents, persist_directory, collection_name)
    
    def load_vector_store(
        self, 
        persist_directory: str = None,
        collection_name: str = "multimodal_rag"
    ):
        """
        Return Langchain QdrantVectorStore.
        """
        return QdrantVectorStore.from_existing_collection(
            embedding=self.embedding_model,
            collection_name=collection_name,
            url=self.url,
            api_key=self.api_key
        )
    
    def search(
        self, 
        vectorstore, 
        query: str, 
        k: int = 5,
        filter_dict: dict = None
    ):
        """
        Search the vector store using langchain QdrantVectorStore.
        """
        search_filter = None
        if filter_dict:
            conditions = []
            for key, value in filter_dict.items():
                conditions.append(rest.FieldCondition(
                    key=f"metadata.{key}",
                    match=rest.MatchValue(value=value)
                ))
            if conditions:
                search_filter = rest.Filter(must=conditions)
        
        results = vectorstore.similarity_search(query, k=k, filter=search_filter)
        return results

    def delete_project_vectors(self, project_id: str):
        """Delete generic Qdrant collection for project"""
        try:
            self.client.delete_collection(collection_name=project_id)
        except Exception:
            pass

    def get_project_document_count(self, project_id: str) -> int:
        """Get the count of vectors in the collection"""
        try:
            count_result = self.client.count(collection_name=project_id)
            return count_result.count
        except Exception:
            return 0
