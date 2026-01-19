'use strict';

// TimerSimulator handles the timer protocol communication with the DerbyNet server
function TimerSimulator(options) {
  let self = this;

  // Configuration
  this.laneCount = options.laneCount || 4;
  this.timerName = options.timerName || 'RaceSimulator';
  this.humanName = options.humanName || 'Race Simulator';
  this.identifier = options.identifier || 'SIM-' + Math.random().toString(36).substr(2, 8).toUpperCase();

  // State
  this.connected = false;
  this.pendingHeat = null;
  this.currentLaneMask = 0;
  this.currentRacers = [];  // Racers in current heat with car numbers
  this.lastHeartbeat = null;
  this.heartbeatInterval = null;

  // Callbacks
  this.onStateChange = options.onStateChange || function() {};
  this.onHeatReady = options.onHeatReady || function() {};
  this.onRacersLoaded = options.onRacersLoaded || function() {};
  this.onAbort = options.onAbort || function() {};
  this.onLog = options.onLog || function() {};

  // Connect to the server
  this.connect = function() {
    self.log('Connecting to server...');
    self.sendHello();
  };

  // Disconnect from the server
  this.disconnect = function() {
    if (self.heartbeatInterval) {
      clearInterval(self.heartbeatInterval);
      self.heartbeatInterval = null;
    }
    self.connected = false;
    self.pendingHeat = null;
    self.onStateChange('disconnected');
  };

  // Update lane count (requires reconnect)
  this.setLaneCount = function(count) {
    self.laneCount = count;
    if (self.connected) {
      self.sendIdentified();
    }
  };

  // Send HELLO message
  this.sendHello = function() {
    $.ajax('action.php', {
      type: 'POST',
      data: {
        action: 'timer-message',
        message: 'HELLO'
      },
      success: function(data) {
        self.processResponse(data);
        self.sendIdentified();
      },
      error: function(xhr, status, error) {
        self.log('HELLO failed: ' + error, 'error');
        self.onStateChange('error');
      }
    });
  };

  // Send IDENTIFIED message
  this.sendIdentified = function() {
    $.ajax('action.php', {
      type: 'POST',
      data: {
        action: 'timer-message',
        message: 'IDENTIFIED',
        lane_count: self.laneCount,
        timer: self.timerName,
        human: self.humanName,
        ident: self.identifier
      },
      success: function(data) {
        self.connected = true;
        self.log('IDENTIFIED sent (' + self.laneCount + ' lanes, "' + self.humanName + '")');
        self.onStateChange('connected');
        self.processResponse(data);

        // Start heartbeat
        if (!self.heartbeatInterval) {
          self.heartbeatInterval = setInterval(function() {
            self.sendHeartbeat();
          }, 1000);
        }
      },
      error: function(xhr, status, error) {
        self.log('IDENTIFIED failed: ' + error, 'error');
        self.onStateChange('error');
      }
    });
  };

  // Send HEARTBEAT message
  this.sendHeartbeat = function() {
    self.lastHeartbeat = new Date();
    $.ajax('action.php', {
      type: 'POST',
      data: {
        action: 'timer-message',
        message: 'HEARTBEAT',
        confirmed: 1
      },
      success: function(data) {
        self.processResponse(data);
      },
      error: function(xhr, status, error) {
        self.log('HEARTBEAT failed: ' + error, 'error');
      }
    });
  };

  // Send STARTED message (race gate opened)
  this.sendStarted = function() {
    self.log('STARTED sent');
    self.onStateChange('racing');
    $.ajax('action.php', {
      type: 'POST',
      data: {
        action: 'timer-message',
        message: 'STARTED',
        confirmed: 1
      },
      success: function(data) {
        self.processResponse(data);
      },
      error: function(xhr, status, error) {
        self.log('STARTED failed: ' + error, 'error');
      }
    });
  };

  // Send FINISHED message with lane times
  // times: array of times (null for DNF), e.g., [3.123, null, 2.891, 3.445]
  // places: optional array of places, e.g., [2, null, 1, 3]
  this.sendFinished = function(times, places) {
    let data = {
      action: 'timer-message',
      message: 'FINISHED'
    };

    let timeStrings = [];
    for (let i = 0; i < times.length; i++) {
      if (times[i] !== null) {
        data['lane' + (i + 1)] = times[i].toFixed(3);
        timeStrings.push(times[i].toFixed(3));
      } else {
        timeStrings.push('DNF');
      }
      if (places && places[i] !== null) {
        data['place' + (i + 1)] = places[i];
      }
    }

    self.log('FINISHED: ' + timeStrings.join(', '));
    self.onStateChange('connected');

    $.ajax('action.php', {
      type: 'POST',
      data: data,
      success: function(data) {
        self.processResponse(data);
      },
      error: function(xhr, status, error) {
        self.log('FINISHED failed: ' + error, 'error');
      }
    });
  };

  // Send MALFUNCTION message
  this.sendMalfunction = function(errorMessage, detectable) {
    self.log('MALFUNCTION: ' + errorMessage, 'error');
    $.ajax('action.php', {
      type: 'POST',
      data: {
        action: 'timer-message',
        message: 'MALFUNCTION',
        error: errorMessage,
        detectable: detectable ? 1 : 0
      },
      success: function(data) {
        self.processResponse(data);
      }
    });
  };

  // Process server response XML
  this.processResponse = function(data) {
    let $data = $(data);

    // Check for abort
    let abort = $data.find('abort');
    if (abort.length > 0) {
      self.log('Received ABORT');
      self.pendingHeat = null;
      self.onAbort();
      return;
    }

    // Check for heat-ready
    let heat = $data.find('heat-ready');
    if (heat.length > 0) {
      heat = $(heat[0]);
      let heatInfo = {
        roundId: heat.attr('roundid'),
        heat: heat.attr('heat'),
        round: heat.attr('round'),
        className: heat.attr('class'),
        laneMask: parseInt(heat.attr('lane-mask'), 10),
        lanes: parseInt(heat.attr('lanes'), 10)
      };

      // Only notify if this is a new/different heat
      if (!self.pendingHeat ||
          self.pendingHeat.roundId != heatInfo.roundId ||
          self.pendingHeat.heat != heatInfo.heat ||
          self.pendingHeat.laneMask != heatInfo.laneMask) {
        self.pendingHeat = heatInfo;
        self.currentLaneMask = heatInfo.laneMask;
        self.log('Heat ready: ' + heatInfo.className + ', Round ' + heatInfo.round +
                 ', Heat ' + heatInfo.heat + ', mask=' + heatInfo.laneMask.toString(2).padStart(self.laneCount, '0'));
        self.onStateChange('ready');
        self.onHeatReady(heatInfo);
        // Fetch racer details including car numbers
        self.fetchRacers();
      }
    }

    // Check for failure
    let failure = $data.find('failure');
    if (failure.length > 0) {
      self.log('Server failure: ' + failure.text(), 'error');
    }
  };

  // Fetch racers for the current heat
  this.fetchRacers = function() {
    if (!self.pendingHeat) return;

    self.log('Fetching racers...');
    $.ajax('action.php', {
      type: 'GET',
      data: {
        query: 'poll.coordinator'
      },
      dataType: 'json',
      success: function(data) {
        if (data.racers && data.racers.length > 0) {
          self.currentRacers = data.racers;
          // Build a map of lane -> car number
          let carNumbers = {};
          let carNumList = [];
          for (let i = 0; i < data.racers.length; i++) {
            let racer = data.racers[i];
            carNumbers[racer.lane] = {
              carnumber: racer.carnumber,
              name: racer.name,
              carname: racer.carname
            };
            carNumList.push('L' + racer.lane + ':' + racer.carnumber);
          }
          self.log('Loaded racers: ' + carNumList.join(', '));
          self.onRacersLoaded(carNumbers);
        } else {
          self.log('No racers returned for heat', 'error');
        }
      },
      error: function(xhr, status, error) {
        self.log('Failed to fetch racers: ' + error, 'error');
      }
    });
  };

  // Get car number for a lane (1-indexed)
  this.getCarNumber = function(lane) {
    for (let i = 0; i < self.currentRacers.length; i++) {
      if (self.currentRacers[i].lane == lane) {
        return self.currentRacers[i].carnumber;
      }
    }
    return null;
  };

  // Get active lanes from lane mask
  this.getActiveLanes = function() {
    let lanes = [];
    for (let i = 0; i < self.laneCount; i++) {
      if (self.currentLaneMask & (1 << i)) {
        lanes.push(i);
      }
    }
    return lanes;
  };

  // Check if lane is active
  this.isLaneActive = function(laneIndex) {
    return (self.currentLaneMask & (1 << laneIndex)) !== 0;
  };

  // Get time since last heartbeat
  this.getHeartbeatAge = function() {
    if (!self.lastHeartbeat) return null;
    return (new Date() - self.lastHeartbeat) / 1000;
  };

  // Log helper
  this.log = function(message, type) {
    self.onLog(message, type || 'timer');
  };
}
