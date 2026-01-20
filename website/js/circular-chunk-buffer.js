'use strict';

// CircularChunkBuffer: Memory-efficient video buffer using compressed chunks
// Instead of storing uncompressed ImageData frames (~2GB for 4s), this stores
// compressed video chunks (~2-8MB for 4s), reducing memory by 250-1000x.
function CircularChunkBuffer(stream, length_ms) {
  console.log('CCB: length_ms = ', length_ms);

  let this_ccb = this;
  let now_msg = (new Date()).toTimeString().split(" ", 1)[0];

  let resizing_callback = false;
  this.on_resize = function(cb) { resizing_callback = cb; }

  // Takes effect for the next recording, not the current one
  this.set_recording_length = function(number_of_milliseconds) {
    length_ms = number_of_milliseconds;
  }

  // Get stream dimensions
  let stream_settings = stream.getVideoTracks()[0].getSettings();
  console.log('CircularChunkBuffer: stream reports w,h', stream_settings.width, stream_settings.height);

  let stream_width = stream_settings.width || 1280;
  let stream_height = stream_settings.height || 720;

  // For remote streams, dimensions may not be available immediately
  // We'll update them when we get actual video frames
  let dimensions_updated = false;

  // Monitor for stream dimension changes
  stream.getVideoTracks()[0].addEventListener('ended', function() {
    console.log('CCB: stream track ended');
  });

  // Circular buffer for compressed video chunks
  let chunks = [];
  let chunk_times = [];
  let recording = false;
  let recorder = null;
  let recording_start_time = 0;

  // MediaRecorder configuration
  // Try to find the best supported codec
  let mimeType = null;
  let codecs_to_try = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm;codecs=h264',
    'video/webm',
    'video/mp4'
  ];

  for (let codec of codecs_to_try) {
    if (MediaRecorder.isTypeSupported(codec)) {
      mimeType = codec;
      console.log('CCB: Using codec:', codec);
      break;
    }
  }

  if (!mimeType) {
    console.error('CCB: No supported video codec found!');
    mimeType = 'video/webm'; // fallback
  }

  this.width = function() { return stream_width; }
  this.height = function() { return stream_height; }

  this.start_recording = function() {
    console.log('CCB: start_recording for ' + now_msg);

    // Clear previous recording
    chunks = [];
    chunk_times = [];
    recording = true;
    recording_start_time = performance.now();

    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2500000  // 2.5 Mbps - adjustable for quality/size tradeoff
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          let chunk_time = performance.now();

          // Store ALL chunks - we'll extract the right portion during playback
          chunks.push(event.data);
          chunk_times.push(chunk_time);

          // Try to update dimensions if not yet set (for remote streams)
          if (!dimensions_updated) {
            let updated_settings = stream.getVideoTracks()[0].getSettings();
            if (updated_settings.width && updated_settings.height) {
              stream_width = updated_settings.width;
              stream_height = updated_settings.height;
              dimensions_updated = true;
              console.log('CCB: Stream dimensions updated to ' + stream_width + 'x' + stream_height);
              if (resizing_callback) {
                resizing_callback(stream_width, stream_height);
              }
            }
          }

          // Log buffer status periodically (every ~50 chunks)
          if (chunks.length % 50 === 0) {
            let total_size = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
            let buffer_duration = chunk_times.length > 1 ?
              (chunk_times[chunk_times.length - 1] - chunk_times[0]) / 1000 : 0;
            console.log('CCB: ' + chunks.length + ' chunks, ' +
                       (total_size / 1024 / 1024).toFixed(2) + ' MB, ' +
                       buffer_duration.toFixed(1) + 's buffered');
          }
        }
      };

      recorder.onerror = (event) => {
        console.error('CCB: MediaRecorder error:', event.error);
      };

      recorder.onstart = () => {
        console.log('CCB: MediaRecorder started');
      };

      let onstop_callback = null;
      recorder.onstop = () => {
        console.log('CCB: MediaRecorder stopped, chunks=' + chunks.length);
        if (onstop_callback) {
          let cb = onstop_callback;
          onstop_callback = null;
          cb();
        }
      };

      // Allow playback to hook into onstop
      this.set_onstop_callback = function(cb) {
        onstop_callback = cb;
      };

      // Record continuously - no time slicing needed
      // This creates a complete, valid video file
      recorder.start();

    } catch (error) {
      console.error('CCB: Error creating MediaRecorder:', error);
      recording = false;
    }
  }

  this.stop_recording = function() {
    console.log('CCB: stop_recording for ' + now_msg);
    recording = false;

    if (recorder && recorder.state === 'recording') {
      // Stop will trigger a final ondataavailable event
      recorder.stop();
    }
  }

  // canvas -- a DOM <canvas> element (kept for API compatibility, but not used for chunk-based playback)
  // repeat -- number of times to play back the video
  // playback_rate -- percentage multiplier for playback (50 = half speed slow-motion)
  // on_precanvas -- callback invoked (once) for compatibility (we'll pass a canvas from video)
  // on_playback_finished -- callback invoked when a playback finishes (may be called repeat times)
  // on_done -- callback to be invoked when playback completes
  this.playback = function(canvas, repeat, playback_rate,
                           on_precanvas, on_playback_finished, on_done) {

    // If recorder is still running or stopping, wait for it to complete
    if (recorder && recorder.state !== 'inactive') {
      console.log('CCB: Waiting for recorder to stop (state=' + recorder.state + ')');
      this_ccb.set_onstop_callback(function() {
        console.log('CCB: Recorder stopped callback, starting playback');
        // Small delay to ensure final chunk is processed
        setTimeout(function() {
          this_ccb.playback(canvas, repeat, playback_rate, on_precanvas, on_playback_finished, on_done);
        }, 100);
      });
      return;
    }

    if (chunks.length === 0) {
      console.log("CCB: No chunks for playback! (" + now_msg + ")");
      if (on_done) {
        on_done();
      }
      return;
    }

    console.log("CCB: Playback from " + now_msg + ": repeat=" + repeat +
                ", playback_rate=" + playback_rate +
                ", chunks=" + chunks.length +
                ", mimeType=" + mimeType);

    // Use ALL chunks to create a complete, valid video file
    // MediaRecorder chunks need to be combined in sequence to form a valid container
    let replay_blob = new Blob(chunks, { type: mimeType });
    let blob_url = URL.createObjectURL(replay_blob);

    console.log("CCB: Created blob of size " + (replay_blob.size / 1024).toFixed(2) + " KB" +
               ", type=" + replay_blob.type);

    // Create a video element for playback
    let playback_video = document.createElement('video');
    playback_video.playsInline = true;
    playback_video.muted = true;
    playback_video.style.display = 'none';
    document.body.appendChild(playback_video);

    // Get canvas context for rendering
    let context = canvas.getContext('2d');

    let rpt = 0;
    let animation_frame = null;

    // For on_precanvas compatibility, create a canvas that captures from the video
    // This allows video upload to still work via captureStream
    let pre_canvas = document.createElement('canvas');
    pre_canvas.width = stream_width;
    pre_canvas.height = stream_height;

    function cleanup() {
      if (animation_frame) {
        cancelAnimationFrame(animation_frame);
        animation_frame = null;
      }
      if (playback_video) {
        playback_video.pause();
        playback_video.src = '';
        playback_video.remove();
        playback_video = null;
      }
      if (blob_url) {
        URL.revokeObjectURL(blob_url);
      }
    }

    function render_frame() {
      if (!playback_video || playback_video.paused || playback_video.ended) {
        return;
      }

      // Draw video frame to pre_canvas (for capture stream)
      let pre_context = pre_canvas.getContext('2d');
      pre_context.drawImage(playback_video, 0, 0, pre_canvas.width, pre_canvas.height);

      // Calculate scaling to fit canvas while maintaining aspect ratio
      let scale = Math.min(canvas.width / stream_width, canvas.height / stream_height);
      let draw_width = stream_width * scale;
      let draw_height = stream_height * scale;
      let draw_x = (canvas.width - draw_width) / 2;
      let draw_y = (canvas.height - draw_height) / 2;

      // Clear canvas and draw scaled video
      context.fillStyle = 'black';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(playback_video, draw_x, draw_y, draw_width, draw_height);

      animation_frame = requestAnimationFrame(render_frame);
    }

    let replay_start_time = 0;  // Will be calculated once metadata loads

    function start_playback() {
      playback_video.src = blob_url;
      playback_video.playbackRate = playback_rate / 100;

      playback_video.onloadedmetadata = function() {
        console.log('CCB: Video loaded, duration=' + playback_video.duration.toFixed(2) + 's');

        // Calculate where to start playback
        // We want to show the last length_ms of the recorded video
        let video_duration_ms = playback_video.duration * 1000;
        replay_start_time = Math.max(0, (video_duration_ms - length_ms) / 1000);

        console.log('CCB: Seeking to ' + replay_start_time.toFixed(2) + 's (showing last ' +
                    (length_ms / 1000).toFixed(1) + 's)');

        // Call on_precanvas callback once (for video upload compatibility)
        if (rpt === 0 && on_precanvas) {
          on_precanvas(pre_canvas);
        }

        // Seek to the start position, then play
        playback_video.currentTime = replay_start_time;

        playback_video.onseeked = function() {
          playback_video.play().then(() => {
            console.log('CCB: Playback started (repeat ' + (rpt + 1) + '/' + repeat + ')');
            render_frame();
          }).catch((err) => {
            console.error('CCB: Play failed:', err);
            cleanup();
            if (on_done) on_done();
          });
        };
      };

      playback_video.onended = function() {
        console.log("CCB: Playback done (once)");

        if (animation_frame) {
          cancelAnimationFrame(animation_frame);
          animation_frame = null;
        }

        if (on_playback_finished) {
          try {
            on_playback_finished();
          } catch(e) {
            console.error('CCB: on_playback_finished error:', e);
          }
        }

        ++rpt;
        if (rpt < repeat) {
          // Reset video for next repetition - seek back to start of replay segment
          playback_video.currentTime = replay_start_time;
          playback_video.onseeked = function() {
            playback_video.play().then(() => {
              console.log('CCB: Replay repeat ' + (rpt + 1) + '/' + repeat);
              render_frame();
            });
          };
        } else {
          console.log("CCB: Playback fully complete (" + repeat + " time(s))");
          cleanup();
          if (on_done) {
            on_done();
          }
        }
      };

      playback_video.onerror = function(e) {
        console.error('CCB: Video error:', e);
        console.error('CCB: Video error details - readyState:', playback_video.readyState,
                     'networkState:', playback_video.networkState);
        if (playback_video.error) {
          console.error('CCB: MediaError code:', playback_video.error.code,
                       'message:', playback_video.error.message);
        }
        cleanup();
        if (on_done) on_done();
      };
    }

    start_playback();
  }
}
