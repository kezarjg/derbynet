#!/usr/bin/env python3
"""
DerbyNet Headless Replay Camera

Replicates the browser-based "Be a Camera" functionality for headless Linux systems.
This script connects to a DerbyNet server and streams video from a local camera
to replay kiosks via WebRTC.

Usage:
    python headless_camera.py --server http://derbynet.local --device /dev/video0
    python headless_camera.py --config config.yaml

Author: Generated for DerbyNet
License: MIT
"""

import asyncio
import json
import logging
import argparse
import sys
import signal
import os
from typing import Dict, Optional, Set
from dataclasses import dataclass

try:
    import yaml
except ImportError:
    yaml = None

# WebRTC and media handling
try:
    from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer, VideoStreamTrack
    from aiortc.sdp import candidate_from_sdp
    from aiortc.contrib.media import MediaPlayer
    from av import VideoFrame
except ImportError:
    print("Error: Required packages not installed.")
    print("Please run: pip install aiortc opencv-python aiohttp websockets")
    sys.exit(1)

# HTTP and WebSocket clients
import aiohttp
import websockets

# Video capture
import cv2


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Suppress verbose ICE candidate negotiation messages
logging.getLogger('aioice').setLevel(logging.WARNING)


def asyncio_exception_handler(loop, context):
    """Custom exception handler to suppress harmless cleanup errors"""
    exception = context.get('exception')
    message = context.get('message', '')

    # Suppress harmless STUN retry errors after connection closes
    if exception and isinstance(exception, AttributeError):
        if "'NoneType' object has no attribute 'sendto'" in str(exception):
            return  # Silently ignore
        if "'NoneType' object has no attribute 'call_exception_handler'" in str(exception):
            return  # Silently ignore

    # For all other exceptions, use default handling
    loop.default_exception_handler(context)


@dataclass
class CameraConfig:
    """Configuration for the headless camera"""
    server_url: str
    device: str = "/dev/video0"
    camera_id: str = "camera-replay"
    websocket_url: Optional[str] = None
    width: int = 640
    height: int = 480
    framerate: int = 30
    poll_interval: float = 1.0  # seconds


class VideoCamera(VideoStreamTrack):
    """Video track that reads from a camera device"""

    def __init__(self, device: str, width: int = 640, height: int = 480, framerate: int = 30):
        super().__init__()
        self.device = device
        self.width = width
        self.height = height
        self.framerate = framerate
        self.cap = None

    async def recv(self):
        """Receive the next video frame"""
        if self.cap is None:
            self.cap = cv2.VideoCapture(self.device)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.framerate)

            if not self.cap.isOpened():
                raise RuntimeError(f"Failed to open camera device: {self.device}")

            logger.info(f"Opened camera {self.device} at {self.width}x{self.height}@{self.framerate}fps")

        ret, frame = self.cap.read()
        if not ret:
            raise RuntimeError("Failed to read frame from camera")

        # Convert BGR to RGB
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Create VideoFrame
        pts, time_base = await self.next_timestamp()
        video_frame = VideoFrame.from_ndarray(frame, format="rgb24")
        video_frame.pts = pts
        video_frame.time_base = time_base

        return video_frame

    def stop(self):
        """Release camera resources"""
        if self.cap is not None:
            self.cap.release()
            self.cap = None


class ViewerConnection:
    """Manages a WebRTC connection to a single viewer"""

    def __init__(self, viewer_id: str, video_track: VideoCamera, signaling):
        self.viewer_id = viewer_id
        self.video_track = video_track
        self.signaling = signaling

        # Create RTCConfiguration with STUN server
        ice_servers = [RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
        configuration = RTCConfiguration(iceServers=ice_servers)
        self.pc = RTCPeerConnection(configuration=configuration)

        self.ideal_width = 0
        self.ideal_height = 0

        # Set up ICE candidate handler
        @self.pc.on("icecandidate")
        async def on_icecandidate(candidate):
            if candidate:
                logger.info(f"Sending ICE candidate to {viewer_id}: {candidate.type} {candidate.candidate[:50]}...")
                await self.signaling.send_message({
                    'recipient': viewer_id,
                    'type': 'ice-candidate',
                    'from': 'camera-replay',
                    'candidate': {
                        'candidate': candidate.candidate,
                        'sdpMid': candidate.sdpMid,
                        'sdpMLineIndex': candidate.sdpMLineIndex
                    }
                })
            else:
                logger.info(f"ICE gathering complete for {viewer_id}")

        # Set up ICE gathering state change handler
        @self.pc.on("icegatheringstatechange")
        async def on_icegatheringstatechange():
            logger.info(f"ICE gathering state for {viewer_id}: {self.pc.iceGatheringState}")

        # Set up ICE connection state change handler
        @self.pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            logger.info(f"ICE connection state for {viewer_id}: {self.pc.iceConnectionState}")

        # Set up connection state change handler
        @self.pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Connection to {viewer_id}: {self.pc.connectionState}")

        # Add video track
        self.pc.addTrack(video_track)
        logger.info(f"Created connection for viewer: {viewer_id}")

    async def handle_solicitation(self, msg: dict):
        """Handle initial solicitation from viewer"""
        if 'ideal' in msg:
            self.ideal_width = msg['ideal'].get('width', 0)
            self.ideal_height = msg['ideal'].get('height', 0)
            logger.info(f"Viewer {self.viewer_id} requests {self.ideal_width}x{self.ideal_height}")

        await self.send_offer()

    async def send_offer(self):
        """Create and send WebRTC offer"""
        logger.info(f"Creating offer for {self.viewer_id}")
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        await self.signaling.send_message({
            'recipient': self.viewer_id,
            'type': 'offer',
            'from': 'camera-replay',
            'sdp': {
                'type': self.pc.localDescription.type,
                'sdp': self.pc.localDescription.sdp
            }
        })
        logger.info(f"Sent offer to {self.viewer_id}")

    async def handle_answer(self, msg: dict):
        """Handle SDP answer from viewer"""
        logger.info(f"Received answer from {self.viewer_id}")
        answer = RTCSessionDescription(
            sdp=msg['sdp']['sdp'],
            type=msg['sdp']['type']
        )
        await self.pc.setRemoteDescription(answer)

    async def handle_ice_candidate(self, msg: dict):
        """Handle ICE candidate from viewer"""
        try:
            candidate_dict = msg.get('candidate', {})
            candidate_str = candidate_dict.get('candidate', '')
            sdp_mid = candidate_dict.get('sdpMid')
            sdp_mline_index = candidate_dict.get('sdpMLineIndex')

            if candidate_str:
                logger.info(f"Received ICE candidate from {self.viewer_id}: {candidate_str[:60]}...")

                # Parse the candidate string (format: "candidate:...")
                # aiortc expects just the part after "candidate:"
                if candidate_str.startswith('candidate:'):
                    candidate_str = candidate_str[10:]  # Remove "candidate:" prefix

                # Parse using aiortc's candidate_from_sdp
                candidate = candidate_from_sdp(candidate_str)
                candidate.sdpMid = sdp_mid
                candidate.sdpMLineIndex = sdp_mline_index

                await self.pc.addIceCandidate(candidate)
                logger.info(f"Added ICE candidate for {self.viewer_id}")
            else:
                logger.info(f"Received empty ICE candidate from {self.viewer_id} (end of candidates)")
        except Exception as e:
            logger.error(f"Error adding ICE candidate from {self.viewer_id}: {e}", exc_info=True)

    async def close(self):
        """Close the peer connection"""
        logger.info(f"Closing connection to {self.viewer_id}")
        await self.pc.close()


class HTTPSignaling:
    """HTTP polling-based signaling (fallback when WebSocket unavailable)"""

    def __init__(self, server_url: str, camera_id: str, poll_interval: float = 1.0):
        self.server_url = server_url.rstrip('/')
        self.camera_id = camera_id
        self.poll_interval = poll_interval
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = False

    async def start(self, message_handler):
        """Start polling for messages"""
        self.running = True
        self.session = aiohttp.ClientSession()

        logger.info("Starting HTTP polling signaling")

        while self.running:
            try:
                await self.retrieve_messages(message_handler)
                await asyncio.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"Error polling for messages: {e}")
                await asyncio.sleep(self.poll_interval)

    async def retrieve_messages(self, message_handler):
        """Poll server for messages"""
        try:
            async with self.session.post(
                f"{self.server_url}/action.php",
                data={
                    'action': 'message.retrieve',
                    'recipient': self.camera_id
                }
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if 'messages' in data:
                        for msg in data['messages']:
                            # Handle malformed messages gracefully
                            if isinstance(msg, str):
                                logger.warning(f"Received malformed message (string instead of dict): {msg}")
                                continue
                            if not isinstance(msg, dict):
                                logger.warning(f"Received unexpected message type: {type(msg)}")
                                continue
                            await message_handler(msg)
        except Exception as e:
            logger.error(f"Error retrieving messages: {e}")

    async def send_message(self, message: dict):
        """Send a message to the server"""
        try:
            # Extract recipient and send message as JSON string
            # This uses the alternate code path in action.message.send.inc
            recipient = message.get('recipient', '')
            async with self.session.post(
                f"{self.server_url}/action.php",
                data={
                    'action': 'message.send',
                    'recipient': recipient,
                    'message': json.dumps(message)
                }
            ) as response:
                if response.status != 200:
                    logger.error(f"Failed to send message: {response.status}")
        except Exception as e:
            logger.error(f"Error sending message: {e}")

    async def stop(self):
        """Stop polling"""
        self.running = False
        if self.session:
            await self.session.close()


class WebSocketSignaling:
    """WebSocket-based signaling (preferred method)"""

    def __init__(self, websocket_url: str, camera_id: str):
        self.websocket_url = websocket_url
        self.camera_id = camera_id
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.running = False

    async def start(self, message_handler):
        """Connect to WebSocket and handle messages"""
        self.running = True

        while self.running:
            try:
                logger.info(f"Connecting to WebSocket: {self.websocket_url}")
                async with websockets.connect(self.websocket_url) as ws:
                    self.ws = ws

                    # Send subscription message
                    await self.send_message({
                        'subscriber': self.camera_id,
                        'topics': []
                    })

                    logger.info("WebSocket connected and subscribed")

                    # Handle incoming messages
                    async for message in ws:
                        try:
                            msg = json.loads(message)
                            if msg.get('type') != 'subscription':
                                await message_handler(msg)
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse message: {e}")
                        except Exception as e:
                            logger.error(f"Error handling message: {e}")

            except websockets.exceptions.WebSocketException as e:
                logger.error(f"WebSocket error: {e}")
                if self.running:
                    logger.info("Reconnecting in 10 seconds...")
                    await asyncio.sleep(10)
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                if self.running:
                    await asyncio.sleep(10)

    async def send_message(self, message: dict):
        """Send a message via WebSocket"""
        if self.ws and not self.ws.closed:
            try:
                await self.ws.send(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")

    async def stop(self):
        """Stop WebSocket connection"""
        self.running = False
        if self.ws:
            await self.ws.close()


class HeadlessCamera:
    """Main headless camera controller"""

    def __init__(self, config: CameraConfig):
        self.config = config
        self.video_track = VideoCamera(
            config.device,
            config.width,
            config.height,
            config.framerate
        )
        self.viewers: Dict[str, ViewerConnection] = {}
        self.signaling = None
        self.running = False

    async def start(self):
        """Start the camera and signaling"""
        self.running = True

        # Determine signaling method
        if self.config.websocket_url:
            logger.info("Using WebSocket signaling")
            self.signaling = WebSocketSignaling(
                self.config.websocket_url,
                self.config.camera_id
            )
        else:
            logger.info("Using HTTP polling signaling")
            self.signaling = HTTPSignaling(
                self.config.server_url,
                self.config.camera_id,
                self.config.poll_interval
            )

        logger.info(f"Starting headless camera as '{self.config.camera_id}'")
        logger.info(f"Server: {self.config.server_url}")
        logger.info(f"Camera device: {self.config.device}")

        try:
            await self.signaling.start(self.handle_message)
        except asyncio.CancelledError:
            logger.info("Camera stopped")
        finally:
            await self.cleanup()

    async def handle_message(self, msg: dict):
        """Handle incoming signaling message"""
        msg_type = msg.get('type', '')
        from_id = msg.get('from', '')

        logger.debug(f"Received {msg_type} from {from_id}")

        if msg_type == 'solicitation':
            # New viewer wants to connect
            await self.handle_solicitation(msg)
        elif from_id in self.viewers:
            # Message for existing viewer connection
            viewer = self.viewers[from_id]
            if msg_type == 'answer':
                await viewer.handle_answer(msg)
            elif msg_type == 'ice-candidate':
                await viewer.handle_ice_candidate(msg)
            else:
                logger.warning(f"Unknown message type from {from_id}: {msg_type}")
        else:
            logger.debug(f"Ignoring message from unknown sender: {from_id}")

    async def handle_solicitation(self, msg: dict):
        """Handle solicitation from new viewer"""
        viewer_id = msg.get('from')
        if not viewer_id:
            logger.warning("Received solicitation without 'from' field")
            return

        logger.info(f"Received solicitation from {viewer_id}")

        # Close any existing connection for this viewer to prevent orphaned connections
        if viewer_id in self.viewers:
            logger.info(f"Closing existing connection for {viewer_id} before creating new one")
            await self.viewers[viewer_id].close()

        # Create new viewer connection
        viewer = ViewerConnection(viewer_id, self.video_track, self.signaling)
        self.viewers[viewer_id] = viewer

        await viewer.handle_solicitation(msg)

    async def cleanup(self):
        """Clean up resources"""
        logger.info("Cleaning up...")

        # Close all viewer connections
        for viewer in self.viewers.values():
            await viewer.close()
        self.viewers.clear()

        # Stop signaling
        if self.signaling:
            await self.signaling.stop()

        # Stop video track
        self.video_track.stop()

        logger.info("Cleanup complete")

    async def stop(self):
        """Stop the camera"""
        self.running = False
        await self.cleanup()


async def fetch_websocket_url(server_url: str) -> Optional[str]:
    """Fetch the WebSocket URL from the server"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{server_url.rstrip('/')}/action.php",
                data={'query': 'poll.websocket'}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    ws_url = data.get('websocket-url', '')
                    if ws_url:
                        logger.info(f"Server provides WebSocket URL: {ws_url}")
                        return ws_url
                    else:
                        logger.info("Server does not provide WebSocket URL")
    except Exception as e:
        logger.warning(f"Could not fetch WebSocket URL: {e}")

    return None


def load_config(config_file: str) -> CameraConfig:
    """Load configuration from YAML or JSON file"""
    try:
        _, ext = os.path.splitext(config_file)
        ext = ext.lower()

        with open(config_file, 'r') as f:
            # Determine format by file extension
            if ext in ('.yaml', '.yml'):
                if yaml is None:
                    logger.error("PyYAML not installed. Install with: pip install pyyaml")
                    sys.exit(1)
                data = yaml.safe_load(f)
            elif ext == '.json':
                data = json.load(f)
            else:
                # Try YAML first, fall back to JSON
                content = f.read()
                f.seek(0)
                try:
                    if yaml:
                        data = yaml.safe_load(content)
                    else:
                        data = json.loads(content)
                except:
                    data = json.loads(content)

        return CameraConfig(
            server_url=data['server_url'],
            device=data.get('device', '/dev/video0'),
            camera_id=data.get('camera_id', 'camera-replay'),
            websocket_url=data.get('websocket_url'),
            width=data.get('width', 640),
            height=data.get('height', 480),
            framerate=data.get('framerate', 30),
            poll_interval=data.get('poll_interval', 1.0)
        )
    except FileNotFoundError:
        logger.error(f"Config file not found: {config_file}")
        sys.exit(1)
    except (json.JSONDecodeError, yaml.YAMLError) as e:
        logger.error(f"Invalid config file format: {e}")
        sys.exit(1)
    except KeyError as e:
        logger.error(f"Missing required config field: {e}")
        sys.exit(1)


async def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='DerbyNet Headless Replay Camera')
    parser.add_argument('--server', help='DerbyNet server URL (e.g., http://derbynet.local)')
    parser.add_argument('--device', default='/dev/video0', help='Camera device (default: /dev/video0)')
    parser.add_argument('--config', help='Path to YAML or JSON config file')
    parser.add_argument('--width', type=int, default=640, help='Video width (default: 640)')
    parser.add_argument('--height', type=int, default=480, help='Video height (default: 480)')
    parser.add_argument('--framerate', type=int, default=30, help='Video framerate (default: 30)')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Load configuration
    if args.config:
        config = load_config(args.config)
    elif args.server:
        # Try to fetch WebSocket URL from server
        ws_url = await fetch_websocket_url(args.server)

        config = CameraConfig(
            server_url=args.server,
            device=args.device,
            websocket_url=ws_url,
            width=args.width,
            height=args.height,
            framerate=args.framerate
        )
    else:
        parser.error("Either --server or --config is required")

    # Create and start camera
    camera = HeadlessCamera(config)

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    # Install custom exception handler to suppress harmless cleanup errors
    loop.set_exception_handler(asyncio_exception_handler)

    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(camera.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await camera.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        await camera.stop()


if __name__ == '__main__':
    asyncio.run(main())
