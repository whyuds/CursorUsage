// Content script to interact with the page

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'copyToClipboard') {
    copyTextToClipboard(request.text);
  }
  if (request.action === 'showSessionCopiedToast') {
    showToast('Cursor session token copied to clipboard!');
  }
});

// Function to copy text to the clipboard using the modern Clipboard API
function copyTextToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Successfully copied
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

// Function to show a toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = '#ffffff';
  toast.style.color = '#000000';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
  toast.style.border = '1px solid #e9ecef';
  toast.style.zIndex = '9999';
  toast.style.opacity = '0';
  toast.style.transition = 'all 0.3s cubic-bezier(0.21, 1.02, 0.73, 1)';
  toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
  }, 100);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}
