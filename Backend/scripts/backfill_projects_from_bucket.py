"""
One-time backfill: create project records in PostgreSQL from existing bucket folders.
Run after creating projects/documents tables. Use when migrating from bucket-only to PostgreSQL.

  python -m scripts.backfill_projects_from_bucket
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import settings
from utils.storage import StorageManager
from utils.project_repository import ProjectRepository
from api.auth_routes import get_supabase_client


def backfill():
    """Create project rows for each folder in the PDF bucket."""
    storage = StorageManager()
    items = storage.list_bucket_contents(settings.SUPABASE_PDF_BUCKET_NAME)
    if not items:
        print("No projects in bucket.")
        return 0

    supabase = get_supabase_client()
    repo = ProjectRepository(supabase)
    count = 0
    for item in items:
        name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
        if not name or name.startswith("."):
            continue
        try:
            repo.create_project(name)
            print(f"  Created project: {name}")
            count += 1
        except Exception as e:
            print(f"  Skip {name}: {e}")
    print(f"\nBackfilled {count} projects.")
    return count


if __name__ == "__main__":
    backfill()
