#!/bin/bash
set -e

echo "🎵 Starting Vinylfy..."

# Create nginx temp directories (non-root user)
mkdir -p /tmp/nginx_client_body /tmp/nginx_proxy /tmp/nginx_fastcgi /tmp/nginx_uwsgi /tmp/nginx_scgi

# Sync version files (ensure needle has latest version.json)
echo "📦 Syncing version..."
if [ -f /app/build/version.json ] && [ -f /app/table/update-version.py ]; then
    cd /app/table && python3 update-version.py 2>/dev/null || echo "⚠️ Version sync skipped"
    cd /app
fi

# Start Flask backend in background
echo "📀 Starting table (backend)..."
cd /app/table
gunicorn --bind 127.0.0.1:5000 \
    --workers 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    app.main:app &

BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Spinning up the turntable ..."
for i in {1..30}; do
    if curl -f http://127.0.0.1:5000/api/health > /dev/null 2>&1; then
        echo "✅ Turntable is spinning!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Turntable failed to spin up"
        exit 1
    fi
    sleep 1
done

# Start nginx in foreground
echo "🎸 Starting needle (frontend) with nginx..."
nginx -g 'daemon off;' &

NGINX_PID=$!

# Monitor both processes
echo "🎵 Vinylfy is running!"
echo "  Turntable PID: $BACKEND_PID"
echo "  Needle PID: $NGINX_PID"
echo "  Vinylfy available at http://localhost"

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?