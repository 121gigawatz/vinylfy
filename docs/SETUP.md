# 🎵 Vinylfy - Unified Deployment Guide

This guide will help you deploy the complete Vinylfy application (table + needle) as a single Docker container.

## 📁 Project Structure

Your project should look like this:

```
vinylfy/
├── Dockerfile              # Unified Docker build
├── docker-compose.yml      # Docker Compose configuration
├── nginx.conf             # Nginx configuration
├── start.sh               # Startup script
├── .env.example           # Environment template
├── .env                   # Your environment config (create this)
├── table/                 # Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── routes.py
│   │   ├── vinyl_processor.py
│   │   ├── file_manager.py
│   │   ├── config.py
│   │   └── utils.py
│   └── requirements.txt
└── needle/                # Frontend
    ├── index.html
    ├── manifest.json
    ├── service-worker.js
    ├── css/
    ├── js/
    └── assets/
```

## 🚀 Quick Start

### 1. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and update the settings (especially `SECRET_KEY`):

```bash
PORT=80
SECRET_KEY=your-very-secure-secret-key-here
MAX_UPLOAD_MB=25
FILE_TTL_HOURS=1
CORS_ORIGINS=*
```

### 2. Build and Run

```bash
docker-compose up --build
```

### 3. Access Application

Open your browser to:
```
http://localhost
```

That's it! Both the frontend and backend are running in a single container.

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `80` | Port to expose the application |
| `SECRET_KEY` | (required) | Flask secret key for sessions |
| `MAX_UPLOAD_MB` | `25` | Maximum upload file size in MB |
| `FILE_TTL_HOURS` | `1` | How long processed files are kept |
| `FLASK_ENV` | `production` | Flask environment mode |
| `DEBUG_MODE` | `false` | Enable debug mode |

### Production Settings

For production deployment:

1. **Change the secret key**:
   ```bash
   SECRET_KEY=$(openssl rand -hex 32)
   ```

2. **Disable volume mounts** in `docker-compose.yml`:
   ```yaml
   # Comment out these lines:
   # - ./table/app:/app/table/app
   # - ./needle:/app/needle
   ```

3. **Use a reverse proxy** (nginx/Caddy) for HTTPS:
   ```yaml
   ports:
     - "8080:80"  # Don't expose port 80 directly
   ```

4. **Set resource limits** appropriately for your server

## 🐳 Docker Commands

### Start in Background
```bash
docker-compose up -d
```

### View Logs
```bash
docker-compose logs -f
```

### Stop
```bash
docker-compose down
```

### Rebuild After Changes
```bash
docker-compose up --build --force-recreate
```

### Clean Everything
```bash
docker-compose down -v
docker system prune -a
```

## 📊 Monitoring

### Check Health
```bash
curl http://localhost/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "vinylfy-table",
  "version": "1.0.0"
}
```

### Check Container Status
```bash
docker-compose ps
```

### View Resource Usage
```bash
docker stats vinylfy
```

## 🔍 Troubleshooting

### Container Won't Start

Check logs:
```bash
docker-compose logs
```

Common issues:
- Port 80 already in use → Change `PORT` in `.env`
- Permission denied → Ensure `start.sh` is executable
- Out of memory → Increase Docker memory limit

### Backend Not Responding

```bash
# Check if backend is running
docker-compose exec vinylfy curl http://localhost:5000/api/health

# Check backend logs
docker-compose logs | grep gunicorn
```

### Frontend Not Loading

```bash
# Check nginx status
docker-compose exec vinylfy nginx -t

# Check nginx logs
docker-compose logs | grep nginx
```

### File Upload Fails

- Check `MAX_UPLOAD_MB` setting
- Verify nginx `client_max_body_size` in `nginx.conf`
- Check available disk space

## 🌐 Deployment Options

### Deploy to DigitalOcean

1. Create a Droplet (Ubuntu 22.04)
2. Install Docker and Docker Compose
3. Clone your repository
4. Configure `.env`
5. Run `docker-compose up -d`
6. Point your domain to the droplet IP

### Deploy to AWS ECS

1. Build and push image to ECR
2. Create ECS task definition
3. Create ECS service
4. Configure Application Load Balancer

### Deploy to Railway

1. Connect GitHub repository
2. Railway auto-detects Dockerfile
3. Set environment variables
4. Deploy!

### Deploy to Fly.io

```bash
fly launch
fly deploy
```

## 🔐 Security Best Practices

1. **Always use HTTPS in production**
   - Use a reverse proxy (nginx/Caddy)
   - Or use a service like Cloudflare

2. **Change default secret key**
   ```bash
   openssl rand -hex 32
   ```

3. **Restrict CORS origins**
   - Update nginx.conf if needed

4. **Regular updates**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

5. **Firewall rules**
   ```bash
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

## 📈 Performance Tuning

### For High Traffic

1. **Increase worker count** in `start.sh`:
   ```bash
   gunicorn --workers 8 ...
   ```

2. **Adjust resource limits** in `docker-compose.yml`:
   ```yaml
   limits:
     cpus: '4.0'
     memory: 2G
   ```

3. **Enable caching** in nginx for static assets

4. **Use a CDN** for frontend assets

### For Large Files

1. **Increase timeouts** in `nginx.conf`:
   ```nginx
   proxy_read_timeout 600s;
   ```

2. **Increase `MAX_UPLOAD_MB`**:
   ```bash
   MAX_UPLOAD_MB=100
   ```

## 🧪 Testing

### Test the Full Stack

```bash
# Upload and process a file
curl -X POST http://localhost/api/process \
  -F "audio=@test.mp3" \
  -F "preset=AJW Recommended"

# Response will include file_id for preview/download
```

### Load Testing

```bash
# Install Apache Bench
apt-get install apache2-utils

# Test
ab -n 100 -c 10 http://localhost/
```

## 🔄 Updates

### Update the Application

```bash
git pull
docker-compose down
docker-compose up --build -d
```

### Backup Data

```bash
# Backup processed files volume
docker run --rm -v vinylfy_vinylfy-data:/data -v $(pwd):/backup \
  ubuntu tar czf /backup/vinylfy-data-backup.tar.gz /data
```

### Restore Data

```bash
docker run --rm -v vinylfy_vinylfy-data:/data -v $(pwd):/backup \
  ubuntu tar xzf /backup/vinylfy-data-backup.tar.gz -C /
```

## 🆘 Getting Help

- Check logs: `docker-compose logs -f`
- Verify health: `curl http://localhost/api/health`
- Check GitHub issues
- Review nginx error logs: `docker-compose exec vinylfy cat /var/log/nginx/error.log`

## 📝 Notes

- Files are automatically deleted after 1 hour (configurable)
- Container runs as non-root user for security
- Both backend and frontend are served from port 80
- API is accessible at `/api/*`
- Frontend handles all other routes

---

**Need more help?** Check the main README.md or open an issue on GitHub.