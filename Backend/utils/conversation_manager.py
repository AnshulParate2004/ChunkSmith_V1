"""Conversation history management with Supabase"""
from typing import List, Dict, Optional
from supabase import Client
from datetime import datetime
import uuid

class ConversationManager:
    """Manages conversation history in Supabase"""
    
    def __init__(self, supabase_client: Client):
        self.client = supabase_client
    
    def create_conversation(
        self,
        user_id: str,
        project_id: str,
        title: Optional[str] = None
    ) -> Dict:
        """
        Create a new conversation
        
        Args:
            user_id: User UUID
            project_id: Project identifier
            title: Optional conversation title
            
        Returns:
            Conversation dict with id, user_id, project_id, title, created_at
        """
        data = {
            "user_id": user_id,
            "project_id": project_id,
            "title": title or f"Chat - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        }
        
        result = self.client.table("conversations").insert(data).execute()
        return result.data[0] if result.data else None
    
    def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """Get conversation by ID"""
        result = self.client.table("conversations")\
            .select("*")\
            .eq("id", conversation_id)\
            .execute()
        return result.data[0] if result.data else None
    
    def list_conversations(
        self,
        user_id: str,
        project_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """
        List conversations for a user
        
        Args:
            user_id: User UUID
            project_id: Optional filter by project
            limit: Max conversations to return
            
        Returns:
            List of conversations ordered by updated_at desc
        """
        query = self.client.table("conversations")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("updated_at", desc=True)\
            .limit(limit)
        
        if project_id:
            query = query.eq("project_id", project_id)
        
        result = query.execute()
        return result.data if result.data else []
    
    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict] = None,
    ) -> Dict:
        """
        Add a message to a conversation.

        `metadata` can hold structured fields such as image_references
        coming from the ChatResponse Pydantic model.
        """
        data = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "metadata": metadata or {},
        }

        result = self.client.table("messages").insert(data).execute()

        # Update conversation's updated_at timestamp
        self.client.table("conversations")\
            .update({"updated_at": datetime.now().isoformat()})\
            .eq("id", conversation_id)\
            .execute()

        return result.data[0] if result.data else None
    
    def get_messages(
        self,
        conversation_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Get recent messages for a conversation.
        We intentionally cap this to the most recent 10 messages
        (roughly 5 user turns and 5 assistant replies) to keep the
        conversation window manageable.
        """
        result = (
            self.client.table("messages")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        rows = list(reversed(result.data or []))
        return rows
    
    def delete_conversation(self, conversation_id: str):
        """Delete a conversation (and all its messages via CASCADE)"""
        self.client.table("conversations")\
            .delete()\
            .eq("id", conversation_id)\
            .execute()
    
    def update_conversation_title(self, conversation_id: str, title: str):
        """Update conversation title"""
        self.client.table("conversations")\
            .update({"title": title})\
            .eq("id", conversation_id)\
            .execute()
