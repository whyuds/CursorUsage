// Popup script for handling UI interactions
document.addEventListener('DOMContentLoaded', function() {
  const actionBtn = document.getElementById('actionBtn');
  
  // Action button click handler - Go to Cursor usage page
  actionBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'https://cursor.com/dashboard?tab=usage' });
  });
});
