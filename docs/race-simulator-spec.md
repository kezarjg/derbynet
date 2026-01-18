# Race Simulator Specification

## Overview

A web-based race simulator that combines timer message generation and synthetic camera feed simulation in a single integrated interface. The simulator enables comprehensive testing of DerbyNet's replay system without requiring physical hardware.

## Goals

1. **Test Replay System**: Validate the complete replay pipeline from race start to video playback
2. **Edge Case Testing**: Simulate DNF, ties, sensor failures, and timing anomalies
3. **Automated Testing**: Run continuous race simulations for stress testing
4. **Development Support**: Enable replay feature development without physical track/timer

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Race Simulator Page                          │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   Timer Simulator   │    │      Camera Simulator           │ │
│  │                     │    │                                 │ │
│  │  - HELLO/IDENTIFIED │    │  - Canvas-based animation       │ │
│  │  - STARTED          │    │  - Lane graphics with cars      │ │
│  │  - FINISHED         │    │  - WebRTC stream output         │ │
│  │  - HEARTBEAT        │    │  - Sync with timer events       │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────┘ │
│             │                              │                     │
│             │ HTTP POST                    │ WebRTC              │
│             ▼                              ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    DerbyNet Server                          ││
│  │  action.php?action=timer-message    WebRTC Signaling        ││
│  └─────────────────────────────────────────────────────────────┘│
│             │                              │                     │
│             │                              │                     │
│             ▼                              ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Replay Kiosk                             ││
│  │  - Receives RACE_STARTS/REPLAY commands                     ││
│  │  - Records frames from simulated camera                     ││
│  │  - Plays back slow-motion replay                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Integration with Existing System

The simulator will:
- Extend the existing `fake-timer.php` patterns
- Use the standard timer-message protocol
- Act as a WebRTC camera source (like `camera.php`)
- Work with the existing `replay.php` kiosk

## Functional Requirements

### FR-1: Timer Simulation

#### FR-1.1: Protocol Messages
The simulator shall send all standard timer messages:
- `HELLO` - Initial connection handshake
- `IDENTIFIED` - Timer identification with lane count, name, identifier
- `STARTED` - Race gate opened signal
- `FINISHED` - Lane times and placements
- `HEARTBEAT` - Periodic keep-alive (1-second interval)
- `MALFUNCTION` - Simulated error conditions (optional trigger)

#### FR-1.2: Heat Response Handling
The simulator shall:
- Parse `<heat-ready>` responses from server
- Extract and respect lane masks
- Display current heat/round information
- Automatically stage the next heat when available

#### FR-1.3: Timing Generation
The simulator shall generate finish times with these modes:

| Mode | Description | Time Range |
|------|-------------|------------|
| Realistic Random | Normal distribution around typical times | 2.8s - 4.2s |
| Fast Pack | Competitive races with close finishes | 2.5s - 3.0s |
| Spread Out | Clear separation between cars | 2.5s - 5.0s |
| Custom | User-specified times per lane | Any |

### FR-2: Edge Case Simulation

#### FR-2.1: Did Not Finish (DNF)
- Configurable DNF probability per lane (0-25%)
- DNF indicated by empty/missing time in FINISHED message
- Visual representation: car stops partway down track

#### FR-2.2: Ties
- Configurable tie probability (0-10%)
- Ties within 0.001s tolerance
- Visual: cars finish simultaneously

#### FR-2.3: Timing Anomalies
| Anomaly | Simulation |
|---------|------------|
| Very fast time | < 2.0 seconds (possible sensor skip) |
| Very slow time | > 8.0 seconds (stuck car) |
| Negative time | -0.001s (sensor glitch) |
| Out-of-order finish | Lane 4 finishes before Lane 1 starts |

#### FR-2.4: Communication Failures
- Dropped FINISHED message (timeout scenario)
- Delayed HEARTBEAT (unhealthy timer)
- MALFUNCTION message injection
- Connection loss and reconnection

### FR-3: Camera Simulation

#### FR-3.1: Visual Elements
The animated track display shall include:
- **Track lanes**: 4-6 parallel lanes (configurable)
- **Cars**: Colored rectangles/shapes per lane
- **Start gate**: Visual gate at top of track
- **Finish line**: Clear finish line indicator
- **Lane numbers**: Labels for each lane
- **Timing overlay**: Current elapsed time display

#### FR-3.2: Animation Behavior

**Pre-race (Staging)**
- Cars positioned at starting gate
- Gate closed indicator
- "Ready" status displayed

**Race in progress**
- Gate opens (visual indication)
- Cars accelerate down track
- Speed corresponds to finish time (faster time = faster visual)
- Cars reach finish line at their designated times

**Post-race**
- Cars remain at finish positions
- Results displayed briefly
- Reset for next heat

#### FR-3.3: WebRTC Streaming
The simulator shall:
- Capture canvas as MediaStream via `captureStream()`
- Respond to viewer solicitations with SDP offers
- Handle ICE candidate exchange
- Support multiple simultaneous viewers
- Target 30 FPS output

#### FR-3.4: Synchronization
Animation timing shall be synchronized with timer events:
- Animation starts on STARTED message send
- Cars reach finish line at exact FINISHED times
- Buffer provides smooth playback when replayed

### FR-4: Automation

#### FR-4.1: Continuous Mode
The simulator shall support fully automated operation:
1. Connect and identify on page load
2. Wait for heat-ready signal
3. Auto-start race after configurable delay (2-10 seconds)
4. Generate times and send FINISHED
5. Wait for next heat-ready
6. Repeat indefinitely

#### FR-4.2: Configurable Intervals
| Setting | Range | Default |
|---------|-------|---------|
| Pre-race delay | 1-30 seconds | 3 seconds |
| Post-race delay | 1-30 seconds | 5 seconds |
| Staging time | 0-10 seconds | 2 seconds |

#### FR-4.3: Race Counter
Display running statistics:
- Total races simulated
- DNFs generated
- Ties generated
- Anomalies injected
- Time since start

### FR-5: User Interface

#### FR-5.1: Layout
```
┌────────────────────────────────────────────────────────────────┐
│  Race Simulator                              [Start] [Stop]    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │                         │  │  Timer Status               │  │
│  │     Track Animation     │  │  ─────────────────────────  │  │
│  │                         │  │  State: Connected           │  │
│  │   [Lane 1] [Lane 2]     │  │  Heat: Round 1, Heat 3      │  │
│  │   [Lane 3] [Lane 4]     │  │  Lane Mask: 1111            │  │
│  │                         │  │  Heartbeat: 1.2s ago        │  │
│  │     ══════════════      │  │                             │  │
│  │        FINISH           │  │  Camera Status              │  │
│  │                         │  │  ─────────────────────────  │  │
│  └─────────────────────────┘  │  Viewers: 1                 │  │
│                               │  FPS: 30                    │  │
│  ┌─────────────────────────┐  │  Stream: Active             │  │
│  │  Settings               │  │                             │  │
│  │  ─────────────────────  │  │  Statistics                 │  │
│  │  Lanes: [4▼]            │  │  ─────────────────────────  │  │
│  │  Mode: [Realistic▼]     │  │  Races: 47                  │  │
│  │  DNF %: [5▼]            │  │  DNFs: 3                    │  │
│  │  Tie %: [2▼]            │  │  Ties: 1                    │  │
│  │  Pre-delay: [3s▼]       │  │  Runtime: 00:23:45          │  │
│  │  □ Include anomalies    │  │                             │  │
│  │  □ Auto-advance         │  └─────────────────────────────┘  │
│  └─────────────────────────┘                                   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────────┤
│  │  Event Log                                                  │
│  │  12:34:56 IDENTIFIED sent (4 lanes, "Race Simulator")       │
│  │  12:34:57 Heat ready: Round 1, Heat 1, mask=15              │
│  │  12:35:00 STARTED sent                                      │
│  │  12:35:03 FINISHED: 2.891, 3.102, 2.756, 3.445              │
│  └─────────────────────────────────────────────────────────────┤
└────────────────────────────────────────────────────────────────┘
```

#### FR-5.2: Controls
- **Start/Stop**: Toggle automatic simulation
- **Manual Race**: Trigger single race manually
- **Reset**: Disconnect and reinitialize
- **Inject DNF**: Force DNF on next race
- **Inject Anomaly**: Force specific anomaly type

#### FR-5.3: Settings Persistence
Settings shall be saved to localStorage:
- Lane count
- Timing mode
- DNF/Tie percentages
- Delay intervals
- Anomaly toggles

## Non-Functional Requirements

### NFR-1: Performance
- Animation shall maintain 30 FPS minimum
- Timer messages shall be sent within 10ms of scheduled time
- WebRTC stream latency shall be < 500ms

### NFR-2: Browser Compatibility
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+ (WebRTC support required)

### NFR-3: Reliability
- Automatic reconnection on connection loss
- Graceful handling of server unavailability
- No memory leaks during extended operation (24+ hours)

### NFR-4: Observability
- All events logged to scrolling event log
- Console logging for debugging
- Visual indicators for connection state

## Technical Design

### File Structure
```
website/
├── race-simulator.php          # Main simulator page
├── js/
│   ├── race-simulator.js       # Core simulator logic
│   ├── track-animation.js      # Canvas animation engine
│   ├── timer-simulator.js      # Timer message handling
│   └── camera-simulator.js     # WebRTC camera output
└── css/
    └── race-simulator.css      # Simulator styles
```

### Key Classes

#### RaceSimulator
Main controller coordinating timer and camera:
```javascript
class RaceSimulator {
  constructor(config)
  start()                    // Begin automatic simulation
  stop()                     // Pause simulation
  runSingleRace()            // Manual race trigger
  setTimingMode(mode)        // Change timing generation
  injectAnomaly(type)        // Force specific anomaly
}
```

#### TimerSimulator
Handles timer protocol:
```javascript
class TimerSimulator {
  constructor(laneCount, identifier)
  connect()                  // Send HELLO/IDENTIFIED
  startRace()                // Send STARTED
  finishRace(times, places)  // Send FINISHED
  sendHeartbeat()            // Periodic heartbeat
  onHeatReady(callback)      // Heat ready handler
}
```

#### TrackAnimation
Canvas-based track visualization:
```javascript
class TrackAnimation {
  constructor(canvas, laneCount)
  reset()                    // Position cars at start
  startRace(finishTimes)     // Begin animation with target times
  getStream()                // Return MediaStream for WebRTC
}
```

#### CameraSimulator
WebRTC camera source:
```javascript
class CameraSimulator {
  constructor(stream)
  startSignaling()           // Begin responding to solicitations
  getViewerCount()           // Current connected viewers
}
```

### Timing Algorithm

Generate realistic finish times with configurable distribution:

```javascript
function generateFinishTimes(laneCount, mode, options) {
  const times = [];

  for (let lane = 0; lane < laneCount; lane++) {
    if (Math.random() < options.dnfProbability) {
      times.push(null);  // DNF
      continue;
    }

    let time;
    switch (mode) {
      case 'realistic':
        // Normal distribution: mean=3.2s, stddev=0.4s
        time = normalRandom(3.2, 0.4);
        break;
      case 'fast':
        time = normalRandom(2.7, 0.15);
        break;
      case 'spread':
        time = 2.5 + (lane * 0.6) + normalRandom(0, 0.1);
        break;
    }

    // Apply tie probability
    if (times.length > 0 && Math.random() < options.tieProbability) {
      time = times[times.length - 1];  // Match previous lane
    }

    times.push(Math.max(2.0, Math.min(9.999, time)));
  }

  return times;
}
```

### Animation Synchronization

The track animation shall use time-based animation synchronized with the timer:

```javascript
class TrackAnimation {
  startRace(finishTimes) {
    this.raceStartTime = performance.now();
    this.finishTimes = finishTimes;
    this.animating = true;
    requestAnimationFrame(this.animate.bind(this));
  }

  animate(timestamp) {
    const elapsed = (timestamp - this.raceStartTime) / 1000;

    for (let lane = 0; lane < this.laneCount; lane++) {
      const finishTime = this.finishTimes[lane];
      if (finishTime === null) {
        // DNF: stop at random position
        this.cars[lane].progress = this.cars[lane].dnfPosition;
      } else {
        // Progress = elapsed / finishTime (0 to 1)
        this.cars[lane].progress = Math.min(1, elapsed / finishTime);
      }
    }

    this.draw();

    if (this.animating && elapsed < Math.max(...this.finishTimes) + 1) {
      requestAnimationFrame(this.animate.bind(this));
    }
  }
}
```

## Test Scenarios

### Scenario 1: Basic Replay Test
1. Start simulator with default settings
2. Open replay.php in another window
3. Verify camera feed appears in replay kiosk
4. Trigger race via coordinator
5. Verify replay captures and plays back race

### Scenario 2: DNF Handling
1. Configure 100% DNF on Lane 1
2. Run race
3. Verify FINISHED message omits Lane 1 time
4. Verify replay shows partial race
5. Verify server correctly records DNF

### Scenario 3: Extended Operation
1. Start simulator in automatic mode
2. Run for 1 hour continuous
3. Monitor memory usage (should remain stable)
4. Verify race count matches expected
5. Check all races recorded in database

### Scenario 4: Connection Recovery
1. Start simulator, verify connected
2. Stop DerbyNet server
3. Verify simulator shows disconnected state
4. Restart server
5. Verify simulator reconnects automatically

## Future Enhancements (Out of Scope)

- Multiple track simulation (parallel races)
- Recorded race playback (load timing data from file)
- Custom car graphics/images
- Sound effects
- Integration with CI/CD test pipelines
- Video file output for offline testing

## Dependencies

- Existing `fake-timer.js` patterns
- Existing `camera-signaling.js` for WebRTC
- Existing `message-poller.js` for server communication
- Canvas API for animation
- MediaStream API for WebRTC source

## Acceptance Criteria

1. [ ] Simulator page loads without errors
2. [ ] Timer connects and identifies successfully
3. [ ] Camera stream visible in replay kiosk
4. [ ] Automatic races run continuously when enabled
5. [ ] DNF scenarios handled correctly
6. [ ] Tie scenarios handled correctly
7. [ ] Anomaly injection works as specified
8. [ ] Settings persist across page reloads
9. [ ] No memory leaks after 100+ races
10. [ ] Documentation updated with simulator usage
