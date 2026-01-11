#!/bin/bash
# Installation script for DerbyNet Headless Camera

set -e

echo "======================================"
echo "DerbyNet Headless Camera Installation"
echo "======================================"
echo

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "Error: This script is designed for Linux systems"
    exit 1
fi

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    echo "Warning: Cannot detect Linux distribution"
    DISTRO="unknown"
fi

echo "Detected distribution: $DISTRO"
echo

# Install system dependencies
echo "Installing system dependencies..."
case $DISTRO in
    ubuntu|debian|raspbian)
        sudo apt-get update
        sudo apt-get install -y \
            python3 \
            python3-pip \
            python3-venv \
            libavformat-dev \
            libavcodec-dev \
            libavdevice-dev \
            libavutil-dev \
            libswscale-dev \
            libswresample-dev \
            libavfilter-dev \
            libopus-dev \
            libvpx-dev \
            pkg-config \
            v4l-utils
        ;;
    *)
        echo "Warning: Unsupported distribution"
        echo "Please install the following packages manually:"
        echo "  - python3, python3-pip, python3-venv"
        echo "  - ffmpeg development libraries"
        echo "  - v4l-utils"
        echo
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        ;;
esac

# Create virtual environment
echo
echo "Creating Python virtual environment..."
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo
echo "Upgrading pip..."
pip install --upgrade pip

# Install Python dependencies
echo
echo "Installing Python dependencies..."
pip install -r requirements.txt

echo
echo "✅ Installation complete!"
echo
echo "Next steps:"
echo "1. Test your camera:"
echo "   source venv/bin/activate"
echo "   python test_camera.py"
echo
echo "2. Create configuration:"
echo "   cp config.example.yaml config.yaml"
echo "   nano config.yaml"
echo
echo "3. Run the camera:"
echo "   python headless_camera.py --config config.yaml"
echo
echo "See QUICKSTART.md for detailed instructions."
