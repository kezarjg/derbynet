<?php @session_start(); ?>
<?php
require_once('inc/data.inc');
require_once('inc/authorize.inc');
session_write_close();
require_once('inc/banner.inc');

require_permission(SET_UP_PERMISSION);

$nlanes = get_lane_count();
$reverse_lanes = read_raceinfo_boolean('reverse-lanes');
?><!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Race Simulator</title>
<link rel="stylesheet" type="text/css" href="css/jquery-ui.min.css"/>
<?php require('inc/stylesheet.inc'); ?>
<link rel="stylesheet" type="text/css" href="css/race-simulator.css"/>
<script type="text/javascript" src="js/jquery.js"></script>
<script type="text/javascript" src="js/jquery-ui.min.js"></script>
<script type="text/javascript" src="js/adapter.js"></script>
<script type="text/javascript" src="js/message-poller.js"></script>
<script type="text/javascript" src="js/timer-simulator.js"></script>
<script type="text/javascript" src="js/track-animation.js"></script>
<script type="text/javascript" src="js/camera-simulator.js"></script>
<script type="text/javascript" src="js/race-simulator.js"></script>
<script type="text/javascript">
g_websocket_url = <?php echo json_encode(read_raceinfo('_websocket_url', '')); ?>;
var g_initial_lane_count = <?php echo $nlanes; ?>;
var g_reverse_lanes = <?php echo $reverse_lanes ? 'true' : 'false'; ?>;
</script>
</head>
<body>
<?php make_banner('Race Simulator', false); ?>
<div id="version-tag" style="position:fixed;bottom:5px;right:10px;font-size:10px;color:#666;">v1.0.5</div>

<div id="simulator-container">
  <div id="left-panel">
    <div id="track-container">
      <canvas id="track-canvas" width="400" height="500"></canvas>
    </div>

    <div id="settings-panel" class="panel">
      <h3>Settings</h3>
      <div class="setting-row">
        <label for="timing-mode">Timing Mode:</label>
        <select id="timing-mode">
          <option value="realistic">Realistic Random</option>
          <option value="fast">Fast Pack</option>
          <option value="spread">Spread Out</option>
        </select>
      </div>
      <div class="setting-row">
        <!-- Blank space to push DNF% to second row -->
      </div>
      <div class="setting-row">
        <label for="dnf-probability">DNF %:</label>
        <select id="dnf-probability">
          <option value="0">0%</option>
          <option value="5" selected>5%</option>
          <option value="10">10%</option>
          <option value="15">15%</option>
          <option value="25">25%</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="tie-probability">Tie %:</label>
        <select id="tie-probability">
          <option value="0">0%</option>
          <option value="2" selected>2%</option>
          <option value="5">5%</option>
          <option value="10">10%</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="pre-delay">Pre-race Delay:</label>
        <select id="pre-delay">
          <option value="1">1 sec</option>
          <option value="2">2 sec</option>
          <option value="3" selected>3 sec</option>
          <option value="5">5 sec</option>
          <option value="10">10 sec</option>
          <option value="15">15 sec</option>
          <option value="20">20 sec</option>
          <option value="30">30 sec</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="post-delay">Post-race Delay:</label>
        <select id="post-delay">
          <option value="2">2 sec</option>
          <option value="3">3 sec</option>
          <option value="5" selected>5 sec</option>
          <option value="10">10 sec</option>
          <option value="15">15 sec</option>
          <option value="20">20 sec</option>
          <option value="30">30 sec</option>
        </select>
      </div>
      <div class="setting-row">
        <label>
          <input type="checkbox" id="include-anomalies"/>
          Include anomalies
        </label>
      </div>
    </div>
  </div>

  <div id="right-panel">
    <div id="controls-panel" class="panel">
      <h3>Controls</h3>
      <div id="control-buttons">
        <button id="start-btn" class="control-btn primary">Start Auto</button>
        <button id="stop-btn" class="control-btn" disabled>Stop</button>
        <button id="single-race-btn" class="control-btn">Single Race</button>
        <button id="reset-btn" class="control-btn">Reset</button>
      </div>
      <div id="inject-buttons">
        <button id="inject-dnf-btn" class="inject-btn">Inject DNF</button>
        <button id="inject-anomaly-btn" class="inject-btn">Inject Anomaly</button>
        <button id="inject-malfunction-btn" class="inject-btn">Inject Malfunction</button>
      </div>
    </div>

    <div id="timer-status-panel" class="panel">
      <h3>Timer Status
        <label class="feature-toggle">
          <input type="checkbox" id="timer-enabled" checked/>
          <span class="toggle-slider"></span>
        </label>
      </h3>
      <div class="status-row">
        <span class="status-label">State:</span>
        <span id="timer-state" class="status-value">Disconnected</span>
      </div>
      <div class="status-row">
        <span class="status-label">Heat:</span>
        <span id="heat-info" class="status-value">--</span>
      </div>
      <div class="status-row">
        <span class="status-label">Lane Mask:</span>
        <span id="lane-mask" class="status-value">--</span>
      </div>
      <div class="status-row">
        <span class="status-label">Heartbeat:</span>
        <span id="heartbeat-age" class="status-value">--</span>
      </div>
    </div>

    <div id="camera-status-panel" class="panel">
      <h3>Camera Status
        <label class="feature-toggle">
          <input type="checkbox" id="camera-enabled" checked/>
          <span class="toggle-slider"></span>
        </label>
      </h3>
      <div class="status-row">
        <span class="status-label">Viewers:</span>
        <span id="viewer-count" class="status-value">0</span>
      </div>
      <div class="status-row">
        <span class="status-label">FPS:</span>
        <span id="camera-fps" class="status-value">--</span>
      </div>
      <div class="status-row">
        <span class="status-label">Stream:</span>
        <span id="stream-status" class="status-value">Inactive</span>
      </div>
    </div>

    <div id="statistics-panel" class="panel">
      <h3>Statistics</h3>
      <div class="status-row">
        <span class="status-label">Races:</span>
        <span id="race-count" class="status-value">0</span>
      </div>
      <div class="status-row">
        <span class="status-label">DNFs:</span>
        <span id="dnf-count" class="status-value">0</span>
      </div>
      <div class="status-row">
        <span class="status-label">Ties:</span>
        <span id="tie-count" class="status-value">0</span>
      </div>
      <div class="status-row">
        <span class="status-label">Anomalies:</span>
        <span id="anomaly-count" class="status-value">0</span>
      </div>
      <div class="status-row">
        <span class="status-label">Runtime:</span>
        <span id="runtime" class="status-value">00:00:00</span>
      </div>
    </div>
  </div>
</div>

<div id="event-log-panel" class="panel">
  <h3>Event Log</h3>
  <div id="event-log"></div>
</div>

<div id="log" class="hidden"></div>

</body>
</html>
