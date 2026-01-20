<?php

// For now, and very possibly forever, we recognize only one ballot, so we don't
// bother with a Ballots table, and ballotid is always fixed at 1.
//
// A Ballots entry has a collection of associated BallotAwards entries to define
// what awards are available for that ballot.
//
// RaceInfo table may have entries for:
//
// ballot_password (the password for users to access the vote.php page; blank for no password)
// balloting  ('open' or 'closed')

return array(

"DROP TABLE IF EXISTS `BallotAwards`",

"CREATE TABLE `BallotAwards` ("
." ballotid INT NOT NULL,"
." awardid INT NOT NULL, "
." depth INT NOT NULL"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE UNIQUE INDEX BallotAwards_Primary ON BallotAwards(ballotid, awardid)",
make_index("BallotAwards", "ballotid"),
make_index("BallotAwards", "awardid"),

// Voters are really just identified by string, normally a session identifier.
// when_cast and ip_addr are captured to provide some forensic clues just in
// case something goes wrong.
"DROP TABLE IF EXISTS `Voters`",

"CREATE TABLE `Voters` ("
." voterid INT AUTO_INCREMENT PRIMARY KEY, "
." ballotid INT NOT NULL, "
." identifier VARCHAR(200), "
." when_cast TIMESTAMP NULL, "
." ip_addr VARCHAR(200)"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Voters", "identifier"),

// Ballots and Voters are all in service of capturing Votes!
"DROP TABLE IF EXISTS `Votes`",

"CREATE TABLE `Votes` ("
." voteid INT AUTO_INCREMENT PRIMARY KEY,"
." awardid INT NOT NULL, "
." racerid INT NOT NULL, "
." voterid INT NOT NULL"
.") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
make_index("Votes", "awardid"),
make_index("Votes", "racerid"),
make_index("Votes", "voterid"),

);

?>
