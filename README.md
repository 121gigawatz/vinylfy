# 🎵 Vinylfy - Vinyl Record Effect Processor

Transform your digital audio into warm, nostalgic vinyl records. Vinylfy applies authentic vinyl characteristics including surface noise, frequency response curves, wow & flutter, pops, and harmonic distortion.

## 🌐 Visit the Website

For more information, visit our official website:

**👉 [vinylfy.app](https://vinylfy.app)**

---

## ✨ Features

- **Surface Noise** - Authentic crackles, pops, and background hiss
- **Frequency Response** - RIAA equalization curve with high/low rolloff
- **Wow & Flutter** - Turntable speed variations for organic feel
- **Pop Intensity** - Add the "pops" from the sound of a needle going across the record
- **Harmonic Distortion** - Analog warmth through soft clipping
- **Stereo Reduction** - Limited stereo separation like real vinyl

## 🚀 Quick Start (Self-Hosted)

Vinylfy is a web application that can be run on any local server via Docker. The best way to get started is to use Docker Compose with environment variables.

You can deploy Vinylfy with default settings through either Docker Hub or GHCR. Vinylfy will automatically generate a secure secret key for you. However, this key will be regenerated on every restart, so it is recommended to set a custom secret key in production via the environment variable `SECRET_KEY` and Docker Compose.

**Via Docker Hub:**
```bash
docker run -d -p 8888:8888 --name vinylfy 121gigawatz/vinylfy:latest
```

**Via GHCR:**
```bash
docker run -d -p 8888:8888 --name vinylfy ghcr.io/121gigawatz/vinylfy:latest
```

### Docker Compose Setup

First, create a `.env` file in the root directory of the project:

```bash
# Vinylfy Environment Configuration
# Copy this file to .env and customize for your environment

# ============================================================================
# APPLICATION SETTINGS
# ============================================================================

# Flask environment (development, production)
FLASK_ENV=production

# Enable debug mode (true/false) - DO NOT use in production
DEBUG_MODE=false

# Secret key for session management - CHANGE THIS IN PRODUCTION!
# IF YOU DO NOT SET A CUSTOM SECRET KEY, VINYLFY WILL GENERATE ONE ON STARTUP!
SECRET_KEY=change-me-in-production-use-a-long-random-string

# ============================================================================
# SERVER SETTINGS
# ============================================================================

# Port to expose the application (default: 8888)
PORT=8888

# ============================================================================
# FILE UPLOAD SETTINGS
# ============================================================================

# Maximum upload file size in MB (default: 25)
MAX_UPLOAD_SIZE=25

# File time-to-live in hours before automatic deletion (default: 1)
# Supports decimals (e.g. 0.5 for 30 minutes)
FILE_TTL_HOURS=1

# ============================================================================
# CORS SETTINGS
# ============================================================================

# Allowed CORS origins
# Controls which domains can access the API.
# Use '*' to allow ALL domains (easiest).
# For production, list specific domains to improve security. 
# If using a reverse proxy, include the FQDN or IP the *browser* uses.
# IMPORTANT: Origins must be `protocol://domain:port` (NO trailing slash or path!).
# (e.g., https://yourdomain.com NOT https://yourdomain.com/api/)
CORS_ORIGINS=*

# ============================================================================
# DOCKER RESOURCE LIMITS (Optional)
# ============================================================================

# CPU limit (default: 2.0 cores)
# DOCKER_CPU_LIMIT=2.0

# Memory limit (default: 1G)
# DOCKER_MEMORY_LIMIT=1G
```

Next, create a `docker-compose.yml` file in the root directory:

```yaml
version: '3.8'

services:
    vinylfy:
        image: 121gigawatz/vinylfy:latest
        env_file: .env
        volumes:
            - ./data:/app/data
```

### Installation

Navigate to the directory where your `docker-compose.yml` and `.env` files are stored. Open up a terminal and run the following:

```bash
docker compose up -d
```

This will start the Vinylfy application in a Docker container.

For more details on configuration, development, and API usage, please visit **[vinylfy.app](https://vinylfy.app)**.

---

Made with ❤️ for AJW, vinyl enthusiasts and audio nerds everywhere.
