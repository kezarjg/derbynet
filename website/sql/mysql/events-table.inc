<?php
return array(

"DROP TABLE IF EXISTS Events",
"CREATE TABLE Events ("
."  seq     INT AUTO_INCREMENT PRIMARY KEY,"
."	tstamp  DATETIME,"
."	action  INT,"
."  racerid INT,"
."  classid INT,"
."  rankid  INT,"
."  roundid INT,"
."  heat    INT,"
."  finishid  INT,"  // FK to EventLaneDetails.finishid
."  other   VARCHAR(250)"
."	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
);
?>
