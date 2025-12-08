# Version Management

Vinylfy uses a centralized **build-time** version management system where all version numbers are controlled from a single source of truth: **`build/version.json`**

## 🔒 Security Model

**Important:** `build/version.json` is a **build-time only** file that never gets deployed:

- ✅ Lives in the source repository
- ✅ Used by scripts to update source files
- ✅ Excluded from Docker images via `.dockerignore`
- ✅ Not served by nginx
- ❌ Never accessible at runtime
- ❌ Cannot be modified by end users or forks post-deployment

Version strings are **embedded directly** into source files during the build process, making them immutable once deployed.

## Quick Start

To update the version across the entire application:

1. **Edit `build/version.json`** - Update the version fields:
   ```json
   {
     "version": "v1.0.0 Beta 2.2.3",
     "shortVersion": "beta2.2.3",
     "dockerTag": "v1.0.0-beta-2.2.3"
   }
   ```

2. **Run the update script:**
   ```bash
   # Option 1: Using Makefile (recommended - simplest)
   make version

   # Option 2: Using Python (cross-platform)
   python3 scripts/update_version.py
   ```

3. **Done!** All files are now updated with the new version.

4. **Commit the changes** - The updated source files should be committed to git:
   ```bash
   git add .
   git commit -m "Update version to v1.0.0 Beta 2.2.3"
   ```

## What Gets Updated

The script automatically updates:

### Frontend Files
- ✅ `needle/js/app.js`
  - `APP_VERSION` constant
  - All import statement version parameters (`?v=...`)
  - `currentVersion` variable for cache management

- ✅ `needle/index.html`
  - All CSS link version parameters (`?v=...`)
  - All JS script version parameters (`?v=...`)

- ✅ `needle/service-worker.js`
  - `CACHE_NAME` constant
  - `RUNTIME_CACHE` constant

### Backend Files
- ✅ `table/app/__init__.py`
  - `__version__` constant (embedded at build time)

### Docker Files
- ✅ `docker-compose.yml`
  - Docker image tag

## Version Format

The `build/version.json` file contains three version formats:

| Field | Format | Used For | Example |
|-------|--------|----------|---------|
| `version` | Full semantic version with label | Display, API responses | `v1.0.0 Beta 2.2.2` |
| `shortVersion` | Short kebab-case version | Cache busting, file versioning | `beta2.2.2` |
| `dockerTag` | Docker-compatible tag | Docker image naming | `v1.0.0-beta-2.2.2` |

## Manual Updates (Not Recommended)

If you need to manually update versions without using the script:

### Backend
The backend automatically reads from `build/version.json` at startup, so no manual changes are needed.

### Frontend
You would need to update:
1. `needle/js/app.js` - Line 6: `const APP_VERSION`
2. `needle/js/app.js` - Lines 8-10: Import version params
3. `needle/index.html` - Lines 27-30: CSS version params
4. `needle/index.html` - Line 485: JS version param
5. `needle/service-worker.js` - Lines 1-2: Cache names

### Docker
1. `docker-compose.yml` - Line 8: Image tag

**⚠️ Warning:** Manual updates are error-prone. Always use the update script!

## Version Naming Conventions

### Release Versions
- Production: `v1.0.0`
- Production patch: `v1.0.1`
- Production minor: `v1.1.0`
- Production major: `v2.0.0`

### Beta Versions
- Beta release: `v1.0.0 Beta 2.0.0`
- Beta patch: `v1.0.0 Beta 2.0.1`
- Beta minor: `v1.0.0 Beta 2.1.0`
- Beta major: `v1.0.0 Beta 3.0.0`

### Development Versions
- Dev snapshot: `v1.0.0 Dev 2024-11-11`
- Dev branch: `v1.0.0 Dev feature-x`

## Security Considerations

### Why Build-Time vs Runtime?

**Build-time embedding** (current approach):
- ✅ Version cannot be tampered with after deployment
- ✅ Forks can't falsely claim to be a specific version
- ✅ No runtime file access needed
- ✅ Simpler deployment (fewer files)
- ✅ Version is part of the code itself

**Runtime loading** (what we avoided):
- ❌ Users could modify build/version.json to fake versions
- ❌ Forks could claim to be official builds
- ❌ File system access required at runtime
- ❌ Additional security surface
- ❌ Can fail if file is missing

### What's Protected

1. **build/version.json** is excluded from Docker images via `.dockerignore`
2. **No API endpoint** serves build/version.json (nginx blocks it)
3. **Version strings are compiled** into source files before deployment
4. **Update scripts** are also excluded from deployment

### For Fork Maintainers

If you maintain a fork of Vinylfy:

1. Update `build/version.json` with your own version identifier
2. Run the update script to embed your version
3. Your version will be displayed in the UI and API
4. Users will see your fork's version, not the original

Example for a fork:
```json
{
  "version": "v1.0.0 Beta 2.2.2-fork-myname",
  "shortVersion": "beta2.2.2-fork",
  "dockerTag": "v1.0.0-beta-2.2.2-fork"
}
```

## Troubleshooting

### Script fails to find build/version.json
**Error:** `❌ Error: build/version.json not found!`

**Solution:** Make sure you're running the script from the project root directory:
```bash
cd /path/to/vinylfy
python3 build/update-version.py
```

### Permission denied
**Error:** `Permission denied: ./build/update-version.sh`

**Solution:** Make the script executable:
```bash
chmod +x update-version.sh
chmod +x update-version.py
```

### Version mismatch after update
**Problem:** Frontend still shows old version

**Solution:**
1. Clear browser cache: `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete` on Mac)
2. Hard refresh: `Ctrl+F5` (or `Cmd+Shift+R` on Mac)
3. Or use the bypass: `?no-sw=true` in the URL

### Docker image not updated
**Problem:** Docker still uses old version tag

**Solution:** Rebuild the image:
```bash
docker-compose build
docker-compose up -d
```

## Integration with CI/CD

You can integrate version updates into your CI/CD pipeline:

### GitHub Actions Example
```yaml
name: Update Version
on:
  push:
    branches: [main]

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Update version
        run: python3 build/update-version.py
      - name: Commit changes
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add .
          git commit -m "Update version strings"
          git push
```

### Pre-commit Hook
Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
python3 build/update-version.py
git add needle/ docker-compose.yml
```

## Best Practices

1. **Always use the script** - Don't manually edit version strings
2. **Update build/version.json first** - Single source of truth
3. **Test after updating** - Verify the version displays correctly
4. **Clear caches** - Tell users to clear cache after version updates
5. **Update buildDate** - Keep the build date current in build/version.json
6. **Commit together** - Commit build/version.json and updated files together
7. **Tag releases** - Create git tags matching version numbers:
   ```bash
   git tag -a v1.0.0-beta-2.2.2 -m "Beta release 2.2.2"
   git push origin v1.0.0-beta-2.2.2
   ```

## How Version is Accessed

All version strings are **embedded at build time** and hardcoded into source files:

- ✅ **Backend** (`table/app/__init__.py`) - Hardcoded `__version__` constant
- ✅ **Frontend** (`needle/js/app.js`) - Hardcoded `APP_VERSION` constant
- ✅ **Service Worker** (`needle/service-worker.js`) - Hardcoded cache names
- ✅ **Docker** (`docker-compose.yml`) - Hardcoded image tag

The frontend **optionally** fetches version from `/api/health` endpoint to verify server/client match, but this is for display/diagnostics only—the embedded version is what's actually used.

## Cache Management

When you update the version:
1. Service worker cache names change automatically
2. Browser sees new cache name and creates new cache
3. Old caches are automatically deleted on activation
4. CSS/JS files bypass cache due to `?v=` query parameters

## Questions?

For more help:
- See `TROUBLESHOOTING.md` for connection issues
- Check GitHub issues: https://github.com/121gigawatz/vinylfy/issues
- Review the update scripts: `update-version.py` or `update-version.sh`
