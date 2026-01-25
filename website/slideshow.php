<!DOCTYPE html>
<html>
<?php
require_once('inc/banner.inc');
require_once('inc/photo-config.inc');
require_once('inc/data.inc');

// Look up racerid from car number if provided
$start_racerid = 0;
if (isset($_GET['car'])) {
  $carnumber = $_GET['car'];
  $stmt = $db->prepare('SELECT racerid FROM RegistrationInfo WHERE carnumber = :carnumber');
  $stmt->execute(array(':carnumber' => $carnumber));
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if ($row) {
    $start_racerid = intval($row['racerid']);
  }
}
?><head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
    <title>DerbyNet Slideshow</title>
    <script type="text/javascript" src="js/jquery.js"></script>
<?php if (isset($as_kiosk)) require_once('inc/kiosk-poller.inc'); ?>
<?php require('inc/stylesheet.inc'); ?>
    <link rel="stylesheet" type="text/css" href="css/kiosks.css"/>
    <link rel="stylesheet" type="text/css" href="css/slideshow.css"/>
    <script type="text/javascript">
       var g_kiosk_parameters = <?php
            echo isset($as_kiosk) ? json_encode(kiosk_parameters()) : "{}";
       ?>;
       var g_start_racerid = <?php echo $start_racerid; ?>;
    </script>
    <script type="text/javascript" src="js/slideshow.js"></script>
  </head>

  <body>
  <?php if (!isset($as_kiosk)) make_banner('Slideshow'); ?>
  <div id="photo-background" class="photo-background">
    <div class="next">
      <img class='mainphoto' onload='mainphoto_onload(this)'
           src='slide.php/title'/>
    </div>
    <div id="pause-indicator" class="pause_indicator">PAUSED</div>
    <div id="help-hint" class="help_hint">Press ? for controls</div>
    <div id="help-overlay" class="help_overlay hidden">
      <p><b>Spacebar</b> &ndash; Pause / Resume</p>
      <p><b>&larr; &uarr;</b> &ndash; Previous slide</p>
      <p><b>&rarr; &darr;</b> &ndash; Next slide</p>
      <p><b>?</b> &ndash; Toggle this help</p>
    </div>
  </div>

  <?php if (isset($as_kiosk)) require('inc/ajax-failure.inc'); ?>
  </body>
</html>
