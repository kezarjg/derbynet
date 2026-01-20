<?php
return array(

"DROP TABLE IF EXISTS CheckinAudit",

"CREATE TABLE CheckinAudit"
."	("
."	seq    INT AUTO_INCREMENT PRIMARY KEY,"
."	stmt   VARCHAR (250),"
."	tstamp DATETIME"
."	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);
?>
