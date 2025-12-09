#!/usr/bin/env python3
"""
Version Update Script for Vinylfy

This script reads version from build/version.json and deploys it throughout the codebase.

Usage:
    python update-version.py

Files updated:
    - needle/version.json (deployed for frontend runtime access)
    - table/app/__init__.py (backend version)
"""

import json
from pathlib import Path


def read_version_json():
    """Read version from build/version.json."""
    version_file = Path(__file__).parent.parent / 'build' / 'version.json'
    if not version_file.exists():
        raise FileNotFoundError("build/version.json not found!")
    
    with open(version_file, 'r') as f:
        version_data = json.load(f)
    
    version = version_data.get('version', 'Unknown')
    print(f"📦 Version from version.json: {version}")
    if 'description' in version_data:
        print(f"📝 {version_data['description']}")
    
    return version_data


def deploy_version_to_needle(version_data):
    """Copy version.json to needle directory for runtime access."""
    build_version = Path(__file__).parent.parent / 'build' / 'version.json'
    needle_version = Path(__file__).parent.parent / 'needle' / 'version.json'
    
    try:
        # Copy the entire JSON file
        with open(build_version, 'r') as src:
            data = json.load(src)
        
        with open(needle_version, 'w') as dst:
            json.dump(data, dst, indent=2)
        
        print(f"✅ Deployed version.json to {needle_version}")
        return True
    except Exception as e:
        print(f"⚠️  Failed to deploy version.json: {e}")
        return False


def update_backend_version(version):
    """Update version in table/app/__init__.py"""
    init_file = Path(__file__).parent / 'app' / '__init__.py'
    
    if not init_file.exists():
        print(f"⚠️  Backend __init__.py not found at {init_file}")
        return False
    
    content = init_file.read_text()
    
    # Format version for backend (convert public-beta-1 to v1.0.0 Public Beta 1)
    formatted_version = format_version_for_display(version)
    
    # Update __version__ line
    import re
    updated_content = re.sub(
        r"__version__\s*=\s*['\"].*['\"]",
        f"__version__ = '{formatted_version}'",
        content
    )
    
    if content != updated_content:
        init_file.write_text(updated_content)
        print(f"✅ Updated backend version to: {formatted_version}")
        return True
    else:
        print(f"ℹ️  Backend version already up to date")
        return False


def format_version_for_display(version):
    """Convert short version to display version.
    
    Examples:
        public-beta-1 -> v1.0.0 Public Beta 1
        public-beta-2.5 -> v1.0.0 Public Beta 2.5
        v2.0.0 -> v2.0.0
    """
    if 'public-beta-' in version:
        # Extract the number after public-beta-
        version_num = version.replace('public-beta-', '')
        return f"v1.0.0 Public Beta {version_num}"
    
    # Return as-is if already formatted
    return version


def main():
    """Main version update workflow."""
    print("=" * 60)
    print("🎵 Vinylfy Version Deployment (version.json)")
    print("=" * 60)
    print()
    
    try:
        # Read version data
        version_data = read_version_json()
        version = version_data.get('version', 'Unknown')
        print()
        
        # Deploy files
        updates = []
        updates.append(deploy_version_to_needle(version_data))
        updates.append(update_backend_version(version))
        
        print()
        print("=" * 60)
        if any(updates):
            print("✅ Version deployment complete!")
            print(f"📦 Version: {version}")
            print("💡 Frontend will load version.json dynamically at runtime")
        else:
            print(f"ℹ️  All files already at latest version: {version}")
        print("=" * 60)
        
        return 0
        
    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ Error: {e}")
        print("=" * 60)
        return 1


if __name__ == '__main__':
    exit(main())
