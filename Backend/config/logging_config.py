# """Logging configuration for ChunkSmith Backend"""
import logging
import sys

def configure_logging():
    """Configure logging to show only FastAPI/uvicorn logs."""
    # Root: warnings and above for all libraries
    logging.basicConfig(
        level=logging.WARNING,
        format="%(levelname)s [%(name)s] %(message)s",
        stream=sys.stdout,
    )

    # FastAPI/uvicorn (server + access) at INFO so you see requests
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    return logging.getLogger(__name__)
