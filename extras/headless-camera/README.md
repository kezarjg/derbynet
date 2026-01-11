# DerbyNet Headless Replay Camera

A Python script that replicates the browser-based "Be a Camera" functionality for headless Linux systems. This allows a Linux machine with a camera to serve as a replay camera for DerbyNet without requiring a web browser.

## Features

- Connects to DerbyNet server as a replay camera
- Streams video via WebRTC to replay kiosks
- Supports both WebSocket and HTTP polling signaling
- Configurable video resolution and framerate
- Automatic reconnection on network interruptions
- Can run as a systemd service

## Requirements

- Python 3.8 or higher
- Linux system with a video camera device
- Network connectivity to DerbyNet server
- Camera device (e.g., `/dev/video0`)

## Installation

### 1. Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip python3-venv
sudo apt-get install libavformat-dev libavcodec-dev libavdevice-dev \
                     libavutil-dev libswscale-dev libswresample-dev \
                     libavfilter-dev libopus-dev libvpx-dev pkg-config
```

**Raspberry Pi:**
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip python3-venv
sudo apt-get install libavformat-dev libavcodec-dev libavdevice-dev \
                     libavutil-dev libswscale-dev libswresample-dev \
                     libavfilter-dev libopus-dev libvpx-dev pkg-config \
                     v4l-utils
```

### 2. Create Virtual Environment

```bash
cd extras/headless-camera
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

## Configuration

### Method 1: Command Line Arguments

```bash
python headless_camera.py \
    --server http://derbynet.local \
    --device /dev/video0 \
    --width 1280 \
    --height 720 \
    --framerate 30
```

### Method 2: Configuration File

1. Copy the example config:
```bash
cp config.example.yaml config.yaml
```

2. Edit `config.yaml`:
```yaml
# DerbyNet server URL (required)
server_url: http://192.168.1.100

# Camera device path
device: /dev/video0

# Camera identifier (do not change!)
camera_id: camera-replay

# WebSocket URL (optional, auto-detected if null)
websocket_url: null

# Video resolution
width: 1280
height: 720

# Framerate
framerate: 30

# Polling interval (seconds, only used without WebSocket)
poll_interval: 1.0
```

3. Run with config file:
```bash
python headless_camera.py --config config.yaml
```

**Note:** JSON config files are also supported for backward compatibility.

## Usage

### Basic Usage

```bash
# Using command line arguments
python headless_camera.py --server http://derbynet.local

# Using config file
python headless_camera.py --config config.yaml

# With verbose logging
python headless_camera.py --server http://derbynet.local --verbose
```

### Command Line Options

- `--server URL` - DerbyNet server URL (required if not using --config)
- `--device PATH` - Camera device path (default: /dev/video0)
- `--config FILE` - Path to YAML or JSON configuration file
- `--width PIXELS` - Video width in pixels (default: 640)
- `--height PIXELS` - Video height in pixels (default: 480)
- `--framerate FPS` - Video framerate (default: 30)
- `--verbose` - Enable verbose debug logging

### Finding Your Camera Device

List available video devices:
```bash
ls -l /dev/video*
```

Test your camera with v4l2:
```bash
v4l2-ctl --list-devices
v4l2-ctl --device=/dev/video0 --list-formats-ext
```

Test with ffplay:
```bash
ffplay /dev/video0
```

## Running as a Service

To run the headless camera automatically on system boot, create a systemd service.

### 1. Create Service File

Create `/etc/systemd/system/derbynet-camera.service`:

```ini
[Unit]
Description=DerbyNet Headless Replay Camera
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/derbynet/extras/headless-camera
ExecStart=/home/pi/derbynet/extras/headless-camera/venv/bin/python \
          /home/pi/derbynet/extras/headless-camera/headless_camera.py \
          --config /home/pi/derbynet/extras/headless-camera/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Note:** Adjust paths and user as needed for your system.

### 2. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable derbynet-camera.service
sudo systemctl start derbynet-camera.service
```

### 3. Check Service Status

```bash
sudo systemctl status derbynet-camera.service
```

### 4. View Logs

```bash
sudo journalctl -u derbynet-camera.service -f
```

## WebSocket vs HTTP Polling

The script supports two signaling methods:

### WebSocket (Preferred)

- Lower latency
- More efficient
- Requires WebSocket server running (see `extras/websocket/ws-server.js`)
- Automatically detected if server provides `_websocket_url`

### HTTP Polling (Fallback)

- Works without WebSocket server
- Higher latency (polls every 1 second by default)
- More server load
- Used automatically if WebSocket URL not available

## Troubleshooting

### Camera Not Opening

```bash
# Check camera permissions
ls -l /dev/video0

# Add user to video group
sudo usermod -a -G video $USER

# Log out and back in for group change to take effect
```

### Connection Issues

```bash
# Test network connectivity
ping derbynet.local

# Check if DerbyNet server is running
curl http://derbynet.local

# Enable verbose logging
python headless_camera.py --server http://derbynet.local --verbose
```

### WebRTC Connection Failures

- Ensure STUN server (stun.l.google.com:19302) is accessible
- Check firewall rules for UDP ports
- Verify network allows WebRTC traffic
- Check server logs for WebSocket connectivity

### Performance Issues

- Reduce resolution: `--width 640 --height 480`
- Reduce framerate: `--framerate 15`
- Ensure adequate network bandwidth
- Check CPU usage with `top` or `htop`

## Hardware Recommendations

### Raspberry Pi

- **Raspberry Pi 4 (4GB+)** recommended for 720p streaming
- **Raspberry Pi 3B+** works for 480p streaming
- USB webcam or Raspberry Pi Camera Module v2/v3
- Wired Ethernet connection preferred

### USB Cameras

Tested and working cameras:
- Logitech C920/C922/C930e
- Microsoft LifeCam
- Raspberry Pi Camera Module (via `bcm2835-v4l2` driver)

## Technical Details

### Architecture

```
┌─────────────────────┐
│  Video Camera       │
│  (/dev/video0)      │
└──────┬──────────────┘
       │ OpenCV
       ▼
┌─────────────────────┐
│  VideoCamera Track  │
│  (aiortc)           │
└──────┬──────────────┘
       │ WebRTC
       ▼
┌─────────────────────┐     ┌──────────────────┐
│  ViewerConnection   │────▶│  Replay Kiosk 1  │
│  (WebRTC Peer)      │     └──────────────────┘
└─────────────────────┘
       ▲
       │ WebSocket or HTTP
       │
┌─────────────────────┐
│  DerbyNet Server    │
└─────────────────────┘
```

### Message Flow

1. **Startup:**
   - Camera connects to server (WebSocket or HTTP polling)
   - Identifies as `camera-replay`

2. **Viewer Connection:**
   - Replay kiosk sends `solicitation` message
   - Camera creates WebRTC peer connection
   - Camera sends `offer` with SDP
   - Viewer responds with `answer`
   - ICE candidates exchanged
   - WebRTC connection established

3. **Streaming:**
   - Video frames captured from camera
   - Encoded and sent via WebRTC
   - Multiple viewers supported simultaneously

### Camera ID

**IMPORTANT:** The camera identifies itself as `camera-replay` to the DerbyNet server. This is the expected identifier used by the system.

**Do not change the `camera_id` parameter.** DerbyNet currently supports only a single remote camera, and the viewer code is hardcoded to look for a camera with ID `camera-replay`. Running multiple cameras simultaneously is not supported without modifying the DerbyNet server code.

## Development

### Running Tests

```bash
# Test camera access
python -c "import cv2; cap = cv2.VideoCapture(0); print('Camera OK' if cap.isOpened() else 'Camera FAIL')"

# Test WebRTC
python -c "from aiortc import RTCPeerConnection; print('aiortc OK')"
```

### Debug Logging

Enable verbose logging to see detailed WebRTC signaling:

```bash
python headless_camera.py --server http://derbynet.local --verbose
```

## License

MIT License - Same as DerbyNet

## Support

For issues and questions:
- DerbyNet GitHub: https://github.com/jeffpiazza/derbynet
- DerbyNet Website: https://derbynet.org
