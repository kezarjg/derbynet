'use strict';

// RaceSimulator - Main controller coordinating timer, animation, and camera
$(function() {
  // Components
  let timer = null;
  let track = null;
  let camera = null;

  // State
  let running = false;
  let autoMode = false;
  let raceTimeout = null;
  let startTime = null;
  let timerEnabled = true;
  let cameraEnabled = true;

  // Injection flags (one-shot)
  let injectDnfNext = false;
  let injectAnomalyNext = false;

  // Statistics
  let stats = {
    races: 0,
    dnfs: 0,
    ties: 0,
    anomalies: 0
  };

  // Settings (loaded from UI)
  function getSettings() {
    return {
      laneCount: timer.laneCount,  // Always use server's lane count
      timingMode: $('#timing-mode').val(),
      dnfProbability: parseInt($('#dnf-probability').val(), 10) / 100,
      tieProbability: parseInt($('#tie-probability').val(), 10) / 100,
      preDelay: parseInt($('#pre-delay').val(), 10) * 1000,
      postDelay: parseInt($('#post-delay').val(), 10) * 1000,
      includeAnomalies: $('#include-anomalies').is(':checked')
    };
  }

  // Save settings to localStorage
  function saveSettings() {
    let settings = {
      timingMode: $('#timing-mode').val(),
      dnfProbability: $('#dnf-probability').val(),
      tieProbability: $('#tie-probability').val(),
      preDelay: $('#pre-delay').val(),
      postDelay: $('#post-delay').val(),
      includeAnomalies: $('#include-anomalies').is(':checked'),
      timerEnabled: $('#timer-enabled').is(':checked'),
      cameraEnabled: $('#camera-enabled').is(':checked')
    };
    localStorage.setItem('raceSimulatorSettings', JSON.stringify(settings));
  }

  // Load settings from localStorage
  function loadSettings() {
    let saved = localStorage.getItem('raceSimulatorSettings');
    if (saved) {
      try {
        let settings = JSON.parse(saved);
        if (settings.timingMode) $('#timing-mode').val(settings.timingMode);
        if (settings.dnfProbability) $('#dnf-probability').val(settings.dnfProbability);
        if (settings.tieProbability) $('#tie-probability').val(settings.tieProbability);
        if (settings.preDelay) $('#pre-delay').val(settings.preDelay);
        if (settings.postDelay) $('#post-delay').val(settings.postDelay);
        if (typeof settings.includeAnomalies !== 'undefined') {
          $('#include-anomalies').prop('checked', settings.includeAnomalies);
        }
        if (typeof settings.timerEnabled !== 'undefined') {
          $('#timer-enabled').prop('checked', settings.timerEnabled);
          timerEnabled = settings.timerEnabled;
        }
        if (typeof settings.cameraEnabled !== 'undefined') {
          $('#camera-enabled').prop('checked', settings.cameraEnabled);
          cameraEnabled = settings.cameraEnabled;
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }

    // Apply initial panel states
    updatePanelState('timer-status-panel', timerEnabled);
    updatePanelState('camera-status-panel', cameraEnabled);
  }

  // Update panel visual state
  function updatePanelState(panelId, enabled) {
    if (enabled) {
      $('#' + panelId).removeClass('disabled');
    } else {
      $('#' + panelId).addClass('disabled');
    }
  }

  // Event log
  function log(message, type) {
    type = type || 'race';
    let time = new Date().toLocaleTimeString();
    let entry = $('<div class="log-entry">' +
      '<span class="log-time">' + time + '</span>' +
      '<span class="log-type ' + type + '">' + type.toUpperCase() + '</span>' +
      '<span class="log-message">' + message + '</span>' +
      '</div>');
    $('#event-log').prepend(entry);

    // Limit log entries
    let entries = $('#event-log .log-entry');
    if (entries.length > 100) {
      entries.slice(100).remove();
    }
  }

  // Generate finish times based on settings
  function generateFinishTimes(laneCount, laneMask, settings) {
    let times = [];
    let lastTime = null;
    let hasDnf = false;
    let hasTie = false;
    let hasAnomaly = false;

    for (let i = 0; i < laneCount; i++) {
      // Check if lane is active
      if ((laneMask & (1 << i)) === 0) {
        times.push(null);
        continue;
      }

      // Check for forced DNF injection
      if (injectDnfNext && !hasDnf) {
        times.push(null);
        hasDnf = true;
        injectDnfNext = false;
        stats.dnfs++;
        continue;
      }

      // Check for DNF probability
      if (Math.random() < settings.dnfProbability) {
        times.push(null);
        hasDnf = true;
        stats.dnfs++;
        continue;
      }

      let time;

      // Check for anomaly injection
      if ((injectAnomalyNext || (settings.includeAnomalies && Math.random() < 0.02)) && !hasAnomaly) {
        let anomalyType = Math.floor(Math.random() * 4);
        switch (anomalyType) {
          case 0: // Very fast
            time = 1.5 + Math.random() * 0.5;
            log('Anomaly: very fast time (' + time.toFixed(3) + 's)', 'error');
            break;
          case 1: // Very slow
            time = 8 + Math.random() * 2;
            log('Anomaly: very slow time (' + time.toFixed(3) + 's)', 'error');
            break;
          case 2: // Negative (sensor glitch)
            time = -0.001;
            log('Anomaly: negative time', 'error');
            break;
          case 3: // Out-of-order finish
            // Lane finishes before previous lane even started (very early time)
            // This simulates a sensor malfunction where timing is completely wrong
            if (lastTime !== null && lastTime > 1.0) {
              time = 0.5; // Impossibly early compared to last lane
              log('Anomaly: out-of-order finish (lane finished before others started)', 'error');
            } else {
              // Fallback to very fast if conditions don't allow out-of-order
              time = 1.5 + Math.random() * 0.5;
              log('Anomaly: very fast time (' + time.toFixed(3) + 's)', 'error');
            }
            break;
        }
        hasAnomaly = true;
        injectAnomalyNext = false;
        stats.anomalies++;
        times.push(time);
        lastTime = time;
        continue;
      }

      // Generate time based on mode
      switch (settings.timingMode) {
        case 'realistic':
          time = normalRandom(3.2, 0.4);
          break;
        case 'fast':
          time = normalRandom(2.7, 0.15);
          break;
        case 'spread':
          time = 2.5 + (i * 0.5) + normalRandom(0, 0.1);
          break;
        default:
          time = normalRandom(3.2, 0.4);
      }

      // Check for tie probability
      if (lastTime !== null && Math.random() < settings.tieProbability) {
        time = lastTime;
        hasTie = true;
        stats.ties++;
      }

      // Clamp to reasonable range
      time = Math.max(2.0, Math.min(9.999, time));
      times.push(time);
      lastTime = time;
    }

    return times;
  }

  // Normal distribution random number (Box-Muller transform)
  function normalRandom(mean, stddev) {
    let u1 = Math.random();
    let u2 = Math.random();
    let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  // Calculate places from times
  function calculatePlaces(times) {
    let indexed = times.map(function(t, i) { return {time: t, lane: i}; });
    let valid = indexed.filter(function(x) { return x.time !== null && x.time > 0; });
    valid.sort(function(a, b) { return a.time - b.time; });

    let places = new Array(times.length).fill(null);
    for (let i = 0; i < valid.length; i++) {
      places[valid[i].lane] = i + 1;
    }
    return places;
  }

  // Run a single race
  // The animation and timer now work asynchronously:
  // 1. Animation starts and triggers timer.startRace() via onRaceStart callback
  // 2. As cars cross finish line, animation reports times via onLaneFinish callback
  // 3. Timer sends results immediately when all lanes finish OR timeout occurs (DNF)
  // 4. Animation continues independently for visual display
  function runRace() {
    let settings = getSettings();
    let laneCount = settings.laneCount;
    let laneMask;

    // Get lane mask from timer (single source of truth)
    if (timerEnabled) {
      if (!timer || !timer.connected || !timer.pendingHeat) {
        log('Cannot start race: no heat ready', 'error');
        return;
      }
      laneMask = timer.currentLaneMask;
    } else {
      // Timer disabled - use all lanes
      laneMask = (1 << laneCount) - 1;
    }

    // Generate finish times (null for DNF - animation will show car stopping mid-track)
    let times = generateFinishTimes(laneCount, laneMask, settings);

    // Filter out null times for display
    let validTimes = times.filter(function(t) { return t !== null && t > 0; });
    let maxTime = validTimes.length > 0 ? Math.max.apply(null, validTimes) : 4;
    let hasDnf = times.some(function(t, i) {
      return (laneMask & (1 << i)) !== 0 && t === null;
    });

    log('Starting race (max time: ' + maxTime.toFixed(3) + 's)' +
        (hasDnf ? ' [has DNF]' : '') +
        (timerEnabled ? '' : ' [visual only]'));

    // Start animation - this will trigger onRaceStart callback which starts the timer
    // The animation's onLaneFinish callback will report times to the timer
    // DNF cars don't report times - the timer will timeout after 10s
    track.startRace(times);
  }

  // Start next race (called after post-race delay completes in animation)
  function startNextRace() {
    let settings = getSettings();

    if (autoMode && running) {
      // If timer disabled, always run next race; if enabled, need pending heat
      if (!timerEnabled || timer.pendingHeat) {
        // Start staging for next race
        track.startStaging();
        raceTimeout = setTimeout(function() {
          if (running) runRace();
        }, settings.preDelay);
      } else {
        // No next heat ready, end the sequence
        track.endSequence();
      }
    } else {
      // Single race mode - end the sequence
      track.endSequence();
    }
  }

  // Update statistics display
  function updateStats() {
    $('#race-count').text(stats.races);
    $('#dnf-count').text(stats.dnfs);
    $('#tie-count').text(stats.ties);
    $('#anomaly-count').text(stats.anomalies);
  }

  // Update runtime display
  function updateRuntime() {
    if (!startTime) {
      $('#runtime').text('00:00:00');
      return;
    }
    let elapsed = Math.floor((Date.now() - startTime) / 1000);
    let hours = Math.floor(elapsed / 3600);
    let minutes = Math.floor((elapsed % 3600) / 60);
    let seconds = elapsed % 60;
    $('#runtime').text(
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0')
    );
  }

  // Update timer status display
  function updateTimerStatus(state) {
    let $state = $('#timer-state');
    $state.text(state.charAt(0).toUpperCase() + state.slice(1));
    $state.removeClass('connected disconnected racing ready');
    $state.addClass(state);
  }

  // Update heat info display
  function updateHeatInfo(heat) {
    if (heat) {
      $('#heat-info').text(heat.className + ' R' + heat.round + ' H' + heat.heat);
      $('#lane-mask').text(heat.laneMask.toString(2).padStart(timer.laneCount, '0'));
    } else {
      $('#heat-info').text('--');
      $('#lane-mask').text('--');
    }
  }

  // Start automatic racing
  function startAuto() {
    if (running) return;

    running = true;
    autoMode = true;
    startTime = Date.now();

    $('#start-btn').prop('disabled', true);
    $('#stop-btn').prop('disabled', false);

    log('Auto mode started' + (timerEnabled ? '' : ' [visual only]'));

    if (timerEnabled) {
      // Connect timer if not connected
      if (!timer.connected) {
        timer.connect();
      } else if (timer.pendingHeat) {
        // Start staging phase and race after pre-delay
        let settings = getSettings();
        track.startStaging();
        raceTimeout = setTimeout(function() {
          if (running) runRace();
        }, settings.preDelay);
      }
    } else {
      // Timer disabled - start staging and race after pre-delay
      let settings = getSettings();
      track.startStaging();
      raceTimeout = setTimeout(function() {
        if (running) runRace();
      }, settings.preDelay);
    }
  }

  // Stop automatic racing
  function stopAuto() {
    running = false;
    autoMode = false;

    if (raceTimeout) {
      clearTimeout(raceTimeout);
      raceTimeout = null;
    }

    // Abort any in-progress race timing
    if (timerEnabled && timer && timer.raceInProgress) {
      timer.abortRace();
    }

    $('#start-btn').prop('disabled', false);
    $('#stop-btn').prop('disabled', true);

    log('Auto mode stopped');
  }

  // Reset everything
  function reset() {
    stopAuto();

    if (timer) {
      timer.disconnect();
    }

    track.reset();

    stats = { races: 0, dnfs: 0, ties: 0, anomalies: 0 };
    startTime = null;
    updateStats();
    updateRuntime();
    updateTimerStatus('disconnected');
    updateHeatInfo(null);

    log('Simulator reset');

    // Reconnect timer if enabled
    if (timerEnabled) {
      setTimeout(function() {
        timer.connect();
      }, 500);
    } else {
      updateTimerStatus('disabled');
    }
  }

  // Initialize components
  function init() {
    loadSettings();

    // Use server's lane count for initialization
    let initialLaneCount = typeof g_initial_lane_count !== 'undefined' ? g_initial_lane_count : 4;
    let postDelay = parseInt($('#post-delay').val(), 10) * 1000;

    // Initialize track animation with callbacks for async timer interaction
    let canvas = document.getElementById('track-canvas');
    track = new TrackAnimation(canvas, {
      laneCount: initialLaneCount,
      laneMask: 0xFF,
      reverseLanes: typeof g_reverse_lanes !== 'undefined' ? g_reverse_lanes : false,
      postRaceDelay: postDelay,

      // Called when the race starts (gate opens)
      // Use async pattern to prevent blocking animation
      onRaceStart: function() {
        if (timerEnabled) {
          setTimeout(function() {
            timer.startRace();
          }, 0);
        }
      },

      // Called when a car crosses the finish line
      // lane: 0-indexed visual lane
      // time: finish time in seconds
      // Use async pattern to prevent blocking animation
      onLaneFinish: function(lane, time) {
        if (timerEnabled) {
          setTimeout(function() {
            timer.reportLaneTime(lane, time);
          }, 0);
        }
      },

      // Called when post-race delay completes (cars have been on finish line)
      // Use async pattern to prevent blocking animation
      onAllFinished: function() {
        setTimeout(function() {
          // If timer is disabled, we need to increment stats here
          // (if timer is enabled, onRaceFinished already handled it)
          if (!timerEnabled) {
            stats.races++;
            updateStats();
          }
          // Always call startNextRace after post-race delay completes
          startNextRace();
        }, 0);
      }
    });

    // Start continuous render loop for streaming
    track.startRenderLoop();

    // Initialize camera simulator with canvas stream
    let stream = track.getStream(30);
    camera = new CameraSimulator(stream, {
      sourceName: 'camera-replay',
      onViewerCountChange: function(count) {
        $('#viewer-count').text(count);
        $('#stream-status').text(count > 0 ? 'Active' : 'Waiting');
      },
      onFpsUpdate: function(fps) {
        $('#camera-fps').text(fps);
      },
      onLog: log
    });

    // Initialize timer simulator
    timer = new TimerSimulator({
      laneCount: initialLaneCount,
      timerName: 'RaceSimulator',
      humanName: 'Race Simulator',
      onStateChange: function(state) {
        updateTimerStatus(state);

        // Don't start staging here in auto mode - let startNextRace() handle it
        // after the post-race delay completes via onAllFinished callback
        // This prevents interrupting the post-race delay visualization
      },
      onHeatReady: function(heat) {
        updateHeatInfo(heat);
        // Update track's lane mask for visual display (synced with timer.currentLaneMask)
        track.setLaneMask(heat.laneMask);
        // Don't reset here - let the race cycle handle it
        // Resetting here would interrupt the post-race delay visualization
      },
      onRacersLoaded: function(carNumbers) {
        track.setCarNumbers(carNumbers);
      },
      onAbort: function() {
        if (raceTimeout) {
          clearTimeout(raceTimeout);
          raceTimeout = null;
        }
        timer.abortRace();
        track.reset();
        log('Race aborted', 'error');
      },
      // Called when timer sends results to server (all lanes finished or timeout)
      onRaceFinished: function(times, places) {
        stats.races++;
        updateStats();
        // Don't call startNextRace() here - let onAllFinished handle it after post-race delay
      },
      onLog: log
    });

    // Start camera signaling (if enabled)
    if (cameraEnabled) {
      camera.startSignaling();
    } else {
      $('#stream-status').text('Disabled');
    }

    // Connect timer (if enabled)
    if (timerEnabled) {
      timer.connect();
    } else {
      updateTimerStatus('disabled');
    }

    // Set up runtime timer
    setInterval(updateRuntime, 1000);

    // Set up heartbeat age display
    setInterval(function() {
      let age = timer.getHeartbeatAge();
      if (age !== null) {
        $('#heartbeat-age').text(age.toFixed(1) + 's ago');
      }
    }, 500);

    log('Simulator initialized');
  }

  // Event handlers
  $('#start-btn').on('click', startAuto);
  $('#stop-btn').on('click', stopAuto);
  $('#reset-btn').on('click', reset);

  $('#single-race-btn').on('click', function() {
    if (timerEnabled && !timer.pendingHeat) {
      log('No heat ready for single race', 'error');
      return;
    }
    // Start staging phase, then race after pre-delay
    let settings = getSettings();
    track.startStaging();
    raceTimeout = setTimeout(function() {
      runRace();
    }, settings.preDelay);
  });

  $('#inject-dnf-btn').on('click', function() {
    injectDnfNext = true;
    log('DNF injection queued for next race');
  });

  $('#inject-anomaly-btn').on('click', function() {
    injectAnomalyNext = true;
    log('Anomaly injection queued for next race');
  });

  $('#inject-malfunction-btn').on('click', function() {
    if (!timerEnabled || !timer.connected) {
      log('Cannot inject malfunction - timer not connected', 'error');
      return;
    }
    timer.sendMalfunction('Simulated timer malfunction');
    log('MALFUNCTION message sent', 'error');
  });

  // Settings changes
  $('#timing-mode, #dnf-probability, #tie-probability, #pre-delay, #include-anomalies')
    .on('change', saveSettings);

  $('#post-delay').on('change', function() {
    let delayMs = parseInt($(this).val(), 10) * 1000;
    track.setPostRaceDelay(delayMs);
    saveSettings();
  });

  // Timer toggle
  $('#timer-enabled').on('change', function() {
    timerEnabled = $(this).is(':checked');
    updatePanelState('timer-status-panel', timerEnabled);
    saveSettings();

    if (timerEnabled) {
      log('Timer enabled');
      timer.connect();
    } else {
      log('Timer disabled');
      timer.disconnect();
      updateTimerStatus('disabled');
      updateHeatInfo(null);
    }
  });

  // Camera toggle
  $('#camera-enabled').on('change', function() {
    cameraEnabled = $(this).is(':checked');
    updatePanelState('camera-status-panel', cameraEnabled);
    saveSettings();

    if (cameraEnabled) {
      log('Camera enabled');
      // The stream is already set during init, just start signaling
      camera.startSignaling();
      $('#stream-status').text('Waiting');
    } else {
      log('Camera disabled');
      camera.stopSignaling();
      $('#stream-status').text('Disabled');
    }
  });

  // Initialize
  init();
});
