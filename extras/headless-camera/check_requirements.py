#!/usr/bin/env python3
"""
Check if all requirements are met for running the headless camera
"""

import sys
import subprocess
import os


def check_python_version():
    """Check Python version"""
    version = sys.version_info
    print(f"Python version: {version.major}.{version.minor}.{version.micro}")

    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 or higher required")
        return False

    print("✓ Python version OK")
    return True


def check_module(module_name, import_name=None):
    """Check if a Python module is installed"""
    if import_name is None:
        import_name = module_name

    try:
        __import__(import_name)
        print(f"✓ {module_name} installed")
        return True
    except ImportError:
        print(f"❌ {module_name} not installed")
        return False


def check_system_command(command, package_hint=None):
    """Check if a system command is available"""
    try:
        result = subprocess.run(['which', command], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ {command} available: {result.stdout.strip()}")
            return True
        else:
            print(f"❌ {command} not found")
            if package_hint:
                print(f"   Install with: sudo apt-get install {package_hint}")
            return False
    except Exception as e:
        print(f"❌ Error checking {command}: {e}")
        return False


def check_video_devices():
    """Check for video devices"""
    devices = []
    for i in range(10):
        device = f'/dev/video{i}'
        if os.path.exists(device):
            devices.append(device)

    if devices:
        print(f"✓ Found {len(devices)} video device(s):")
        for device in devices:
            print(f"  - {device}")
        return True
    else:
        print("❌ No video devices found")
        print("   Check: ls -l /dev/video*")
        return False


def check_video_permissions():
    """Check if user has access to video devices"""
    import grp

    try:
        video_group = grp.getgrnam('video')
        username = os.getenv('USER')

        if username in video_group.gr_mem:
            print(f"✓ User '{username}' is in 'video' group")
            return True
        else:
            print(f"❌ User '{username}' is not in 'video' group")
            print(f"   Run: sudo usermod -a -G video {username}")
            print(f"   Then log out and back in")
            return False
    except KeyError:
        print("⚠ Could not check video group membership")
        return True


def main():
    print("DerbyNet Headless Camera Requirements Check")
    print("=" * 50)
    print()

    all_ok = True

    # Check Python version
    print("Checking Python...")
    all_ok &= check_python_version()
    print()

    # Check Python modules
    print("Checking Python modules...")
    modules = [
        ('aiortc', 'aiortc'),
        ('opencv-python', 'cv2'),
        ('aiohttp', 'aiohttp'),
        ('websockets', 'websockets'),
        ('av', 'av'),
    ]

    for module_name, import_name in modules:
        all_ok &= check_module(module_name, import_name)
    print()

    # Check system commands (optional but helpful)
    print("Checking optional system commands...")
    v4l2_ok = check_system_command('v4l2-ctl', 'v4l-utils')
    if not v4l2_ok:
        print("  ⚠ v4l2-ctl is optional but recommended for detailed camera testing")

    ffmpeg_ok = check_system_command('ffmpeg', 'ffmpeg')
    if not ffmpeg_ok:
        print("  ⚠ ffmpeg command is optional (FFmpeg libraries are already installed)")
    print()

    # Check video devices
    print("Checking video devices...")
    all_ok &= check_video_devices()
    print()

    # Check permissions
    print("Checking permissions...")
    all_ok &= check_video_permissions()
    print()

    # Summary
    print("=" * 50)
    if all_ok:
        print("✅ All requirements met!")
        print("\nYou can now run:")
        print("  python headless_camera.py --config config.yaml")
    else:
        print("❌ Some requirements are missing")
        print("\nTo install missing requirements:")
        print("  ./install.sh")
        print("\nOr install manually:")
        print("  pip install -r requirements.txt")

    sys.exit(0 if all_ok else 1)


if __name__ == '__main__':
    main()
