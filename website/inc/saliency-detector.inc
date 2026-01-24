<?php
// Saliency-based object detection for car photos
// Uses edge detection and contrast analysis to find the most visually interesting region

class SaliencyDetector {
  // Padding factor to add around detected region (1.02 = 2% padding)
  private $padding_factor = 1.02;

  // Target aspect ratio for car photos (4:3 landscape)
  private $target_aspect = 4.0 / 3.0;

  // Threshold for saliency (0-255), pixels above this are considered salient
  private $saliency_threshold = 30;

  // Downsample factor for faster processing
  private $downsample_max = 400;

  public function __construct($padding_factor = 1.15, $target_aspect = null) {
    $this->padding_factor = $padding_factor;
    if ($target_aspect !== null) {
      $this->target_aspect = $target_aspect;
    }
  }

  // Detect the salient region in an image
  // Returns array('x' => , 'y' => , 'width' => , 'height' => ) or false
  public function detect($image) {
    $width = imagesx($image);
    $height = imagesy($image);

    // Downsample for faster processing
    $scale = 1.0;
    if ($width > $this->downsample_max || $height > $this->downsample_max) {
      $scale = max($width, $height) / $this->downsample_max;
      $small_w = intval($width / $scale);
      $small_h = intval($height / $scale);
      $small = imagecreatetruecolor($small_w, $small_h);
      imagecopyresampled($small, $image, 0, 0, 0, 0, $small_w, $small_h, $width, $height);
    } else {
      $small = $image;
      $small_w = $width;
      $small_h = $height;
    }

    // Convert to grayscale and compute saliency map
    $saliency = $this->compute_saliency_map($small, $small_w, $small_h);

    // Find bounding box of salient region
    $bbox = $this->find_salient_bbox($saliency, $small_w, $small_h);

    if ($small !== $image) {
      imagedestroy($small);
    }

    if ($bbox === false) {
      return false;
    }

    // Scale bbox back to original image size
    $bbox['x'] = intval($bbox['x'] * $scale);
    $bbox['y'] = intval($bbox['y'] * $scale);
    $bbox['width'] = intval($bbox['width'] * $scale);
    $bbox['height'] = intval($bbox['height'] * $scale);

    // Apply padding
    $bbox = $this->apply_padding($bbox, $width, $height);

    // Adjust to target aspect ratio
    $bbox = $this->adjust_aspect_ratio($bbox, $width, $height);

    return $bbox;
  }

  // Compute saliency map using edge detection (Sobel-like)
  private function compute_saliency_map($image, $width, $height) {
    $saliency = array_fill(0, $height, array_fill(0, $width, 0));

    // Convert to grayscale array
    $gray = array();
    for ($y = 0; $y < $height; $y++) {
      $gray[$y] = array();
      for ($x = 0; $x < $width; $x++) {
        $rgb = imagecolorat($image, $x, $y);
        $r = ($rgb >> 16) & 0xFF;
        $g = ($rgb >> 8) & 0xFF;
        $b = $rgb & 0xFF;
        // Standard grayscale conversion
        $gray[$y][$x] = intval(0.299 * $r + 0.587 * $g + 0.114 * $b);
      }
    }

    // Compute gradient magnitude (simplified Sobel)
    for ($y = 1; $y < $height - 1; $y++) {
      for ($x = 1; $x < $width - 1; $x++) {
        // Horizontal gradient
        $gx = -$gray[$y-1][$x-1] + $gray[$y-1][$x+1]
            - 2*$gray[$y][$x-1] + 2*$gray[$y][$x+1]
            - $gray[$y+1][$x-1] + $gray[$y+1][$x+1];

        // Vertical gradient
        $gy = -$gray[$y-1][$x-1] - 2*$gray[$y-1][$x] - $gray[$y-1][$x+1]
            + $gray[$y+1][$x-1] + 2*$gray[$y+1][$x] + $gray[$y+1][$x+1];

        // Gradient magnitude
        $saliency[$y][$x] = min(255, intval(sqrt($gx*$gx + $gy*$gy)));
      }
    }

    return $saliency;
  }

  // Find bounding box containing salient pixels
  private function find_salient_bbox($saliency, $width, $height) {
    $min_x = $width;
    $max_x = 0;
    $min_y = $height;
    $max_y = 0;
    $found = false;

    // Find bounding box of pixels above threshold
    for ($y = 0; $y < $height; $y++) {
      for ($x = 0; $x < $width; $x++) {
        if ($saliency[$y][$x] > $this->saliency_threshold) {
          $found = true;
          $min_x = min($min_x, $x);
          $max_x = max($max_x, $x);
          $min_y = min($min_y, $y);
          $max_y = max($max_y, $y);
        }
      }
    }

    if (!$found) {
      return false;
    }

    return array(
      'x' => $min_x,
      'y' => $min_y,
      'width' => $max_x - $min_x + 1,
      'height' => $max_y - $min_y + 1
    );
  }

  // Apply padding around the detected region
  private function apply_padding($bbox, $img_width, $img_height) {
    $center_x = $bbox['x'] + $bbox['width'] / 2;
    $center_y = $bbox['y'] + $bbox['height'] / 2;

    $new_width = $bbox['width'] * $this->padding_factor;
    $new_height = $bbox['height'] * $this->padding_factor;

    $new_x = $center_x - $new_width / 2;
    $new_y = $center_y - $new_height / 2;

    // Clip to image bounds
    if ($new_x < 0) {
      $new_width += $new_x;
      $new_x = 0;
    }
    if ($new_y < 0) {
      $new_height += $new_y;
      $new_y = 0;
    }
    if ($new_x + $new_width > $img_width) {
      $new_width = $img_width - $new_x;
    }
    if ($new_y + $new_height > $img_height) {
      $new_height = $img_height - $new_y;
    }

    return array(
      'x' => intval($new_x),
      'y' => intval($new_y),
      'width' => intval($new_width),
      'height' => intval($new_height)
    );
  }

  // Adjust bounding box to target aspect ratio
  private function adjust_aspect_ratio($bbox, $img_width, $img_height) {
    $current_aspect = $bbox['width'] / $bbox['height'];
    $center_x = $bbox['x'] + $bbox['width'] / 2;
    $center_y = $bbox['y'] + $bbox['height'] / 2;

    if ($current_aspect < $this->target_aspect) {
      // Too tall, need to widen
      $new_width = $bbox['height'] * $this->target_aspect;
      $new_height = $bbox['height'];
    } else {
      // Too wide, need to make taller
      $new_width = $bbox['width'];
      $new_height = $bbox['width'] / $this->target_aspect;
    }

    $new_x = $center_x - $new_width / 2;
    $new_y = $center_y - $new_height / 2;

    // Clip to image bounds, adjusting position first
    if ($new_x < 0) {
      $new_x = 0;
    }
    if ($new_y < 0) {
      $new_y = 0;
    }
    if ($new_x + $new_width > $img_width) {
      $new_x = $img_width - $new_width;
      if ($new_x < 0) {
        $new_x = 0;
        $new_width = $img_width;
        // Recalculate height to maintain aspect ratio within bounds
        $new_height = $new_width / $this->target_aspect;
        $new_y = $center_y - $new_height / 2;
        if ($new_y < 0) $new_y = 0;
        if ($new_y + $new_height > $img_height) $new_height = $img_height - $new_y;
      }
    }
    if ($new_y + $new_height > $img_height) {
      $new_y = $img_height - $new_height;
      if ($new_y < 0) {
        $new_y = 0;
        $new_height = $img_height;
        // Recalculate width to maintain aspect ratio within bounds
        $new_width = $new_height * $this->target_aspect;
        $new_x = $center_x - $new_width / 2;
        if ($new_x < 0) $new_x = 0;
        if ($new_x + $new_width > $img_width) $new_width = $img_width - $new_x;
      }
    }

    return array(
      'x' => max(0, intval($new_x)),
      'y' => max(0, intval($new_y)),
      'width' => intval($new_width),
      'height' => intval($new_height)
    );
  }
}
?>
