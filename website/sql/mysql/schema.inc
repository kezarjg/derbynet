<?php
// MySQL
require_once('inc/schema_version.inc');

if (!function_exists('make_index')) {
  function make_index($table, $column) {
    return "CREATE INDEX ".$table."_".$column." ON ".$table."(".$column.")";
  }
}

return array_merge(
array(
"ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",

"DROP TABLE IF EXISTS `Awards`",

"CREATE TABLE `Awards` ("
."  `awardid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `awardname` VARCHAR(100) NOT NULL, "
."  `awardtypeid` INT NOT NULL DEFAULT 1, "
."  `classid` INT, "
."  `rankid` INT, "
."  `racerid` INT DEFAULT 0, "
."  `sort` INT DEFAULT 0"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Awards", "awardtypeid"),
make_index("Awards", "awardname"),
make_index("Awards", "classid"),
make_index("Awards", "rankid"),
make_index("Awards", "sort"),

"DROP TABLE IF EXISTS `AwardTypes`",

"CREATE TABLE `AwardTypes` ("
."  `awardtypeid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `awardtype` VARCHAR(15) NOT NULL"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  ),

@include(sql_file_path('audit-table')),

@include(sql_file_path('events-table')),

array(

"DROP TABLE IF EXISTS `Classes`",

"CREATE TABLE `Classes` ("
."  `classid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `class` VARCHAR(75) NOT NULL UNIQUE"
.(expected_schema_version() < 3 ? "" :
  // For aggregate classes, constituents is a comma-separated list of classids, and
  // durable is true if the aggregate class was created explicitly by the user, otherwise
  // false if created while creating an aggregate round.
  (",  `constituents` VARCHAR(100) DEFAULT ''"
   .(expected_schema_version() < 5 ? "" :
     ",  `rankids` VARCHAR(100) DEFAULT ''")
   .", `durable` INT"
  // ntrophies is the number of trophies to award for this class, or -1 to use
  // the standard value from settings.
   .", `ntrophies` INT DEFAULT -1"))
.(expected_schema_version() < 2 ? "" : ",  `sortorder` INT")
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"DROP TABLE IF EXISTS ConstituentClasses",

"CREATE TABLE ConstituentClasses ("
."  antecedent INT,"
."  dependent  INT,"
."  UNIQUE (antecedent, dependent)"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"DROP TABLE IF EXISTS `RaceChart`",

"CREATE TABLE `RaceChart` ("
."  `resultid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `classid` INT, "
."  `roundid` INT NOT NULL, "
."  `heat` INT NOT NULL, "
."  `lane` INT NOT NULL, "
."  `racerid` INT, "
."  `chartnumber` INT, "
."  `finishtime` DOUBLE NULL, "
."  `finishplace` INT, "
."  `points` INT, "
."  `completed` TIMESTAMP NULL, "
."  `ignoretime` TINYINT(1) DEFAULT 0, "
."  `masterheat` INT DEFAULT 0"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("RaceChart", "chartnumber"),
make_index("RaceChart", "classid"),
make_index("RaceChart", "finishtime"),
make_index("RaceChart", "heat"),
make_index("RaceChart", "lane"),
make_index("RaceChart", "masterheat"),
make_index("RaceChart", "points"),
make_index("RaceChart", "racerid"),
make_index("RaceChart", "roundid"),

"DROP TABLE IF EXISTS `RaceInfo`",

"CREATE TABLE `RaceInfo` ("
."  `raceinfoid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `itemkey` VARCHAR(80) NOT NULL, "
.(expected_schema_version() < 2
  ? "  `itemvalue` VARCHAR(200)"
  : "  `itemvalue` VARCHAR(500)")
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("RaceInfo", "itemkey"),

"DROP TABLE IF EXISTS `Ranks`",

"CREATE TABLE `Ranks` ("
."  `rankid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `rank` VARCHAR(75) NOT NULL, "
."  `classid` INT NOT NULL"
.(expected_schema_version() < 10 ? "" :
  ", `ntrophies` INT DEFAULT -1")
.(expected_schema_version() < 2 ? "" : ",  `sortorder` INT ")
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Ranks", "classid"),
make_index("Ranks", "rank"),

"DROP TABLE IF EXISTS `RegistrationInfo`",

"CREATE TABLE `RegistrationInfo` ("
."  `racerid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `carnumber` INT NOT NULL, "
."  `carname` VARCHAR(30), "
."  `lastname` VARCHAR(30) NOT NULL, "
."  `firstname` VARCHAR(30) NOT NULL, "
."  `classid` INT NOT NULL, "
."  `rankid` INT NOT NULL, "
."  `partitionid` INT NOT NULL,"
."  `passedinspection` TINYINT(1) DEFAULT 0, "
."  `imagefile` VARCHAR(255), "
.(expected_schema_version() < 2 ? "" : "  `carphoto` VARCHAR(255), ")
.(expected_schema_version() < REGISTRATION_CHECKIN_SCHEMA ? "" : "  `checkin_time` INT, ")
."  `note` VARCHAR(255), "
."  `exclude` TINYINT(1) DEFAULT 0"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("RegistrationInfo", "carnumber"),
make_index("RegistrationInfo", "classid"),
make_index("RegistrationInfo", "exclude"),
make_index("RegistrationInfo", "lastname"),
make_index("RegistrationInfo", "passedinspection"),
make_index("RegistrationInfo", "rankid"),

"DROP TABLE IF EXISTS `Roster`",

"CREATE TABLE `Roster` ("
."  `rosterid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `roundid` INT NOT NULL, "
."  `classid` INT NOT NULL DEFAULT 0, "
."  `racerid` INT NOT NULL, "
."  `finalist` TINYINT(1) DEFAULT 0, "
."  `grandfinalist` TINYINT(1) DEFAULT 0"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Roster", "classid"),
make_index("Roster", "racerid"),
make_index("Roster", "roundid"),

"DROP TABLE IF EXISTS `Rounds`",

"CREATE TABLE `Rounds` ("
."  `roundid` INT AUTO_INCREMENT PRIMARY KEY, "
."  `round` INT NOT NULL, "
."  `classid` INT NOT NULL, "
."  `charttype` INT, "
."  `phase` INT"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Rounds", "classid"),
make_index("Rounds", "round"),
  ),

@include(sql_file_path('kiosk-table')),

@include(sql_file_path('message-queue-table')),

@include(sql_file_path('scene-tables')),

@include(sql_file_path('playlist-table')),

@include(sql_file_path('award-type-values')),

@include(sql_file_path('balloting')),

@include(sql_file_path('timer-settings')),

@include(sql_file_path('partitions')),

@include(sql_file_path('event-lane-details')),

@include(sql_file_path('action-history')),

array(
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('schema', ".expected_schema_version().")",
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('photos-on-now-racing', 'head')",
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('show-cars-on-deck', '1')",
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('show-racer-photos-rr', '1')",
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('show-car-photos-rr', '1')",
"INSERT INTO RaceInfo (itemkey, itemvalue) VALUES ('upload-videos', '1')",
  )
);
?>
