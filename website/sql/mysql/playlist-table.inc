<?php

return array(

"DROP TABLE IF EXISTS Playlist",
"CREATE TABLE Playlist ("
."  queueid              INT AUTO_INCREMENT PRIMARY KEY,"
."  seq                  INT,"
// Identifying the round by classid + round.
."  classid              INT,"
."  round                INT,"
// Roster creation parameters (if needed):
."  bucket_limit         INT,"
."  bucketed             INT,"  // Boolean
// Scheduling parameter (if needed): how many runs per lane for each racer
."  n_times_per_lane     INT,"
// If sceneid_at_finish is non-zero, it's a foreign key to Scenes table.
."  sceneid_at_finish    INT,"
// If sceneid_at_finish is zero, then continue_racing says whether to advance
// directly to the next round without a break.
."  continue_racing      INT"
."  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);
?>
