// Background script to monitor for the session cookie
let extractedSession = null;

function isCursorDashboard(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('cursor.com')) return false;
    const path = u.pathname.toLowerCase();
    return path.endsWith('/dashboard') || /\/dashboard\/?$/.test(path);
  } catch {
    return false;
  }
}

// Function to extract session from cookies and auto-copy to clipboard
async function extractSessionFromCookies() {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://cursor.com',
      name: 'WorkosCursorSessionToken'
    });
    
    if (cookie && cookie.value) {
      extractedSession = cookie.value;
      
      // Auto-copy to clipboard with prefix
      const sessionWithPrefix = `WorkosCursorSessionToken=${extractedSession}`;
      await copyToClipboard(sessionWithPrefix);
      
      // Notify the content script to show a toast
      notifyPageSessionCopied();
      
      // Store the session
      chrome.storage.local.set({
        cursorSession: extractedSession,
        sessionFound: true
      });
      
      // Update badge
      chrome.action.setBadgeText({text: '✓'});
      chrome.action.setBadgeBackgroundColor({color: '#000000'});
      
      return true;
    } else {
      chrome.storage.local.set({ sessionFound: false });
      chrome.action.setBadgeText({ text: '' });
      return false;
    }
  } catch (error) {
    console.error('Error reading cookies:', error);
    return false;
  }
}

// Function to copy text to clipboard using a content script
async function copyToClipboard(text) {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'copyToClipboard',
        text: text
      });
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
  }
}

// Function to notify content script to show a toast
function notifyPageSessionCopied() {
  chrome.tabs.query({active: true, url: '*://*.cursor.com/*'}, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showSessionCopiedToast'
      }).catch(error => {
        // Silent fail - content script might not be available
      });
    }
  });
}

// Listen for tab updates to trigger cookie extraction
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isCursorDashboard(tab.url)) {
    extractSessionFromCookies();
  }
});

// Reset session status when navigating away from cursor.com
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.includes('cursor.com')) {
    chrome.storage.local.set({ 
      'sessionFound': false 
    });
    chrome.action.setBadgeText({ text: '' });
  }
});
