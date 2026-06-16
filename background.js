// Background service worker for Fill Anything Chrome Extension
// Handles extension lifecycle and cross-tab communication

function loadPersonalInfoIntoStorage() {
  const url = chrome.runtime.getURL('personal-info.json');
  fetch(url + '?t=' + Date.now(), { cache: 'no-cache' })
    .then(resp => resp.json())
    .then(data => {
      chrome.storage.local.set({ fillAnythingPersonalInfo: data }, () => {
        console.log('[Fill Anything] Personal info loaded/synced to storage');
      });

      // Also set a flag if the user has configured real data
      const info = data.personalInfo || data;
      const PLACEHOLDER_PATTERNS = [
        'YOUR_', 'APT_', 'SUITE_', 'UNIT_', 'EMERGENCY_CONTACT_',
        'YYYY-MM-DD', 'MM/YY', 'DD', 'MM', 'YYYY', 'Select...'
      ];
      const hasRealData = Object.entries(info).some(([key, fieldDef]) => {
        if (key.startsWith('//') || key === 'customFieldMappings') return false;
        if (fieldDef && typeof fieldDef === 'object' && fieldDef.enabled !== false && fieldDef.value) {
          const val = fieldDef.value;
          if (val && val !== '') {
            const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => val.startsWith(p) || val === p);
            return !isPlaceholder;
          }
        }
        return false;
      });
      chrome.storage.local.set({ fillAnythingConfigured: hasRealData });
    })
    .catch(err => {
      console.error('[Fill Anything] Failed to load personal info:', err);
    });
}

// On install or update/reload
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Fill Anything] Extension installed/updated, reason:', details.reason);
  loadPersonalInfoIntoStorage();
});

// On startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Fill Anything] Browser started, loading personal info');
  loadPersonalInfoIntoStorage();
});

// Relay messages between popup and content scripts if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ tabId: tabs[0].id, url: tabs[0].url });
      }
    });
    return true;
  }
  return false;
});

// Optional: context menu for quick fill
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create({
    id: 'fillAnythingQuickFill',
    title: 'Fill Anything - Auto Fill Form',
    contexts: ['page']
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'fillAnythingQuickFill' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'fillForms', mode: 'all' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not injected, inject it
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        }, () => {
          // Retry
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'fillForms', mode: 'all' });
          }, 100);
        });
      }
    });
  }
});
