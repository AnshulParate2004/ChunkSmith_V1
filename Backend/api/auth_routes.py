"""Authentication API routes and dependencies"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from supabase import create_client, Client
from config.settings import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Define HTTP Bearer scheme
security = HTTPBearer()


# ============================================
# AUTHENTICATION DEPENDENCIES
# ============================================

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
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return user_response.user

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============================================
# REQUEST MODELS
# ============================================

class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str


# ============================================
# ROUTES
# ============================================

@router.post("/login")
async def login(request: LoginRequest):
    """Login with email and password"""
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        
        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        return {
            "success": True,
            "user": {
                "id": response.user.id,
                "email": response.user.email
            },
            "session": {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token
            }
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/signup")
async def signup(request: SignupRequest):
    """Sign up with email and password"""
    try:
        supabase = get_supabase_client()
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password
        })
        
        return {
            "success": True,
            "message": "Check your email for confirmation link",
            "user": {
                "id": response.user.id if response.user else None,
                "email": request.email
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/logout")
async def logout(user = Depends(get_current_user)):
    """Logout current user"""
    try:
        supabase = get_supabase_client()
        supabase.auth.sign_out()
        return {"success": True, "message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session")
async def get_session(user = Depends(get_current_user)):
    """Get current user session"""
    return {
        "success": True,
        "user": {
            "id": user.id,
            "email": user.email
        }
    }
