from flask import Blueprint, request, jsonify, send_file
from werkzeug.exceptions import RequestEntityTooLarge
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from .vinyl_processor import VinylProcessor
from .config import Config
from .file_manager import ProcessedFileManager
from .utils import (
    allowed_file,
    create_temp_file,
    cleanup_temp_file,
    validate_audio_settings,
    merge_settings,
    get_audio_info,
    parse_boolean,
    sanitize_filename
)
from .drm_detector import quick_drm_check, DRMProtectedError
from . import __version__

logger = logging.getLogger(__name__)

# Create Blueprint
api = Blueprint('api', __name__)

# Initialize file manager
file_manager = ProcessedFileManager(
    storage_dir=Config.PROCESSED_FILES_DIR,
    ttl_hours=Config.PROCESSED_FILES_TTL_HOURS
)


@api.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for monitoring.

    Returns:
        JSON response with status and configuration info
    """
    return jsonify({
        'status': 'healthy',
        'service': 'vinylfy-table',
        'version': __version__,
        'config': {
            'file_ttl_hours': Config.PROCESSED_FILES_TTL_HOURS,
            'max_upload_mb': Config.MAX_FILE_SIZE
        }
    }), 200


@api.route('/presets', methods=['GET'])
def get_presets():
    """
    Get available vinyl effect presets.
    
    Returns:
        JSON response with all available presets and their settings
    """
    return jsonify({
        'presets': Config.PRESETS,
        'default': 'AJW Recommended'
    }), 200


@api.route('/formats', methods=['GET'])
def get_supported_formats():
    """
    Get supported input and output audio formats.

    Returns:
        JSON response with supported formats
    """
    return jsonify({
        'input_formats': list(Config.ALLOWED_EXTENSIONS),
        'output_formats': sorted(list(Config.ALLOWED_OUTPUT_FORMATS))
    }), 200


@api.route('/check-drm', methods=['POST'])
def check_drm():
    """
    Quick DRM check endpoint for frontend validation.
    Accepts file upload and returns DRM status without processing.
    
    Expected form data:
        - audio: Audio file (required)
    
    Returns:
        JSON with DRM status and type
    """
    temp_input_path = None
    
    try:
        # Check if audio file is present
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file extension
        if not allowed_file(audio_file.filename, Config.ALLOWED_EXTENSIONS):
            return jsonify({
                'error': f'Unsupported file format. Allowed: {", ".join(Config.ALLOWED_EXTENSIONS)}'
            }), 400
        
        # Create temporary input file
        file_ext = audio_file.filename.rsplit('.', 1)[1].lower()
        _, temp_input_path = create_temp_file(suffix=f'.{file_ext}')
        audio_file.save(temp_input_path)
        
        # Quick DRM check
        has_drm, drm_type = quick_drm_check(temp_input_path)
        
        logger.info(f"DRM check for {audio_file.filename}: has_drm={has_drm}, type={drm_type}")
        
        return jsonify({
            'has_drm': has_drm,
            'drm_type': drm_type,
            'filename': audio_file.filename
        }), 200
    
    except Exception as e:
        logger.error(f"DRM check error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to check file'}), 500
    
    finally:
        # Cleanup temporary file
        if temp_input_path:
            cleanup_temp_file(temp_input_path)


def generate_format(audio_data, output_format, processor, sample_rate):
    """
    Helper function to generate a single audio format.
    Designed to be run in parallel via ThreadPoolExecutor.
    
    Args:
        audio_data: Processed audio numpy array
        output_format: Format to generate (mp3, wav, flac, aac)
        processor: VinylProcessor instance
        sample_rate: Audio sample rate
    
    Returns:
        Tuple of (format, temp_filepath, file_size)
    """
    try:
        # Create temp file for this format
        _, temp_path = create_temp_file(suffix=f'.{output_format}')
        
        # Save audio in the requested format
        processor.save_audio(audio_data, temp_path, output_format)
        
        # Get file info
        file_info = get_audio_info(temp_path)
        file_size = file_info['size']
        size_formatted = file_info['size_formatted']
        
        logger.debug(f"Generated {output_format.upper()}: {size_formatted}")
        
        return output_format, temp_path, file_size, size_formatted
    
    except Exception as e:
        logger.error(f"Error generating {output_format}: {e}", exc_info=True)
        raise


@api.route('/process', methods=['POST'])
def process_audio():
    """
    Main endpoint for processing audio files with vinyl effects.
    Returns a file ID for preview/download instead of the file itself.
    
    Expected form data:
        - audio: Audio file (required)
        - preset: Preset name (optional, default: 'AJW Recommended')
        - output_format: Output format (optional, default: 'wav')
        - Custom settings when preset='custom':
            - frequency_response: bool
            - surface_noise: bool
            - noise_intensity: float (0.0-0.1)
            - wow_flutter: bool
            - wow_flutter_intensity: float (0.0-0.01)
            - harmonic_distortion: bool
            - distortion_amount: float (0.0-1.0)
            - stereo_reduction: bool
            - stereo_width: float (0.0-1.0)
    
    Returns:
        JSON with file ID and metadata for preview/download
    """
    temp_input_path = None
    temp_output_path = None
    
    try:
        # Check if audio file is present
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate file extension
        if not allowed_file(audio_file.filename, Config.ALLOWED_EXTENSIONS):
            return jsonify({
                'error': f'Unsupported file format. Allowed: {", ".join(Config.ALLOWED_EXTENSIONS)}'
            }), 400
        
        # Get preset
        preset_name = request.form.get('preset', 'AJW Recommended')  # Keep original case for preset names

        # Validate preset
        if preset_name not in Config.PRESETS:
            return jsonify({
                'error': f'Invalid preset. Available: {", ".join(Config.PRESETS.keys())}'
            }), 400
        
        # Get base settings from preset
        settings = Config.PRESETS[preset_name].copy()
        
        # If custom preset, override with user-provided settings
        if preset_name == 'custom':
            custom_settings = {
                'frequency_response': parse_boolean(request.form.get('frequency_response', True)),
                'surface_noise': parse_boolean(request.form.get('surface_noise', True)),
                'noise_intensity': float(request.form.get('noise_intensity', 0.02)),
                'pop_intensity': float(request.form.get('pop_intensity', 0.6)),
                'wow_flutter': parse_boolean(request.form.get('wow_flutter', True)),
                'wow_flutter_intensity': float(request.form.get('wow_flutter_intensity', 0.001)),
                'harmonic_distortion': parse_boolean(request.form.get('harmonic_distortion', True)),
                'distortion_amount': float(request.form.get('distortion_amount', 0.15)),
                'stereo_reduction': parse_boolean(request.form.get('stereo_reduction', True)),
                'stereo_width': float(request.form.get('stereo_width', 0.7)),
            }
            settings = merge_settings(settings, custom_settings)
        
        # Validate settings
        is_valid, error_msg = validate_audio_settings(settings)
        if not is_valid:
            return jsonify({'error': f'Invalid settings: {error_msg}'}), 400
        
        logger.info(f"Processing file: {audio_file.filename} with preset: {preset_name}")
        
        # Create temporary input file
        file_ext = audio_file.filename.rsplit('.', 1)[1].lower()
        _, temp_input_path = create_temp_file(suffix=f'.{file_ext}')
        audio_file.save(temp_input_path)
        
        # Quick DRM check - reject DRM-protected files early
        has_drm, drm_type = quick_drm_check(temp_input_path)
        if has_drm:
            logger.warning(f"DRM-protected file rejected: {audio_file.filename} (Type: {drm_type})")
            return jsonify({
                'error': 'DRM-protected file detected',
                'drm_type': drm_type,
                'message': 'This file appears to be protected by DRM. Please use audio files you own.'
            }), 400
        
        # Get input file info
        input_info = get_audio_info(temp_input_path)
        logger.info(f"Input file: {input_info}")
        
        # Initialize processor and load audio
        processor = VinylProcessor(sample_rate=Config.DEFAULT_SAMPLE_RATE)
        audio_data, sample_rate = processor.load_audio(temp_input_path)
        
        # Update processor sample rate if different
        if sample_rate != Config.DEFAULT_SAMPLE_RATE:
            processor.sample_rate = sample_rate
            logger.info(f"Updated sample rate to: {sample_rate} Hz")
        
        # Process audio with vinyl effects
        processed_audio = processor.process(audio_data, settings)
        
        # Generate all output formats in parallel
        output_formats = ['mp3', 'wav', 'flac', 'aac']
        format_filepaths = {}
        format_sizes = {}
        temp_format_paths = []  # Track temp files for cleanup
        
        logger.info(f"Generating {len(output_formats)} formats in parallel...")
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Submit all format generation tasks
            future_to_format = {
                executor.submit(generate_format, processed_audio, fmt, processor, sample_rate): fmt
                for fmt in output_formats
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_format):
                fmt, temp_path, file_size, size_formatted = future.result()
                format_filepaths[fmt] = temp_path
                format_sizes[fmt] = {
                    'size': file_size,
                    'size_formatted': size_formatted
                }
                temp_format_paths.append(temp_path)
        
        logger.info(f"All formats generated successfully")
        
        # Store all format files and get ID
        file_id = file_manager.store_file(
            format_filepaths=format_filepaths,
            original_filename=audio_file.filename,
            preset=preset_name,
            settings=settings
        )
        
        # Prepare suggested filenames for download
        original_name = os.path.splitext(audio_file.filename)[0]
        safe_name = sanitize_filename(original_name)
        
        # Return file ID and metadata with all format sizes
        return jsonify({
            'success': True,
            'file_id': file_id,
            'original_filename': audio_file.filename,
            'preset': preset_name,
            'formats': format_sizes,  # Include all format sizes
            'preview_url': f'/api/preview/{file_id}',
            'download_url': f'/api/download/{file_id}',
            'expires_in_seconds': Config.PROCESSED_FILES_TTL_HOURS * 3600
        }), 200
    
    except DRMProtectedError as e:
        logger.warning(f"DRM-protected file rejected during processing: {audio_file.filename}")
        return jsonify({
            'error': 'DRM-protected file detected',
            'message': 'This file is protected by DRM and cannot be processed. Please use audio files you own.'
        }), 400
    
    except RequestEntityTooLarge:
        return jsonify({
            'error': f'File too large. Maximum size: {Config.MAX_CONTENT_LENGTH // (1024*1024)} MB'
        }), 413
    
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'error': str(e)}), 400
    
    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)
        return jsonify({'error': 'An error occurred during processing'}), 500
    
    finally:
        # Cleanup temporary files
        if temp_input_path:
            cleanup_temp_file(temp_input_path)
        # Clean up all temporary format files
        if 'temp_format_paths' in locals():
            for temp_path in temp_format_paths:
                cleanup_temp_file(temp_path)




@api.route('/preview/<file_id>', methods=['GET'])
def preview_audio(file_id):
    """
    Stream processed audio for preview in the browser.
    
    Args:
        file_id: Unique file identifier
    
    Returns:
        Audio file stream for preview (not as attachment)
    """
    try:
        # Get file metadata - use mp3 for preview as it's the most compatible
        metadata = file_manager.get_file(file_id, format='mp3')
        
        if not metadata:
            return jsonify({'error': 'File not found or expired'}), 404
        
        filepath = metadata['filepath']
        output_format = metadata['output_format']
        
        # Verify file exists
        if not os.path.exists(filepath):
            logger.error(f"Preview file missing: {filepath}")
            return jsonify({'error': 'File not found on disk'}), 404
        
        logger.info(f"Streaming preview for file: {file_id} (format: {output_format})")
        
        # Send file for streaming (not as attachment)
        return send_file(
            filepath,
            mimetype=f'audio/{output_format}',
            as_attachment=False  # Stream in browser
        )
    
    except Exception as e:
        logger.error(f"Preview error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to stream preview'}), 500


@api.route('/download/<file_id>', methods=['GET'])
@api.route('/download/<file_id>/<format>', methods=['GET'])
def download_audio(file_id, format=None):
    """
    Download processed audio file in specific format.
    
    Args:
        file_id: Unique file identifier
        format: Optional format (mp3, wav, flac, aac). Defaults to mp3 if not specified.
    
    Returns:
        Audio file as download
    """
    try:
        # Default to mp3 if no format specified (backward compatibility)
        if not format:
            format = 'mp3'
        
        # Validate format
        format = format.lower()
        if format not in Config.ALLOWED_OUTPUT_FORMATS:
            return jsonify({'error': f'Invalid format. Allowed: {", ".join(sorted(Config.ALLOWED_OUTPUT_FORMATS))}'}), 400
        
        # Get file metadata for specific format
        metadata = file_manager.get_file(file_id, format=format)
        
        if not metadata:
            return jsonify({'error': 'File not found or expired'}), 404
        
        filepath = metadata['filepath']
        output_format = metadata['output_format']
        original_filename = metadata['original_filename']
        
        # Prepare download filename
        original_name = os.path.splitext(original_filename)[0]
        safe_name = sanitize_filename(original_name)
        download_name = f"{safe_name}_vinylfy.{output_format}"
        
        logger.info(f"Downloading file: {file_id} (format: {output_format})")
        
        # Send file as attachment
        return send_file(
            filepath,
            mimetype=f'audio/{output_format}',
            as_attachment=True,
            download_name=download_name
        )
    
    except Exception as e:
        logger.error(f"Download error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to download file'}), 500


@api.route('/download-all/<file_id>', methods=['GET'])
def download_all_formats(file_id):
    """
    Download all formats as a ZIP archive.
    
    Args:
        file_id: Unique file identifier
    
    Returns:
        ZIP file containing all format versions
    """
    import zipfile
    from io import BytesIO
    
    try:
        # Get file metadata
        metadata = file_manager.get_file(file_id)
        
        if not metadata:
            return jsonify({'error': 'File not found or expired'}), 404
        
        if 'formats' not in metadata:
            return jsonify({'error': 'Multi-format data not available'}), 400
        
        original_filename = metadata['original_filename']
        original_name = os.path.splitext(original_filename)[0]
        safe_name = sanitize_filename(original_name)
        
        # Create ZIP file in memory
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add each format to the ZIP
            for fmt, fmt_data in metadata['formats'].items():
                filepath = fmt_data['filepath']
                if os.path.exists(filepath):
                    # Add file to ZIP with appropriate name
                    arcname = f"{safe_name}_vinylfy.{fmt}"
                    zip_file.write(filepath, arcname)
                    logger.debug(f"Added {arcname} to ZIP")
        
        # Seek to beginning of buffer
        zip_buffer.seek(0)
        
        logger.info(f"Created ZIP archive for file: {file_id}")
        
        # Send ZIP file
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"{safe_name}_vinylfy_all_formats.zip"
        )
    
    except Exception as e:
        logger.error(f"ZIP download error: {e}", exc_info=True)
        return jsonify({'error': 'Failed to create ZIP archive'}), 500


@api.route('/file/<file_id>', methods=['GET'])
def get_file_info(file_id):
    """
    Get information about a processed file without downloading it.
    
    Args:
        file_id: Unique file identifier
    
    Returns:
        JSON with file metadata
    """
    try:
        metadata = file_manager.get_file(file_id)
        
        if not metadata:
            return jsonify({'error': 'File not found or expired'}), 404
        
        # Remove internal filepath from response
        response_metadata = metadata.copy()
        response_metadata.pop('filepath', None)
        
        return jsonify(response_metadata), 200
    
    except Exception as e:
        logger.error(f"File info error: {e}")
        return jsonify({'error': 'Failed to get file info'}), 500


@api.route('/file/<file_id>', methods=['DELETE'])
def delete_file(file_id):
    """
    Manually delete a processed file before it expires.
    
    Args:
        file_id: Unique file identifier
    
    Returns:
        JSON with deletion status
    """
    try:
        success = file_manager.delete_file(file_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'File deleted successfully'
            }), 200
        else:
            return jsonify({'error': 'File not found'}), 404
    
    except Exception as e:
        logger.error(f"Delete error: {e}")
        return jsonify({'error': 'Failed to delete file'}), 500


@api.route('/stats', methods=['GET'])
def get_stats():
    """
    Get statistics about the file storage.
    
    Returns:
        JSON with storage statistics
    """
    try:
        stats = file_manager.get_stats()
        return jsonify(stats), 200
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return jsonify({'error': 'Failed to get stats'}), 500


@api.route('/validate', methods=['POST'])
def validate_settings():
    """
    Validate custom settings without processing audio.
    Useful for the frontend to check settings before uploading.
    
    Expected JSON body:
        - settings: Dictionary of effect settings
    
    Returns:
        JSON response with validation result
    """
    try:
        data = request.get_json()
        
        if not data or 'settings' not in data:
            return jsonify({'error': 'No settings provided'}), 400
        
        settings = data['settings']
        is_valid, error_msg = validate_audio_settings(settings)
        
        if is_valid:
            return jsonify({
                'valid': True,
                'message': 'Settings are valid'
            }), 200
        else:
            return jsonify({
                'valid': False,
                'error': error_msg
            }), 400
    
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'error': 'Invalid request format'}), 400


@api.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large errors"""
    return jsonify({
        'error': f'File too large. Maximum size: {Config.MAX_CONTENT_LENGTH // (1024*1024)} MB'
    }), 413


@api.errorhandler(500)
def internal_server_error(error):
    """Handle internal server errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({
        'error': 'Internal server error occurred'
    }), 500