#!/usr/bin/env python3
"""
Simple camera test script to verify hardware is working
"""

import cv2
import sys
import os
import subprocess

# Suppress OpenCV warnings and errors when scanning for cameras
os.environ['OPENCV_LOG_LEVEL'] = 'FATAL'
cv2.setLogLevel(0)

# Common resolutions to test
COMMON_RESOLUTIONS = [
    (320, 240, "QVGA"),
    (640, 480, "VGA"),
    (800, 600, "SVGA"),
    (1024, 768, "XGA"),
    (1280, 720, "HD 720p"),
    (1280, 1024, "SXGA"),
    (1920, 1080, "Full HD 1080p"),
    (2560, 1440, "QHD 1440p"),
    (3840, 2160, "4K UHD"),
]


def test_supported_formats_v4l2(device):
    """Use v4l2-ctl to get supported formats (if available)"""
    try:
        # Try to run v4l2-ctl
        result = subprocess.run(
            ['v4l2-ctl', '--device', device, '--list-formats-ext'],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            print("\n📋 Supported formats (from v4l2-ctl):")
            print("=" * 60)

            # Parse and display the output
            for line in result.stdout.split('\n'):
                line = line.strip()
                if line.startswith('['):
                    # Format line
                    print(f"\n{line}")
                elif 'Size:' in line:
                    print(f"  {line}")
                elif 'Interval:' in line and 'fps' in line.lower():
                    print(f"    {line}")

            print("=" * 60)
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        pass

    return False


def test_supported_resolutions(device):
    """Test common resolutions to see which ones work"""
    print("\n📐 Testing common resolutions:")
    print("=" * 60)

    supported = []

    for width, height, name in COMMON_RESOLUTIONS:
        cap = cv2.VideoCapture(device)
        if not cap.isOpened():
            break

        # Try to set the resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        # Check what resolution we actually got
        actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Try to read a frame to verify it works
        ret, _ = cap.read()
        cap.release()

        if ret and actual_width == width and actual_height == height:
            supported.append((width, height, name))
            print(f"  ✓ {width}x{height} ({name})")
        else:
            print(f"  ✗ {width}x{height} ({name})")

    print("=" * 60)

    if supported:
        print(f"\n✅ {len(supported)} resolution(s) supported")
        print("\nRecommendations for config.yaml:")
        if len(supported) >= 3:
            mid = len(supported) // 2
            rec_width, rec_height, rec_name = supported[mid]
            print(f"  Medium quality: width: {rec_width}, height: {rec_height}  # {rec_name}")
        if supported[-1] != supported[0]:
            max_width, max_height, max_name = supported[-1]
            print(f"  High quality:   width: {max_width}, height: {max_height}  # {max_name}")

    return len(supported) > 0


def test_camera(device='/dev/video0', detailed=False):
    """Test if camera can be opened and read"""
    print(f"Testing camera: {device}")

    cap = cv2.VideoCapture(device)

    if not cap.isOpened():
        print(f"❌ Failed to open camera {device}")
        print("\nTroubleshooting:")
        print("1. Check if device exists: ls -l /dev/video*")
        print("2. Check permissions: sudo usermod -a -G video $USER")
        print("3. Try a different device number")
        return False

    print(f"✓ Camera opened successfully")

    # Get camera properties
    width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    fps = cap.get(cv2.CAP_PROP_FPS)

    print(f"✓ Default resolution: {int(width)}x{int(height)}")
    print(f"✓ Default FPS: {fps}")

    # Try to read a frame
    ret, frame = cap.read()

    if not ret:
        print("❌ Failed to read frame from camera")
        cap.release()
        return False

    print(f"✓ Successfully read frame: {frame.shape}")

    cap.release()

    print("\n✅ Basic camera test passed!")

    # Show detailed format information if requested
    if detailed:
        # Try v4l2-ctl first (more accurate)
        if not test_supported_formats_v4l2(device):
            # Fall back to testing common resolutions
            test_supported_resolutions(device)

    return True


def list_cameras():
    """List all available video devices"""
    print("Searching for video devices...")

    found = []
    for i in range(10):
        device = f'/dev/video{i}'
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            found.append(device)
            cap.release()

    if found:
        print(f"\nFound {len(found)} camera(s):")
        for device in found:
            print(f"  - {device}")
    else:
        print("\n❌ No cameras found")
        print("\nTroubleshooting:")
        print("1. Is a camera connected?")
        print("2. Check: ls -l /dev/video*")
        print("3. Check: v4l2-ctl --list-devices")

    return found


if __name__ == '__main__':
    print("DerbyNet Camera Test\n" + "="*50 + "\n")

    # Check for --detailed flag
    detailed = '--detailed' in sys.argv or '-d' in sys.argv
    args = [arg for arg in sys.argv[1:] if arg not in ('--detailed', '-d')]

    if args:
        device = args[0]
    else:
        # First list all cameras
        cameras = list_cameras()
        print()

        if not cameras:
            sys.exit(1)

        device = cameras[0]
        print(f"Testing first camera: {device}\n")

    if test_camera(device, detailed=detailed):
        if not detailed:
            print("\n💡 Tip: Run 'python test_camera.py --detailed' to see all supported resolutions")
        sys.exit(0)
    else:
        sys.exit(1)
