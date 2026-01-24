<?php

// $_POST['repo'] - Name of the repository ('head' or 'car')
// $_POST['image_name'] - Base filename of the image
//
// Detects the main subject in the image and returns coordinates.
// Does NOT perform the crop - just returns the suggested region.
// For car photos, uses edge-based saliency detection.
// For head photos, uses face detection.

require_once('inc/photo-config.inc');

if (!have_permission(ASSIGN_RACER_IMAGE_PERMISSION)) {
  json_not_authorized();
  return;
}

$image_name = $_POST['image_name'];
$repo_name = isset($_POST['repo']) ? $_POST['repo'] : 'head';
$photo_repository = photo_repository($repo_name);

$original = $photo_repository->lookup(RENDER_ORIGINAL);
$source_file_path = $original->file_path($image_name);

if (!file_exists($source_file_path)) {
  json_failure('file-not-found', "Source file not found: $image_name");
  return;
}

list($source_width, $source_height, $image_type) = getimagesize($source_file_path);
$im = open_image($source_file_path, $image_type);

if (!$im) {
  json_failure('open-failed', "Could not open image: $image_name");
  return;
}

$region = false;

if ($repo_name == 'head') {
  // Use face detection for headshots
  require_once('inc/facedetection.inc');
  $detector = new FaceDetector();
  $face = $detector->detect_face($im);

  if ($face) {
    $x = round($face['x']);
    $y = round($face['y']);
    $w = round($face['width']);

    // Widen by 10%, then adjust to 4:3 portrait aspect
    function widen_clip(&$v, &$width, $scale, $max) {
      $original_width = $width;
      $width = round($width * $scale);
      $v = $v - round(($width - $original_width) / 2);
      if ($v < 0) {
        $width = $width + $v;
        $v = 0;
      }
      if ($v + $width > $max) {
        $width = $max - $v;
      }
    }

    widen_clip($x, $w, 1.10, imagesx($im));
    $h = $w;
    widen_clip($y, $h, 4 / 3, imagesy($im));

    $region = array('x' => $x, 'y' => $y, 'width' => $w, 'height' => $h);
  }
} else {
  // Use saliency detection for car photos
  require_once('inc/saliency-detector.inc');
  $detector = new SaliencyDetector(1.02, 4.0 / 3.0);  // 2% padding, 4:3 landscape
  $region = $detector->detect($im);
}

imagedestroy($im);

if (!$region || $region['width'] <= 0 || $region['height'] <= 0) {
  json_failure('detection-failed', "Could not detect " . ($repo_name == 'head' ? 'face' : 'car') . " in image.");
  return;
}

json_success();
// Return region in original image coordinates
json_out('region', $region);
// Also return original image dimensions so JS can scale to display size
json_out('original_width', $source_width);
json_out('original_height', $source_height);

?>
