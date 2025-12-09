# CORS Configuration Guide for Vinylfy

**Last Updated**: December 8, 2025

---

## ✅ CORS is Already Configured!

Good news! Your Flask backend (`/table/app/main.py`) already has CORS support built in via `flask-cors`. You just need to configure it properly for your production domain.

---

## 🔧 Quick Setup

### **Step 1: Update Your `.env` File**

Your `.env` file needs to have the `CORS_ORIGINS` variable set to allow your production domain. 

**Option A: Allow Specific Domains** (Recommended for Production)
```bash
CORS_ORIGINS=https://beta.vinylfy.app,http://localhost:5500,http://127.0.0.1:5500
```

**Option B: Allow All Origins** (Development Only - NOT Secure)
```bash
CORS_ORIGINS=*
```

### **Step 2: Verify Your `.env` File**

Check that your `.env` file exists and has the correct setting:

```bash
cat .env | grep CORS_ORIGINS
```

If you don't have a `.env` file, copy from the example:
```bash
cp .env.example .env
```

Then edit `.env` and set:
```bash
CORS_ORIGINS=https://beta.vinylfy.app,http://localhost:5500,http://127.0.0.1:5500
```

### **Step 3: Restart Your Backend**

After updating `.env`, restart your backend service:

**If using Docker Compose:**
```bash
docker-compose down
docker-compose up -d
```

**If running directly:**
```bash
# Kill the old process
pkill -f "python.*app/main.py"

# Start fresh
python table/app/main.py
```

---

## 🔍 How CORS is Configured

Your backend has automatic CORS handling built in. Here's how it works:

### **1. Config File** (`/table/app/config.py` - Line 31)
```python
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')
```
- Reads from environment variable `CORS_ORIGINS`
- Splits by comma for multiple domains
- Defaults to `*` (allow all) if not set

### **2. Main App** (`/table/app/main.py` - Lines 38-44)
```python
CORS(app, resources={
    r"/api/*": {
        "origins": app.config['CORS_ORIGINS'],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
```

This automatically adds the following headers to all `/api/*` endpoints:
- `Access-Control-Allow-Origin: https://beta.vinylfy.app`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

---

## 🌐 Understanding Your Setup

### **Current Architecture**

```
┌───────────────────────────────────┐
│  https://beta.vinylfy.app         │
│  (Frontend - Served by Nginx)     │
│                                   │
│  JavaScript tries to call:        │
│  /api/health, /api/presets, etc   │
└────────────┬──────────────────────┘
             │
             │ HTTP Request
             ▼
┌───────────────────────────────────┐
│  Your Reverse Proxy (Nginx/etc)   │
│  Port 8888                        │
│                                   │
│  Routes /api/* to Flask Backend   │
└────────────┬──────────────────────┘
             │
             │ Proxied Request
             ▼
┌───────────────────────────────────┐
│  Flask Backend (table/app)        │
│  Port 5000 (internal)             │
│                                   │
│  Processes request                │
│  Adds CORS headers                │
│  Returns response                 │
└───────────────────────────────────┘
```

### **Key Points**

1. **Reverse Proxy**: Your nginx already forwards port 8888 traffic
2. **API Detection**: The frontend JS now auto-detects and uses `/api` in production
3. **CORS Headers**: Flask backend adds necessary headers to allow cross-origin requests

---

## ✅ Testing CORS

### **Test 1: Check Backend CORS Headers**

```bash
curl -I \
  -H "Origin: https://beta.vinylfy.app" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  http://localhost:8888/api/health
```

**Expected Response:**
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://beta.vinylfy.app
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
...
```

### **Test 2: Browser DevTools**

1. Open `https://beta.vinylfy.app` in your browser
2. Open DevTools Console (F12)
3. Run this test:

```javascript
fetch('https://beta.vinylfy.app/api/health')
  .then(r => r.json())
  .then(data => console.log('✅ CORS working!', data))
  .catch(e => console.error('❌ CORS error:', e));
```

**Expected Output:**
```javascript
✅ CORS working! {
  "status": "healthy",
  "service": "vinylfy-table",
  "version": "v1.0.0 Beta 2.4.3",
  ...
}
```

### **Test 3: Check Environment Variable**

```bash
# If using Docker
docker-compose exec table env | grep CORS_ORIGINS

# If running directly
echo $CORS_ORIGINS
```

---

## 🚨 Common Issues & Solutions

### **Issue 1: Still Getting CORS Errors**

**Symptom:**
```
Access to fetch at 'https://beta.vinylfy.app/api/health' has been blocked by CORS policy
```

**Solutions:**
1. ✅ Verify `.env` has `CORS_ORIGINS` set correctly
2. ✅ Restart backend after changing `.env`
3. ✅ Clear browser cache (hard refresh: Cmd+Shift+R)
4. ✅ Check that reverse proxy is forwarding `/api` requests

### **Issue 2: `CORS_ORIGINS=*` Not Working**

**Problem:** The `*` wildcard doesn't work with credentials.

**Solution:** Use explicit domains instead:
```bash
CORS_ORIGINS=https://beta.vinylfy.app,http://localhost:5500
```

### **Issue 3: Preflight OPTIONS Failing**

**Symptom:** Browser sends `OPTIONS` request that fails.

**Solution:** Ensure Flask backend is running and accessible:
```bash
curl -X OPTIONS http://localhost:8888/api/health
```

Should return 200 OK.

---

## 📝 Environment Variable Reference

### **Production `.env` Example**

```bash
# Flask environment
FLASK_ENV=production
DEBUG_MODE=false
SECRET_KEY=your-super-secret-key-here-change-me

# Server settings
PORT=8888

# File settings
MAX_UPLOAD_MB=25
FILE_TTL_HOURS=1

# CORS - Production domains only
CORS_ORIGINS=https://beta.vinylfy.app

# Local development: Add localhost for testing
# CORS_ORIGINS=https://beta.vinylfy.app,http://localhost:5500,http://127.0.0.1:5500
```

### **Development `.env` Example**

```bash
FLASK_ENV=development
DEBUG_MODE=true
SECRET_KEY=dev-secret-key

PORT=8888

MAX_UPLOAD_MB=25
FILE_TTL_HOURS=24

# Development: Allow all origins
CORS_ORIGINS=*
```

---

## 🔐 Security Best Practices

1. **Never use `CORS_ORIGINS=*` in production** - Always specify exact domains
2. **Use HTTPS** - Production should always use `https://` origins
3. **Restrict methods** - Only allow required HTTP methods (GET, POST)
4. **Validate headers** - Only allow required headers (Content-Type)

---

## 🎯 Summary

**What You Need to Do:**

1. ✅ Update your `.env` file:
   ```bash
   CORS_ORIGINS=https://beta.vinylfy.app,http://localhost:5500
   ```

2. ✅ Restart your backend:
   ```bash
   docker-compose restart table
   # or
   docker-compose down && docker-compose up -d
   ```

3. ✅ Clear browser cache and test:
   - Open DevTools Console
   - Navigate to `https://beta.vinylfy.app`
   - Check for CORS errors (should be gone!)

**That's it!** Your backend is already configured to handle CORS automatically through the environment variable.

---

## 📚 Additional Resources

- **Flask-CORS Documentation**: https://flask-cors.readthedocs.io/
- **MDN CORS Guide**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- **CORS Tester**: https://www.test-cors.org/

---

## 🆘 Need Help?

If you're still experiencing issues after following this guide:

1. Check backend logs: `docker-compose logs table`
2. Verify nginx configuration forwards `/api` requests
3. Test API directly: `curl http://localhost:8888/api/health`
4. Check browser console for specific error messages
