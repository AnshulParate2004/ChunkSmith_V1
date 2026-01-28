"""Vector store operations using Qdrant (Cloud Native)"""
import json
import logging
from typing import List, Optional
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from config.settings import settings

# Configure logging
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

class VectorStoreManager:
    """Manages Qdrant vector store operations"""
    
    def __init__(self, embedding_model: str):
        # Initialize Google Embeddings
        self.embedding_model = GoogleGenerativeAIEmbeddings(model=embedding_model)
        
        # Initialize Qdrant Client
        # Note: Port 6333 is standard, user url included it.
        url = settings.QDRANT_URL
        api_key = settings.QDRANT_API_KEY
        
        # if not url or not api_key:
            # logger.warning("Qdrant credentials missing in settings!")
            
        self.client = QdrantClient(url=url, api_key=api_key)
    
    def create_vector_store(
        self, 
        documents: List[Document], 
        persist_directory: str = None, # Unused
        collection_name: str = "multimodal_rag" # Maps to project_id (One collection per project)
    ):
        """
        Create (or append to) Qdrant collection.
        Strategy: One Collection per Project ID.
        """
        # logger.info(f"Adding {len(documents)} documents to Qdrant (Collection: {collection_name})")
        
        # Prepare metadata
        for doc in documents:
            doc.metadata["project_id"] = collection_name
            # Ensure complex metadata fields are strings (Qdrant handles JSON but LangChain behavior varies)
            # Keeping stringification for consistency with previous logic
            if "raw_tables_html" in doc.metadata and not isinstance(doc.metadata["raw_tables_html"], (str, type(None))):
                 doc.metadata["raw_tables_html"] = json.dumps(doc.metadata["raw_tables_html"])
            if "image_interpretation" in doc.metadata and not isinstance(doc.metadata["image_interpretation"], (str, type(None))):
                doc.metadata["image_interpretation"] = json.dumps(doc.metadata["image_interpretation"])
            if "table_interpretation" in doc.metadata and not isinstance(doc.metadata["table_interpretation"], (str, type(None))):
                doc.metadata["table_interpretation"] = json.dumps(doc.metadata["table_interpretation"])
            if "image_paths" in doc.metadata and not isinstance(doc.metadata["image_paths"], (str, type(None))):
                if isinstance(doc.metadata["image_paths"], list):
                     doc.metadata["image_paths"] = json.dumps(doc.metadata["image_paths"])
            if "image_base64" in doc.metadata and not isinstance(doc.metadata["image_base64"], (str, type(None))):
                doc.metadata["image_base64"] = json.dumps(doc.metadata["image_base64"])
            if "page_numbers" in doc.metadata and not isinstance(doc.metadata["page_numbers"], (str, type(None))):
                doc.metadata["page_numbers"] = json.dumps(doc.metadata["page_numbers"])
            if "content_types" in doc.metadata and not isinstance(doc.metadata["content_types"], (str, type(None))):
                doc.metadata["content_types"] = json.dumps(doc.metadata["content_types"])
        
        # Ensure collection exists
        # gemini-embedding-001 has 3072 dimensions
        try:
            self.client.get_collection(collection_name)
        except Exception:
             # logger.info(f"Creating new Qdrant collection: {collection_name}")
             self.client.create_collection(
                 collection_name=collection_name,
                 vectors_config=rest.VectorParams(size=3072, distance=rest.Distance.COSINE)
             )
        
        # Add documents via LangChain Qdrant wrapper
        vectorstore = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embedding_model
        )
        vectorstore.add_documents(documents)
        
        # Attach project_id for later use
        vectorstore.project_id = collection_name
        
        # logger.info("--- Finished adding to Qdrant vector store ---")
        return vectorstore
    
    def append_to_vector_store(
        self,
        documents: List[Document],
        persist_directory: str = None,
        collection_name: str = "multimodal_rag"
    ):
        """Append to vector store (same as create for Qdrant)"""
        return self.create_vector_store(documents, persist_directory, collection_name)
    
    def load_vector_store(
        self, 
        persist_directory: str = None,
        collection_name: str = "multimodal_rag"
    ):
        """
        Load existing Qdrant vector store client.
        """
        # logger.info(f"Loading Qdrant vector store for collection: {collection_name}")
        
        vectorstore = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embedding_model
        )
        
        vectorstore.project_id = collection_name
        return vectorstore
    
    def search(
        self, 
        vectorstore, 
        query: str, 
        k: int = 5,
        filter_dict: dict = None
    ):
        """
        Search the vector store.
        """
        # logger.info(f"Searching collection {vectorstore.collection_name} for: {query}")
        
        results = vectorstore.similarity_search(query, k=k, filter=filter_dict)
        
        # logger.info(f"Found {len(results)} results")
        return results

    def delete_project_vectors(self, project_id: str):
        """Delete generic Qdrant collection for project"""
        try:
            # logger.info(f"Deleting Qdrant collection: {project_id}")
            self.client.delete_collection(collection_name=project_id)
            # logger.info(f"Deleted collection {project_id}")
        except Exception as e:
            logger.error(f"Error deleting collection {project_id} (might not exist): {e}")

    def get_project_document_count(self, project_id: str) -> int:
        """Get the count of vectors in the collection"""
        try:
            count_result = self.client.count(collection_name=project_id)
            return count_result.count
        except Exception as e:
            # Collection might not exist
            # logger.warning(f"Error counting documents for {project_id}: {e}")
            return 0
