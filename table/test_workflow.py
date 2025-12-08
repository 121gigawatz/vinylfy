"""
Example test script for two-step preview / download
"""

import requests
import sys
import time

BASE_URL = "http://localhost:5000/api"

def test_workflow(audio_file_path):
    """
    Test complete workflow: upload -> process -> preview -> download
    """
    print("🎵 Vinylfy Table - Workflow Test\n")
    print("=" * 50)

    # Step 1: Upload and process
    print("\n1️⃣  Uploading and processing audio file...")

    with open(audio_file_path, 'rb') as f:
        files = {'audio': f}
        data = {
            'preset': 'AJW Recommended',
            'output_format': 'wav'
        }

        response = requests.post(f"{BASE_URL}/process", files=files, data=data)
    
    if response.status_code != 200:
        print(f"❌ Error: {response.json().get('error')}")
        return
    
    result = response.json()
    file_id = result['file_id']

    print(f"✅ Processing complete!")
    print(f"   File ID: {file_id}")
    print(f"   Original: {result['original_filename']}")
    print(f"   Output: {result['suggested_filename']}")
    print(f"   Size: {result['file_size_formatted']}")
    print(f"   Preset: {result['preset']}")
    print(f"   Expires in: {result['expires_in_seconds'] // 60} minutes")

    # Step 2: Get file info
    print("\n2️⃣  Getting file information...")
    
    response = requests.get(f"{BASE_URL}/file/{file_id}")
    if response.status_code == 200:
        info = response.json()
        print(f"✅ File info retrieved")
        print(f"  Stored at: {info['stored_at']}")
        print(f"  Expires at: {info['expires_at']}")
    
    # Step 3: Preview (just get the URL, browser would play it)
    print("\n3️⃣  Preview URL generated:")
    preview_url = f"{BASE_URL}/preview/{file_id}"
    print(f"   🎧 {preview_url}")
    print(f"   (Open with URL in a browser to preview)")

    # Step 4: Download
    print("\n4️⃣  Downloading processed file...")
    download_url = f"{BASE_URL}/download/{file_id}"

    response = requests.get(download_url)
    if response.status_code == 200:
        output_filename = result['suggested_filename']
        with open(output_filename, 'wb') as f:
            f.write(response.content)
        print(f"✅ Downloaded: {output_filename}")
    else:
        print(f"❌ Download failed: {response.status_code}")
    
    # Step 5: Check stats
    print("\n5️⃣  Storage statistics:")
    response = requests.get(f"{BASE_URL}/stats")
    if response.status_code == 200:
        stats = response.json()
        print(f"   Total files: {stats['total_files']}")
        print(f"   Storage used: {stats['total_size_mb']} MB")
    
    # Optional: Delete file
    print("\n6️⃣  Cleaning up...")
    response = requests.delete(f"{BASE_URL}/file/{file_id}")
    if response.status_code == 200:
        print(f"✅ File deleted successfully")
    
    print("\n" + "=" * 50)
    print("✨ Workflow test complete!\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_workflow.py <audio_file>")
        print("Example: python test_workflow.py song.mp3")
        sys.exit(1)
    
    audio_file = sys.argv[1]

    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code != 200:
            print("❌ Server not responding. Make sure the table is running!")
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Make sure the table is running!")
        print("  Run docker-compose up")
        sys.exit(1)
    
    test_workflow(audio_file)