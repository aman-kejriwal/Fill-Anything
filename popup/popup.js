// Popup script for Fill Anything Chrome Extension
(function() {
  'use strict';

  const els = {
    formStatus: document.getElementById('formStatus'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    formCount: document.getElementById('formCount'),
    fillAllBtn: document.getElementById('fillAllBtn'),
    fillContactBtn: document.getElementById('fillContactBtn'),
    fillAddressBtn: document.getElementById('fillAddressBtn'),
    fillAllVisibleBtn: document.getElementById('fillAllVisibleBtn'),
    clearBtn: document.getElementById('clearBtn'),
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    resultsSection: document.getElementById('resultsSection'),
    resultsList: document.getElementById('resultsList'),
    settingsToggle: document.getElementById('settingsToggle'),
    settingsChevron: document.getElementById('settingsChevron'),
    settingsPanel: document.getElementById('settingsPanel'),
    animationDelay: document.getElementById('animationDelay'),
    highlightFilled: document.getElementById('highlightFilled'),
    skipDisabled: document.getElementById('skipDisabled'),
    skipReadonly: document.getElementById('skipReadonly'),
    fuzzyFallback: document.getElementById('fuzzyFallback'),
    editInfoBtn: document.getElementById('editInfoBtn'),
    importInfoBtn: document.getElementById('importInfoBtn'),
    importFile: document.getElementById('importFile'),
    lastSaved: document.getElementById('lastSaved'),
    setupWarning: document.getElementById('setupWarning')
  };

  let settings = {
    animationDelay: 100,
    highlightFilled: true,
    skipDisabled: true,
    skipReadonly: true,
    fuzzyFallback: true
  };

  // ===== INIT =====
  async function init() {
    loadSettings();
    await updateLastSaved();
    await detectForms();
  }

  // ===== SETTINGS =====
  function loadSettings() {
    try {
      const stored = localStorage.getItem('fillAnythingSettings');
      if (stored) settings = { ...settings, ...JSON.parse(stored) };
    } catch (e) {}
    if (els.animationDelay) els.animationDelay.value = settings.animationDelay;
    if (els.highlightFilled) els.highlightFilled.checked = settings.highlightFilled;
    if (els.skipDisabled) els.skipDisabled.checked = settings.skipDisabled;
    if (els.skipReadonly) els.skipReadonly.checked = settings.skipReadonly;
    if (els.fuzzyFallback) els.fuzzyFallback.checked = settings.fuzzyFallback;
  }

  function saveSettings() {
    settings.animationDelay = parseInt(els.animationDelay.value, 10) || 100;
    settings.highlightFilled = els.highlightFilled.checked;
    settings.skipDisabled = els.skipDisabled.checked;
    settings.skipReadonly = els.skipReadonly.checked;
    settings.fuzzyFallback = els.fuzzyFallback ? els.fuzzyFallback.checked : true;
    localStorage.setItem('fillAnythingSettings', JSON.stringify(settings));
  }

  async function updateLastSaved() {
    try {
      if (chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(['fillAnythingPersonalInfo']);
        const data = result['fillAnythingPersonalInfo'];
        if (data) {
          const info = data.personalInfo || data;
          if (info && typeof info === 'object') {
            // Check if any real values exist (not placeholders)
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
            if (hasRealData) {
              if (els.lastSaved) els.lastSaved.textContent = 'Configured';
              if (els.setupWarning) els.setupWarning.style.display = 'none';
              return;
            }
          }
        }
      }
    } catch (e) {
      console.error('[Fill Anything] Error updating status:', e);
    }
    if (els.lastSaved) els.lastSaved.textContent = 'Not configured';
    if (els.setupWarning) els.setupWarning.style.display = 'flex';
  }

  // ===== FORM DETECTION =====
  async function detectForms() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        setErrorStatus('Cannot access tab');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const forms = document.querySelectorAll('form');
          const allFields = document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]):not([type="file"]), select, textarea'
          );
          const visibleFields = Array.from(allFields).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });
          return {
            formCount: forms.length,
            totalFields: visibleFields.length,
            hasFields: visibleFields.length > 0
          };
        }
      });

      const info = results?.[0]?.result;
      if (info && info.hasFields) {
        setActiveStatus(info.formCount, info.totalFields);
        enableButtons();
      } else if (info) {
        setEmptyStatus(info.formCount);
        disableButtons();
      } else {
        setErrorStatus('Cannot scan this page');
        disableButtons();
      }
    } catch (e) {
      setErrorStatus('Error: ' + (e.message || 'unknown'));
      disableButtons();
    }
  }

  // ===== STATUS UI =====
  function setActiveStatus(formCount, fieldCount) {
    els.formStatus.classList.add('active');
    els.formStatus.classList.remove('error');
    els.statusText.textContent = `Found ${fieldCount} field${fieldCount !== 1 ? 's' : ''} in ${formCount} form${formCount !== 1 ? 's' : ''}`;
    els.formCount.textContent = fieldCount + ' fields';
  }

  function setEmptyStatus(formCount) {
    els.formStatus.classList.remove('active', 'error');
    els.statusText.textContent = formCount > 0 ? 'No fillable fields' : 'No forms detected';
    els.formCount.textContent = formCount + ' form(s)';
  }

  function setErrorStatus(msg) {
    els.formStatus.classList.add('error');
    els.formStatus.classList.remove('active');
    els.statusText.textContent = msg;
    els.formCount.textContent = '';
  }

  function enableButtons() {
    els.fillAllBtn.disabled = false;
    els.fillContactBtn.disabled = false;
    els.fillAddressBtn.disabled = false;
    els.fillAllVisibleBtn.disabled = false;
    els.clearBtn.disabled = false;
  }

  function disableButtons() {
    els.fillAllBtn.disabled = true;
    els.fillContactBtn.disabled = true;
    els.fillAddressBtn.disabled = true;
    els.fillAllVisibleBtn.disabled = true;
    els.clearBtn.disabled = true;
  }

  // ===== PROGRESS =====
  function showProgress(pct, text) {
    els.progressSection.style.display = 'block';
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = text;
  }

  function hideProgress() {
    setTimeout(() => { els.progressSection.style.display = 'none'; }, 1500);
  }

  // ===== RESULTS =====
  function showResults(results) {
    els.resultsSection.style.display = 'block';
    els.resultsList.innerHTML = '';

    if (!results || results.length === 0) {
      addResultItem('○', 'No fields were filled. Make sure your personal info is configured.', 'partial');
      return;
    }

    const exact = results.filter(r => r.status === 'filled').length;
    const guessed = results.filter(r => r.status === 'guessed' || r.status === 'weak-guess').length;
    const unfilled = results.filter(r => r.status === 'unfilled').length;
    const errors = results.filter(r => r.status === 'error').length;

    if (exact > 0) addResultItem('✓', `${exact} field${exact !== 1 ? 's' : ''} filled (exact match)`, 'success');
    if (guessed > 0) addResultItem('~', `${guessed} field${guessed !== 1 ? 's' : ''} filled (best guess — please review)`, 'partial');
    if (unfilled > 0) addResultItem('○', `${unfilled} field${unfilled !== 1 ? 's' : ''} could not be matched`, 'none');
    if (errors > 0) addResultItem('✗', `${errors} error${errors !== 1 ? 's' : ''}`, 'none');

    // Show individual results (first 15)
    results.slice(0, 15).forEach(r => {
      let icon, cls;
      switch (r.status) {
        case 'filled': icon = '✓'; cls = 'success'; break;
        case 'guessed': icon = '~'; cls = 'partial'; break;
        case 'weak-guess': icon = '~'; cls = 'partial'; break;
        case 'unfilled': icon = '○'; cls = 'none'; break;
        case 'error': icon = '✗'; cls = 'none'; break;
        default: icon = '?'; cls = 'none';
      }
      const prefix = r.matchType ? `[${r.matchType}] ` : '';
      addResultItem(icon, `${prefix}${r.label}`, cls);
    });

    if (results.length > 15) {
      addResultItem('...', `and ${results.length - 15} more`, 'partial');
    }
  }

  function addResultItem(icon, text, cls) {
    const div = document.createElement('div');
    div.className = 'result-item ' + cls;
    div.innerHTML = `<span class="icon">${icon}</span><span>${escapeHtml(text)}</span>`;
    els.resultsList.appendChild(div);
  }

  function hideResults() {
    els.resultsSection.style.display = 'none';
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== FILL FORMS =====
  async function fillForms(mode) {
    hideResults();
    disableButtons();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        enableButtons();
        return;
      }

      showProgress(20, 'Scanning fields...');

      // Inject content script if needed, then send fill command
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          action: 'fillForms',
          mode: mode,
          settings: settings
        });
      } catch (connErr) {
        // Content script not loaded — inject it
        if (connErr.message && connErr.message.includes('Could not establish connection')) {
          showProgress(40, 'Injecting extension...');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js']
          });
          // Wait a moment for the script to initialize
          await new Promise(r => setTimeout(r, 200));
          // Now try again
          response = await chrome.tabs.sendMessage(tab.id, {
            action: 'fillForms',
            mode: mode,
            settings: settings
          });
        } else {
          throw connErr;
        }
      }

      hideProgress();

      if (response && response.results && response.results.length > 0) {
        showResults(response.results);
      } else if (response && response.personalInfoEmpty) {
        addResultItem('⚠', 'No personal info configured! Click "Edit Personal Info" below to set up your data.', 'partial');
        els.resultsSection.style.display = 'block';
        els.resultsList.innerHTML = '';
        addResultItem('⚠', 'No personal info configured!', 'none');
        addResultItem('→', 'Click "Edit Personal Info" in Settings to set up your data.', 'partial');
      } else {
        showResults([{ status: 'unfilled', label: 'No matching fields found' }]);
      }
    } catch (e) {
      hideProgress();
      setErrorStatus('Error: ' + (e.message || 'unknown'));
      console.error('[Fill Anything] Fill error:', e);
    }

    enableButtons();
    await detectForms();
  }

  // ===== CLEAR FILLED =====
  async function clearFields() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      await chrome.tabs.sendMessage(tab.id, { action: 'clearFilled' });
    } catch (e) { /* ignore */ }
    hideResults();
    showResults([{ status: 'filled', label: 'Fields cleared' }]);
  }

  // ===== EVENT LISTENERS =====
  els.fillAllBtn.addEventListener('click', () => fillForms('all'));
  els.fillContactBtn.addEventListener('click', () => fillForms('contact'));
  els.fillAddressBtn.addEventListener('click', () => fillForms('address'));
  els.fillAllVisibleBtn.addEventListener('click', () => fillForms('visible'));
  els.clearBtn.addEventListener('click', clearFields);

  els.settingsToggle.addEventListener('click', () => {
    const isOpen = els.settingsPanel.style.display !== 'none';
    els.settingsPanel.style.display = isOpen ? 'none' : 'flex';
    els.settingsToggle.classList.toggle('open', !isOpen);
    els.settingsChevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  });

  if (els.animationDelay) els.animationDelay.addEventListener('change', saveSettings);
  if (els.highlightFilled) els.highlightFilled.addEventListener('change', saveSettings);
  if (els.skipDisabled) els.skipDisabled.addEventListener('change', saveSettings);
  if (els.skipReadonly) els.skipReadonly.addEventListener('change', saveSettings);
  if (els.fuzzyFallback) els.fuzzyFallback.addEventListener('change', saveSettings);

  if (els.editInfoBtn) {
    els.editInfoBtn.addEventListener('click', () => {
      const jsonUrl = chrome.runtime.getURL('personal-info.json');
      chrome.tabs.create({ url: jsonUrl });
    });
  }

  if (els.importInfoBtn && els.importFile) {
    els.importInfoBtn.addEventListener('click', () => {
      els.importFile.click();
    });

    els.importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          
          // Verify format
          const info = data.personalInfo || data;
          if (!info || typeof info !== 'object') {
            throw new Error('Invalid JSON format. Must contain a personalInfo object.');
          }

          if (chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ fillAnythingPersonalInfo: data });
            
            // Update UI status
            await updateLastSaved();

            // Notify content script in the active tab to reload its data
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
              try {
                await chrome.tabs.sendMessage(tab.id, { action: 'reloadData' });
              } catch (err) { /* content script might not be loaded yet */ }
            }

            hideResults();
            showResults([{ status: 'filled', label: 'Imported configuration successfully!' }]);
          } else {
            throw new Error('Chrome storage not available.');
          }
        } catch (err) {
          showResults([{ status: 'error', label: 'Import failed: ' + err.message }]);
          console.error('[Fill Anything] Import error:', err);
        }
      };
      reader.readAsText(file);
    });
  }

  init();
})();
