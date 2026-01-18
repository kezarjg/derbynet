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
      laneCount: parseInt($('#lane-count').val(), 10),
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
      laneCount: $('#lane-count').val(),
      timingMode: $('#timing-mode').val(),
      dnfProbability: $('#dnf-probability').val(),
      tieProbability: $('#tie-probability').val(),
      preDelay: $('#pre-delay').val(),
      postDelay: $('#post-delay').val(),
      includeAnomalies: $('#include-anomalies').is(':checked')
    };
    localStorage.setItem('raceSimulatorSettings', JSON.stringify(settings));
  }

  // Load settings from localStorage
  function loadSettings() {
    let saved = localStorage.getItem('raceSimulatorSettings');
    if (saved) {
      try {
        let settings = JSON.parse(saved);
        if (settings.laneCount) $('#lane-count').val(settings.laneCount);
        if (settings.timingMode) $('#timing-mode').val(settings.timingMode);
        if (settings.dnfProbability) $('#dnf-probability').val(settings.dnfProbability);
        if (settings.tieProbability) $('#tie-probability').val(settings.tieProbability);
        if (settings.preDelay) $('#pre-delay').val(settings.preDelay);
        if (settings.postDelay) $('#post-delay').val(settings.postDelay);
        if (typeof settings.includeAnomalies !== 'undefined') {
          $('#include-anomalies').prop('checked', settings.includeAnomalies);
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }

    // Set initial lane count from server if available
    if (typeof g_initial_lane_count !== 'undefined' && g_initial_lane_count > 0) {
      $('#lane-count').val(g_initial_lane_count);
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
        let anomalyType = Math.floor(Math.random() * 3);
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
  function runRace() {
    if (!timer || !timer.connected || !timer.pendingHeat) {
      log('Cannot start race: no heat ready', 'error');
      return;
    }

    let settings = getSettings();
    let laneMask = timer.currentLaneMask;
    let laneCount = settings.laneCount;

    // Generate finish times
    let times = generateFinishTimes(laneCount, laneMask, settings);
    let places = calculatePlaces(times);

    // Filter out null times for display
    let validTimes = times.filter(function(t) { return t !== null && t > 0; });
    let maxTime = validTimes.length > 0 ? Math.max.apply(null, validTimes) : 4;

    log('Starting race (max time: ' + maxTime.toFixed(3) + 's)');

    // Send STARTED
    timer.sendStarted();

    // Start animation
    track.startRace(times);

    // Schedule FINISHED after max time
    raceTimeout = setTimeout(function() {
      timer.sendFinished(times, places);
      stats.races++;
      updateStats();

      // If auto mode, schedule next race
      if (autoMode && running) {
        raceTimeout = setTimeout(function() {
          if (running && timer.pendingHeat) {
            runRace();
          }
        }, settings.postDelay);
      }
    }, maxTime * 1000 + 100); // Add small buffer
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

    log('Auto mode started');

    // Connect timer if not connected
    if (!timer.connected) {
      timer.connect();
    } else if (timer.pendingHeat) {
      // Start racing after pre-delay
      let settings = getSettings();
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

    // Reconnect
    setTimeout(function() {
      timer.connect();
    }, 500);
  }

  // Initialize components
  function init() {
    loadSettings();

    let settings = getSettings();

    // Initialize track animation
    let canvas = document.getElementById('track-canvas');
    track = new TrackAnimation(canvas, {
      laneCount: settings.laneCount,
      laneMask: 0xFF
    });

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
      laneCount: settings.laneCount,
      timerName: 'RaceSimulator',
      humanName: 'Race Simulator',
      onStateChange: function(state) {
        updateTimerStatus(state);

        if (state === 'ready' && autoMode && running) {
          // Heat ready, start race after delay
          let s = getSettings();
          raceTimeout = setTimeout(function() {
            if (running && timer.pendingHeat) {
              runRace();
            }
          }, s.preDelay);
        }
      },
      onHeatReady: function(heat) {
        updateHeatInfo(heat);
        track.setLaneMask(heat.laneMask);
        track.reset();
      },
      onRacersLoaded: function(carNumbers) {
        track.setCarNumbers(carNumbers);
      },
      onAbort: function() {
        if (raceTimeout) {
          clearTimeout(raceTimeout);
          raceTimeout = null;
        }
        track.reset();
        log('Race aborted', 'error');
      },
      onLog: log
    });

    // Start camera signaling
    camera.startSignaling();

    // Connect timer
    timer.connect();

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
    if (!timer.pendingHeat) {
      log('No heat ready for single race', 'error');
      return;
    }
    runRace();
  });

  $('#inject-dnf-btn').on('click', function() {
    injectDnfNext = true;
    log('DNF injection queued for next race');
  });

  $('#inject-anomaly-btn').on('click', function() {
    injectAnomalyNext = true;
    log('Anomaly injection queued for next race');
  });

  // Settings changes
  $('#lane-count').on('change', function() {
    let count = parseInt($(this).val(), 10);
    track.setLaneCount(count);
    timer.setLaneCount(count);
    saveSettings();
  });

  $('#timing-mode, #dnf-probability, #tie-probability, #pre-delay, #post-delay, #include-anomalies')
    .on('change', saveSettings);

  // Initialize
  init();
});
