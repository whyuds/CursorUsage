# Cursor Session Token Extractor

A browser extension that automatically extracts and copies the WorkosCursorSessionToken from Cursor.com dashboard for seamless IDE integration.

## Features

- 🔄 **Automatic Detection**: Automatically detects when you visit the Cursor dashboard
- 📋 **One-Click Copy**: Instantly copies the session token to your clipboard
- 🔔 **Smart Notifications**: Shows a clean toast notification when the token is copied
- 🎯 **Minimal Permissions**: Only requests necessary permissions for functionality
- 🎨 **Clean Design**: Modern, minimalist black and white interface

## Installation

### From Chrome Web Store
1. Visit the Chrome Web Store (link will be available after publication)
2. Click "Add to Chrome"
3. Confirm the installation

### From Edge Add-ons Store
1. Visit the Microsoft Edge Add-ons Store (link will be available after publication)
2. Click "Get"
3. Confirm the installation

### Manual Installation (Developer Mode)
1. Download the extension files
2. Open Chrome/Edge and go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## How to Use

1. **Install the extension** from your browser's extension store
2. **Visit Cursor Dashboard**: Go to [cursor.com/dashboard](https://cursor.com/dashboard)
3. **Automatic Extraction**: The extension will automatically detect and copy your session token
4. **Notification**: You'll see a clean white toast notification confirming the copy action
5. **Use the Token**: The token is now in your clipboard and ready for IDE integration

## Permissions Explained

- **activeTab**: Required to interact with the current tab
- **storage**: Stores session information locally
- **tabs**: Monitors tab updates to detect dashboard visits
- **cookies**: Reads the WorkosCursorSessionToken from cursor.com cookies
- **clipboardWrite**: Copies the token to your clipboard
- **host_permissions**: Only accesses cursor.com domain

## Privacy

This extension:
- ✅ Only accesses cursor.com domain
- ✅ Only reads the WorkosCursorSessionToken cookie
- ✅ Stores data locally on your device
- ✅ Does not send any data to external servers
- ✅ Does not track your browsing activity

## Technical Details

- **Manifest Version**: 3 (latest Chrome/Edge standard)
- **Background Script**: Service worker for cookie monitoring
- **Content Script**: Handles clipboard operations and notifications
- **Popup Interface**: Clean, minimalist user interface

## Support

If you encounter any issues or have questions:
1. Check that you're logged into Cursor.com
2. Ensure you're visiting the dashboard page
3. Try refreshing the page if the token isn't detected immediately

## Version History

- **v1.0.0**: Initial release with automatic token extraction and copy functionality

## License

This project is open source and available under the MIT License.
