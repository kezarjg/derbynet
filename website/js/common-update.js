// Moves curgroup class and adds "Now Racing" text.
//
// tbodyid identifies the <tbody> element for the current round(s).
// round is the numeric round
// classname: optional name of current racing class
// now_racing: boolean indicating if racing is actively in progress
function notice_change_current_tbody(tbodyid, round, classname, now_racing) {
  // g_update_status.current.tbodyid is initialized to -1, and query
  // poll.ondeck should keep reporting current.tbodyid=-1 before racing
  // starts.  While racing is actually underway, current.tbodyid should be > 0.
  // When concluded, current.tbodyid should report an empty string.

  // Track both tbodyid and now_racing state for change detection
  var dominated_tbody = $("tbody.curgroup");
  var dominated_tbodyid = dominated_tbody.attr('id');
  var dominated_now_racing = dominated_tbody.hasClass('now-racing-active');

  if (tbodyid != dominated_tbodyid || now_racing != dominated_now_racing) {
	// Remove class and text from previous tbody, if any
	$(".curgroup").not("#overflow").removeClass("curgroup").removeClass("now-racing-active");
	$(".pre_group_title").html("");

	// Mark the current racing tbody if racing is active
	if (tbodyid && now_racing) {
	  $("#tbody_" + tbodyid).addClass("curgroup").addClass("now-racing-active");
	  var curgroup = $(".curgroup .pre_group_title");
	  if (curgroup.length > 0) {
		curgroup.html("Now<br/>Racing");
	  }
	}

	// Update text and target of "Now racing" link at top of page.
	if (tbodyid && now_racing) {
	  $(".now_running").html("Now racing: <a href='#tbody_" + tbodyid + "'>"
							 + (classname ? classname + ", " : "")
							 + "Round " + round + "</a>");
	} else {
	  $(".now_running").html("Racing has concluded.");
	}
  }
}
