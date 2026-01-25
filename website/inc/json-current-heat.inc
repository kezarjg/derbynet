<?php

// Check if racing has concluded: racing is off AND there are no unrun heats
// in the current round (or no current round is set).
// For master scheduling, checks all scheduled heats across all rounds.
function racing_has_concluded(&$now_running) {
  if ($now_running['now_racing']) {
    return false;  // Racing is actively on
  }
  $roundid = @$now_running['roundid'];
  if (!$roundid || $roundid < 0) {
    return false;  // No round selected yet
  }

  if (@$now_running['use_master_sched']) {
    // For master scheduling, check if there are any unrun heats across ALL rounds
    $unrun_heats = read_single_value('SELECT COUNT(*) FROM RaceChart'
                                     .' WHERE finishtime IS NULL AND finishplace IS NULL');
  } else {
    // For normal scheduling, check only the current round
    $unrun_heats = read_single_value('SELECT COUNT(*) FROM RaceChart'
                                     .' WHERE roundid = :roundid'
                                     .'  AND finishtime IS NULL AND finishplace IS NULL',
                                     array(':roundid' => $roundid));
  }
  return $unrun_heats == 0;
}

function json_current_heat(&$now_running) {
  $concluded = racing_has_concluded($now_running);

  $current_heat = array(
    'now_racing' => $now_running['now_racing'] ? true : false,
    'concluded' => $concluded,
    'use_master_sched' => @$now_running['use_master_sched'] ? true : false,
    'use_points' => @$now_running['use_points'] ? true : false,
    'classid' => @$now_running['classid'],
    'roundid' => @$now_running['roundid'],
    'round' => @$now_running['round'],
    // Return empty tbodyid when racing has concluded to trigger "Racing has concluded." message
    'tbodyid' => $concluded ? '' : ($now_running['use_master_sched'] ? @$now_running['round'] : @$now_running['roundid']),
    'heat' => @$now_running['heat'],
    'number-of-heats' => read_single_value('SELECT MAX(heat) FROM RaceChart'
                                           .' WHERE roundid = :roundid',
                                           array(':roundid' => @$now_running['roundid']), 0));
  if (use_groups()) {
    $current_heat['class'] = @$now_running['class'];
  }
  if (@$now_running['use_master_sched']) {
    $current_heat['masterheat'] = read_single_value('SELECT masterheat FROM RaceChart'
                                                    .' WHERE roundid = :roundid'
                                                    .'   AND heat = :heat',
                                                    array(':roundid' => $now_running['roundid'],
                                                          ':heat' => $now_running['heat']));
    $current_heat['max_masterheat'] = read_single_value('SELECT MAX(masterheat) FROM RaceChart');
  }
  return $current_heat;
}

?>
