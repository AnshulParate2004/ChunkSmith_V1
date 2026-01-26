"""Chat and Conversation API routes"""
import json
from typing import AsyncGenerator, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from config.settings import settings
from core.chat_agent import ChatAgent
from api.shared import chat_agents
from api.auth_routes import get_current_user, get_supabase_client
from utils.conversation_manager import ConversationManager

router = APIRouter(prefix="/chat", tags=["Chat & Conversations"])


# ============================================
# REQUEST MODELS
# ============================================

class ConversationCreateRequest(BaseModel):
    project_id: str
    title: Optional[str] = None

class TitleUpdateRequest(BaseModel):
    title: str


# ============================================
# SESSION-BASED CHAT ENDPOINTS (EPHEMERAL)
# ============================================

@router.post("/init/{project_id}")
async def initialize_chat(project_id: str, user = Depends(get_current_user)):
    """Initialize a chat session for a project"""
    try:
        # Check if project exists (basic check via settings)
        project_dir = settings.get_project_dir(project_id)
        # Note: We don't enforce local existence due to cloud-native nature, 
        # but ChatAgent will need to pull from vector store
        
        # Create new agent instance if not exists
        if project_id not in chat_agents:
            # We initialize lazily here
            chat_agents[project_id] = ChatAgent(project_id=project_id)
            
        return {
            "success": True,
            "message": "Chat session initialized",
            "project_id": project_id,
            "session_id": project_id # Using project_id as session_id for simplicity in this version
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream/{project_id}")
async def stream_chat_response(
    project_id: str,
    message: str = Query(..., description="User message to send to the chat agent"),
    token: str = Query(..., description="JWT authentication token")
):
    """
    Stream chat responses for a project with JWT authentication
    Token is passed as query parameter since EventSource doesn't support custom headers
    """
    # Validate JWT token
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = user_response.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Authentication failed")
    
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Create or get cached chat agent for this project
            if project_id not in chat_agents:
                chat_agents[project_id] = ChatAgent(project_id=project_id, user_id=user.id)
            
            agent = chat_agents[project_id]
            
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected to chat stream'})}\n\n"
            
            # Stream responses from the chat agent
            async for event in agent.chat_stream(message):
                event_type = event["type"]
                event_data = event["data"]
                
                sse_message = {
                    "type": event_type,
                    **event_data
                }
                
                yield f"data: {json.dumps(sse_message)}\n\n"
            
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except Exception as e:
            error_message = str(e).replace('"', '\\"').replace("\n", " ")
            yield f"data: {json.dumps({'type': 'error', 'message': error_message})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.post("/clear/{project_id}")
async def clear_chat_session(
    project_id: str,
    user = Depends(get_current_user)
):
    """
    Clear the chat session for a project (requires authentication)
    This removes the cached chat agent, effectively starting a fresh conversation
    """
    try:
        if project_id in chat_agents:
            del chat_agents[project_id]
            return {
                "success": True,
                "message": f"Chat session cleared for project {project_id}",
                "user_id": user.id
            }
        else:
            return {
                "success": True,
                "message": "No active chat session to clear"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# PERSISTENT CONVERSATION ENDPOINTS
# ============================================

@router.post("/conversations")
async def create_conversation(
    request: ConversationCreateRequest,
    user = Depends(get_current_user)
):
    """Create a new conversation"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        result = manager.create_conversation(user.id, request.project_id, request.title)
        
        if not result:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations")
async def list_conversations(
    project_id: Optional[str] = None,
    user = Depends(get_current_user)
):
    """List conversations for current user, optionally filtered by project"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        result = manager.list_conversations(user.id, project_id)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Get conversation details"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        # verify ownership
        result = manager.get_conversation(conversation_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        if result["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Get messages for a conversation"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        # Verify ownership first
        conv_result = manager.get_conversation(conversation_id)
        if not conv_result or conv_result["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        result = manager.get_messages(conversation_id)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/conversations/{conversation_id}/message_stream")
async def stream_conversation_message(
    conversation_id: str,
    message: str = Query(..., description="User message"),
    token: str = Query(..., description="JWT Token for auth in SSE")
):
    """
    Stream a message in a conversation and save context
    Uses same SSE pattern as ephemeral chat but saves history
    """
    # Validate token manually since SSE doesn't support headers
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = user_response.user
    except:
        raise HTTPException(status_code=401, detail="Authentication failed")

    async def event_generator():
        try:
            # Re-get client inside generator scope if needed, or use outer one
            # supabase client is thread-safe usually
            manager = ConversationManager(supabase)
            
            # Verify ownership
            conv_result = manager.get_conversation(conversation_id)
            if not conv_result or conv_result["user_id"] != user.id:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Not authorized'})}\n\n"
                return

            project_id = conv_result["project_id"]
            
            # Save User Message
            manager.add_message(conversation_id, "user", message)
            
            # Get Context/History (Last 10 messages)
            # history_res = manager.get_messages(conversation_id)
            # Todo: Format history for agent if needed
            
            # Initialize Agent
            if project_id not in chat_agents:
                chat_agents[project_id] = ChatAgent(project_id=project_id, user_id=user.id)
            
            agent = chat_agents[project_id]
            
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected'})}\n\n"
            
            full_response = ""
            
            # Stream response
            # Pass conversation_id context if agent supports it, or just use history
            async for event in agent.chat_stream(message):
                yield f"data: {json.dumps(event)}\n\n"
                
                if event["type"] == "content":
                    full_response += event["data"].get("content", "")
            
            # Save Assistant Message
            if full_response:
                manager.add_message(conversation_id, "assistant", full_response)
                
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except Exception as e:
            error_msg = str(e).replace('"', '\\"').replace("\n", " ")
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Delete a conversation"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        # Verify ownership
        conv_result = manager.get_conversation(conversation_id)
        if not conv_result or conv_result["user_id"] != user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
             
        manager.delete_conversation(conversation_id)
        return {"success": True, "message": "Conversation deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/conversations/{conversation_id}/title")
async def update_conversation_title(
    conversation_id: str,
    request: TitleUpdateRequest,
    user = Depends(get_current_user)
):
    """Update conversation title"""
    try:
        supabase = get_supabase_client()
        manager = ConversationManager(supabase)
        # Verify ownership
        conv_result = manager.get_conversation(conversation_id)
        if not conv_result or conv_result["user_id"] != user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
             
        manager.update_conversation_title(conversation_id, request.title)
        return {"success": True, "message": "Title updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
