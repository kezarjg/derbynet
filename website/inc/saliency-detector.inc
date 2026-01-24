<?php
// Object detection for car photos
// Optimized for white light box photography - finds dark objects on light backgrounds

class SaliencyDetector {
  // Padding factor to add around detected region (1.02 = 2% padding)
  private $padding_factor = 1.02;

  // Target aspect ratio for car photos (4:3 landscape)
  private $target_aspect = 4.0 / 3.0;

  // Darkness threshold - pixels must be this much darker than background
  // Higher value = stricter detection (requires darker pixels)
  private $darkness_threshold = 60;

  // Border margin to ignore (percentage) - helps exclude edges of light box
  // 8% margin helps ignore table edges, checkered patterns, etc. outside the light box
  private $border_margin = 0.08;

  // Downsample factor for faster processing
  private $downsample_max = 400;

  public function __construct($padding_factor = 1.02, $target_aspect = null) {
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

    // Use brightness-based detection for white box photography
    $bbox = $this->find_dark_object($small, $small_w, $small_h);

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

  // Find dark object on light background (optimized for white box photography)
  private function find_dark_object($image, $width, $height) {
    // Calculate border margins to ignore
    $margin_x = intval($width * $this->border_margin);
    $margin_y = intval($height * $this->border_margin);

    // Sample corners to estimate background brightness (should be white/light)
    $corner_samples = array();
    $sample_size = min(10, intval($width * 0.05), intval($height * 0.05));
    if ($sample_size < 3) $sample_size = 3;

    // Top-left corner
    for ($y = $margin_y; $y < $margin_y + $sample_size && $y < $height; $y++) {
      for ($x = $margin_x; $x < $margin_x + $sample_size && $x < $width; $x++) {
        $corner_samples[] = $this->get_brightness($image, $x, $y);
      }
    }
    // Top-right corner
    for ($y = $margin_y; $y < $margin_y + $sample_size && $y < $height; $y++) {
      for ($x = $width - $margin_x - $sample_size; $x < $width - $margin_x; $x++) {
        if ($x >= 0) {
          $corner_samples[] = $this->get_brightness($image, $x, $y);
        }
      }
    }
    // Bottom-left corner
    for ($y = $height - $margin_y - $sample_size; $y < $height - $margin_y; $y++) {
      if ($y >= 0) {
        for ($x = $margin_x; $x < $margin_x + $sample_size && $x < $width; $x++) {
          $corner_samples[] = $this->get_brightness($image, $x, $y);
        }
      }
    }
    // Bottom-right corner
    for ($y = $height - $margin_y - $sample_size; $y < $height - $margin_y; $y++) {
      if ($y >= 0) {
        for ($x = $width - $margin_x - $sample_size; $x < $width - $margin_x; $x++) {
          if ($x >= 0) {
            $corner_samples[] = $this->get_brightness($image, $x, $y);
          }
        }
      }
    }

    if (empty($corner_samples)) {
      return false;
    }

    // Background brightness is the median of corner samples (robust to outliers)
    sort($corner_samples);
    $bg_brightness = $corner_samples[intval(count($corner_samples) / 2)];

    // Threshold for detecting dark pixels (pixels darker than this are the subject)
    $threshold = $bg_brightness - $this->darkness_threshold;

    // Find bounding box of dark pixels (excluding borders)
    $min_x = $width;
    $max_x = 0;
    $min_y = $height;
    $max_y = 0;
    $found = false;

    for ($y = $margin_y; $y < $height - $margin_y; $y++) {
      for ($x = $margin_x; $x < $width - $margin_x; $x++) {
        $brightness = $this->get_brightness($image, $x, $y);
        if ($brightness < $threshold) {
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

  // Get brightness of a pixel (0-255)
  private function get_brightness($image, $x, $y) {
    $rgb = imagecolorat($image, $x, $y);
    $r = ($rgb >> 16) & 0xFF;
    $g = ($rgb >> 8) & 0xFF;
    $b = $rgb & 0xFF;
    return intval(0.299 * $r + 0.587 * $g + 0.114 * $b);
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
