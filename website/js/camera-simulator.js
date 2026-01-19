'use strict';

// CameraSimulator handles WebRTC streaming of the canvas animation
// Reuses patterns from camera-signaling.js but for a canvas source instead of getUserMedia
function CameraSimulator(stream, options) {
  let self = this;

  // Configuration
  this.stream = stream;
  this.sourceName = options.sourceName || 'camera-replay';

  // State
  this.viewerCount = 0;
  this.fps = 0;
  this.fpsFrameCount = 0;
  this.fpsLastTime = performance.now();

  // Callbacks
  this.onViewerCountChange = options.onViewerCountChange || function() {};
  this.onFpsUpdate = options.onFpsUpdate || function() {};
  this.onLog = options.onLog || function() {};

  // ViewClient represents a remote viewer receiving the stream
  function ViewClient(recipient, poller) {
    let pc = new RTCPeerConnection({
      'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}]
    });

    // Connection state change handler
    pc.onconnectionstatechange = function(event) {
      self.log('Connection state to ' + recipient + ': ' + pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Remove this client from dispatcher when connection is closed
        if (self.dispatcher && self.dispatcher[recipient]) {
          delete self.dispatcher[recipient];
          self.viewerCount = Math.max(0, self.viewerCount - 1);
          self.onViewerCountChange(self.viewerCount);
        }
      }
    };

    // Local ICE candidate
    pc.onicecandidate = function(event) {
      if (event.candidate) {
        self.log('ICE candidate: ' + event.candidate.type);
        poller.send_message({
          recipient: recipient,
          type: 'ice-candidate',
          from: self.sourceName,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.onnegotiationneeded = function(event) {
      pc.setLocalDescription()
        .then(function() {
          self.log('Sending offer to ' + recipient);
          poller.send_message({
            recipient: recipient,
            type: 'offer',
            from: self.sourceName,
            sdp: pc.localDescription.toJSON()
          });
        });
    };

    this.connection = pc;

    this.setstream = function(stream) {
      stream.getTracks().forEach(function(track) {
        pc.addTrack(track, stream);
      });
    };

    this.on_message = function(msg) {
      if (msg.type == 'answer') {
        this.on_answer(msg);
      } else if (msg.type == 'ice-candidate') {
        this.on_ice_candidate(msg);
      } else {
        console.error('Unrecognized message:', msg);
      }
    };

    this.on_answer = function(msg) {
      self.log('Received answer from ' + recipient);
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    };

    this.on_ice_candidate = function(msg) {
      let candidate = new RTCIceCandidate(msg.candidate);
      pc.addIceCandidate(candidate);
    };

    this.on_solicitation = function(msg) {
      self.log('Solicitation from ' + recipient);
      this.convey_offer();
    };

    this.convey_offer = function() {
      pc.createOffer()
        .then(function(offer) {
          return pc.setLocalDescription(offer);
        })
        .then(function() {
          self.log('Sending offer to ' + recipient);
          poller.send_message({
            recipient: recipient,
            type: 'offer',
            from: self.sourceName,
            sdp: pc.localDescription.toJSON()
          });
        });
    };
  }

  // ViewClientManager manages all viewer connections
  this.clientManager = null;
  this.poller = null;
  this.dispatcher = null;
  this.signalingActive = false;

  // Start signaling - listen for viewer solicitations
  this.startSignaling = function() {
    if (self.signalingActive) {
      self.log('Camera signaling already active');
      return;
    }

    self.dispatcher = {};

    self.poller = new MessagePoller(
      self.sourceName,
      function(msg) {
        // Reject all messages if signaling is not active
        if (!self.signalingActive) {
          return;
        }

        if (self.dispatcher.hasOwnProperty(msg.from)) {
          self.dispatcher[msg.from].on_message(msg);
        } else if (msg.type != 'solicitation') {
          console.log('Received non-solicitation from unknown sender:', msg);
          return;
        } else {
          self.log('New viewer: ' + msg.from);
          let client = new ViewClient(msg.from, self.poller);
          client.setstream(self.stream);
          self.dispatcher[msg.from] = client;
          client.on_solicitation(msg);

          self.viewerCount++;
          self.onViewerCountChange(self.viewerCount);
        }
      }
    );

    self.signalingActive = true;
    self.log('Camera signaling started');
  };

  // Stop signaling - disconnect from message poller and close connections
  this.stopSignaling = function() {
    if (!self.signalingActive) {
      return;
    }

    self.log('Camera signaling stopping');

    // Set this first to prevent race conditions where new solicitations
    // might be processed before the poller stops
    self.signalingActive = false;

    // Stop the message poller
    if (self.poller) {
      self.poller.close();
      self.poller = null;
    }

    // Close all viewer connections
    if (self.dispatcher) {
      for (let viewerId in self.dispatcher) {
        if (self.dispatcher.hasOwnProperty(viewerId)) {
          let client = self.dispatcher[viewerId];
          if (client.connection) {
            self.log('Closing connection to ' + viewerId);
            client.connection.close();
          }
        }
      }
      self.dispatcher = {};
    }

    // Note: We don't stop the canvas stream tracks because:
    // 1. Canvas streams can't be restarted once stopped
    // 2. The stream is needed for the animation to continue rendering
    // 3. With no viewers connected, the stream effectively goes nowhere
    // This is different from a camera stream where stopping tracks saves resources

    self.viewerCount = 0;
    self.onViewerCountChange(0);
    // signalingActive already set to false at the start of this function
    self.log('Camera signaling stopped');
  };

  // Update the stream being broadcast
  this.setStream = function(newStream) {
    // If we have existing connections, we need to close them
    // because they're using the old stream
    if (self.dispatcher && Object.keys(self.dispatcher).length > 0) {
      self.log('Closing existing connections for new stream');
      for (let viewerId in self.dispatcher) {
        if (self.dispatcher.hasOwnProperty(viewerId)) {
          let client = self.dispatcher[viewerId];
          if (client.connection) {
            client.connection.close();
          }
        }
      }
      self.dispatcher = {};
      self.viewerCount = 0;
      self.onViewerCountChange(0);
    }

    self.stream = newStream;
  };

  // Update FPS counter (call this from animation loop)
  this.countFrame = function() {
    self.fpsFrameCount++;
    let now = performance.now();
    let elapsed = now - self.fpsLastTime;

    if (elapsed >= 1000) {
      self.fps = Math.round(self.fpsFrameCount * 1000 / elapsed);
      self.fpsFrameCount = 0;
      self.fpsLastTime = now;
      self.onFpsUpdate(self.fps);
    }
  };

  // Get current viewer count
  this.getViewerCount = function() {
    return self.viewerCount;
  };

  // Get current FPS
  this.getFps = function() {
    return self.fps;
  };

  // Log helper
  this.log = function(message) {
    self.onLog(message, 'camera');
  };
}
