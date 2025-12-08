# Version Management Workflow

## 📋 Complete Build & Deploy Process

### Development Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPMENT ENVIRONMENT                      │
│                                                                   │
│  1. Edit build/version.json                                      │
│     ├─ version: "v1.0.0 Beta 2.2.3"                             │
│     ├─ shortVersion: "beta2.2.3"                                 │
│     └─ dockerTag: "v1.0.0-beta-2.2.3"                           │
│                                                                   │
│  2. Run: make version                                            │
│     (or: python3 build/update-version.py)                        │
│                                                                   │
│     ├─ Updates needle/js/app.js              [v2.2.3]           │
│     ├─ Updates needle/index.html             [v2.2.3]           │
│     ├─ Updates needle/service-worker.js      [v2.2.3]           │
│     ├─ Updates table/app/__init__.py         [v2.2.3]           │
│     └─ Updates docker-compose.yml            [v2.2.3]           │
│                                                                   │
│  3. Commit changes                                               │
│     git add .                                                    │
│     git commit -m "Update version to v1.0.0 Beta 2.2.3"        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DOCKER BUILD PHASE                        │
│                                                                   │
│  4. Run: make build                                              │
│     (or: docker-compose build)                                   │
│                                                                   │
│     Docker reads: .dockerignore                                  │
│     ├─ EXCLUDES: build/ directory ⛔                             │
│     │   └─ build/version.json NOT copied to image               │
│     │                                                             │
│     ├─ INCLUDES: Source files with embedded versions ✅          │
│     │   ├─ needle/js/app.js        (has v2.2.3)                 │
│     │   ├─ needle/index.html       (has v2.2.3)                 │
│     │   ├─ needle/service-worker.js (has v2.2.3)                │
│     │   ├─ table/app/__init__.py   (has v2.2.3)                 │
│     │   ├─ nginx.conf                                            │
│     │   └─ start.sh                                              │
│     │                                                             │
│     └─ Creates: vinylfy:v1.0.0-beta-2.2.3 image                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DOCKER IMAGE CONTENTS                       │
│                                                                   │
│  /app/                                                           │
│  ├── needle/              [Frontend with v2.2.3 embedded]       │
│  │   ├── index.html       ✅ Has version query params          │
│  │   ├── js/app.js        ✅ APP_VERSION = 'v2.2.3'            │
│  │   └── service-worker.js ✅ CACHE_NAME = 'vinylfy-beta2.2.3' │
│  │                                                               │
│  ├── table/               [Backend with v2.2.3 embedded]        │
│  │   └── app/__init__.py  ✅ __version__ = 'v2.2.3'            │
│  │                                                               │
│  ├── nginx.conf           ✅ No /version.json endpoint          │
│  └── start.sh             ✅ Starts nginx + gunicorn            │
│                                                                   │
│  ❌ NO build/ directory                                         │
│  ❌ NO build/version.json                                       │
│  ❌ NO build scripts                                             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       RUNTIME DEPLOYMENT                         │
│                                                                   │
│  5. Run: make up                                                 │
│     (or: docker-compose up -d)                                   │
│                                                                   │
│     Container starts:                                            │
│     ├─ Flask backend (port 5000)                                 │
│     │   └─ /api/health returns: {"version": "v2.2.3"}           │
│     │                                                             │
│     └─ Nginx frontend (port 80)                                  │
│         ├─ Serves: /needle/index.html (v2.2.3)                   │
│         ├─ Serves: /needle/js/app.js (v2.2.3)                    │
│         ├─ Proxies: /api/* to Flask                              │
│         └─ BLOCKS: /version.json (404)                           │
│                                                                   │
│  6. Access: http://localhost:8888                                │
│     ✅ UI shows: "v1.0.0 Beta 2.2.3"                            │
│     ✅ Service worker uses: vinylfy-beta2.2.3 cache             │
│     ✅ API returns: {"version": "v2.2.3"}                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔒 Security Model

### What's in the Image
```
✅ Source files with hardcoded version strings
✅ Compiled/bundled code
✅ Runtime dependencies
```

### What's NOT in the Image
```
⛔ build/version.json
⛔ build/update-version.py
⛔ build/update-version.sh
⛔ build/VERSION_MANAGEMENT.md
⛔ Any build tools
```

## 🚀 Deployment Methods

### Method 1: Docker Compose (Recommended)
```bash
# Edit version
vim build/version.json

# Update source files
make version

# Build and deploy
make build
make up

# Or combined:
docker-compose up -d --build
```

### Method 2: Plain Docker
```bash
# Edit version
vim build/version.json

# Update source files
python3 build/update-version.py

# Build image
docker build -t vinylfy:v1.0.0-beta-2.2.3 .

# Run container
docker run -d -p 8888:80 \
  -e CORS_ORIGINS=* \
  -v vinylfy-data:/tmp/vinylfy \
  --name vinylfy \
  vinylfy:v1.0.0-beta-2.2.3
```

### Method 3: Docker Hub / Registry
```bash
# Build with proper tag
docker build -t yourusername/vinylfy:v1.0.0-beta-2.2.3 .

# Push to registry
docker push yourusername/vinylfy:v1.0.0-beta-2.2.3

# Others can pull and run
docker pull yourusername/vinylfy:v1.0.0-beta-2.2.3
docker run -d -p 8888:80 yourusername/vinylfy:v1.0.0-beta-2.2.3
```

## 📦 Image Distribution

### What Users Get
When someone pulls your Docker image:
- ✅ Working application with version v2.2.3
- ✅ Version displayed in UI
- ✅ Version in API responses
- ❌ NO access to build tools
- ❌ NO ability to change version

### What Fork Maintainers Do
1. Clone your repository
2. Edit `build/version.json` with their version
3. Run `make version` to embed their version
4. Build their own image: `make build`
5. Their fork shows their version, not yours

## 🔍 Verification

### Check Version in Running Container
```bash
# Check API version
curl http://localhost:8888/api/health

# Check if build/ directory exists (should be empty)
docker exec vinylfy ls /app/build 2>&1
# Output: No such file or directory ✅

# Check if version.json exists (should fail)
docker exec vinylfy cat /app/version.json 2>&1
# Output: No such file or directory ✅

# Verify embedded version in backend
docker exec vinylfy python3 -c "from table.app import __version__; print(__version__)"
# Output: v1.0.0 Beta 2.2.3 ✅
```

## ❓ FAQ

**Q: Can users change the version after deployment?**
A: No. Version strings are hardcoded into the source files before the Docker build. The `build/` directory is not included in the image.

**Q: Can I deploy without rebuilding the Docker image?**
A: Only for development with volume mounts. For production, you must rebuild the image to embed the new version.

**Q: What if I just change version.json and rebuild?**
A: Won't work. You MUST run `make version` first to update the source files, THEN rebuild.

**Q: Can forks falsely claim to be the official version?**
A: No. They must update version.json and rebuild to show their own version identifier.

**Q: Does the version update during runtime?**
A: No. The version is embedded at build-time and cannot change during runtime.

**Q: How do I deploy a new version?**
A:
1. Edit `build/version.json`
2. Run `make version`
3. Run `make build`
4. Run `make up`
5. The new version is now deployed

## 🎯 Summary

**Build Phase** (Development):
- Edit build/version.json
- Run update script
- Versions embedded in source
- Commit to git

**Docker Build**:
- Copies source files (with embedded versions)
- Excludes build/ directory
- Creates immutable image

**Runtime**:
- Version displayed in UI/API
- No access to build tools
- No way to change version
- Fully tamper-proof
