# 🎵 Vinylfy - Vinyl Record Effect Processor

Transform your digital audio into warm, nostalgic vinyl records. Vinylfy applies authentic vinyl characteristics including surface noise, frequency response curves, wow & flutter, pops, and harmonic distortion.

## ✨ Features

### Audio Processing (Table)
- **Surface Noise** - Authentic crackles, pops, and background hiss
- **Frequency Response** - RIAA equalization curve with high/low rolloff
- **Wow & Flutter** - Turntable speed variations for organic feel
- **Pop Intensity** - Add the "pops" from the sound of a needle going across the record.
- **Harmonic Distortion** - Analog warmth through soft clipping
- **Stereo Reduction** - Limited stereo separation like real vinyl

### User Interface (Needle)
- 🎨 **Simple & Clean Design** - Modern UI with simple, clean design. Includes Light and Dark modes, and respects your browser settings.
- 📱 **Fully responsive** - Mobile, tablet, and desktop
- 👆 **Touch-optimized** - Large touch targets and gestures
- ♿ **Accessible** - ARIA labels, keyboard navigation
- 📲 **PWA** - Install as app on any device, including iOS.

### Presets
- **AJW Recommended** - Recommended Settings from our resident vinyl enthusiast, AJW (default) ❤️
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

### Workflow
1. **Upload** - Drag/drop or select audio file
2. **Configure** - Choose preset or customize
3. **Process** - Audio is processed on the table
4. **Preview** - Stream audio before downloading
5. **Discard** - Want to make more tweaks before downloading, simply discard and try again!
6. **Download** - Save in your preferred format

Files are stored temporarily and auto-expire after the time configured by the administrator.

## 🚀 Quick Start

### For Users (Recommended - No Build Required!)

**Just run it:**
```bash
# 1. Download docker-compose.yml
curl -O https://raw.githubusercontent.com/121gigawatz/vinylfy/main/docker-compose.yml

# 2. Start Vinylfy
docker-compose up -d

# 3. Open your browser
open http://localhost:8888
```

That's it! The pre-built image is pulled from Docker Hub automatically.

**Or clone the repository:**
```bash
# 1. Clone
git clone https://github.com/121gigawatz/vinylfy.git
cd vinylfy

# 2. Run
docker-compose up -d

# 3. Access
open http://localhost:8888
```

### For Developers

**Want to modify or contribute?**

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for:
- Building from source
- Local development without Docker
- Making code changes
- Version management
- Contributing guidelines

### 📚 Documentation

- **🚀 Quick Deploy** → You're reading it!
- **🔧 Configuration** → See Environment Variables below
- **🐛 Troubleshooting** → [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **💻 Development** → [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (for contributors)

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

## 🔒 Security Notes

Currently, Vinylfy does not require any authorization to enjoy! If you wish to add login security, please add this through your reverse proxy or other authentication service. 

For production deployment:
1. Change `SECRET_KEY` in `.env`
2. Use HTTPS with a reverse proxy (nginx/caddy)
3. Consider adding authentication

## 🎯 Supported Formats

**Input:** WAV, MP3, FLAC, OGG, M4A, AAC  
**Output:** WAV, MP3, FLAC, OGG

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

## 🚧 Coming Soon

- Batch processing
- Audio visualization
- More effect presets
- Real-time preview during processing

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ for AJW, vinyl enthusiasts and audio nerds everywhere.
