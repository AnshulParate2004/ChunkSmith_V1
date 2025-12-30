"""Vector store operations using ChromaDB with append support"""
import json
import re
from typing import List
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma


class VectorStoreManager:
    """Manages ChromaDB vector store operations"""
    
    def __init__(self, embedding_model: str ):
        self.embedding_model = GoogleGenerativeAIEmbeddings(model=embedding_model)
    
    @staticmethod
    def sanitize_collection_name(name: str) -> str:
        """
        Sanitize collection name to meet ChromaDB requirements:
        - 3-512 characters
        - Only alphanumeric, dots, underscores, hyphens
        - Must start and end with alphanumeric
        
        Args:
            name: Original collection name
            
        Returns:
            Sanitized collection name
        """
        # Replace invalid characters with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9._-]', '_', name)
        
        # Remove leading/trailing non-alphanumeric characters
        sanitized = re.sub(r'^[^a-zA-Z0-9]+', '', sanitized)
        sanitized = re.sub(r'[^a-zA-Z0-9]+$', '', sanitized)
        
        # Collapse multiple underscores/hyphens
        sanitized = re.sub(r'[_-]+', '_', sanitized)
        
        # Ensure length is within bounds (3-512 characters)
        if len(sanitized) < 3:
            sanitized = f"doc_{sanitized}"
        if len(sanitized) > 512:
            sanitized = sanitized[:512]
            # Re-ensure it ends with alphanumeric after truncation
            sanitized = re.sub(r'[^a-zA-Z0-9]+$', '', sanitized)
        
        # Final validation
        if not sanitized or len(sanitized) < 3:
            sanitized = "default_collection"
        
        return sanitized
    
    def create_vector_store(
        self, 
        documents: List[Document], 
        persist_directory: str,
        collection_name: str = "multimodal_rag"
    ):
        """
        Create and persist ChromaDB vector store
        
        Args:
            documents: List of LangChain documents
            persist_directory: Directory to persist the database
            collection_name: Name of the collection (will be sanitized)
            
        Returns:
            ChromaDB vector store instance
        """
        print("Creating embeddings and storing in ChromaDB...")
        
        # Sanitize collection name
        original_name = collection_name
        collection_name = self.sanitize_collection_name(collection_name)
        
        if original_name != collection_name:
            print(f"Collection name sanitized: '{original_name}' -> '{collection_name}'")
        
        # Convert list metadata to JSON strings (ChromaDB requirement)
        for doc in documents:
            if "raw_tables_html" in doc.metadata:
                doc.metadata["raw_tables_html"] = json.dumps(doc.metadata["raw_tables_html"])
            if "image_interpretation" in doc.metadata:
                doc.metadata["image_interpretation"] = json.dumps(doc.metadata["image_interpretation"])
            if "table_interpretation" in doc.metadata:
                doc.metadata["table_interpretation"] = json.dumps(doc.metadata["table_interpretation"])
            if "image_paths" in doc.metadata:
                doc.metadata["image_paths"] = json.dumps(doc.metadata["image_paths"])
            if "image_base64" in doc.metadata:
                doc.metadata["image_base64"] = json.dumps(doc.metadata["image_base64"])
            if "page_numbers" in doc.metadata:
                doc.metadata["page_numbers"] = json.dumps(doc.metadata["page_numbers"])
            if "content_types" in doc.metadata:
                doc.metadata["content_types"] = json.dumps(doc.metadata["content_types"])
        
        print("--- Creating vector store ---")
        vectorstore = Chroma.from_documents(
            documents=documents,
            embedding=self.embedding_model,
            persist_directory=persist_directory,
            collection_name=collection_name,
            collection_metadata={"hnsw:space": "cosine"}
        )
        print("--- Finished creating vector store ---")
        
        print(f"Vector store created with {len(documents)} documents")
        print(f"Saved to {persist_directory}")
        print(f"Collection name: {collection_name}")
        
        return vectorstore
    
    def append_to_vector_store(
        self,
        documents: List[Document],
        persist_directory: str,
        collection_name: str = "multimodal_rag"
    ):
        """
        Append documents to existing vector store (or create if doesn't exist)
        
        Args:
            documents: List of LangChain documents to add
            persist_directory: Directory where database is persisted
            collection_name: Name of the collection (will be sanitized)
            
        Returns:
            ChromaDB vector store instance
        """
        print(f"Appending {len(documents)} documents to vector store...")
        
        # Sanitize collection name
        collection_name = self.sanitize_collection_name(collection_name)
        
        # Convert list metadata to JSON strings
        for doc in documents:
            if "raw_tables_html" in doc.metadata:
                doc.metadata["raw_tables_html"] = json.dumps(doc.metadata["raw_tables_html"])
            if "image_interpretation" in doc.metadata:
                doc.metadata["image_interpretation"] = json.dumps(doc.metadata["image_interpretation"])
            if "table_interpretation" in doc.metadata:
                doc.metadata["table_interpretation"] = json.dumps(doc.metadata["table_interpretation"])
            if "image_paths" in doc.metadata:
                doc.metadata["image_paths"] = json.dumps(doc.metadata["image_paths"])
            if "image_base64" in doc.metadata:
                doc.metadata["image_base64"] = json.dumps(doc.metadata["image_base64"])
            if "page_numbers" in doc.metadata:
                doc.metadata["page_numbers"] = json.dumps(doc.metadata["page_numbers"])
            if "content_types" in doc.metadata:
                doc.metadata["content_types"] = json.dumps(doc.metadata["content_types"])
        
        try:
            # Try to load existing vector store
            vectorstore = Chroma(
                persist_directory=persist_directory,
                embedding_function=self.embedding_model,
                collection_name=collection_name
            )
            print(f"Loaded existing vector store: {collection_name}")
            
            # Add new documents
            vectorstore.add_documents(documents)
            print(f"Appended {len(documents)} documents to existing collection")
            
        except Exception as e:
            print(f"Vector store doesn't exist, creating new one: {str(e)}")
            # Create new if doesn't exist
            vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embedding_model,
                persist_directory=persist_directory,
                collection_name=collection_name,
                collection_metadata={"hnsw:space": "cosine"}
            )
            print(f"Created new vector store with {len(documents)} documents")
        
        print(f"Vector store path: {persist_directory}")
        print(f"Collection name: {collection_name}")
        
        return vectorstore
    
    def load_vector_store(
        self, 
        persist_directory: str,
        collection_name: str = "multimodal_rag"
    ):
        """
        Load existing ChromaDB vector store
        
        Args:
            persist_directory: Directory where database is persisted
            collection_name: Name of the collection (will be sanitized)
            
        Returns:
            ChromaDB vector store instance
        """
        print(f"Loading vector store from {persist_directory}")
        
        # Sanitize collection name
        collection_name = self.sanitize_collection_name(collection_name)
        
        vectorstore = Chroma(
            persist_directory=persist_directory,
            embedding_function=self.embedding_model,
            collection_name=collection_name
        )
        
        print(f"Vector store loaded successfully")
        return vectorstore
    
    def search(
        self, 
        vectorstore, 
        query: str, 
        k: int = 2,
        filter_dict: dict = None
    ):
        """
        Search the vector store
        
        Args:
            vectorstore: ChromaDB instance
            query: Search query
            k: Number of results to return
            filter_dict: Optional metadata filter
            
        Returns:
            List of relevant documents
        """
        print(f"Searching for: {query}")
        
        if filter_dict:
            results = vectorstore.similarity_search(query, k=k, filter=filter_dict)
        else:
            results = vectorstore.similarity_search(query, k=k)
        
        print(f"Found {len(results)} results")
        return results
