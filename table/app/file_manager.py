# ==========================
# File Manager Logic
# ==========================

import os
import time
import uuid
import json
import logging
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime, timedelta
import threading

# Set up logger
logger = logging.getLogger(__name__)

class ProcessedFileManager:
    """
    Manages temp storage of processed audio files.
    Stores files with unique ID and metadata for preview/download.
    """

    def __init__(self, storage_dir: Path, ttl_hours: int = 1):
        """
        Initialize file manager.

        Args:
            storage_dir: Directory to store processed files
            ttl_hours: Time-to-live for files in hours (default = 1)
        """
        self.storage_dir = Path(storage_dir)
        self.metadata_dir= self.storage_dir / 'metadata'
        self.files_dir = self.storage_dir / 'files'
        self.ttl_seconds = ttl_hours * 3600

        # Create directories
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.files_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"ProcessedFileManager initialized at {self.storage_dir}")
        logger.info(f"File TTL: {ttl_hours}")

        # Start cleanup thread
        self._start_cleanup_thread()
    
    def store_file(self, format_filepaths: Dict[str, str], original_filename: str,
                   preset: str, settings: Dict) -> str:
        """
        Store multiple format files with metadata.

        Args:
            format_filepaths: Dictionary mapping format (mp3, wav, flac, aac) to filepath
            original_filename: Original filename uploaded by user
            preset: Preset used for processing
            settings: Processing settings used
        
        Returns:
            Unique file ID
        """
        import shutil
        
        # Generate unique ID
        file_id = str(uuid.uuid4())

        # Store all format files and collect metadata
        formats = {}
        for output_format, filepath in format_filepaths.items():
            # Store file
            stored_filepath = self.files_dir / f"{file_id}.{output_format}"

            # Copy file to storage
            # Try copy2() first (preserves metadata), fallback to copy() if permission denied
            try:
                shutil.copy2(filepath, stored_filepath)
            except (PermissionError, OSError):
                # Fallback for Windows mounts or restricted volumes
                shutil.copy(filepath, stored_filepath)
            
            # Track format-specific data
            formats[output_format] = {
                'filepath': str(stored_filepath),
                'file_size': os.path.getsize(stored_filepath)
            }

        # Create metadata
        metadata = {
            'id': file_id,
            'original_filename': original_filename,
            'preset': preset,
            'settings': settings,
            'stored_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(seconds=self.ttl_seconds)).isoformat(),
            'formats': formats  # Store all format data
        }

        # Store metadata
        metadata_path = self.metadata_dir / f"{file_id}.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Stored file with ID: {file_id} ({len(formats)} formats)")
        return file_id
    
    def get_file(self, file_id: str, format: Optional[str] = None) -> Optional[Dict]:
        """
        Retrieve file information by ID.

        Args:
            file_id: Unique file identifier
            format: Optional format to get specific format filepath (mp3, wav, flac, aac)

        Returns:
            Dictionary with file metadata and paths, or None if not found/expired
        """
        metadata_path = self.metadata_dir / f"{file_id}.json"

        if not metadata_path.exists():
            logger.warning(f"File not found: {file_id}")
            return None

        # Load metadata
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Check if expired
        expires_at = datetime.fromisoformat(metadata['expires_at'])
        if datetime.now() > expires_at:
            logger.info(f"File expired: {file_id}")
            self.delete_file(file_id)
            return None

        # Check if files exist (check all formats)
        if 'formats' in metadata:
            # Multi-format storage (new format)
            for fmt, fmt_data in metadata['formats'].items():
                filepath = Path(fmt_data['filepath'])
                if not filepath.exists():
                    logger.warning(f"File missing on disk: {file_id}.{fmt}")
                    self.delete_file(file_id)
                    return None
        else:
            # Legacy single-format storage (backward compatibility)
            filepath = Path(metadata['filepath'])
            if not filepath.exists():
                logger.warning(f"File missing on disk: {file_id}")
                self.delete_file(file_id)
                return None

        # If specific format requested, return that format's data
        if format and 'formats' in metadata:
            if format in metadata['formats']:
                return {
                    **metadata,
                    'filepath': metadata['formats'][format]['filepath'],
                    'file_size': metadata['formats'][format]['file_size'],
                    'output_format': format
                }
            else:
                logger.warning(f"Format {format} not found for file {file_id}")
                return None

        return metadata
    def delete_file(self, file_id: str) -> bool:
        """
        Delete a file and its metadata (all format versions).

        Args:
            file_id: Unique file identifier
        
        Returns:
            True if deleted, False if not found
        """
        metadata_path = self.metadata_dir / f"{file_id}.json"

        if not metadata_path.exists():
            return False
        
        # Load metadata to get file paths
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Delete all format files
            if 'formats' in metadata:
                # Multi-format storage (new format)
                for fmt, fmt_data in metadata['formats'].items():
                    filepath = Path(fmt_data['filepath'])
                    if filepath.exists():
                        filepath.unlink()
                        logger.debug(f"Deleted file: {filepath}")
            else:
                # Legacy single-format storage (backward compatibility)
                filepath = Path(metadata['filepath'])
                if filepath.exists():
                    filepath.unlink()
                    logger.debug(f"Deleted file: {filepath}")
            
            # Delete metadata
            metadata_path.unlink()
            logger.info(f"Deleted file and metadata: {file_id}")
            return True
        
        except Exception as e:
            logger.error(f"Error deleting file {file_id}: {e}")
            return False
        
    def cleanup_expired_files(self):
        """
        Remove all expired files and their metadata
        """
        logger.info("Running cleanup of expired files")
        deleted_count = 0
        for metadata_path in self.metadata_dir.glob("*.json"):
            try:
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                
                expires_at = datetime.fromisoformat(metadata['expires_at'])
                if datetime.now() > expires_at:
                    file_id = metadata['id']
                    if self.delete_file(file_id):
                        deleted_count += 1
            
            except Exception as e:
                logger.error(f"Error checking file {metadata_path}: {e}")
        
        logger.info(f"Cleanup complete. Deleted {deleted_count} expired files.")
    
    def _start_cleanup_thread(self):
        """
        Start background thread for periodic cleanup
        """
        def cleanup_loop():
            while True:
                time.sleep(1800) # Run every 30 minutes
                try:
                    self.cleanup_expired_files()
                except Exception as e:
                    logger.error(f"Error in cleanup thread: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        logger.info("Cleanup thread started")
    
    def get_stats(self) -> Dict:
        """
        Get stats about stored files
        """
        total_files = len(list(self.metadata_dir.glob("*.json")))
        total_size = sum(
            os.path.getsize(f)
            for f in self.files_dir.glob("*")
            if f.is_file()
        )

        return {
            'total_files': total_files,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size/ (1024*1024), 2),
            'storage_dir': str(self.storage_dir)
        }