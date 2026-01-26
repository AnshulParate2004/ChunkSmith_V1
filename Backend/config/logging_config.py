# """Logging configuration for ChunkSmith Backend"""
import logging
import sys

def configure_logging():
    """Configure logging to suppress verbose retry messages"""
    
    # Set root logger to WARNING to suppress INFO/DEBUG from libraries
    logging.basicConfig(
        level=logging.WARNING,
        format='%(levelname)s: %(message)s',
        stream=sys.stdout
    )
    
    # Suppress specific verbose loggers
    logging.getLogger("google.api_core.retry").setLevel(logging.ERROR)
    logging.getLogger("google.genai._api_client").setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    
    # Keep our app logs visible
    app_logger = logging.getLogger("uvicorn")
    app_logger.setLevel(logging.INFO)
    
    return logging.getLogger(__name__)
