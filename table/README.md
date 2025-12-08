# 🎵 Vinylfy - Vinyl Record Effect Processor

Transform your digital audio into warm, nostalgic vinyl records. Vinylfy applies authentic vinyl characteristics including surface noise, frequency response curves, wow & flutter, and harmonic distortion.

## 🏗️ Architecture

```
vinyl-processor/
├── table/              # Backend (The Turntable)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # Flask app initialization
│   │   ├── routes.py            # API endpoints
│   │   ├── vinyl_processor.py   # Audio processing engine
│   │   ├── file_manager.py      # Processed file storage
│   │   ├── config.py            # Configuration
│   │   └── utils.py             # Helper functions
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example
├── needle/             # Frontend (Coming soon - The Interface)
└── README.md
```

## ✨ Features

### Vinyl Effects
- **Surface Noise** - Authentic crackles, pops, and background hiss
- **Frequency Response** - RIAA equalization curve with high/low rolloff
- **Wow & Flutter** - Turntable speed variations for organic feel
- **Harmonic Distortion** - Analog warmth through soft clipping
- **Stereo Reduction** - Limited stereo separation like real vinyl

### Presets
- **AJW Recommended** - Preset from the vinyl enthusiast herself, AJW (default) ❤️
- **Era-Based Presets** - Authentic vinyl sounds from different decades:
  - 1920's Jazz, 1930's Swing, 1940's Big Band
  - 1950's Rock & Roll, 1950's Rhythm & Blues
  - 1960's Pop, 1960's Psychedelic
  - 1970's Rock, 1970's Disco, 1970's Funk
  - 1980's New Wave, 1980's Metal
  - 1990's Alternative, 1990's Hip-Hop
  - 2000's Pop, 2000's Indie
  - 2010's Pop, 2010's Electronic
  - 2020's Modern Vinyl
- **Custom** - Full control over every parameter

### Two-Step Preview Workflow
1. **Upload & Process** - Returns a file ID
2. **Preview** - Stream audio in browser before downloading
3. **Download** - Get the final processed file

Files are stored temporarily and auto-expire after 1 hour.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- (Optional) Python 3.11+ for local development

### Installation

1. **Clone the repository**
```bash
git clone <repo-url>
cd vinyl-processor/table
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Build and run with Docker**
```bash
docker-compose up --build
```

4. **Verify it's running**
```bash
curl http://localhost:5000/api/health
```

The table (backend) is now spinning at `http://localhost:5000` 🎵

## 📡 API Endpoints

### Health Check
```bash
GET /api/health
```

### Get Presets
```bash
GET /api/presets
```

### Get Supported Formats
```bash
GET /api/formats
```

### Process Audio (Upload & Convert)
```bash
POST /api/process
Content-Type: multipart/form-data

Parameters:
  - audio: Audio file (required)
  - preset: Any era-based preset name or 'custom' (default: 'AJW Recommended')
  - output_format: wav|mp3|flac|ogg (default: wav)
  
For custom preset, add:
  - frequency_response: true/false
  - surface_noise: true/false
  - noise_intensity: 0.0-0.1
  - wow_flutter: true/false
  - wow_flutter_intensity: 0.0-0.01
  - harmonic_distortion: true/false
  - distortion_amount: 0.0-1.0
  - stereo_reduction: true/false
  - stereo_width: 0.0-1.0

Response:
{
  "success": true,
  "file_id": "uuid-here",
  "original_filename": "song.mp3",
  "suggested_filename": "song_vinylfy.wav",
  "preview_url": "/api/preview/uuid",
  "download_url": "/api/download/uuid",
  "expires_in_seconds": 3600
}
```

### Preview Audio
```bash
GET /api/preview/<file_id>
# Streams audio for in-browser preview
```

### Download Audio
```bash
GET /api/download/<file_id>
# Downloads the processed file
```

### Get File Info
```bash
GET /api/file/<file_id>
```

### Delete File
```bash
DELETE /api/file/<file_id>
```

### Storage Stats
```bash
GET /api/stats
```

## 🧪 Testing the Workflow

We've included a test script to demonstrate the complete workflow:

```bash
# Install requests if needed
pip install requests

# Run the test
python test_workflow.py path/to/audio.mp3
```

This will:
1. Upload and process your audio
2. Retrieve file information
3. Generate preview/download URLs
4. Download the processed file
5. Show storage statistics
6. Clean up the file

## 🔧 Configuration

Edit `.env` file:

```bash
# Flask Environment
FLASK_ENV=production
DEBUG_MODE=false

# Security
SECRET_KEY=your-secret-key-here

# Server
TABLE_PORT=5000

# File Upload
MAX_UPLOAD_MB=25

# File Storage
FILE_TTL_HOURS=1  # Files expire after 1 hour

# CORS
CORS_ORIGINS=*  # Change for production
```

## 🎛️ Custom Preset Parameters

When using `preset=custom`, you can fine-tune every aspect:

| Parameter | Range | Description |
|-----------|-------|-------------|
| `noise_intensity` | 0.0 - 0.1 | Surface noise level |
| `wow_flutter_intensity` | 0.0 - 0.01 | Pitch variation amount |
| `distortion_amount` | 0.0 - 1.0 | Harmonic distortion level |
| `stereo_width` | 0.0 - 1.0 | Stereo separation (0=mono, 1=full) |

## 🎨 Example Usage (curl)

### Basic Processing
```bash
curl -X POST http://localhost:5000/api/process \
  -F "audio=@song.mp3" \
  -F "preset=AJW Recommended" \
  -F "output_format=wav"
```

### Custom Settings
```bash
curl -X POST http://localhost:5000/api/process \
  -F "audio=@song.mp3" \
  -F "preset=custom" \
  -F "noise_intensity=0.03" \
  -F "wow_flutter_intensity=0.002" \
  -F "distortion_amount=0.2" \
  -F "stereo_width=0.6" \
  -F "output_format=mp3"
```

### Preview and Download
```bash
# Get file ID from process response
FILE_ID="uuid-from-response"

# Preview in browser (open this URL)
http://localhost:5000/api/preview/$FILE_ID

# Download
curl http://localhost:5000/api/download/$FILE_ID -o output.wav
```

## 🐳 Docker Commands

```bash
# Build and start
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f table

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up --build --force-recreate
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Storage Statistics
```bash
curl http://localhost:5000/api/stats
```

### Docker Health
```bash
docker ps
# Look for (healthy) status
```

## 🔒 Security Notes

For production deployment:
1. Change `SECRET_KEY` in `.env`
2. Set specific `CORS_ORIGINS` (not `*`)
3. Use HTTPS with a reverse proxy (nginx/caddy)
4. Set `DEBUG_MODE=false`
5. Consider adding authentication

## 🎯 Supported Formats

**Input:** WAV, MP3, FLAC, OGG, M4A, AAC  
**Output:** WAV, MP3, FLAC, OGG

## 🛠️ Development

### Local Development (without Docker)

```bash
cd table

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
export FLASK_ENV=development
export DEBUG_MODE=true
python -m app.main
```

### Running Tests
```bash
# Install test dependencies
pip install pytest requests

# Run the workflow test
python test_workflow.py test_audio.mp3
```

## 🐛 Troubleshooting

### File upload fails
- Check `MAX_UPLOAD_MB` in `.env`
- Ensure file format is supported
- Check available disk space in `/tmp/vinylfy`

### Processing takes too long
- Large files take longer to process
- Adjust Docker resource limits in `docker-compose.yml`
- Consider using WAV output (faster than MP3 encoding)

### Preview/Download returns 404
- File may have expired (default: 1 hour)
- Check `FILE_TTL_HOURS` in `.env`
- Verify file_id is correct

### Docker container unhealthy
```bash
# Check logs
docker-compose logs table

# Restart
docker-compose restart table
```

## 📝 License

MIT License - Feel free to use in your projects!

## 🚧 Coming Soon

- **needle** (Frontend) - Beautiful web interface
- Batch processing
- Audio visualization
- More effect presets
- Real-time preview during processing

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ for AJW and other vinyl enthusiasts everywhere!
