# Race Simulator Specification

## Overview

A web-based race simulator that simulates a typical race day setup where the race crew can stage cars, run races, and manage the finish line. The simulator provides three independent but synchronized components:

1. **Race Animation**: Visual representation of cars racing down the track
2. **Timer Simulator**: Sends standard timer protocol messages to the server (gate drop, finish times)
3. **Camera Simulator**: Provides a WebRTC video feed for replay capture

The race animation runs independently and signals the timer when appropriate (gate opens, cars cross finish line), mimicking how physical hardware operates on race day.

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

The timer simulator acts as a standard timer device, sending protocol messages to the server in response to race events signaled by the animation component.

#### FR-1.1: Protocol Messages
The simulator shall send all standard timer messages:
- `HELLO` - Initial connection handshake
- `IDENTIFIED` - Timer identification with lane count, name, identifier
  - Lane count shall be obtained from the server configuration (not GUI controls)
- `STARTED` - Race gate opened signal (triggered by animation's onRaceStart callback)
- `FINISHED` - Lane times and placements (triggered when all active lanes finish or timeout)
- `HEARTBEAT` - Periodic keep-alive (1-second interval)
- `MALFUNCTION` - Simulated error conditions (optional trigger)

#### FR-1.2: Heat Response Handling
The simulator shall:
- Parse `<heat-ready>` responses from server
- Extract and respect lane masks for inactive lanes
- Display current heat/round/class information
- Automatically stage the next heat when available in auto mode

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

### FR-3: Race Animation (Independent Component)

The race animation runs independently from the timer and camera, simulating the physical race process. It drives the timing of race events and signals the timer when key events occur.

#### FR-3.1: Visual Elements
The animated track display shall include:
- **Track lanes**: 2-6 parallel lanes (from server configuration)
- **Cars**: Colored rectangles per lane with car numbers displayed
- **Start gate**: Visual gate at top of track
- **Finish line**: Clear finish line indicator
- **Lane numbers**: Labels for each lane
- **Timing overlay**: Current elapsed time display
- **Reverse lanes option**: Visual lane ordering based on server setting

#### FR-3.2: Animation Behavior and Race Cycle

The animation shall simulate the complete race day cycle:

**Pre-race (Staging Phase)**
- Duration: Configurable pre-race delay (simulates crew staging cars and dropping gate)
- Default: 3 seconds
- Cars positioned at starting gate
- Gate closed indicator
- Status shows "Staging"

**Race in Progress**
- Gate opens (visual indication) - **triggers onRaceStart callback to timer**
- Cars accelerate down track
- Speed corresponds to finish time (faster time = faster visual)
- When each car crosses finish line - **triggers onLaneFinish callback to timer with lane and time**
- DNF cars stop partway down track and do not trigger finish callback
- Animation continues independently of timer message transmission

**Post-race (Finish Line Phase)**
- Duration: Configurable post-race delay (simulates cars sitting at finish line, audience watching results/replay, until crew picks up cars)
- Default: 5 seconds
- Cars remain at finish positions
- Results displayed on canvas
- After post-race delay completes - **triggers onAllFinished callback**

#### FR-3.3: Animation Modes

**Single Race Mode**
- Execute one complete race cycle: staging → race → post-race
- Return to idle state after completion

**Auto Mode**
- Continuously cycle through races
- After post-race phase, automatically return to staging for next heat
- Continue until stopped or no more heats available

#### FR-3.4: Server Configuration Integration
The animation shall obtain configuration from server (not GUI):
- Lane count from server database
- Reverse lanes setting from server raceinfo
- Lane mask from heat-ready response (marks inactive lanes)
- Car numbers from heat roster

#### FR-3.5: Timer Independence
The animation shall operate independently:
- Animation can run with timer disabled (visual-only mode)
- Animation timing is not blocked by timer message transmission
- Timer receives asynchronous callbacks from animation events
- Animation continues smoothly regardless of server response timing

### FR-4: Camera Simulation

#### FR-4.1: WebRTC Streaming
The simulator shall:
- Capture canvas as MediaStream via `captureStream()`
- Respond to viewer solicitations with SDP offers
- Handle ICE candidate exchange
- Support multiple simultaneous viewers
- Target 30 FPS output

#### FR-4.2: Independence
- Camera can be disabled independently from animation and timer
- Stream continues during all animation phases
- Operates as standard camera source (like camera.php)

### FR-5: Operation Modes

#### FR-5.1: Single Race Mode
When "Single Race" button is clicked:
1. If timer enabled: Require heat-ready state
2. Begin staging phase (pre-race delay)
3. Execute race (animation drives timer via callbacks)
4. Complete post-race phase (cars sit at finish)
5. Return to idle state

#### FR-5.2: Auto Mode
When "Start Auto" button is clicked:
1. If timer enabled: Connect and wait for heat-ready signal
2. Begin first race cycle (staging → race → post-race)
3. After post-race delay, automatically cycle to next heat
4. Repeat indefinitely until stopped or no heats available
5. If timer disabled: Continuously cycle races with generated data

#### FR-5.3: Race Cycle Timing
The complete race cycle timing:

| Phase | Setting | Range | Default | Purpose |
|-------|---------|-------|---------|---------|
| Staging | Pre-race delay | 1-30 sec | 3 sec | Simulates crew staging cars and dropping gate |
| Racing | Variable | 2-10 sec | Based on timing mode | Simulated race duration |
| Finish Line | Post-race delay | 1-30 sec | 5 sec | Simulates cars sitting at finish, audience watching results/replay, crew picking up cars |

#### FR-5.4: Race Counter
Display running statistics:
- Total races simulated
- DNFs generated
- Ties generated
- Anomalies injected
- Runtime since start

### FR-6: User Interface

#### FR-6.1: Layout
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

#### FR-6.2: Controls
- **Start Auto**: Begin continuous race cycling
- **Stop**: Halt automatic operation
- **Single Race**: Execute one race cycle (staging → race → post-race)
- **Reset**: Disconnect timer and reinitialize all components
- **Inject DNF**: Force DNF on next race
- **Inject Anomaly**: Force specific anomaly type

#### FR-6.3: Settings

**GUI Settings** (configurable by user):
- Timing mode (Realistic Random, Fast Pack, Spread Out)
- DNF probability (0-25%)
- Tie probability (0-10%)
- Pre-race delay (1-30 seconds) - simulates staging duration
- Post-race delay (1-30 seconds) - simulates finish line duration
- Include anomalies (checkbox)
- Timer enabled/disabled (toggle)
- Camera enabled/disabled (toggle)

**Server Settings** (obtained from server, not GUI):
- Lane count (from database configuration)
- Reverse lanes (from raceinfo setting)
- Lane mask (from heat-ready response)
- Car numbers and racer names (from heat roster)

Note: GUI includes lane count selector for visual-only mode, but when timer is enabled, server value takes precedence.

#### FR-6.4: Settings Persistence
Settings shall be saved to localStorage:
- Timing mode
- DNF/Tie percentages
- Pre-race and post-race delays
- Anomaly toggles
- Timer enabled/disabled state
- Camera enabled/disabled state
- Lane count (for visual-only mode)

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

#### RaceSimulator (Main Controller)
jQuery-based controller coordinating timer, animation, and camera:
```javascript
// Main state and coordination
var running = false;           // Overall running state
var autoMode = false;          // Continuous cycling mode
var timerEnabled = true;       // Timer component toggle
var cameraEnabled = true;      // Camera component toggle

// Core functions
function startAuto()           // Begin automatic race cycling
function stopAuto()            // Stop automatic operation
function runRace()             // Execute one race (with all phases)
function scheduleNextRace()    // Set up next race after post-delay
function reset()               // Reinitialize all components

// The main controller creates and coordinates three independent components:
// - TimerSimulator: handles timer protocol
// - TrackAnimation: drives the race visualization
// - CameraSimulator: provides WebRTC stream
```

#### TimerSimulator
Handles timer protocol with asynchronous callbacks from animation:
```javascript
function TimerSimulator(options) {
  // State
  this.connected = false;
  this.pendingHeat = null;
  this.currentLaneMask = 0;
  this.raceInProgress = false;
  this.laneTimes = [];       // Collected from onLaneFinish callbacks

  // Configuration callbacks (set by main controller)
  this.onStateChange = function(state) {};
  this.onHeatReady = function(heat) {};
  this.onRacersLoaded = function(carNumbers) {};
  this.onRaceFinished = function(times, places) {};

  // Timer protocol methods
  connect()                   // Send HELLO/IDENTIFIED
  disconnect()                // Stop heartbeat and disconnect
  startRace()                 // Send STARTED (called by animation.onRaceStart)
  reportLaneTime(lane, time)  // Collect lane time (called by animation.onLaneFinish)
  abortRace()                 // Cancel in-progress race

  // Internal: sends FINISHED when all lanes reported or timeout (DNF)
}
```

#### TrackAnimation
Canvas-based track visualization driving the race cycle:
```javascript
function TrackAnimation(canvas, options) {
  // Configuration callbacks (set by main controller)
  this.onRaceStart = function() {};           // Called when gate opens
  this.onLaneFinish = function(lane, time) {};// Called when car crosses finish
  this.onAllFinished = function() {};         // Called when animation complete

  // Configuration
  this.laneCount = 4;
  this.laneMask = 0xFF;
  this.reverseLanes = false;

  // Phase management
  this.phase = 'idle';        // idle, staging, racing, finished

  // Methods
  reset()                     // Return to start position
  startStaging()              // Begin staging phase (pre-race)
  startRace(finishTimes)      // Begin race animation (triggers callbacks)
  endSequence()               // Complete post-race and return to idle
  setLaneCount(count)         // Update lane configuration
  setLaneMask(mask)           // Mark inactive lanes
  setCarNumbers(carNumbers)   // Display car numbers on vehicles
  getStream(fps)              // Return MediaStream for WebRTC
  startRenderLoop()           // Begin continuous canvas rendering

  // Animation cycle:
  // 1. startStaging() → phase = 'staging', cars at gate
  // 2. startRace(times) → phase = 'racing', gate opens → calls onRaceStart()
  // 3. Cars move, cross finish → calls onLaneFinish(lane, time) for each
  // 4. All finished → phase = 'finished', calls onAllFinished()
  // 5. endSequence() → phase = 'idle'
}
```

#### CameraSimulator
WebRTC camera source (independent component):
```javascript
function CameraSimulator(stream, options) {
  // Configuration callbacks
  this.onViewerCountChange = function(count) {};
  this.onFpsUpdate = function(fps) {};
  this.onLog = function(message, type) {};

  // Methods
  startSignaling()            // Begin responding to viewer solicitations
  // Operates continuously once started, independent of race state
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

### Component Independence and Interaction

The three main components operate independently with asynchronous callbacks:

```
┌─────────────────┐
│ TrackAnimation  │ (drives the race cycle)
└────────┬────────┘
         │
         │ Callbacks (async)
         ├──► onRaceStart() ────────┐
         │                          │
         ├──► onLaneFinish(L, T) ───┤
         │                          │
         └──► onAllFinished() ───────┤
                                    │
                          ┌─────────▼─────────┐
                          │  TimerSimulator   │ (receives events)
                          └─────────┬─────────┘
                                    │
                                    │ HTTP POST
                                    ▼
                          ┌───────────────────┐
                          │ DerbyNet Server   │
                          └───────────────────┘

┌─────────────────┐
│ CameraSimulator │ (streams canvas continuously)
└────────┬────────┘
         │ WebRTC
         ▼
  ┌──────────────┐
  │ Replay Kiosk │
  └──────────────┘
```

Key design principles:
1. **Animation drives timing**: The TrackAnimation component controls when events happen
2. **Asynchronous callbacks**: Timer receives notifications but doesn't block animation
3. **Independent operation**: Each component can be disabled without affecting others
4. **Race day simulation**: Mimics physical setup where race happens, timer records it

### Animation Synchronization

The track animation shall use time-based animation with callback triggers:

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

## Additional Implementation Features

The following features are implemented beyond the basic requirements:

### Feature Toggles
- Timer can be disabled for visual-only operation (testing animation without server)
- Camera can be disabled for timer-only operation (testing protocol without video)
- Both toggles persist to localStorage

### Visual Only Mode
When timer is disabled:
- Animation generates random finish times
- No server communication occurs
- All lanes are active (full lane mask)
- Statistics still tracked locally
- Useful for testing animation and camera streaming independently

### DNF Timeout Handling
- Timer waits 10 seconds for all lanes to report
- If timeout occurs, missing lanes are treated as DNF
- DNF time sent as 9.999 seconds in FINISHED message
- Matches real timer behavior for stuck/stopped cars

### Car Number Display
- Fetches racer roster from server for each heat
- Displays car numbers on animated cars
- Handles reverse lane configuration correctly
- Maps visual lanes to RaceChart lane numbers properly

### Continuous Rendering
- Canvas renders continuously at target FPS (30)
- Smooth WebRTC stream even when race is idle
- Reduces startup jitter when race begins
- Provides clean feed for replay capture

### Phase Management
The animation tracks distinct phases:
- **idle**: No activity, waiting for trigger
- **staging**: Pre-race delay in progress, cars at gate
- **racing**: Race in progress, cars moving
- **finished**: Post-race delay in progress, cars at finish line

This enables proper state visualization and prevents race overlap.

### Statistics Tracking
Tracks across all races:
- Total race count
- DNF occurrences
- Tie occurrences
- Anomaly injections
- Total runtime

### Reverse Lanes Support
- Reads reverse-lanes setting from server
- Correctly maps visual lane 0 to physical lane N (when reversed)
- Ensures car numbers appear on correct visual lanes
- Matches coordinator display behavior

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
