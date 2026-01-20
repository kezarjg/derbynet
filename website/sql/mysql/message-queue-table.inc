<?php
return array(

"DROP TABLE IF EXISTS MessageQueue",
"CREATE TABLE MessageQueue ("
."  msgid      INT AUTO_INCREMENT PRIMARY KEY, "
."  recipient  VARCHAR(50),"
."  expiration INT,"  // Unix timestamp
."  message    TEXT"
."  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);
?>
