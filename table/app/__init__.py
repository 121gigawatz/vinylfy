"""
Vinylfy Turntable - Backend Audio Processing Service

This package provides the backend services for applying vinyl record
effects to digital audio files. It simulates the warm, mostalgic sound
of vinyl records including:

- Surface Noise
- Frequency Characteristics
- Mechancial Artifacts like pops
"""

# Version is embedded at build time by update-version script
# DO NOT modify this manually - use: python3 update-version.py
__version__ = '0.9.5.4'
__author__ = 'Vinylfy by 121GigaWatz'

from .main import create_app

__all__ = ['create_app']