<?php

return array(

"DROP TABLE IF EXISTS Partitions",
"CREATE TABLE Partitions ("
."  partitionid        INT AUTO_INCREMENT PRIMARY KEY,"
."  name              VARCHAR(200) UNIQUE,"
."  rankid            INT,"
."  sortorder         INT"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);

?>
