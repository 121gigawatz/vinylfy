# 🎵 Vinylfy Needle (Frontend)

The user interface for Vinylfy - a responsive, PWA-ready web application for applying vinyl record effects to digital audio.

## 📁 Structure

```
needle/
├── index.html              # Main application page
├── manifest.json           # PWA manifest
├── service-worker.js       # Offline support & caching
├── css/
│   ├── variables.css       # Design tokens (colors, spacing, etc.)
│   ├── base.css           # Reset & base styles
│   ├── components.css     # UI components
│   └── responsive.css     # Media queries & responsive design
├── js/
│   ├── app.js             # Main application logic
│   ├── api.js             # API communication with table (backend)
│   ├── audio-player.js    # Audio preview player
│   └── utils.js           # Helper functions
└── assets/
    └── icons/             # PWA icons (various sizes)
```

## ✨ Features

### User Experience
- 🎨 **Vinyl-themed design** - Warm colors and record player aesthetics
- 📱 **Fully responsive** - Works on mobile, tablet, and desktop
- 👆 **Touch-optimized** - Large touch targets and gesture support
- ♿ **Accessible** - ARIA labels, keyboard navigation, reduced motion support
- 🌙 **Dark mode** - Easy on the eyes

### Progressive Web App
- 📲 **Installable** - Add to home screen on any device
- 🔄 **Offline support** - Service worker caching
- ⚡ **Fast loading** - Optimized assets and preloading
- 📱 **Native feel** - Standalone display mode

### Audio Processing
- 🎵 **20+ era-based presets** - From 1920's Jazz to 2020's Modern Vinyl, plus Custom
- 🎛️ **Custom controls** - Fine-tune every parameter
- 🎧 **Live preview** - Stream audio before downloading
- 💾 **Multiple formats** - WAV, MP3, FLAC, OGG

## 🚀 Quick Start

### Option 1: Serve Locally

Using Python:
```bash
cd needle
python -m http.server 8000
```

Using Node.js:
```bash
cd needle
npx serve
```

Then open `http://localhost:8000` in your browser.

### Option 2: Deploy to Production

Deploy the `needle/` directory to any static hosting service:
- **Netlify**: Drag and drop the folder
- **Vercel**: Connect your Git repository
- **GitHub Pages**: Push to a gh-pages branch
- **Cloudflare Pages**: Connect and deploy

### Environment Configuration

Make sure the backend (table) is running and accessible. By default, the frontend expects:
- **Development**: `http://localhost:5000/api`
- **Production**: `/api` (relative path)

Update `js/api.js` if your backend URL is different:
```javascript
const API_BASE_URL = 'https://your-backend-url.com/api';
```

## 📱 PWA Setup

### Icons Required

Place icons in `assets/icons/`:
- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`

You can generate these from a single 512x512 icon using tools like:
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

### Testing PWA

1. Serve over HTTPS (required for service workers)
2. Open Chrome DevTools → Application → Service Workers
3. Check "Service Worker" registration
4. Test offline by checking "Offline" in Network tab

## 🎨 Customization

### Colors

Edit `css/variables.css` to change the color scheme:
```css
:root {
  --color-primary: #d4a574;  /* Vinyl gold */
  --color-bg-primary: #1a1a1a;  /* Dark background */
  /* ... more variables */
}
```

### Preset Names

Add or modify presets in the backend (`table/app/config.py`) and they'll automatically appear in the frontend.

### Layout

The app uses CSS Grid and Flexbox for layout. Modify `css/components.css` and `css/responsive.css` for layout changes.

## 🔧 Development

### File Watching

For development with auto-reload, use:
```bash
npx live-server needle/
```

### Browser Support

Tested and working on:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

### Key Technologies

- **Vanilla JavaScript** - No framework dependencies
- **ES6 Modules** - Modern import/export
- **CSS Variables** - Dynamic theming
- **Fetch API** - Network requests
- **Web Audio API** - Audio playback
- **Service Workers** - PWA features

## 📊 Performance

### Lighthouse Scores (Target)
- **Performance**: 95+
- **Accessibility**: 95+
- **Best Practices**: 95+
- **SEO**: 95+
- **PWA**: 100

### Optimization Tips

1. **Lazy load images**: Use `loading="lazy"` attribute
2. **Compress assets**: Minify CSS/JS for production
3. **CDN**: Serve static assets from a CDN
4. **Caching**: Service worker handles offline caching

## 🎯 User Flow

1. **Upload** - User drags or selects an audio file
2. **Configure** - Choose preset or customize settings
3. **Process** - File is sent to backend for processing
4. **Preview** - Stream processed audio in browser
5. **Download** - Save the vinylified file

## 🔒 Security

- **No data stored**: Files expire after 1 hour on backend
- **Client-side only**: No analytics or tracking
- **HTTPS required**: For PWA and secure uploads
- **CORS**: Properly configured for API access

## 🐛 Troubleshooting

### Service Worker Not Registering
- Ensure you're serving over HTTPS (or localhost)
- Check browser console for errors
- Clear cache and hard reload (Ctrl+Shift+R)

### API Connection Failed
- Verify backend (table) is running
- Check API URL in `js/api.js`
- Look for CORS errors in console

### Audio Won't Play
- Check browser supports the audio format
- Verify file isn't corrupted
- Try a different browser

### Upload Fails
- Check file size (max 25MB by default)
- Verify file format is supported
- Check network connection

## 📱 Mobile Considerations

### iOS
- Uses `viewport-fit=cover` for notched devices
- Safe area insets for proper padding
- Apple touch icon configured

### Android
- Theme color matches app design
- Installable as PWA
- Chrome custom tabs support

### Performance on Mobile
- Touch targets are 44px+ (WCAG compliant)
- Reduced animations on low-power mode
- Optimized for 3G connections

## 🌐 Browser Features Used

- **File API**: Reading uploaded files
- **Fetch API**: AJAX requests
- **Service Workers**: Offline support
- **Web Audio API**: Audio playback
- **LocalStorage**: Saving preferences
- **Notifications API**: (Optional) Processing complete alerts

## 📝 Code Style

- **Naming**: camelCase for JS, kebab-case for CSS
- **Comments**: JSDoc for functions
- **Formatting**: 2 spaces, semicolons
- **Linting**: Follow ESLint recommended

## 🚧 Future Enhancements

- [ ] Waveform visualization
- [ ] Batch processing
- [ ] Audio trimming/editing
- [ ] Social sharing
- [ ] User accounts (optional)
- [ ] Preset marketplace

## 🤝 Contributing

The frontend is designed to be easily extensible. To add features:

1. Add UI components in `index.html`
2. Style them in `css/components.css`
3. Add logic in `js/app.js`
4. Update API calls in `js/api.js` if needed

## 📄 License

MIT License - Feel free to use and modify!

---

**Made with ❤️ for vinyl enthusiasts and audio nerds everywhere.**