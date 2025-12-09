# Vinylfy Beta - Quick Start Guide

## ⚠️ Important: You Must Be in the Correct Directory

The error `failed to read dockerfile: open Dockerfile: no such file or directory` means you're not in the correct folder.

### Where Should You Be?

After downloading and extracting the release, you'll have a folder structure like this:

```
vinlyfy-beta/           <- You need to be HERE
├── Dockerfile          <- This file must be visible
├── docker-compose.yml
├── start.sh
├── nginx.conf
├── table/
│   └── app/
└── needle/
```

## Windows Users - Step by Step

### 1. Download the Release

- Go to: https://github.com/121gigawatz/vinlyfy/releases/tag/beta
- Click on **"Source code (zip)"** to download
- Save it somewhere easy to find (like your Desktop or Downloads)

### 2. Extract the Files

- Right-click the downloaded `vinlyfy-beta.zip` file
- Click **"Extract All..."**
- Choose where to extract (or use the default)
- Click **Extract**

### 3. Open PowerShell in the Correct Folder

**Option A - Using File Explorer:**
1. Open File Explorer
2. Navigate to the extracted folder (it should be named `vinlyfy-beta`)
3. You should see files like `Dockerfile`, `docker-compose.yml`, etc.
4. In the address bar, type `powershell` and press Enter

**Option B - Using PowerShell:**
```powershell
# Change to where you extracted the files
cd "C:\Users\YourName\Downloads\vinlyfy-beta"

# Verify you're in the right place
dir Dockerfile
```

If you see "Cannot find path" or similar error, you're not in the right folder!

### 4. Verify Files Are Present

Run the verification script:
```powershell
.\verify-deployment.bat
```

You should see checkmarks for all files. If anything is missing, you're in the wrong folder!

### 5. Start Vinylfy

```powershell
docker compose up -d
```

### 6. Access the Application

Open your browser to: http://localhost:8888

## macOS/Linux Users - Step by Step

### 1. Download and Extract

```bash
# Download the release
curl -L https://github.com/121gigawatz/vinlyfy/archive/refs/tags/beta.tar.gz -o vinylfy-beta.tar.gz

# Extract - this creates a vinlyfy-beta folder
tar -xzf vinylfy-beta.tar.gz

# IMPORTANT: Go into the extracted folder
cd vinlyfy-beta
```

### 2. Verify Files Are Present

```bash
# Run the verification script
./verify-deployment.sh

# Or manually check for Dockerfile
ls -la Dockerfile
```

### 3. Start Vinylfy

```bash
docker-compose up -d
```

### 4. Access the Application

Open your browser to: http://localhost:8888

## Common Issues

### "failed to read dockerfile: open Dockerfile: no such file or directory"

**Problem:** You're not in the correct directory.

**Solution:**
1. Make sure you're inside the `vinlyfy-beta` folder (or whatever the extracted folder is named)
2. Run `dir` (Windows) or `ls` (Mac/Linux) and verify you see `Dockerfile`
3. If you don't see it, navigate into the extracted folder

### "port is already allocated"

**Problem:** Port 8888 is already in use.

**Solution:**
```bash
# Stop any existing containers
docker compose down

# Or use a different port
$env:PORT=9000  # Windows PowerShell
docker compose up -d

# For Mac/Linux:
PORT=9000 docker-compose up -d
```

### "pull access denied for vinylfy"

**Problem:** Docker is trying to pull from a registry that doesn't exist.

**Solution:** This is just a warning, ignore it. Docker will build the image locally instead.

### Docker Desktop Not Running

**Problem:** Docker commands fail with "Cannot connect to the Docker daemon"

**Solution:**
1. Open Docker Desktop
2. Wait for it to fully start (whale icon in system tray should be steady)
3. Try the command again

## Verifying It Works

Check if Vinylfy is running:

```powershell
# Windows PowerShell
Invoke-WebRequest http://localhost:8888/api/health
```

```bash
# Mac/Linux
curl http://localhost:8888/api/health
```

You should see:
```json
{"service":"vinylfy-table","status":"healthy","version":"beta"}
```

## Need Help?

1. Make sure Docker Desktop is running
2. Make sure you're in the correct directory (with Dockerfile visible)
3. Run the verification script: `verify-deployment.bat` (Windows) or `./verify-deployment.sh` (Mac/Linux)
4. Check the logs: `docker compose logs`
5. Open an issue: https://github.com/121gigawatz/vinlyfy/issues

## Stopping Vinylfy

```bash
docker compose down
```

## Updating to a New Version

```bash
# Stop the current version
docker compose down

# Download and extract the new release
# Then navigate to the new folder and run:
docker compose up -d
```
