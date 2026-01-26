"""
Main API Router Aggregator
Combines all domain-specific routers into a single router for main.py
"""
from fastapi import APIRouter
from api.auth_routes import router as auth_router
from api.project_routes import router as project_router
from api.document_routes import router as document_router
from api.chat_routes import router as chat_router
from api.shared import router as search_router  # Search merged into shared
from api.health_routes import router as health_router

# Create main router
router = APIRouter()

# Include all sub-routers
router.include_router(auth_router)       # Prefix: /auth
router.include_router(project_router)    # Prefix: /projects
router.include_router(document_router)   # Prefix: None (Mixed)
router.include_router(chat_router)       # Prefix: /chat
router.include_router(search_router)     # Prefix: None (/search) - from shared
router.include_router(health_router)     # Prefix: None (/health, /languages)
