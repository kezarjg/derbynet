// We don't know the actual rendered size of the main photo until after it's
// loaded, so that's when we can calculate how much margin to apply to the main
// photo so it's vertically centered.  (If the image is taller than its
// container, margin can be zero and the image will be scaled down to fit.)
function mainphoto_onload(img) {
  var height = img.height;
  if (img.width > $("#photo-background").width()) {
    // img.height and width give the "true" image size, but the photo will
    // actually render at a scaled size
    height = height * $("#photo-background").width() / img.width;
  }
  if (height < $("#photo-background").height()) {
    var top_margin = ($("#photo-background").height() - height) / 2;
    $(img).css('margin-top', top_margin);
  }
  $(img).css({'max-height': $("#photo-background").height(),
             'max-width': $("#photo-background").width()});
}


(function() {
  // g_kiosk_parameters is set in slideshow.php
  var kiosk_parameters = g_kiosk_parameters;

  // Slideshow state
  var is_paused = false;
  var slide_interval;
  var manual_advance_timeout;
  var pending_ajax = null;

  // Navigation history: array of slides with an index pointer
  var slide_history = [];
  var history_index = -1;  // Current position in history

  try {
    KioskPoller.param_callback = function(parameters) {
      if (parameters != null) {
        kiosk_parameters = parameters;
      }
    };
  } catch (e) {
    // If not in a kiosk, then KioskPoller will be undefined.
  }

  // Display a slide on screen
  function display_slide(response) {
    // Remove old current slide and any pending next slide
    $("#photo-background div.current").remove();
    $("#photo-background div.next").remove();

    // Create new slide as current (visible immediately)
    var current = $("<div class='current'></div>").appendTo("#photo-background")
        .append($("<img class='mainphoto'/>")
                .attr('src', response['photo'])
                .on('load', function() { mainphoto_onload(this); }));

    // Add award indicators if awards exist
    if (response.hasOwnProperty('awards') && response['awards'].length > 0) {
      var award_container = $("<div class='award_indicators'></div>").appendTo(current);
      for (var i = 0; i < response['awards'].length; i++) {
        var award = response['awards'][i];
        var award_class = award.type + '_award';

        $("<div class='award_indicator " + award_class + "'></div>")
          .text(award.name)
          .appendTo(award_container);
      }
    }

    if (response.hasOwnProperty('name')) {
      var subtitle = $("<p class='subtitle'/>").text(response['name']).appendTo(current);
      if (response.hasOwnProperty('carnumber')) {
        subtitle.prepend(': ')
                .prepend($("<span class='carno'/>").text(response['carnumber']));
      }
      if (response.hasOwnProperty('carname')) {
        subtitle.append("<br/>")
                .append($("<i/>").text(response['carname']));
      }
    }

    if (response.hasOwnProperty('inset')) {
      current.append('<img class="inset_photo" src="' + response['inset'] + '"/>');
    }

    if (response.hasOwnProperty('title') && kiosk_parameters.title) {
      $('<p class="maintitle"></p>').text(kiosk_parameters.title).appendTo(current);
    }
  }

  // Add a new slide to history and display it
  function add_and_display(response) {
    // If we navigated back and then got a new slide, truncate forward history
    if (history_index < slide_history.length - 1) {
      slide_history = slide_history.slice(0, history_index + 1);
    }
    slide_history.push(response);
    history_index = slide_history.length - 1;
    display_slide(response);
  }

  // Fetch the next slide from server
  function fetch_next_slide() {
    var current = slide_history[history_index];
    var next_query = current ? current.next : {'mode': 'slide', 'file': ''};

    next_query.query = 'slide.next';
    if (kiosk_parameters.subdir) {
      next_query.subdir = kiosk_parameters.subdir;
    }
    var classids = kiosk_parameters.classids;
    if (classids && classids.length > 0) {
      next_query.classids = classids.join(',');
    }
    pending_ajax = $.ajax('action.php',
           {type: 'GET',
            data: next_query,
            success: function(data) {
              pending_ajax = null;
              if (data.hasOwnProperty('photo')) {
                add_and_display(data.photo);
              } else {
                add_and_display({'photo': 'slide.php/title',
                              'title': true,
                              'next': {'mode': 'slide',
                                       'file': ''}});
              }
            }
           }
          );
  }

  function start_slideshow() {
    if (slide_interval) {
      clearInterval(slide_interval);
    }
    slide_interval = setInterval(function() {
      // Always fetch next when auto-advancing
      fetch_next_slide();
    }, 10000);
    is_paused = false;
    $("#pause-indicator").removeClass("visible");
  }

  function pause_slideshow() {
    if (slide_interval) {
      clearInterval(slide_interval);
      slide_interval = null;
    }
    is_paused = true;
    if (manual_advance_timeout) {
      clearTimeout(manual_advance_timeout);
      manual_advance_timeout = null;
    }
    if (pending_ajax) {
      pending_ajax.abort();
      pending_ajax = null;
    }
  }

  function toggle_pause_play() {
    if (is_paused) {
      start_slideshow();
    } else {
      pause_slideshow();
      $("#pause-indicator").addClass("visible");
    }
  }

  function manual_next_slide() {
    pause_slideshow();
    $("#pause-indicator").addClass("visible");

    // If we have forward history, use it; otherwise fetch new
    if (history_index < slide_history.length - 1) {
      history_index++;
      display_slide(slide_history[history_index]);
    } else {
      fetch_next_slide();
    }

    manual_advance_timeout = setTimeout(start_slideshow, 30000);
  }

  function manual_prev_slide() {
    pause_slideshow();
    $("#pause-indicator").addClass("visible");

    if (history_index > 0) {
      history_index--;
      display_slide(slide_history[history_index]);
    }

    manual_advance_timeout = setTimeout(start_slideshow, 30000);
  }

  $(document).ready(function() {
    // Keyboard event handler
    $(document).keydown(function(e) {
      switch(e.which) {
        case 32: // Spacebar
          e.preventDefault();
          toggle_pause_play();
          break;
        case 37: // Left arrow
        case 38: // Up arrow
          e.preventDefault();
          manual_prev_slide();
          break;
        case 39: // Right arrow
        case 40: // Down arrow
          e.preventDefault();
          manual_next_slide();
          break;
        case 191: // ? (slash key, with shift)
          if (e.shiftKey) {
            e.preventDefault();
            $("#help-overlay").toggleClass("hidden");
          }
          break;
      }
    });

    // Auto-hide help hint after 5 seconds
    setTimeout(function() {
      $("#help-hint").addClass("hidden");
    }, 5000);

    $("#photo-background").height($("#photo-background").height() -
                                  $("#photo-background").position().top);

    // Check if we should start at a specific racer (by car number)
    if (typeof g_start_racerid !== 'undefined' && g_start_racerid > 0) {
      // Fetch the specific racer
      var start_query = {
        'query': 'slide.next',
        'mode': 'racer',
        'racerid': g_start_racerid - 1  // Query uses racerid > X
      };
      $.ajax('action.php', {
        type: 'GET',
        data: start_query,
        success: function(data) {
          if (data.hasOwnProperty('photo')) {
            add_and_display(data.photo);
          }
          // Start paused so user can see the specific racer
          is_paused = true;
          $("#pause-indicator").addClass("visible");
        }
      });
    } else {
      // Start with title slide
      var title_slide = {
        'photo': 'slide.php/title',
        'title': true,
        'next': {'mode': 'slide', 'file': ''}
      };
      add_and_display(title_slide);
      start_slideshow();
    }
  });
}());
