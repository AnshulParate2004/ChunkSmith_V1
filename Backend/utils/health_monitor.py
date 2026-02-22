"""Background health monitor - automatically checks backend health every 3 minutes"""
import httpx
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)

# Configuration
HEALTH_ENDPOINT = "http://localhost:8000/api/health"
CHECK_INTERVAL = 180  # 3 minutes in seconds
TIMEOUT = 10  # Request timeout in seconds

# Statistics
check_count = 0
success_count = 0
failure_count = 0


def log_message(message: str, level: str = "INFO"):
    """Log message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] [HealthMonitor] {message}"
    
    if level == "ERROR":
        logger.error(log_msg)
    elif level == "SUCCESS":
        logger.info(log_msg)
    else:
        logger.info(log_msg)


async def check_health() -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Send health check request to backend
    
    Returns:
        tuple: (success: bool, response_data: dict or None)
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(HEALTH_ENDPOINT)
            response.raise_for_status()
            data = response.json()
            return True, data
    except httpx.ConnectError:
        log_message("Connection failed - Backend may be down", "ERROR")
        return False, None
    except httpx.TimeoutException:
        log_message(f"Request timeout after {TIMEOUT}s", "ERROR")
        return False, None
    except httpx.HTTPStatusError as e:
        log_message(f"HTTP error: {e.response.status_code}", "ERROR")
        return False, None
    except Exception as e:
        log_message(f"Unexpected error: {e}", "ERROR")
        return False, None


async def health_monitor_loop():
    """Main monitoring loop that runs in background"""
    global check_count, success_count, failure_count
    
    log_message("Health monitor started", "INFO")
    log_message(f"Monitoring: {HEALTH_ENDPOINT}", "INFO")
    log_message(f"Check interval: {CHECK_INTERVAL} seconds (3 minutes)", "INFO")
    
    while True:
        try:
            check_count += 1
            log_message(f"Health check #{check_count}...", "INFO")
            
            success, data = await check_health()
            
            if success:
                success_count += 1
                status = data.get("status", "unknown")
                api_version = data.get("api_version", "unknown")
                active_processing = data.get("active_processing", 0)
                active_chat = data.get("active_chat_sessions", 0)
                projects = data.get("projects_count", 0)
                
                log_message(
                    f"✓ Backend is healthy | "
                    f"Status: {status} | "
                    f"Version: {api_version} | "
                    f"Processing: {active_processing} | "
                    f"Chat sessions: {active_chat} | "
                    f"Projects: {projects}",
                    "SUCCESS"
                )
            else:
                failure_count += 1
                log_message(
                    f"✗ Health check failed (Failures: {failure_count}/{check_count})",
                    "ERROR"
                )
            
            # Wait before next check
            await asyncio.sleep(CHECK_INTERVAL)
            
        except asyncio.CancelledError:
            log_message("Health monitor stopped", "INFO")
            break
        except Exception as e:
            log_message(f"Error in health monitor loop: {e}", "ERROR")
            await asyncio.sleep(CHECK_INTERVAL)  # Wait before retrying


def get_monitor_stats() -> Dict[str, Any]:
    """Get health monitor statistics"""
    global check_count, success_count, failure_count
    
    success_rate = (success_count / check_count * 100) if check_count > 0 else 0
    
    return {
        "total_checks": check_count,
        "successful_checks": success_count,
        "failed_checks": failure_count,
        "success_rate": round(success_rate, 1),
        "check_interval_seconds": CHECK_INTERVAL
    }
