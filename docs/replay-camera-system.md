# Replay Camera System Documentation

This document describes the replay camera flow in DerbyNet, including the headless camera, replay kiosk, timer integration, and available settings.

## Overview

The replay system captures video of each race and plays it back in slow motion after cars cross the finish line. The system consists of three main components:

1. **Camera** - Captures video (either local USB camera or remote headless camera)
2. **Replay Kiosk** - Displays live video and replays to spectators
3. **Timer** - Triggers replay capture and playback based on race events

## Architecture Diagram

```
┌─────────────────┐
│  Timer Hardware │
│  (Start Gate,   │
│   Finish Line)  │
└────────┬────────┘
         │ STARTED / FINISHED events
         ▼
┌─────────────────────┐
│  DerbyNet Server    │
│  (timer-message.inc)│
│                     │
│  Sends commands:    │
│  - RACE_STARTS      │
│  - REPLAY           │
│  - CANCEL           │
└────────┬────────────┘
         │ via WebSocket / file queue
         ▼
┌─────────────────────┐         WebRTC          ┌──────────────────┐
│   Replay Kiosk      │◄────────────────────────│  Camera          │
│   (replay.php)      │      video stream       │  (camera.php or  │
│                     │                         │   headless)      │
│  - Receives stream  │                         │                  │
│  - Records frames   │    signaling messages   │  - Captures      │
│  - Plays replays    │◄───────────────────────►│    video         │
└─────────────────────┘    (solicitation,       │  - Broadcasts    │
                            offer, answer,       │    via WebRTC    │
                            ICE candidates)      └──────────────────┘
```

## Components

### 1. Camera

The camera component captures video and streams it to replay kiosks via WebRTC.

#### Local Camera (camera.php)

A browser-based camera page that:
- Accesses a local USB camera via `getUserMedia()`
- Creates WebRTC peer connections to broadcast the stream
- Responds to solicitation messages from viewers
- Handles WebRTC signaling (offer/answer/ICE candidates)

**Key files:**
- [camera.php](website/camera.php) - Camera page
- [camera-signaling.js](website/js/camera-signaling.js) - WebRTC signaling logic

#### Headless Camera (Raspberry Pi)

A standalone service that runs on a Raspberry Pi without a GUI:
- Runs as a systemd service (`derbynet-camera.service`)
- Captures video from a USB camera
- Broadcasts stream via WebRTC to replay kiosks
- Configured via `config.yaml`

**Key files:**
- [extras/headless-camera/](extras/headless-camera/) - Headless camera code
- [extras/scripts/camera-ctl](extras/scripts/camera-ctl) - Control script for managing the service

**Control script features:**
- Start/stop/restart the service
- Enable/disable auto-start on boot
- View live and recent logs
- Edit configuration
- Health check diagnostics

### 2. Replay Kiosk

The replay kiosk displays live video and plays back replays on command.

**Key files:**
- [replay.php](website/replay.php) - Main replay kiosk page
- [circular-frame-buffer.js](website/js/circular-frame-buffer.js) - Frame recording and playback
- [viewer-signaling.js](website/js/viewer-signaling.js) - WebRTC viewer signaling
- [video-capture.js](website/js/video-capture.js) - Video upload functionality

#### Video Input

The kiosk can receive video from two sources:

1. **Local USB camera** - Direct access via `getUserMedia()`
2. **Remote camera** - Video stream via WebRTC from a headless camera or another camera.php instance

When using a remote camera, the kiosk:
1. Sends periodic "solicitation" messages (every 5 seconds)
2. Receives an "offer" from the camera
3. Responds with an "answer"
4. Exchanges ICE candidates to establish the peer connection
5. Receives the video stream

#### Frame Recording

The circular frame buffer continuously records video:
- Captures frames at ~30 FPS
- Stores frames in a circular array (older frames overwritten)
- Pre-allocates memory based on configured replay duration
- Uses `ImageData` objects from an offscreen canvas

#### Replay Playback

When a REPLAY command is received:
1. Finds the starting frame based on the skipback duration
2. Iterates through the circular buffer
3. Renders frames to the display canvas
4. Applies the configured playback rate (slow motion)
5. Repeats for the configured number of showings

#### Video Upload (Optional)

If enabled, the kiosk can record and upload replays:
- Captures the canvas as a video stream via `captureStream()`
- Uses MediaRecorder API to encode
- Format: Matroska (.mkv) with AVC codec
- Uploads to server via `action.php?action=video.upload`

### 3. Timer Integration

The timer triggers replay events based on race state changes.

**Key files:**
- [action.timer-message.inc](website/ajax/action.timer-message.inc) - Timer message handler
- [replay.inc](website/inc/replay.inc) - Replay message sending functions

#### Event Flow

1. **Race Starts** (gate opens):
   - Timer sends `STARTED` message
   - Server calls `send_replay_RACE_STARTS()`
   - Kiosk begins/continues recording

2. **Race Finishes** (results received):
   - Timer sends finish times
   - Server calls `send_replay_REPLAY()`
   - Kiosk plays back the recorded frames

3. **Race Cancelled**:
   - Server calls `send_replay_CANCEL()`
   - Kiosk stops any current playback

#### Message Format

Replay commands follow this format:
```
COMMAND [skipback] [showings] [rate]
```

Examples:
- `RACE_STARTS 4000 2 50` - Race started, record with 4s skipback, 2 showings at 50% speed
- `REPLAY 4000 2 50` - Play replay now
- `CANCEL` - Cancel current replay
- `HELLO` - Handshake/connection test
- `TEST 4000 2 50` - Test replay without actual race

## Communication

### Message Transport

Messages between components use one of three methods (in priority order):

1. **WebSocket (Preferred)**
   - Low latency, persistent connection
   - Server URL configured in `_websocket_url` setting
   - Topic: `replay-commands`

2. **File-based Queue**
   - Location: `$homedir/replay_queue`
   - Uses file locking for concurrent access
   - Polled and drained by replay kiosk

3. **Database Queue**
   - Stored in `RaceInfo.replay_queue` column
   - Fallback if filesystem unavailable

**Key file:** [message-poller.js](website/js/message-poller.js) - Handles WebSocket and AJAX polling

### WebRTC Signaling

Video streaming uses WebRTC with the following flow:

1. Viewer sends **solicitation** to camera (identifies itself, requests stream)
2. Camera creates **offer** (SDP) and sends to viewer
3. Viewer creates **answer** (SDP) and sends to camera
4. Both exchange **ICE candidates** for NAT traversal
5. Direct peer-to-peer video stream established

STUN server: `stun:stun.l.google.com:19302`

## Settings

### Replay Settings (Coordinator Modal)

These settings are configured in the coordinator page under "Replay Settings":

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| **Duration** | 2.5s, 3.0s, 3.5s, 4.0s, 4.5s, 5.0s, 6.0s | 3.0s | How far back to replay (skipback) |
| **Showings** | 1, 2, 3 | 2 | Number of times to play the replay |
| **Speed** | 10%, 25%, 50%, 75%, 100% | 50% | Playback speed (50% = half speed) |

### Video Upload Settings (Settings Page)

| Setting | Type | Description |
|---------|------|-------------|
| **Upload Videos** | Boolean | Enable/disable automatic video upload |
| **Video Directory** | Path | Server directory for storing uploaded videos |

### Database Settings (RaceInfo Table)

| Key | Type | Description |
|-----|------|-------------|
| `replay-skipback` | int (ms) | Replay duration in milliseconds |
| `replay-num-showings` | int | Number of playback iterations |
| `replay-rate` | int (%) | Playback speed percentage |
| `upload-videos` | bool | Video upload enabled |
| `video-directory` | string | Video storage path |
| `_websocket_url` | string | WebSocket server URL |
| `_ws_trigger_port` | string | TCP trigger port (host:port) |
| `replay_state` | enum | Connection state (1=not connected, 2=connected, 3=trouble) |
| `replay_reported` | enum | Current replay status |
| `replay_last_contact` | timestamp | Last successful message time |
| `replay_trouble` | string | Error message if in trouble state |

### Connection Monitoring

The system monitors replay kiosk connectivity:
- **Timeout threshold:** 10 seconds
- If no contact for 10 seconds, state changes to "not connected"
- Coordinator shows connection status icon and time since last contact
- Kiosks send periodic "HELLO" messages to maintain connection

## Coordinator Interface

The coordinator page ([coordinator.php](website/coordinator.php)) provides:

1. **Status Display**
   - Connection state indicator (connected/not connected/trouble)
   - Time since last contact
   - Current replay status

2. **Controls**
   - "Trigger Replay" button - Manually trigger a test replay
   - "Replay Settings" button - Open settings modal

## Kiosk Deployment

Replay kiosks are managed through the kiosk dashboard:

**Key files:**
- [kiosk.php](website/kiosk.php) - Kiosk display page
- [kiosk-dashboard.php](website/kiosk-dashboard.php) - Kiosk management

Kiosks can be:
- Assigned to specific display pages/scenes
- Configured with parameters via URL query strings
- Identified by machine address for persistent assignment

## Typical Setup

### Basic Setup (Single Machine)

1. Open replay.php on a display machine
2. Select the local USB camera
3. Configure replay settings in coordinator
4. Timer events automatically trigger replays

### Remote Camera Setup (Headless Raspberry Pi)

1. Install headless camera on Raspberry Pi
2. Configure `config.yaml` with server URL
3. Start service: `sudo systemctl start derbynet-camera`
4. Open replay.php on display machine
5. Select "remote" as video source
6. WebRTC connection established automatically

### Multiple Displays

1. Configure WebSocket server for reliable messaging
2. Open replay.php on each display machine
3. All displays receive same replay commands
4. Each establishes WebRTC connection to camera
