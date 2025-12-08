#!/usr/bin/env python3
"""
Test script to verify EQ and filter controls work correctly.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'table', 'app'))

import numpy as np
from vinyl_processor import VinylProcessor
from config import Config

def test_eq_controls():
    """Test 3-band EQ controls"""
    print("Testing 3-band EQ controls...")
    
    processor = VinylProcessor(sample_rate=44100)
    
    # Create test audio (1 second of white noise, stereo)
    duration = 1.0
    samples = int(44100 * duration)
    test_audio = np.random.randn(samples, 2).astype(np.float32) * 0.1
    
    # Test bass boost
    print("  ✓ Testing bass boost (+5 dB)")
    bass_boosted = processor.apply_eq(test_audio, bass=5.0, mid=0.0, treble=0.0)
    assert bass_boosted.shape == test_audio.shape
    
    # Test mid boost
    print("  ✓ Testing mid boost (+5 dB)")
    mid_boosted = processor.apply_eq(test_audio, bass=0.0, mid=5.0, treble=0.0)
    assert mid_boosted.shape == test_audio.shape
    
    # Test treble boost
    print("  ✓ Testing treble boost (+5 dB)")
    treble_boosted = processor.apply_eq(test_audio, bass=0.0, mid=0.0, treble=5.0)
    assert treble_boosted.shape == test_audio.shape
    
    # Test combined EQ
    print("  ✓ Testing combined EQ (bass +3, mid -2, treble +1)")
    combined = processor.apply_eq(test_audio, bass=3.0, mid=-2.0, treble=1.0)
    assert combined.shape == test_audio.shape
    
    # Test zero EQ (should return unchanged)
    print("  ✓ Testing zero EQ (should pass through)")
    unchanged = processor.apply_eq(test_audio, bass=0.0, mid=0.0, treble=0.0)
    assert np.array_equal(unchanged, test_audio)
    
    print("✅ EQ controls test PASSED\n")

def test_hpf():
    """Test High-Pass Filter"""
    print("Testing High-Pass Filter...")
    
    processor = VinylProcessor(sample_rate=44100)
    
    # Create test audio
    duration = 1.0
    samples = int(44100 * duration)
    test_audio = np.random.randn(samples, 2).astype(np.float32) * 0.1
    
    # Test various cutoff frequencies
    for cutoff in [30, 50, 100, 200, 500]:
        print(f"  ✓ Testing HPF at {cutoff} Hz")
        filtered = processor.apply_hpf(test_audio, cutoff_hz=cutoff)
        assert filtered.shape == test_audio.shape
    
    print("✅ HPF test PASSED\n")

def test_lpf():
    """Test Low-Pass Filter"""
    print("Testing Low-Pass Filter...")
    
    processor = VinylProcessor(sample_rate=44100)
    
    # Create test audio
    duration = 1.0
    samples = int(44100 * duration)
    test_audio = np.random.randn(samples, 2).astype(np.float32) * 0.1
    
    # Test various cutoff frequencies
    for cutoff in [5000, 8000, 12000, 15000, 18000]:
        print(f"  ✓ Testing LPF at {cutoff} Hz")
        filtered = processor.apply_lpf(test_audio, cutoff_hz=cutoff)
        assert filtered.shape == test_audio.shape
    
    print("✅ LPF test PASSED\n")

def test_presets():
    """Test that all presets have the new parameters"""
    print("Testing preset configurations...")
    
    required_params = ['bass', 'mid', 'treble', 'hpf_enabled', 'hpf_cutoff', 'lpf_enabled', 'lpf_cutoff']
    
    for preset_name, preset_config in Config.PRESETS.items():
        print(f"  ✓ Checking preset: {preset_name}")
        for param in required_params:
            assert param in preset_config, f"Missing {param} in {preset_name}"
        
        # Validate ranges
        assert -5 <= preset_config['bass'] <= 5, f"Bass out of range in {preset_name}"
        assert -5 <= preset_config['mid'] <= 5, f"Mid out of range in {preset_name}"
        assert -5 <= preset_config['treble'] <= 5, f"Treble out of range in {preset_name}"
        assert isinstance(preset_config['hpf_enabled'], bool)
        assert isinstance(preset_config['lpf_enabled'], bool)
        assert 20 <= preset_config['hpf_cutoff'] <= 500
        assert 5000 <= preset_config['lpf_cutoff'] <= 20000
    
    print("✅ Preset configuration test PASSED\n")

def test_full_processing():
    """Test full processing pipeline with new controls"""
    print("Testing full processing pipeline...")
    
    processor = VinylProcessor(sample_rate=44100)
    
    # Create test audio
    duration = 1.0
    samples = int(44100 * duration)
    test_audio = np.random.randn(samples, 2).astype(np.float32) * 0.1
    
    # Test with custom settings including EQ and filters
    settings = {
        'frequency_response': True,
        'surface_noise': True,
        'noise_intensity': 0.02,
        'pop_intensity': 0.5,
        'wow_flutter': True,
        'wow_flutter_intensity': 0.001,
        'harmonic_distortion': True,
        'distortion_amount': 0.15,
        'stereo_reduction': True,
        'stereo_width': 0.7,
        'bass': 2.0,
        'mid': -1.0,
        'treble': 1.5,
        'hpf_enabled': True,
        'hpf_cutoff': 40,
        'lpf_enabled': True,
        'lpf_cutoff': 14000,
    }
    
    print("  ✓ Processing with all effects enabled")
    processed = processor.process(test_audio, settings)
    assert processed.shape == test_audio.shape
    assert processed.dtype == np.float32
    assert np.all(np.abs(processed) <= 1.0), "Output should be normalized"
    
    # Test with each preset
    for preset_name, preset_config in Config.PRESETS.items():
        print(f"  ✓ Processing with preset: {preset_name}")
        processed = processor.process(test_audio, preset_config)
        assert processed.shape == test_audio.shape
    
    print("✅ Full processing pipeline test PASSED\n")

if __name__ == '__main__':
    print("=" * 60)
    print("EQ and Filter Controls Verification Test")
    print("=" * 60 + "\n")
    
    try:
        test_eq_controls()
        test_hpf()
        test_lpf()
        test_presets()
        test_full_processing()
        
        print("=" * 60)
        print("🎉 ALL TESTS PASSED!")
        print("=" * 60)
        print("\nNew features available:")
        print("  • Bass control: -5 to +5 dB (centered at 100 Hz)")
        print("  • Mid control: -5 to +5 dB (centered at 1000 Hz)")
        print("  • Treble control: -5 to +5 dB (high shelf at 8000 Hz)")
        print("  • HPF: Configurable cutoff (20-500 Hz)")
        print("  • LPF: Configurable cutoff (5-20 kHz)")
        print("\nAll presets updated with sensible defaults!")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
