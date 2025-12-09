# ================================
# MAIN APP
# ================================

from flask import Flask
from flask_cors import CORS
import logging
import os
from .config import config
from .routes import api
from . import __version__

def create_app(config_name=None):
    """
    Application factory pattern for creating Flask app.
    
    Args:
        config_name: Configuration name ('development', 'production', 'testing')
                    If None, uses FLASK_ENV environment variable
    
    Returns:
        Configured Flask application
    """
    # Create Flask app
    app = Flask(__name__)
    
    # Load configuration
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    
    # Setup logging
    setup_logging(app)
    
    # Enable CORS
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })
    
    # Register blueprints
    app.register_blueprint(api, url_prefix='/api')
    
    # Root endpoint
    @app.route('/')
    def index():
        return {
            'service': 'Vinylfy Table',
            'version': __version__,
            'description': 'Backend service for applying vinyl record effects to audio',
            'endpoints': {
                'health': '/api/health',
                'presets': '/api/presets',
                'formats': '/api/formats',
                'process': '/api/process (POST) - Returns file ID',
                'preview': '/api/preview/<file_id> (GET) - Stream audio',
                'download': '/api/download/<file_id> (GET) - Download file',
                'file_info': '/api/file/<file_id> (GET) - Get metadata',
                'delete': '/api/file/<file_id> (DELETE) - Delete file',
                'validate': '/api/validate (POST) - Validate settings',
                'stats': '/api/stats (GET) - Storage statistics'
            },
            'workflow': {
                '1': 'Upload audio to /api/process',
                '2': 'Receive file_id in response',
                '3': 'Preview at /api/preview/<file_id>',
                '4': 'Download at /api/download/<file_id>',
                '5': 'Files expire after 1 hour'
            },
            'status': 'spinning 🎵'
        }
    
    # Version endpoint for frontend
    @app.route('/version.json')
    def version_json():
        """Serve version information for frontend."""
        import json
        from pathlib import Path
        
        # Read version.json from needle directory
        version_file = Path(__file__).parent.parent.parent / 'needle' / 'version.json'
        
        if version_file.exists():
            with open(version_file, 'r') as f:
                version_data = json.load(f)
            return version_data, 200, {'Content-Type': 'application/json'}
        else:
            # Fallback if file doesn't exist
            return {
                'version': __version__,
                'shortVersion': __version__,
                'dockerTag': __version__,
                'buildDate': None,
                'description': 'Version file not found'
            }, 200, {'Content-Type': 'application/json'}
    
    # Log startup info
    app.logger.info(f"Vinylfy Table started in {config_name} mode")
    app.logger.info(f"CORS enabled for origins: {app.config['CORS_ORIGINS']}")
    app.logger.info(f"Max file size: {app.config['MAX_CONTENT_LENGTH'] // (1024*1024)} MB")
    
    return app


def setup_logging(app):
    """
    Configure application logging.
    
    Args:
        app: Flask application instance
    """
    # Set log level based on debug mode
    log_level = logging.DEBUG if app.config['DEBUG'] else logging.INFO
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Configure Flask logger
    app.logger.setLevel(log_level)
    
    # Reduce noise from some verbose libraries
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    
    app.logger.info(f"Logging configured at {logging.getLevelName(log_level)} level")


# Create app instance for running directly
app = create_app()


if __name__ == '__main__':
    # Get configuration from environment
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    print("=" * 50)
    print("🎵 Vinylfy Table - Audio Processing Service")
    print("=" * 50)
    print(f"Environment: {os.environ.get('FLASK_ENV', 'development')}")
    print(f"Running on: http://{host}:{port}")
    print(f"Debug mode: {debug}")
    print("=" * 50)
    
    app.run(host=host, port=port, debug=debug)