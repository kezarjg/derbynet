'use strict';

// CircularChunkBuffer: Memory-efficient circular video buffer using compressed chunks
// Instead of storing uncompressed ImageData frames (~2GB for 4s), this stores
// compressed video chunks (~2-8MB for 4s), reducing memory by 250-1000x.
//
// This is a true circular buffer - old chunks are automatically discarded when
// they exceed 20 seconds. During playback, the last N seconds are extracted.
//
function CircularChunkBuffer(stream, length_ms) {
  const BUFFER_DURATION_MS = 20000;  // Fixed 20-second circular buffer
  let this_ccb = this;
  let resizing_callback = null;

  this.on_resize = function(cb) { resizing_callback = cb; }
  this.set_recording_length = function(number_of_milliseconds) {
    length_ms = number_of_milliseconds;
  }

  // Get stream dimensions (may be undefined for remote streams initially)
  let stream_settings = stream.getVideoTracks()[0].getSettings();
  let stream_width = stream_settings.width || 1280;
  let stream_height = stream_settings.height || 720;
  let dimensions_updated = !!(stream_settings.width && stream_settings.height);

  // Circular buffer for compressed video chunks
  let chunks = [];
  let chunk_times = [];
  let recorder = null;

  // Select best supported codec
  const codecs = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8',
                  'video/webm;codecs=h264', 'video/webm', 'video/mp4'];
  let mimeType = codecs.find(c => MediaRecorder.isTypeSupported(c)) || 'video/webm';

  this.width = function() { return stream_width; }
  this.height = function() { return stream_height; }

  this.start_recording = function() {
    chunks = [];
    chunk_times = [];

    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2500000  // 2.5 Mbps - adjustable for quality/size tradeoff
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          let chunk_time = performance.now();

          // Add new chunk
          chunks.push(event.data);
          chunk_times.push(chunk_time);

          // Implement circular buffer: remove old chunks beyond 20 seconds
          while (chunks.length > 1 && (chunk_time - chunk_times[0]) > BUFFER_DURATION_MS) {
            chunks.shift();
            chunk_times.shift();
          }

          // Update dimensions if not yet set (for remote streams)
          if (!dimensions_updated) {
            let updated_settings = stream.getVideoTracks()[0].getSettings();
            if (updated_settings.width && updated_settings.height) {
              stream_width = updated_settings.width;
              stream_height = updated_settings.height;
              dimensions_updated = true;
              if (resizing_callback) resizing_callback(stream_width, stream_height);
            }
          }
        }
      };

      let onstop_callback = null;
      recorder.onstop = () => {
        if (onstop_callback) {
          let cb = onstop_callback;
          onstop_callback = null;
          cb();
        }
      };
      this.set_onstop_callback = (cb) => { onstop_callback = cb; };

      recorder.start();
    } catch (error) {
      console.error('CCB: Error creating MediaRecorder:', error);
    }
  }

  this.stop_recording = function() {
    if (recorder && recorder.state === 'recording') {
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

    // Wait for recorder to stop if still active
    if (recorder && recorder.state !== 'inactive') {
      this_ccb.set_onstop_callback(() => {
        setTimeout(() => this_ccb.playback(canvas, repeat, playback_rate,
                                           on_precanvas, on_playback_finished, on_done), 100);
      });
      return;
    }

    if (chunks.length === 0) {
      if (on_done) on_done();
      return;
    }

    // Create blob from all buffered chunks (up to 20 seconds)
    // We'll seek during playback to show only the last length_ms
    let replay_blob = new Blob(chunks, { type: mimeType });
    let blob_url = URL.createObjectURL(replay_blob);

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
        // Remove all event handlers to prevent errors after cleanup
        playback_video.onloadedmetadata = null;
        playback_video.onseeked = null;
        playback_video.onended = null;
        playback_video.onerror = null;
        playback_video.pause();
        playback_video.src = '';
        playback_video.remove();
        playback_video = null;
      }
      if (blob_url) {
        URL.revokeObjectURL(blob_url);
        blob_url = null;
      }
    }

    // Cache context for performance
    let pre_context = pre_canvas.getContext('2d');

    function render_frame() {
      if (!playback_video || playback_video.paused || playback_video.ended) return;

      // Draw to pre_canvas for capture stream
      pre_context.drawImage(playback_video, 0, 0, pre_canvas.width, pre_canvas.height);

      // Scale to fit canvas while maintaining aspect ratio
      let scale = Math.min(canvas.width / stream_width, canvas.height / stream_height);
      let draw_width = stream_width * scale;
      let draw_height = stream_height * scale;

      context.fillStyle = 'black';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(playback_video,
                       (canvas.width - draw_width) / 2,
                       (canvas.height - draw_height) / 2,
                       draw_width, draw_height);

      animation_frame = requestAnimationFrame(render_frame);
    }

    function play_video() {
      playback_video.play().then(render_frame).catch((err) => {
        console.error('CCB: Play failed:', err);
        cleanup();
        if (on_done) on_done();
      });
    }

    let replay_start_time = 0;

    function start_playback() {
      playback_video.src = blob_url;
      playback_video.playbackRate = playback_rate / 100;

      playback_video.onloadedmetadata = () => {
        // Calculate where to start: show the last length_ms of the buffered video
        let video_duration_ms = playback_video.duration * 1000;
        replay_start_time = Math.max(0, (video_duration_ms - length_ms) / 1000);

        if (rpt === 0 && on_precanvas) on_precanvas(pre_canvas);

        // Seek to start position, then play
        if (replay_start_time > 0) {
          playback_video.currentTime = replay_start_time;
          playback_video.onseeked = () => {
            playback_video.onseeked = null;
            play_video();
          };
        } else {
          play_video();
        }
      };

      playback_video.onended = () => {
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

        if (++rpt < repeat) {
          playback_video.currentTime = replay_start_time;
          playback_video.onseeked = () => {
            playback_video.onseeked = null;
            play_video();
          };
        } else {
          cleanup();
          if (on_done) on_done();
        }
      };

      playback_video.onerror = function(e) {
        console.error('CCB: Video error:', e);
        if (playback_video) {
          console.error('CCB: Video error details - readyState:', playback_video.readyState,
                       'networkState:', playback_video.networkState);
          if (playback_video.error) {
            console.error('CCB: MediaError code:', playback_video.error.code,
                         'message:', playback_video.error.message);
          }
        }
        cleanup();
        if (on_done) on_done();
      };
    }

    start_playback();
  }
}
