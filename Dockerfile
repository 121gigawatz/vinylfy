# Main Dockerfile
# Build complete backend (table) and frontend (needle)

# 1 - Backend Dependencies
FROM python:3.11-slim AS builder

WORKDIR /build

# Install sys dependencies
# RUN apt-get update && apt-get install -y --no-install-recommends \ ffmpeg \ libsndfile1 \curl \ $$ rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*


# Copy backend requirements and install
COPY table/requirements.txt /build/
RUN pip install --no-cache-dir -r /build/requirements.txt

# 2 - Final Image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy backend application
COPY table/app /app/table/app

# Copy frontend application
COPY needle /app/needle

# Copy only version.json (needed for version update script)
COPY build/version.json /app/build/version.json

# Copy maintenance scripts
COPY scripts /app/scripts

# Run version update script to sync all version strings
# (must run AFTER files are copied so it can update them)
RUN python3 /app/scripts/update_version.py



# Create non-root user
RUN useradd -m -u 1000 vinylfy && \
    chown -R vinylfy:vinylfy /app && \
    mkdir -p /tmp/vinylfy/uploads /tmp/vinylfy/processed && \
    chown -R vinylfy:vinylfy /tmp/vinylfy

# Configure nginx
COPY nginx.conf /etc/nginx/nginx.conf
RUN chown -R vinylfy:vinylfy /var/log/nginx /var/lib/nginx

# Expose ports
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8888/api/health || exit 1

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh && chown vinylfy:vinylfy /app/start.sh

# Switch to non-root user
USER vinylfy

# Start both services
CMD ["/app/start.sh"]
