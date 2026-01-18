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

  // Start signaling - listen for viewer solicitations
  this.startSignaling = function() {
    let dispatcher = {};

    self.poller = new MessagePoller(
      self.sourceName,
      function(msg) {
        if (dispatcher.hasOwnProperty(msg.from)) {
          dispatcher[msg.from].on_message(msg);
        } else if (msg.type != 'solicitation') {
          console.log('Received non-solicitation from unknown sender:', msg);
          return;
        } else {
          self.log('New viewer: ' + msg.from);
          let client = new ViewClient(msg.from, self.poller);
          client.setstream(self.stream);
          dispatcher[msg.from] = client;
          client.on_solicitation(msg);

          self.viewerCount++;
          self.onViewerCountChange(self.viewerCount);
        }
      }
    );

    self.log('Camera signaling started');
  };

  // Update the stream being broadcast
  this.setStream = function(newStream) {
    self.stream = newStream;
    // Note: existing connections would need to be updated for a new stream
    // For simplicity, we expect the stream to be set before viewers connect
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
