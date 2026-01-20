<?php
require_once('inc/schema_version.inc');

if (!function_exists('make_index')) {
  function make_index($table, $column) {
    return "CREATE INDEX ".$table."_".$column." ON ".$table."(".$column.")";
  }

  function table_exists($table_name) {
    global $db;
    $dbname = $db->query("SELECT DATABASE()")->fetchColumn();
    return read_single_value("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES"
                             ." WHERE TABLE_SCHEMA='$dbname' AND TABLE_NAME='$table_name'") > 0;
  }
}

$updates = array();

if (schema_version() < 2) {

  $updates[] = "ALTER TABLE RaceInfo MODIFY itemvalue VARCHAR(200)";

  $updates[] = "ALTER TABLE Classes ADD COLUMN sortorder INT";
  $updates[] = "ALTER TABLE Ranks ADD COLUMN sortorder INT";

  $updates[] = "ALTER TABLE RegistrationInfo ADD COLUMN carphoto VARCHAR(255)";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '2')";
}

if (schema_version() < 3) {
  $updates[] = "ALTER TABLE Classes ADD COLUMN constituents VARCHAR(100) DEFAULT ''";
  $updates[] = "ALTER TABLE Classes ADD COLUMN durable INT";
  $updates[] = "ALTER TABLE Classes ADD COLUMN ntrophies INT DEFAULT -1";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '3')";
}

if (schema_version() < 4) {
  if (!table_exists('MessageQueue')) {
    $updates = array_merge($updates,
                           @include(sql_file_path('message-queue-table')));
  }
  if (!table_exists('Scenes')) {
    $updates = array_merge($updates,
                           @include(sql_file_path('scene-tables')));
  }
  if (!table_exists('Playlist')) {
    $updates = array_merge($updates,
                           @include(sql_file_path('playlist-table')));
  }

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '4')";
}

if (schema_version() < 5) {
  $updates[] = "ALTER TABLE Classes ADD COLUMN rankids VARCHAR(100) DEFAULT ''";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '5')";
}

if (schema_version() < 6) {
  $updates = array_merge($updates,
                         @include(sql_file_path('balloting')));

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '6')";
}

if (schema_version() < 7) {
  $updates = array_merge($updates,
                         @include(sql_file_path('timer-settings')));

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '7')";
}

if (schema_version() < 8) {
  $updates = array_merge($updates,
                         @include(sql_file_path('partitions')));
  $updates[] = "ALTER TABLE RegistrationInfo ADD COLUMN partitionid INT";
  $updates[] = "ALTER TABLE RegistrationInfo ADD COLUMN note VARCHAR(255)";
  $updates[] = "CREATE TABLE ConstituentClasses ("
                  ."antecedent INT, dependent INT, UNIQUE (antecedent, dependent)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '8')";
}

if (schema_version() < 9) {
  $updates = array_merge($updates,
                         @include(sql_file_path('event-lane-details')));
  // $updates[] = "ALTER TABLE Events DROP COLUMN lane";
  $updates[] = "ALTER TABLE Events ADD COLUMN finishid INT";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '9')";
}

if (schema_version() < 10) {
  $updates = array_merge($updates,
                         @include(sql_file_path('action-history')));
  $updates[] = "ALTER TABLE Ranks ADD COLUMN ntrophies INT DEFAULT -1";
  $updates[] = "ALTER TABLE RegistrationInfo ADD COLUMN checkin_time INT";

  $updates[] = "DELETE FROM RaceInfo WHERE itemkey = 'schema'";
  $updates[] = "INSERT INTO RaceInfo(itemkey, itemvalue) VALUES('schema', '10')";
}

// For each new schema version, copy the DELETE and INSERT for schema version

return $updates;
?>
