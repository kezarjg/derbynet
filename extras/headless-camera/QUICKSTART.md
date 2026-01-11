# Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies

```bash
cd extras/headless-camera

# Install system packages (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv \
    libavformat-dev libavcodec-dev libavdevice-dev \
    libavutil-dev libswscale-dev libavfilter-dev \
    libopus-dev libvpx-dev v4l-utils

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python packages
pip install -r requirements.txt
```

### 2. Test Your Camera

```bash
# List available cameras
ls -l /dev/video*

# Test camera with script
python test_camera.py
```

Expected output:
```
Testing camera: /dev/video0
✓ Camera opened successfully
✓ Resolution: 1280x720
✓ FPS: 30.0
✓ Successfully read frame: (720, 1280, 3)
✓ Can set resolution to: 1280x720

✅ Camera test passed!
```

### 3. Configure

```bash
# Copy example config
cp config.example.yaml config.yaml

# Edit with your server URL
nano config.yaml
```

Change `server_url` to your DerbyNet server:
```yaml
server_url: http://192.168.1.100
```

### 4. Run

```bash
python headless_camera.py --config config.yaml
```

You should see:
```
INFO - Using WebSocket signaling (or HTTP polling signaling)
INFO - Starting headless camera as 'camera-replay'
INFO - Server: http://192.168.1.100
INFO - Camera device: /dev/video0
INFO - Opened camera /dev/video0 at 640x480@30fps
INFO - WebSocket connected and subscribed
```

### 5. Test from DerbyNet

1. Open a browser to your DerbyNet server
2. Go to any page that has a replay option
3. Open the replay configuration
4. Select "Remote Camera" from the device picker
5. You should see the video from your headless camera

## Raspberry Pi Specific

### Enable Camera Module

If using Raspberry Pi Camera Module:

```bash
# Enable camera interface
sudo raspi-config
# Navigate to: Interface Options → Camera → Enable

# Load the driver
sudo modprobe bcm2835-v4l2

# Make it load on boot
echo "bcm2835-v4l2" | sudo tee -a /etc/modules

# Reboot
sudo reboot
```

### Optimize Performance

For Raspberry Pi 3/4, reduce CPU usage in `config.yaml`:

```yaml
width: 640
height: 480
framerate: 15
```

## Running on Boot

```bash
# Copy service file
sudo cp derbynet-camera.service /etc/systemd/system/

# Edit paths in service file
sudo nano /etc/systemd/system/derbynet-camera.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable derbynet-camera.service
sudo systemctl start derbynet-camera.service

# Check status
sudo systemctl status derbynet-camera.service
```

## Troubleshooting

### Camera Permission Denied

```bash
sudo usermod -a -G video $USER
# Log out and back in
```

### Can't Connect to Server

```bash
# Test connectivity
ping <server-ip>
curl http://<server-ip>

# Check firewall
sudo ufw status
```

### Poor Video Quality

Increase resolution in `config.yaml`:
```yaml
width: 1280
height: 720
framerate: 30
```

### Service Won't Start

```bash
# View logs
sudo journalctl -u derbynet-camera.service -n 50

# Test manually first
source venv/bin/activate
python headless_camera.py --config config.yaml --verbose
```

## Next Steps

- See [README.md](README.md) for complete documentation
- Check logs: `sudo journalctl -u derbynet-camera.service -f`
- Adjust resolution/framerate in config.yaml
- Multiple cameras not supported (see README for details)
