<?php

return array(

"DROP TABLE IF EXISTS TimerSettings",

"CREATE TABLE TimerSettings ("
."  settingid            INT AUTO_INCREMENT PRIMARY KEY,"
."  kind                 VARCHAR(20),"  // flag, device, or ports
."  `key`                VARCHAR(100),"
."  type                 VARCHAR(10),"
."  value                VARCHAR(100),"
."  description          VARCHAR(500),"
."  pending              VARCHAR(100)"  // Value change requested
."  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

);

?>
