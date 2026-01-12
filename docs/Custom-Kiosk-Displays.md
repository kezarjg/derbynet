# Creating Custom Kiosk Displays

This guide explains how to create custom kiosk display files for DerbyNet.

## Overview

DerbyNet's kiosk system allows you to create custom displays that can be assigned to various screens around your event venue. Each kiosk display is a standalone HTML/PHP/JavaScript file that automatically integrates with DerbyNet's polling and configuration system.

## File Location

Custom kiosk files should be placed in:

**Docker Installation:**
```
/var/lib/derbynet/kiosks/your-display.kiosk
```

**Standard Installation:**
```
$DERBYNET_CONFIG_DIR/kiosks/your-display.kiosk
```

Built-in kiosk files are located in:
```
website/kiosks/*.kiosk
```

The system automatically discovers and merges both built-in and custom kiosk files, displaying them all in the kiosk dashboard dropdown.

## Basic Template

Every kiosk file must follow this basic structure:

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Your Display Name</title>

<!-- Required: jQuery -->
<script type="text/javascript" src="js/jquery.js"></script>

<!-- Required: Kiosk polling system -->
<?php require('inc/kiosk-poller.inc'); ?>

<!-- Required: Standard stylesheets -->
<?php require('inc/stylesheet.inc'); ?>

<!-- Optional: Standard kiosk styles -->
<link rel="stylesheet" type="text/css" href="css/kiosks.css"/>

<!-- Your custom styles -->
<style type="text/css">
  /* Custom CSS here */
</style>

<!-- Your custom JavaScript -->
<script type="text/javascript">
$(function() {
  // Initialization code here
});
</script>
</head>
<body>
<?php
// Optional: Display banner across top
require_once('inc/banner.inc');
make_banner('Your Display Title', /* back_button */ false);
?>

<!-- Your display content here -->

<?php
// Required: AJAX failure handling
require('inc/ajax-failure.inc');
?>
</body>
</html>
```

## Required Elements

### 1. Kiosk Poller Include (REQUIRED)

```php
<?php require('inc/kiosk-poller.inc'); ?>
```

This include **must** be present in the `<head>` section. It provides:
- Automatic polling every 5 seconds to check for configuration changes
- Automatic page reload when the kiosk is reassigned to a different display
- Parameter update notifications
- Connection to the kiosk dashboard

### 2. jQuery (REQUIRED)

```html
<script type="text/javascript" src="js/jquery.js"></script>
```

The polling system and most DerbyNet JavaScript depends on jQuery.

### 3. Standard Stylesheet Include (REQUIRED)

```php
<?php require('inc/stylesheet.inc'); ?>
```

Provides access to DerbyNet's standard CSS and theming.

### 4. AJAX Failure Handler (REQUIRED)

```php
<?php require('inc/ajax-failure.inc'); ?>
```

Should be placed at the end of the `<body>` tag. Displays error messages if AJAX calls fail.

## Optional Elements

### Banner

Display the standard DerbyNet banner across the top of your kiosk:

```php
<?php
require_once('inc/banner.inc');
make_banner('Display Title', /* back_button */ false);
?>
```

Parameters:
- First parameter: Title text to display
- Second parameter: `false` disables the back button (recommended for kiosks)

### Standard Kiosk CSS

```html
<link rel="stylesheet" type="text/css" href="css/kiosks.css"/>
```

Provides helpful defaults for kiosk displays (full-screen layouts, etc.)

## Working with Parameters

Parameters allow coordinators to configure your kiosk display without editing code. For example, a QR code display might have `title` and `content` parameters.

### Server-Side Parameter Access

Access parameters in PHP using the `kiosk_parameters()` function:

```php
<?php
$params = kiosk_parameters();
$my_value = isset($params['my_param']) ? $params['my_param'] : 'default';
?>

<h1><?php echo htmlspecialchars($my_value); ?></h1>
```

**Important:** Always use `htmlspecialchars()` when outputting user-provided parameters to prevent XSS vulnerabilities.

### Client-Side Parameter Access

Handle dynamic parameter updates in JavaScript using the `KioskPoller.param_callback`:

```javascript
<script type="text/javascript">
$(function() {
  // Initialize with default or empty values
  var title = '';
  var content = '';

  // Define callback for parameter updates
  KioskPoller.param_callback = function(parameters) {
    // Called initially and whenever parameters change

    if (parameters.title != title) {
      $('#display-title').text(title = parameters.title);
    }

    if (parameters.content != content) {
      $('#display-content').html(content = parameters.content);
    }
  };
});
</script>
```

The `param_callback` is called:
1. Initially when the page loads
2. Every 5 seconds if parameters have changed
3. Automatically - no polling code needed

## Parameter Storage Format

Parameters are stored as JSON in the database, appended to the page path with a `#` separator:

```
kiosks/my-display.kiosk#{"title":"Welcome","color":"blue"}
```

The system automatically parses this and makes the parameters available via `kiosk_parameters()` and `KioskPoller.param_callback`.

## Adding Configuration UI (Advanced)

If your display has configurable parameters, you can add a configuration UI in the kiosk dashboard.

Create a handler in `website/js/kiosk-parameters.js`:

```javascript
g_kiosk_page_handlers['kiosks/my-display.kiosk'] = {
  decorate: function(kiosk_div, parameters, callback) {
    // Add a Configure button
    var button = $('<button class="configure-button">Configure</button>')
      .on('click', function() {
        // Show your configuration UI
        // This could open a modal dialog, etc.

        // When configuration is complete, call the callback
        // with the new parameters as a JavaScript object:
        var new_params = {
          title: 'New Title',
          color: 'red'
        };
        callback(new_params);
      });

    kiosk_div.append(button);

    // Optional: Display current parameter values
    if (parameters.title) {
      $('<p class="parameters"/>')
        .text('Title: ' + parameters.title)
        .appendTo(kiosk_div);
    }
  }
};
```

This is optional - kiosks without parameter handlers will still work, they just won't have custom configuration options in the dashboard.

## Examples

### Example 1: Simple Message Display

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Welcome Message</title>
<script type="text/javascript" src="js/jquery.js"></script>
<?php require('inc/kiosk-poller.inc'); ?>
<?php require('inc/stylesheet.inc'); ?>
<link rel="stylesheet" type="text/css" href="css/kiosks.css"/>
<style type="text/css">
#welcome-message {
  text-align: center;
  font-size: 72px;
  margin-top: 200px;
  color: #0066cc;
}
</style>
</head>
<body>
<?php
require_once('inc/banner.inc');
make_banner('', false);
?>

<div id="welcome-message">Welcome to Our Derby!</div>

<?php require('inc/ajax-failure.inc'); ?>
</body>
</html>
```

### Example 2: Display with Parameters

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Custom Message</title>
<script type="text/javascript" src="js/jquery.js"></script>
<?php require('inc/kiosk-poller.inc'); ?>
<?php require('inc/stylesheet.inc'); ?>
<link rel="stylesheet" type="text/css" href="css/kiosks.css"/>
<style type="text/css">
#message-container {
  text-align: center;
  margin-top: 150px;
}
#message-title {
  font-size: 60px;
  font-weight: bold;
  margin-bottom: 30px;
}
#message-body {
  font-size: 40px;
}
</style>
<script type="text/javascript">
$(function() {
  var title = '';
  var message = '';

  KioskPoller.param_callback = function(parameters) {
    // Update title if it changed
    if (parameters.title != title) {
      $('#message-title').text(title = parameters.title || 'Welcome');
    }

    // Update message if it changed
    if (parameters.message != message) {
      $('#message-body').text(message = parameters.message || 'Good luck!');
    }
  };
});
</script>
</head>
<body>
<?php
require_once('inc/banner.inc');
make_banner('', false);
?>

<div id="message-container">
  <div id="message-title"></div>
  <div id="message-body"></div>
</div>

<?php require('inc/ajax-failure.inc'); ?>
</body>
</html>
```

### Example 3: Accessing Race Data

```html
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<title>Race Count</title>
<script type="text/javascript" src="js/jquery.js"></script>
<?php require('inc/kiosk-poller.inc'); ?>
<?php require('inc/stylesheet.inc'); ?>
<link rel="stylesheet" type="text/css" href="css/kiosks.css"/>
<style type="text/css">
#stats {
  text-align: center;
  margin-top: 200px;
  font-size: 48px;
}
</style>
<script type="text/javascript">
$(function() {
  function updateStats() {
    $.ajax('action.php', {
      type: 'GET',
      data: {query: 'poll'},
      success: function(data) {
        if (data.hasOwnProperty('race-results')) {
          var completed = data['race-results'].length;
          $('#race-count').text(completed);
        }
      }
    });
  }

  // Update immediately
  updateStats();

  // Update every 5 seconds
  setInterval(updateStats, 5000);
});
</script>
</head>
<body>
<?php
require_once('inc/banner.inc');
make_banner('Race Statistics', false);
?>

<div id="stats">
  Races Completed: <span id="race-count">0</span>
</div>

<?php require('inc/ajax-failure.inc'); ?>
</body>
</html>
```

## Testing Your Custom Kiosk

### Method 1: Direct URL Testing

You can test your kiosk directly without registering it in the database:

```
http://your-server/kiosk.php?page=kiosks/your-display.kiosk
```

With parameters:
```
http://your-server/kiosk.php?page=kiosks/your-display.kiosk&parameters={"title":"Test"}
```

**Note:** When using the `page` parameter, the kiosk won't be registered in the database and won't appear in the dashboard.

### Method 2: Dashboard Assignment

1. Go to the Coordinator Dashboard
2. Click on "Kiosk Dashboard"
3. Your custom kiosk should appear in the dropdown list
4. Assign it to a kiosk address
5. Navigate to the kiosk (or open a new window with the kiosk address)

## Best Practices

### Security

1. **Always sanitize output:** Use `htmlspecialchars()` when displaying parameters or user data
2. **Validate input:** Check parameter types and values before using them
3. **Avoid eval():** Never use `eval()` with parameter data
4. **Be careful with HTML:** If you must allow HTML in parameters, use a whitelist approach

### Performance

1. **Minimize polling:** Don't create additional polling loops if possible - use `KioskPoller.param_callback`
2. **Optimize images:** Use appropriate image sizes for display resolution
3. **Avoid heavy JavaScript:** Remember these run on potentially low-powered devices

### Compatibility

1. **Test on target devices:** Kiosks often run on tablets, old laptops, or Raspberry Pis
2. **Use standard web technologies:** Avoid cutting-edge features that may not be supported
3. **Handle missing data gracefully:** Always provide defaults for parameters

### User Experience

1. **Design for distance viewing:** Use large fonts and high contrast
2. **Keep it simple:** Avoid clutter and unnecessary animations
3. **Test visibility:** View from actual kiosk distances (10+ feet)
4. **Consider orientation:** Most kiosks are landscape, but plan for both

## Available DerbyNet Resources

Your custom kiosk has access to all DerbyNet's JavaScript libraries and PHP includes:

### JavaScript Libraries

- `js/jquery.js` - jQuery library
- `js/ajax-setup.js` - AJAX configuration
- `js/kiosk-poller.js` - Kiosk polling system
- `js/modal.js` - Modal dialog utilities
- `js/utils.js` - General utilities

### PHP Includes

- `inc/data.inc` - Database access functions
- `inc/authorize.inc` - Authorization (usually not needed for kiosks)
- `inc/photo-config.inc` - Photo/image configuration
- `inc/classes.inc` - Class/rank data access
- `inc/standings.inc` - Standings calculations

### CSS Files

- `css/kiosks.css` - Kiosk-specific styles
- `css/jquery-ui.min.css` - jQuery UI styles
- `css/mobile.css` - Mobile/responsive styles

### AJAX Endpoints

Query endpoints (GET requests to `action.php`):
- `query=poll` - Get current race state
- `query=poll.kiosk` - Get kiosk-specific data
- `query=standings` - Get standings data

See existing kiosk files in `website/kiosks/` for examples of AJAX usage.

## Troubleshooting

### Kiosk doesn't appear in dashboard

- Verify file extension is exactly `.kiosk`
- Check file is in correct directory (`$DERBYNET_CONFIG_DIR/kiosks/`)
- Verify file permissions (must be readable by web server)
- Check Docker volume mount if using Docker

### Parameters not updating

- Verify `<?php require('inc/kiosk-poller.inc'); ?>` is present
- Check browser console for JavaScript errors
- Verify `KioskPoller.param_callback` is defined before polling starts
- Make sure you're not testing with `?page=` parameter (use dashboard assignment)

### Page not reloading when changed

- Ensure kiosk poller include is present
- Check that you're accessing via kiosk.php, not directly
- Verify kiosk is registered in database (use dashboard, not `?page=` testing)

### Styling issues

- Check browser developer tools for CSS conflicts
- Verify `<?php require('inc/stylesheet.inc'); ?>` is present
- Test on actual kiosk hardware/browser, not just desktop browser

## Examples from Built-in Kiosks

Study these built-in kiosk files for reference:

- `website/kiosks/flag.kiosk` - Simple image display
- `website/kiosks/qrcode.kiosk` - Parameters with dynamic updates
- `website/kiosks/now-racing.kiosk` - Complex real-time data display
- `website/kiosks/standings.kiosk` - Database-driven content
- `website/kiosks/please-check-in.kiosk` - Parameter configuration example

## Additional Resources

- DerbyNet GitHub: https://github.com/jeffpiazza/derbynet
- DerbyNet Website: http://jeffpiazza.github.io/derbynet/
- Installation Documentation: See `docs/Installation-*.fodt` files
