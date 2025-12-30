"""
Test script for project-based architecture
Run this to verify the new system works correctly
"""
import requests
import time
import json

BASE_URL = "http://localhost:8000/api"

def test_create_project():
    """Test creating a new project"""
    print("\n=== Test 1: Create Project ===")
    response = requests.post(
        f"{BASE_URL}/projects",
        json={"project_name": "Test Project"}
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    return response.json()["project_id"]

def test_list_projects():
    """Test listing all projects"""
    print("\n=== Test 2: List Projects ===")
    response = requests.get(f"{BASE_URL}/projects")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Found {data['count']} projects")
    for proj in data['projects']:
        print(f"  - {proj['project_id']} ({proj['file_count']} files)")

def test_get_project_details(project_id):
    """Test getting project details"""
    print(f"\n=== Test 3: Get Project Details ({project_id}) ===")
    response = requests.get(f"{BASE_URL}/projects/{project_id}")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"PDF Count: {data.get('pdf_count', 0)}")
    print(f"Image Count: {data.get('image_count', 0)}")
    print(f"Has Vector Store: {data.get('has_vector_store', False)}")
    print(f"Chunks in DB: {data.get('chunks_in_db', 0)}")

def test_upload_pdf(project_id, pdf_path):
    """Test uploading PDF to project"""
    print(f"\n=== Test 4: Upload PDF to {project_id} ===")
    
    with open(pdf_path, 'rb') as f:
        files = {'file': (pdf_path, f, 'application/pdf')}
        response = requests.post(
            f"{BASE_URL}/process-pdf",
            params={"project_id": project_id},
            files=files
        )
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Document ID: {data['document_id']}")
        print(f"Stream URL: {data['stream_url']}")
        return data['document_id']
    else:
        print(f"Error: {response.text}")
        return None

def test_search(project_id, query):
    """Test searching within project"""
    print(f"\n=== Test 5: Search in {project_id} ===")
    response = requests.post(
        f"{BASE_URL}/search",
        json={
            "query": query,
            "project_id": project_id,
            "k": 3
        }
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Found {data['results_count']} results")
        for result in data['results']:
            print(f"\nRank {result['rank']}:")
            print(f"  {result['content'][:100]}...")

def test_init_chat(project_id):
    """Test initializing chat for project"""
    print(f"\n=== Test 6: Initialize Chat for {project_id} ===")
    response = requests.post(f"{BASE_URL}/chat/init/{project_id}")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Session ID: {data['session_id']}")
        return data['session_id']
    else:
        print(f"Error: {response.text}")
        return None

def test_delete_project(project_id):
    """Test deleting a project"""
    print(f"\n=== Test 7: Delete Project {project_id} ===")
    response = requests.delete(f"{BASE_URL}/projects/{project_id}")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

def test_health():
    """Test health endpoint"""
    print("\n=== Test 8: Health Check ===")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"API Status: {data['status']}")
    print(f"Projects Count: {data.get('projects_count', 0)}")
    print(f"Active Processing: {data.get('active_processing', 0)}")

def main():
    """Run all tests"""
    print("=" * 60)
    print("ChunkSmith Backend - Project Architecture Tests")
    print("=" * 60)
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code != 200:
            print("❌ Server is not running! Start with: uvicorn main:app --reload")
            return
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server! Start with: uvicorn main:app --reload")
        return
    
    print("✅ Server is running")
    
    # Run tests
    test_health()
    
    # Create a test project
    project_id = test_create_project()
    
    # List all projects
    test_list_projects()
    
    # Get project details
    test_get_project_details(project_id)
    
    # Note: Uploading requires an actual PDF file
    print("\n" + "=" * 60)
    print("⚠️  To test PDF upload, uncomment the following and provide a PDF:")
    print(f"# document_id = test_upload_pdf('{project_id}', 'path/to/your.pdf')")
    print("# time.sleep(30)  # Wait for processing")
    print(f"# test_search('{project_id}', 'your search query')")
    print(f"# session_id = test_init_chat('{project_id}')")
    print("=" * 60)
    
    # Clean up (optional)
    print("\n⚠️  Cleaning up test project...")
    choice = input(f"Delete test project '{project_id}'? (y/n): ")
    if choice.lower() == 'y':
        test_delete_project(project_id)
        print("✅ Test project deleted")
    else:
        print(f"⚠️  Test project '{project_id}' was kept")
    
    print("\n" + "=" * 60)
    print("✅ All tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()
