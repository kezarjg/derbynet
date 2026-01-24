<?php @session_start();
require_once('inc/banner.inc');
require_once('inc/data.inc');
session_write_close();
?><!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Replay Recording</title>
<?php
require('inc/stylesheet.inc');
require('inc/servername.inc');

$server = server_name();
$path = request_path();

$url = $server . $path;

$last = strrpos($url, '/');
if ($last === false) {
  $last = -1;
}

// Don't force http !
$kiosk_url = '//'.substr($url, 0, $last + 1).'kiosk.php';
if (isset($_REQUEST['address'])) {
  $kiosk_url .= "?address=".$_REQUEST['address'];
}
?>
<link rel="stylesheet" type="text/css" href="css/jquery-ui.min.css"/>
<link rel="stylesheet" type="text/css" href="css/replay.css"/>
<script type="text/javascript" src="js/jquery.js"></script>
<script type="text/javascript" src="js/ajax-setup.js"></script>
<script type="text/javascript" src="js/jquery-ui.min.js"></script>
<script type="text/javascript" src="js/screenfull.min.js"></script>
<!-- WebRTC adapter: a shim to insulate apps from spec changes and prefix differences in WebRTC.
     Latest: https://webrtc.github.io/adapter/adapter-latest.js -->
<script type="text/javascript" src="js/adapter.js"></script>
<script type="text/javascript" src="js/message-poller.js"></script>
<script type="text/javascript" src="js/viewer-signaling.js"></script>
<script type="text/javascript" src="js/video-capture.js"></script>
<script type="text/javascript" src="js/circular-frame-buffer.js?v=<?php echo time(); ?>"></script>
<script type="text/javascript" src="js/video-device-picker.js"></script>
<script type="text/javascript">

g_websocket_url = <?php echo json_encode(read_raceinfo('_websocket_url', '')); ?>;
// If using websockets to listen for replay messages, this variable will hold
// the websocket object.
var g_trigger_websocket;

// Avoid starting another poll request if another one is still in flight.
g_poll_in_flight = false;

function poll_once_for_replay() {
  if (g_poll_in_flight) {
    return;
  }
  g_poll_in_flight = true;
  $.ajax("action.php",
         {type: 'POST',
          data: {action: 'replay.message',
                 status: 0,
                 'finished-replay': 0},
          success: function(data) {
            for (let i = 0; i < data.replay.length; ++i) {
              handle_replay_message(data.replay[i]);
            }
          },
          complete: function() {
            // Called after success (or error)
            g_poll_in_flight = false;
          },
         });
}

function listen_for_replay_messages() {
  if (g_websocket_url != "") {
    // g_trigger_websocket is the websocket on which we listen for replay messages
    g_trigger_websocket = new MessagePoller(make_id_string('replay-'),
                                            function(msg) { handle_replay_message(msg.cmd); },
                                            ['replay-commands']);
    // Even though we're using the websocket for triggering, poll every 5s (as
    // opposed to several times per second), so we get credit for being
    // connected.
    setInterval(poll_once_for_replay, 5000);
  } else {
    setInterval(poll_once_for_replay, 250);
  }
}

g_upload_videos = <?php echo read_raceinfo_boolean('upload-videos') ? "true" : "false"; ?>;
g_video_name_root = "";
// If a replay is triggered by timing out after a RACE_STARTS, then ignore any
// subsequent REPLAY messages until the next START.
//
// If a replay is triggered by a REPLAY message that arrives before the timeout
// (as most will), then we just cancel the g_replay_timeout.
g_preempted = false;


var g_remote_poller;
var g_recorder;

// Continue recording for this many milliseconds after trigger (configured in Race Coordinator)
var g_record_after = <?php echo read_raceinfo('replay-record-after', '2000'); ?>;

<?php
// Calculate buffer size dynamically from skipback + record_after + padding
$skipback = read_raceinfo('replay-skipback', '4000');
$record_after = read_raceinfo('replay-record-after', '2000');
// If skipback is 0 ("Entire race"), use 15 seconds as the skipback portion (covers DNF timeout)
$effective_skipback = ($skipback == 0 || $skipback == '0') ? 15000 : intval($skipback);
// Timeout should be long enough to cover entire race (15s covers DNF timeout)
$race_timeout = 15000;
// Buffer size needs to accommodate maximum possible playback window:
// race_timeout + record_after + 2s padding
$buffer_size = $race_timeout + intval($record_after) + 2000;
?>
var g_replay_options = {
  count: 2,
  rate: 50,  // expressed as a percentage
  // Buffer size calculated from: race_timeout + record_after + 2s padding
  length: <?php echo $buffer_size; ?>,  // ms
  skipback: <?php echo $effective_skipback; ?>,  // ms - how far back from trigger to start playback
  race_timeout: <?php echo $race_timeout; ?>  // ms - how long to wait after RACE_STARTS before auto-triggering
};

function parse_replay_options(cmdline) {
  // Server sends skipback value in the message
  g_replay_options.skipback = parseInt(cmdline.split(" ")[1]);
  // Buffer size is computed server-side and remains constant
  // No need to adjust buffer length here since it's set correctly at initialization
  
  g_replay_options.count = parseInt(cmdline.split(" ")[2]);
  g_replay_options.rate = parseInt(cmdline.split(" ")[3]);
}

// If non-zero, holds the timeout ID of a pending timeout that will trigger a
// replay based on the start of a heat.
var g_replay_timeout = 0;
// Milliseconds short of g_replay_length to start a replay after a race start.
var g_replay_timeout_epsilon = 0;

function ts() {
  return new Date().toISOString().substr(11, 12);
}

function handle_replay_message(cmdline) {
  console.log(ts(), '* Replay message:', cmdline, 'g_preempted=' + g_preempted, 'g_replay_timeout=' + g_replay_timeout);
  var root = g_video_name_root;
  if (cmdline.startsWith("HELLO")) {
  } else if (cmdline.startsWith("TEST")) {
    parse_replay_options(cmdline);
    on_replay(root);
  } else if (cmdline.startsWith("START")) {  // Setting up for a new heat
    // This assumes that we'll get a queued START when the page is freshly
    // loaded.
    g_video_name_root = cmdline.substr(6).trim();
    console.log(ts(), 'START: new heat, resetting g_preempted to false, root=' + g_video_name_root);
    g_preempted = false;
  } else if (cmdline.startsWith("REPLAY")) {
    // REPLAY skipback showings rate
    // (Must be exactly one space between fields:)
    parse_replay_options(cmdline);
    if (!g_preempted) {
      clearTimeout(g_replay_timeout);
      g_replay_timeout = 0;
      g_preempted = true;  // Mark that we've handled the replay, preventing RACE_STARTS timeout
      console.log(ts(), 'Triggering replay from REPLAY message', root);
      on_replay(root);
    } else {
      console.log(ts(), 'REPLAY ignored because g_preempted=true');
    }
  } else if (cmdline.startsWith("CANCEL")) {
    console.log(ts(), 'CANCEL received, clearing timeout', g_replay_timeout);
    clearTimeout(g_replay_timeout);
    g_replay_timeout = 0;
  } else if (cmdline.startsWith("RACE_STARTS")) {
    // This message signals that the start gate has actually opened (if that can
    // be detected).  The START message identifies what heat is queued next.
    parse_replay_options(cmdline);
    // Use race_timeout (15s) to ensure we capture the entire race before auto-triggering
    console.log(ts(), 'RACE_STARTS: setting timeout for', g_replay_options.race_timeout - g_replay_timeout_epsilon, 'ms');
    // Clear any previous timeouts to prevent duplicates
    if (g_replay_timeout) {
      clearTimeout(g_replay_timeout);
    }
    g_replay_timeout = setTimeout(
      function() {
        // Only trigger if not preempted by a REPLAY message
        if (!g_preempted) {
          console.log(ts(), 'Triggering replay from timeout after RACE_STARTS', root);
          on_replay(root);
        } else {
          console.log(ts(), 'RACE_STARTS timeout ignored because already preempted');
        }
      },
      g_replay_options.race_timeout - g_replay_timeout_epsilon);
  } else {
    console.log("Unrecognized replay message: " + cmdline);
  }
}

$(function() {
  listen_for_replay_messages();
  console.log('Replay page (re)loaded');
});

function on_stream_ready(stream) {
  $("#waiting-for-remote").addClass('hidden');
  g_recorder = new CircularFrameBuffer(stream, g_replay_options.length);
  g_recorder.start_recording();
  document.getElementById("preview").srcObject = stream;
}

function on_remote_stream_ready(stream) {
  let resize = function(w, h) {
    $("#recording-stream-info").removeClass('hidden');
    $("#recording-stream-size").text(w + 'x' + h);
  };
  resize(-1, -1);  // Says we've got a stream, even if no frames yet.
  on_stream_ready(stream);
  g_recorder.on_resize(resize);
}

function on_device_selection(selectq) {
  // mobile_select_refresh(selectq);
  // If a stream is already open, stop it.
  stream = document.getElementById("preview").srcObject;
  if (stream != null) {
    stream.getTracks().forEach(function(track) {
      track.stop();
    });
  }
  
  // Dispose of existing recorder if present
  if (g_recorder) {
    console.log(ts(), 'Disposing existing recorder before switching devices');
    g_recorder.dispose();
    g_recorder = null;
  }	

  let device_id = selectq.find(':selected').val();

  if (typeof(navigator.mediaDevices) == 'undefined') {
    $("no-camera-warning").toggleClass('hidden', device_id == 'remote');
  }

  if (device_id == 'remote') {
    if (g_remote_poller) {
      g_remote_poller.close();
      g_remote_poller = null;
    }
    $("#waiting-for-remote").removeClass('hidden');
    let id = make_id_string("viewer-");
    console.log("Viewer id is " + id);
    g_remote_poller = new RemoteCamera(
      id,
      {width: $(window).width(),
       height: $(window).height()},
      on_remote_stream_ready);
  } else {
    if (g_remote_poller) {
      g_remote_poller.close();
      g_remote_poller = null;
    }
    $("#recording-stream-info").addClass('hidden');
    navigator.mediaDevices.getUserMedia(
      { video: {
          deviceId: device_id,
          width: { ideal: $(window).width() },
          height: { ideal: $(window).height() }
        }
      })
    .then(on_stream_ready);
  }
}

$(function() {
    if (typeof(window.MediaRecorder) == 'undefined') {
      g_upload_videos = false;
      $("#user_agent").text(navigator.userAgent);
      $("#recorder-warning").removeClass('hidden');
    }
});


$(function() {
    if (typeof(navigator.mediaDevices) == 'undefined') {
      $("#no-camera-warning").removeClass('hidden');
      if (window.location.protocol == 'http:') {
        var https_url = "https://" + window.location.hostname + window.location.pathname;
        $("#no-camera-warning").append("<p>You may need to switch to <a href='" +  https_url + "'>" + https_url + "</a></p>");
      }
    } else {
      navigator.mediaDevices.ondevicechange = function(event) {
        build_device_picker($("#device-picker"), /*include_remote*/true, on_device_selection, on_setup);
      };
    }

    build_device_picker($("#device-picker"), /*include_remote*/true, on_device_selection);
});

// Posts a message to the page running in the interior iframe.
function announce_to_interior(msg) {
  document.querySelector("#interior").contentWindow.postMessage(msg, '*');
}

function upload_video(root, blob) {
  if (blob) {
    console.log("Uploading video " + root + ".mkv");
    let form_data = new FormData();
    form_data.append('video', blob, root + ".mkv");
    form_data.append('action', 'video.upload');
    $.ajax("action.php",
           {type: 'POST',
             data: form_data,
             processData: false,
             contentType: false,
             success: function(data) {
               console.log('video upload success:');
               console.log(data);
             }
           });
  }
}


function on_replay(root) {
  console.log(ts(), '* on_replay called, root=' + root);
  if (root != g_video_name_root) {
    console.log(ts(), '** WARNING: root mismatch: root=', root, ', g_video_name_root=', g_video_name_root);
  }
  // Capture this global variable before starting the asynchronous operation,
  // because it's reasonably likely to be clobbered by another queued message
  // from the server.
  var upload = g_upload_videos;

  // If this is a replay triggered after RACE_START, make sure we don't start
  // another replay for the same heat.
  if (g_replay_timeout > 0) {
    clearTimeout(g_replay_timeout);
  }
  g_replay_timeout = 0;

  // Continue recording for configured duration before stopping (configured in Race Coordinator)
  var record_after = g_record_after;

  console.log(ts(), 'on_replay: scheduling stop_recording in', record_after, 'ms');
  setTimeout(function() {
    console.log(ts(), 'on_replay: calling stop_recording now');
    g_recorder.stop_recording();
  }, record_after);

  var delay_elem = $("#delay")[0];
  var delay = delay_elem ? delay_elem.valueAsNumber * 1000 : 0;
  if (isNaN(delay)) {
    delay = 0;
  }

  // Add recording duration to any configured delay to account for continued recording
  var total_delay = delay + record_after;
  console.log(ts(), 'on_replay: scheduling start_playback in', total_delay, 'ms (delay=' + delay + ', record_after=' + record_after + ')');
  setTimeout(function() {
    console.log(ts(), 'on_replay: calling start_playback now');
    start_playback(root, upload);
  }, total_delay);
}

function start_playback(root, upload) {
  let playback = document.querySelector("#playback");
  playback.width = $(window).width();
  playback.height = $(window).height();

  announce_to_interior('replay-started');

  $("#playback-background").show('slide', function() {
      let playback_start_ms = Date.now();
      let vc;
      // When the offscreen <canvas> is first created, we construct a
      // VideoCapture object to record its capture stream.  After the first play
      // through, stop the VideoCapture and upload the resulting Blob.

      // Calculate the playback window duration
      // We want to play from (trigger - skipback) to (trigger + record_after)
      // Total duration = skipback + record_after
      var adjusted_length = g_replay_options.skipback + g_record_after;
      console.log(ts(), 'start_playback: skipback=' + g_replay_options.skipback + 'ms, g_record_after=' + g_record_after + 'ms, adjusted_length=' + adjusted_length + 'ms');
      console.log(ts(), 'start_playback: count=' + g_replay_options.count + ', rate=' + g_replay_options.rate + '%');

      g_recorder.playback(playback,
                          g_replay_options.count,
                          g_replay_options.rate,
                          function(pre_canvas) {
                            if (upload && root != "") {
                              vc = new VideoCapture(pre_canvas.captureStream());
                            } else if (!upload) {
                              console.log("No video upload planned.");
                            } else {
                              console.log("No video root name specified; will not upload.");
                            }
                          },
                          function() {
                            // The first time through, consume the captured
                            // video and destroy the VideoCapture object.
                            if (vc) {
                              vc.stop(function(blob) { upload_video(root, blob); });
                              vc = null;
                            }
                          },
                          function() {
                            console.log(ts(), 'Playback complete, restarting recording');
                            $("#playback-background").hide('slide');
                            announce_to_interior('replay-ended');
                            g_recorder.start_recording();
                          },
                          adjusted_length);
    });
}

function on_proceed() {
  $("#interior").attr('src', $("#inner_url").val());

  if (document.getElementById('go-fullscreen').checked) {
    if (screenfull.enabled) {
      // Temporarily remove resize handler while switching to fullscreen, to
      // avoid having to click "Proceed" again.
      $(window).off('resize');
      screenfull.request();
      setTimeout(function() {
$(window).on('resize', function(event) { on_setup(); });

// Add cleanup handler for page unload
$(window).on('beforeunload', function() {
  if (g_recorder) {
    console.log(ts(), 'Cleaning up recorder on page unload');
    g_recorder.dispose();
    g_recorder = null;
  }
});
        }, 2000);
    }
  }

  $("#replay-setup").hide('slide', {direction: 'down'});
  $("#playback-background").hide('slide').removeClass('hidden');
  $("#interior").removeClass('hidden');
  $("#click-shield").removeClass('hidden');
}

function on_setup() {
  $("#click-shield").addClass('hidden');
  $("#replay-setup").show('slide', {direction: 'down'});
}

$(window).on('resize', function(event) { on_setup(); });

</script>
</head>
<body>
  <div id="fps"></div>

  <div id="debug" <?php if (!isset($_GET['debug'])) echo 'class="hidden"'; ?> >
    <div id="log">
    </div>
  </div>

<iframe id="interior" class="hidden full-window">
</iframe>

<div id="click-shield" class="hidden full-window"
     onclick="on_setup(); return false;"
     oncontextmenu="on_replay(); return false;">
</div>

<div id="playback-background" class="hidden full-window">
  <canvas id="playback" class="full-window">
  </canvas>
</div>

<div id="replay-setup" class="full-window block_buttons">
  <?php make_banner('Replay'); ?>
  <div id="recorder-warning" class="hidden">
    <h2>This browser does not support MediaRecorder.</h2>
    <p>Replay is still possible, but you can't upload videos.</p>
    <p>Your browser's User Agent string is:<br/><span id="user_agent"></span></p>
  </div>

  <div id="no-camera-warning" class="hidden">
     <h2 id='reject'>Access to cameras is blocked.</h2>
  </div>

  <div id="preview-container">
    <video id="preview" autoplay="true" muted="true" playsinline="true">
    </video>
    <div id="waiting-for-remote" class="hidden">
      <p>Waiting for remote camera to connect...</p>
    </div>
  </div>

    <div id="device-picker-div">
      <select id="device-picker"><option>Please wait</option></select>
    </div>
    <p id="recording-stream-info" class="hidden">
      Recording at <span id="recording-stream-size"></span>
    </p>

  <div id="replay-setup-controls" style="margin-left: 25%; margin-right: 25%;">

    <p>
    <input type="checkbox" id="go-fullscreen" checked="checked"/>
    <label for="go-fullscreen">Change to fullscreen?</label>
    </p>

    <label for="inner_url">URL:</label>
    <input type="text" name="inner_url" id="inner_url" size="50"
           value="<?php echo htmlspecialchars($kiosk_url, ENT_QUOTES, 'UTF-8'); ?>"/>

    <p style="font-size: 1em; margin-left: 10%;">Delay playback by:
    <input type="number" name="delay" id="delay" min="0" step="0.1" value="0.0" size="8"
           style="font-size: 1em; width: 5em; "/>
    (s) after heat ends
    </p>

    <input type="button" value="Proceed" onclick="on_proceed();"/>
  </div>
</div>

</body>
</html>
