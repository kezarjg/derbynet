<?php

return array(

"DROP TABLE IF EXISTS EventLaneDetails",

// Raw results reported by the timer, or entered by the user,
// along with the roundid and heat that were current at the time
// (i.e., the heat to which these values were applied).
"CREATE TABLE EventLaneDetails ("
."  tresultid           INT AUTO_INCREMENT PRIMARY KEY, "
."  finishid            INT, "
."  `lane`              INT NOT NULL, "
."  `finishtime`        DOUBLE NULL, "
."  `finishplace`       INT, "
."  `completed`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP "
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE INDEX EventLaneDetails_finishid ON EventLaneDetails(finishid)",

);

?>
