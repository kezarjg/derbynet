<?php

return array(

"DROP TABLE IF EXISTS ActionHistory",
"CREATE TABLE ActionHistory ("
." historyid    INT AUTO_INCREMENT PRIMARY KEY,"
." received     TIMESTAMP NULL,"
." request      TEXT"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);

?>
