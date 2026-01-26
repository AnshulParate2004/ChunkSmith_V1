from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from config.settings import settings
from typing import Optional

# Define HTTP Bearer scheme
security = HTTPBearer()

def get_supabase_client() -> Client:
    """Create a Supabase client"""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase credentials not configured"
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Validate the JWT token and return the user object.
    """
    token = credentials.credentials
    supabase = get_supabase_client()

    try:
        # Get user via Supabase Auth
        # db call to verify token
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_response.user

    except Exception as e:
        # print(f"Auth Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
