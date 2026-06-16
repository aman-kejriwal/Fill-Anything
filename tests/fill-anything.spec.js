// tests/fill-anything.spec.js
// End-to-end Playwright test for Fill Anything Chrome Extension
//
// Strategy: Load the content script directly into the page context
// (bypassing the extension system) so Playwright can access all functions.
// We mock chrome.storage and chrome.runtime to simulate the extension environment.

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CONTENT_SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'content.js'), 'utf8'
);
const TEST_FORM_HTML = fs.readFileSync(
  path.join(__dirname, 'test-form.html'), 'utf8'
);

// Chrome mock script to inject before any page code runs
const CHROME_MOCK_SCRIPT = `
  window.__chromeStorageData = {};
  window.chrome = {
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          const keyArray = Array.isArray(keys) ? keys : [keys];
          keyArray.forEach(k => { result[k] = window.__chromeStorageData[k]; });
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set(items, callback) {
          Object.assign(window.__chromeStorageData, items);
          if (callback) callback();
          return Promise.resolve();
        },
        onChanged: { addListener: () => {} },
      },
    },
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
    tabs: { query: () => {}, sendMessage: () => {} },
    scripting: { executeScript: () => {} },
  };
`;

let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(TEST_FORM_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  if (server) server.close();
}

// Helper: create a context with chrome mock pre-installed
async function createContext(browser) {
  const context = await browser.newContext();
  await context.addInitScript(CHROME_MOCK_SCRIPT);
  context.on('page', page => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  });
  return context;
}

// Helper: inject content script and wait for init
async function injectContentScript(page) {
  await page.evaluate((script) => {
    window.__fillAnythingInjected = false;
    eval(script);
  }, CONTENT_SCRIPT);

  await page.waitForFunction(
    () => window.__fillAnythingInjected === true,
    { timeout: 10000 }
  );
}

// Helper: inject test personal info data
async function injectTestData(page) {
  await page.evaluate(() => {
    window.__fillAnything.setPersonalInfoMap({
      firstName: 'Arjun',
      lastName: 'Kumar',
      fullName: 'Arjun Kumar',
      email: 'arjun.kumar.dev@example.com',
      phone: '9876543210',
      addressLine1: '42 MG Road',
      addressLine2: 'Apt 91D',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560037',
      country: 'India',
      dob: '1992-08-15',
      gender: 'Male',
      occupation: 'Software Developer',
      employer: 'TechCorp India Pvt Ltd',
      website: 'https://arjun.dev',
      username: 'arjun_dev',
      notes: 'Test notes from Playwright',
      cardName: 'Arjun Kumar',
      cardNumber: '4111111111111111',
      cardExpiry: '12/28',
      cardCvv: '123',
    });
  });
}

const BASE_URL = () => `http://127.0.0.1:${serverPort}/`;

// ===== TEST SUITE =====

test.describe('Fill Anything Extension', () => {
  let browser;

  test.beforeAll(async () => {
    await startServer();
    browser = await chromium.launch({ headless: false, timeout: 60000 });
  }, 90000);

  test.afterAll(async () => {
    if (browser) await browser.close();
    stopServer();
  });

  test('content script is injected', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    const injected = await page.evaluate(() => window.__fillAnythingInjected);
    expect(injected).toBe(true);
    await context.close();
  });

  test('core API functions are available', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    const functions = [
      'getFillableFields', 'findBestMatch', 'fillForms',
      'clearHighlights', 'setFieldValue', 'scoreMatch', 'fuzzyMatch',
    ];
    for (const fn of functions) {
      const type = await page.evaluate(`typeof window.__fillAnything.${fn}`);
      expect(type).toBe('function');
    }
    await context.close();
  });

  test('detects all fillable fields', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    const count = await page.evaluate(() => window.__fillAnything.getFillableFields().length);
    expect(count).toBeGreaterThanOrEqual(20);
    await context.close();
  });

  test('field inventory lists all expected fields', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    const fields = await page.evaluate(() =>
      window.__fillAnything.getFillableFields().map(f => ({ id: f.id, name: f.name, type: f.type, tagName: f.tagName }))
    );
    const fieldIds = fields.map(f => f.id).filter(Boolean);
    const expected = [
      'firstName','lastName','fullName','email','phone',
      'addressLine1','addressLine2','city','state','zipCode',
      'country','dob','gender','occupation','employer',
      'website','cardName','cardNumber','cardExpiry','cardCvv',
      'notes','username',
    ];
    for (const id of expected) {
      expect(fieldIds).toContain(id);
    }
    await context.close();
  });

  test('exact field matching works for all standard fields', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    const matches = await page.evaluate(() => {
      const fields = window.__fillAnything.getFillableFields();
      const tests = {
        firstName:'firstName', lastName:'lastName', fullName:'fullName',
        email:'email', phone:'phone', addressLine1:'addressLine1',
        addressLine2:'addressLine2', city:'city', state:'state',
        zipCode:'zipCode', country:'country', dob:'dob',
        gender:'gender', occupation:'occupation', employer:'employer',
        website:'website', cardName:'cardName', cardNumber:'cardNumber',
        cardExpiry:'cardExpiry', cardCvv:'cardCvv', notes:'notes',
        username:'username',
      };
      const results = {};
      for (const [id, expected] of Object.entries(tests)) {
        const f = fields.find(f => f.id === id);
        if (!f) { results[id] = 'NOT_FOUND'; continue; }
        const m = window.__fillAnything.findBestMatch(f, 'all');
        results[id] = m ? { key: m.key, score: m.score } : 'NO_MATCH';
      }
      return results;
    });

    for (const [id, result] of Object.entries(matches)) {
      expect(result).not.toBe('NOT_FOUND');
      expect(result).not.toBe('NO_MATCH');
      expect(result.key).toBe(id);
      expect(result.score).toBeGreaterThanOrEqual(3);
    }
    await context.close();
  });

  test('autocomplete attribute boosts matching score', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    const result = await page.evaluate(() => {
      const fields = window.__fillAnything.getFillableFields();
      const fn = fields.find(f => f.id === 'firstName');
      if (!fn) return null;
      return { autocomplete: fn.getAttribute('autocomplete'), score: window.__fillAnything.scoreMatch(fn, 'firstName') };
    });

    expect(result).not.toBeNull();
    expect(result.autocomplete).toBe('given-name');
    expect(result.score).toBeGreaterThanOrEqual(15);
    await context.close();
  });

  test('fill all fields populates every form field', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    const results = await page.evaluate(async () => {
      const r = await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: true,
        skipDisabled: true, skipReadonly: true, fuzzyFallback: true,
      });
      return r;
    });
    expect(results.length).toBeGreaterThanOrEqual(20);
    const filled = results.filter(r => r.status === 'filled');
    const errors = results.filter(r => r.status === 'error');
    console.log(`  ${results.length} total, ${filled.length} filled, ${errors.length} errors`);
    expect(filled.length).toBeGreaterThanOrEqual(15);
    expect(errors.length).toBe(0);
    await context.close();
  });

  test('field values are correctly populated after fill', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true, fuzzyFallback: true,
      });
    });

    const expected = {
      firstName: 'Arjun', lastName: 'Kumar', fullName: 'Arjun Kumar',
      email: 'arjun.kumar.dev@example.com', phone: '9876543210',
      addressLine1: '42 MG Road', addressLine2: 'Apt 91D',
      city: 'Bengaluru', state: 'Karnataka', zipCode: '560037',
      occupation: 'Software Developer', employer: 'TechCorp India Pvt Ltd',
      website: 'https://arjun.dev', username: 'arjun_dev',
      notes: 'Test notes from Playwright', cardName: 'Arjun Kumar',
      cardNumber: '4111111111111111', cardExpiry: '12/28', cardCvv: '123',
    };

    for (const [id, exp] of Object.entries(expected)) {
      const val = await page.evaluate((elId) => document.getElementById(elId)?.value, id);
      expect(val).toBe(exp);
    }
    await context.close();
  });

  test('select element (country) is filled correctly', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await page.evaluate(() => { window.__fillAnything.setPersonalInfoMap({ country: 'US' }); });

    const result = await page.evaluate(async () => {
      const fields = window.__fillAnything.getFillableFields();
      const cf = fields.find(f => f.id === 'country');
      if (!cf) return 'NO_FIELD';
      const m = window.__fillAnything.findBestMatch(cf, 'all');
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
      return JSON.stringify({ matched: m ? m.key : null, value: cf.value });
    });

    expect(result).toContain('"value":"US"');
    await context.close();
  });

  test('contact mode only fills contact fields', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    const results = await page.evaluate(async () => {
      return await window.__fillAnything.fillForms('contact', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    const filledKeys = results.filter(r => r.status === 'filled').map(r => r.key);
    const contactKeys = ['firstName','lastName','fullName','email','phone'];
    for (const key of filledKeys) expect(contactKeys).toContain(key);
    expect(filledKeys).toContain('firstName');
    expect(filledKeys).toContain('email');
    await context.close();
  });

  test('address mode only fills address fields', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    const results = await page.evaluate(async () => {
      return await window.__fillAnything.fillForms('address', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    const filledKeys = results.filter(r => r.status === 'filled').map(r => r.key);
    const addrKeys = ['addressLine1','addressLine2','city','state','zipCode','country'];
    for (const key of filledKeys) expect(addrKeys).toContain(key);
    expect(filledKeys).toContain('city');
    expect(filledKeys).toContain('state');
    expect(filledKeys).toContain('zipCode');
    await context.close();
  });

  test('highlight fields after filling', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: true,
        skipDisabled: true, skipReadonly: true,
      });
    });

    const n = await page.evaluate(() => document.querySelectorAll('.fill-anything-highlight').length);
    expect(n).toBeGreaterThan(0);
    await context.close();
  });

  test('clear highlights removes all highlights', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: true,
        skipDisabled: true, skipReadonly: true,
      });
    });
    await page.evaluate(() => window.__fillAnything.clearHighlights());
    const n = await page.evaluate(() => document.querySelectorAll('.fill-anything-highlight').length);
    expect(n).toBe(0);
    await context.close();
  });

  test('setFieldValue uses native input setter', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    const result = await page.evaluate(() => {
      const el = document.getElementById('firstName');
      const ok = window.__fillAnything.setFieldValue(el, 'TestValue');
      return { ok, value: el.value };
    });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('TestValue');
    await context.close();
  });

  test('fuzzy fallback fills fields with partial keyword matches', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Add a non-standard field that won't conflict with existing fields
    await page.evaluate(() => {
      const form = document.getElementById('miscForm');
      const div = document.createElement('div');
      div.innerHTML = '<label for="user_nickname">Nickname</label><input type="text" id="user_nickname" name="user_nickname" />';
      form.appendChild(div);
    });

    // Only set data for a field that won't be matched by exact match
    await page.evaluate(() => {
      window.__fillAnything.setPersonalInfoMap({ nickname: 'Arju' });
    });

    const results = await page.evaluate(async () => {
      return await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true, fuzzyFallback: true,
      });
    });

    const nickname = results.find(r => r.fieldId === 'user_nickname');
    if (nickname) {
      console.log(`  Nickname: ${JSON.stringify(nickname)}`);
      expect(['guessed', 'weak-guess', 'filled']).toContain(nickname.status);
    }
    await context.close();
  });

  test('fill with empty personal info returns no filled results', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    // Don't inject test data

    const results = await page.evaluate(async () => {
      return await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });
    const filled = results.filter(r => r.status === 'filled');
    expect(filled.length).toBe(0);
    await context.close();
  });

  test('fields with score below threshold are not matched', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await injectTestData(page);

    const result = await page.evaluate(() => {
      const el = document.createElement('input');
      el.type = 'text'; el.id = 'xyz_unrelated_field'; el.name = 'xyz_unrelated';
      // Use a clean container to avoid label text leakage from siblings
      const container = document.createElement('div');
      container.appendChild(el);
      document.body.appendChild(container);
      const match = window.__fillAnything.findBestMatch(el, 'all');
      document.body.removeChild(container);
      return match;
    });
    expect(result).toBeNull();
    await context.close();
  });

  test('label text is used for field matching', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    const result = await page.evaluate(() => {
      const fields = window.__fillAnything.getFillableFields();
      const ef = fields.find(f => f.id === 'email');
      if (!ef) return null;
      return { labelText: window.__fillAnything.getLabelText(ef), score: window.__fillAnything.scoreMatch(ef, 'email') };
    });
    expect(result).not.toBeNull();
    expect(result.labelText).toContain('email');
    expect(result.score).toBeGreaterThanOrEqual(8);
    await context.close();
  });

  test('gender select element is filled correctly', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);
    await page.evaluate(() => { window.__fillAnything.setPersonalInfoMap({ gender: 'Male' }); });

    const result = await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
      return document.getElementById('gender')?.value;
    });
    expect(result).toBe('Male');
    await context.close();
  });

  test('loadPersonalInfo prioritizes file data if configured and syncs to storage', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());

    // Mock fetch to return configured data when fetching personal-info.json
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('personal-info.json')) {
          return {
            ok: true,
            json: async () => ({
              personalInfo: {
                firstName: { enabled: true, value: 'Arjun' },
                lastName: { enabled: true, value: 'Kumar' }
              }
            })
          };
        }
        return originalFetch(url, options);
      };
    });

    await injectContentScript(page);

    // Verify it loaded from the file mock
    const map = await page.evaluate(() => window.__fillAnything.personalInfoMap);
    expect(map.firstName).toBe('Arjun');
    expect(map.lastName).toBe('Kumar');

    // Verify it synced to chrome.storage.local
    const synced = await page.evaluate(() => window.chrome.storage.local.get('fillAnythingPersonalInfo'));
    expect(synced.fillAnythingPersonalInfo.personalInfo.firstName.value).toBe('Arjun');

    await context.close();
  });

  test('loadPersonalInfo falls back to storage if file is unconfigured', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());

    // Mock fetch to return unconfigured placeholder data
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('personal-info.json')) {
          return {
            ok: true,
            json: async () => ({
              personalInfo: {
                firstName: { enabled: true, value: 'YOUR_FIRST_NAME' },
                lastName: { enabled: true, value: 'YOUR_LAST_NAME' }
              }
            })
          };
        }
        return originalFetch(url, options);
      };
    });

    // Populate chrome.storage.local with configured data
    await page.evaluate(() => {
      window.chrome.storage.local.set({
        fillAnythingPersonalInfo: {
          personalInfo: {
            firstName: { enabled: true, value: 'CachedName' },
            lastName: { enabled: true, value: 'CachedLastName' }
          }
        }
      });
    });

    await injectContentScript(page);

    // Verify it fell back to loading from chrome.storage.local
    const map = await page.evaluate(() => window.__fillAnything.personalInfoMap);
    expect(map.firstName).toBe('CachedName');
    expect(map.lastName).toBe('CachedLastName');

    await context.close();
  });

  test('smart DOB formatting formats correctly based on input type and placeholder hints', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove the original forms so they don't consume the 'dob' key
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Set user's dob to 1995-10-25
    await page.evaluate(() => {
      window.__fillAnything.setPersonalInfoMap({ dob: '1995-10-25' });
    });

    // Test 1: HTML5 Date input
    const dateVal = await page.evaluate(async () => {
      const container = document.createElement('div');
      container.id = 'temp-dob-container-1';
      const dateEl = document.createElement('input');
      dateEl.type = 'date'; dateEl.id = 'dob_date_input'; dateEl.name = 'dob_date_input';
      container.appendChild(dateEl);
      document.body.appendChild(container);

      const match = window.__fillAnything.findBestMatch(dateEl, 'all');
      if (!match || match.key !== 'dob') {
        document.body.removeChild(container);
        return { matchKey: match ? match.key : null, val: null };
      }

      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });

      const val = dateEl.value;
      document.body.removeChild(container);
      return { matchKey: match.key, val };
    });

    expect(dateVal.matchKey).toBe('dob');
    expect(dateVal.val).toBe('1995-10-25');

    // Test 2: Text input with DD/MM/YYYY placeholder
    const dmyVal = await page.evaluate(async () => {
      const container = document.createElement('div');
      container.id = 'temp-dob-container-2';
      const dmyEl = document.createElement('input');
      dmyEl.type = 'text'; dmyEl.id = 'dob_dmy_input'; dmyEl.name = 'dob_dmy_input';
      dmyEl.placeholder = 'DD/MM/YYYY';
      container.appendChild(dmyEl);
      document.body.appendChild(container);

      const match = window.__fillAnything.findBestMatch(dmyEl, 'all');
      if (!match || match.key !== 'dob') {
        document.body.removeChild(container);
        return { matchKey: match ? match.key : null, val: null };
      }

      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });

      const val = dmyEl.value;
      document.body.removeChild(container);
      return { matchKey: match.key, val };
    });

    expect(dmyVal.matchKey).toBe('dob');
    expect(dmyVal.val).toBe('25/10/1995');

    // Test 3: Text input with MM-DD-YYYY placeholder
    const mdyVal = await page.evaluate(async () => {
      const container = document.createElement('div');
      container.id = 'temp-dob-container-3';
      const mdyEl = document.createElement('input');
      mdyEl.type = 'text'; mdyEl.id = 'dob_mdy_input'; mdyEl.name = 'dob_mdy_input';
      mdyEl.placeholder = 'MM-DD-YYYY';
      container.appendChild(mdyEl);
      document.body.appendChild(container);

      const match = window.__fillAnything.findBestMatch(mdyEl, 'all');
      if (!match || match.key !== 'dob') {
        document.body.removeChild(container);
        return { matchKey: match ? match.key : null, val: null };
      }

      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });

      const val = mdyEl.value;
      document.body.removeChild(container);
      return { matchKey: match.key, val };
    });

    expect(mdyVal.matchKey).toBe('dob');
    expect(mdyVal.val).toBe('10-25-1995');

    await context.close();
  });

  test('fuzzy select matching selects option based on country codes and name mappings', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove the original forms so they don't consume the 'country' key
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Create temporary select dropdown for testing country matches
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'temp-country-container';

      // Dropdown with country code values
      const selectEl = document.createElement('select');
      selectEl.id = 'test_country_select';
      selectEl.name = 'test_country_select';
      
      const optEmpty = document.createElement('option');
      optEmpty.value = ''; optEmpty.text = 'Select...';
      selectEl.appendChild(optEmpty);

      const optUS = document.createElement('option');
      optUS.value = 'US'; optUS.text = 'United States';
      selectEl.appendChild(optUS);

      const optIN = document.createElement('option');
      optIN.value = 'IN'; optIN.text = 'India';
      selectEl.appendChild(optIN);

      container.appendChild(selectEl);
      document.body.appendChild(container);
    });

    // Test 1: Mapped country code (value: "India" should select option "IN")
    await page.evaluate(async () => {
      window.__fillAnything.setPersonalInfoMap({ country: 'India' });
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    let selectedVal = await page.evaluate(() => document.getElementById('test_country_select')?.value);
    expect(selectedVal).toBe('IN');

    // Reset dropdown
    await page.evaluate(() => { document.getElementById('test_country_select').value = ''; });

    // Test 2: Mapped code to name (value: "usa" should select option "US" / "United States")
    await page.evaluate(async () => {
      window.__fillAnything.setPersonalInfoMap({ country: 'usa' });
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    selectedVal = await page.evaluate(() => document.getElementById('test_country_select')?.value);
    expect(selectedVal).toBe('US');

    // Clean up
    await page.evaluate(() => {
      const container = document.getElementById('temp-country-container');
      if (container) document.body.removeChild(container);
    });

    await context.close();
  });

  test('should fill radio buttons for gender and read-only inputs for DOB', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove the original forms
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Set map values
    await page.evaluate(() => {
      window.__fillAnything.setPersonalInfoMap({
        gender: 'Female',
        dob: '1990-05-12'
      });
    });

    // Create temporary read-only date input and gender radio buttons
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'temp-picker-container';

      // Readonly date input
      const dateEl = document.createElement('input');
      dateEl.type = 'text';
      dateEl.id = 'temp_readonly_dob';
      dateEl.name = 'temp_readonly_dob';
      dateEl.readOnly = true; // marked as read-only!
      dateEl.placeholder = 'DD/MM/YYYY';
      container.appendChild(dateEl);

      // Gender radio button group
      const maleRadio = document.createElement('input');
      maleRadio.type = 'radio';
      maleRadio.name = 'temp_gender';
      maleRadio.value = 'M';
      maleRadio.id = 'gender_male';
      container.appendChild(maleRadio);

      const femaleRadio = document.createElement('input');
      femaleRadio.type = 'radio';
      femaleRadio.name = 'temp_gender';
      femaleRadio.value = 'F';
      femaleRadio.id = 'gender_female';
      container.appendChild(femaleRadio);

      document.body.appendChild(container);
    });

    // Fill forms
    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true, // skipReadonly is true!
      });
    });

    const values = await page.evaluate(() => {
      return {
        dobVal: document.getElementById('temp_readonly_dob')?.value,
        maleChecked: document.getElementById('gender_male')?.checked,
        femaleChecked: document.getElementById('gender_female')?.checked
      };
    });

    expect(values.dobVal).toBe('12/05/1990');
    expect(values.maleChecked).toBe(false);
    expect(values.femaleChecked).toBe(true);

    // Clean up
    await page.evaluate(() => {
      const container = document.getElementById('temp-picker-container');
      if (container) document.body.removeChild(container);
    });

    await context.close();
  });

  test('should auto-derive dobDay, dobMonth, and dobYear from dob and fill split selects', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove the original forms
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Set map values with just dob
    await page.evaluate(() => {
      window.__fillAnything.buildMap({
        personalInfo: {
          dob: { enabled: true, value: '1995-10-25' }
        }
      });
    });

    // Create temporary split day, month, year dropdowns
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'temp-split-container';

      // Month select
      const monthSel = document.createElement('select');
      monthSel.id = 'temp_dob_month';
      monthSel.name = 'birth_month';
      ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = m ? String(idx) : ''; // e.g. "10" for Oct
        opt.text = m || 'Month';
        monthSel.appendChild(opt);
      });
      container.appendChild(monthSel);

      // Day select
      const daySel = document.createElement('select');
      daySel.id = 'temp_dob_day';
      daySel.name = 'birth_day';
      const optDayEmpty = document.createElement('option');
      optDayEmpty.value = ''; optDayEmpty.text = 'Day';
      daySel.appendChild(optDayEmpty);
      for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        const padded = String(i).padStart(2, '0');
        opt.value = padded; opt.text = padded; // e.g. "25"
        daySel.appendChild(opt);
      }
      container.appendChild(daySel);

      // Year select
      const yearSel = document.createElement('select');
      yearSel.id = 'temp_dob_year';
      yearSel.name = 'birth_year';
      const optYearEmpty = document.createElement('option');
      optYearEmpty.value = ''; optYearEmpty.text = 'Year';
      yearSel.appendChild(optYearEmpty);
      for (let y = 1990; y <= 2000; y++) {
        const opt = document.createElement('option');
        opt.value = String(y).slice(-2); opt.text = String(y); // value="95", text="1995"
        yearSel.appendChild(opt);
      }
      container.appendChild(yearSel);

      document.body.appendChild(container);
    });

    // Fill forms
    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    const values = await page.evaluate(() => {
      return {
        monthVal: document.getElementById('temp_dob_month')?.value,
        dayVal: document.getElementById('temp_dob_day')?.value,
        yearVal: document.getElementById('temp_dob_year')?.value
      };
    });

    expect(values.monthVal).toBe('10'); // October is index 10
    expect(values.dayVal).toBe('25'); // 25
    expect(values.yearVal).toBe('95'); // 95 for 1995

    // Clean up
    await page.evaluate(() => {
      const container = document.getElementById('temp-split-container');
      if (container) document.body.removeChild(container);
    });

    await context.close();
  });

  test('user reported fields matching and filling', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove the original forms
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Set user's exact map values
    await page.evaluate(() => {
      window.__fillAnything.setPersonalInfoMap({
        gender: 'Male',
        dob: '2002-09-15',
        country: 'India'
      });
    });

    // Create the exact elements the user pasted
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'user-test-container';

      // 1. Gender select
      const genderSel = document.createElement('select');
      genderSel.id = 'gender';
      genderSel.name = 'gender';
      genderSel.setAttribute('autocomplete', 'sex');
      genderSel.innerHTML = `
        <option value="">Select...</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
        <option value="Other">Other</option>
      `;
      container.appendChild(genderSel);

      // 2. DOB input
      const dobInput = document.createElement('input');
      dobInput.type = 'date';
      dobInput.id = 'dob';
      dobInput.name = 'dob';
      dobInput.setAttribute('autocomplete', 'bday');
      container.appendChild(dobInput);

      // 3. Country select
      const countrySel = document.createElement('select');
      countrySel.id = 'country';
      countrySel.name = 'country';
      countrySel.setAttribute('autocomplete', 'country');
      countrySel.innerHTML = `
        <option value="">Select...</option>
        <option value="US">United States</option>
        <option value="CA">Canada</option>
        <option value="UK">United Kingdom</option>
        <option value="AU">Australia</option>
        <option value="IN">India</option>
      `;
      container.appendChild(countrySel);

      document.body.appendChild(container);
    });

    // Fill forms
    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    const values = await page.evaluate(() => {
      return {
        genderVal: document.getElementById('gender')?.value,
        dobVal: document.getElementById('dob')?.value,
        countryVal: document.getElementById('country')?.value
      };
    });

    expect(values.genderVal).toBe('Male');
    expect(values.dobVal).toBe('2002-09-15');
    expect(values.countryVal).toBe('IN'); // should map "India" to "IN"

    // Clean up
    await page.evaluate(() => {
      const container = document.getElementById('user-test-container');
      if (container) document.body.removeChild(container);
    });

    await context.close();
  });

  test('should overwrite pre-populated fields if they have incorrect values, and keep them if correct', async () => {
    const context = await createContext(browser);
    const page = await context.newPage();
    await page.goto(BASE_URL());
    await injectContentScript(page);

    // Remove original forms
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach(f => f.remove());
    });

    // Set map values
    await page.evaluate(() => {
      window.__fillAnything.setPersonalInfoMap({
        firstName: 'Aman',
        lastName: 'Kumar',
        gender: 'Male',
        country: 'India'
      });
    });

    // Create inputs with correct and incorrect pre-populated values
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'overwrite-test-container';

      // 1. Text input with incorrect value (should be overwritten)
      const fnInput = document.createElement('input');
      fnInput.type = 'text';
      fnInput.id = 'first_name';
      fnInput.name = 'firstName';
      fnInput.value = 'RandomValue'; // Incorrect value
      container.appendChild(fnInput);

      // 2. Text input with correct value (should remain)
      const lnInput = document.createElement('input');
      lnInput.type = 'text';
      lnInput.id = 'last_name';
      lnInput.name = 'lastName';
      lnInput.value = 'Kumar'; // Correct value
      container.appendChild(lnInput);

      // 3. Select element with incorrect selected option (should be overwritten)
      const countrySel = document.createElement('select');
      countrySel.id = 'country';
      countrySel.name = 'country';
      countrySel.innerHTML = `
        <option value="">Select...</option>
        <option value="US" selected>United States</option>
        <option value="IN">India</option>
      `; // Selected option is US (incorrect)
      container.appendChild(countrySel);

      // 4. Select element with correct selected option (should remain)
      const genderSel = document.createElement('select');
      genderSel.id = 'gender';
      genderSel.name = 'gender';
      genderSel.innerHTML = `
        <option value="">Select...</option>
        <option value="Male" selected>Male</option>
        <option value="Female">Female</option>
      `; // Selected option is Male (correct)
      container.appendChild(genderSel);

      document.body.appendChild(container);
    });

    // Fill forms
    await page.evaluate(async () => {
      await window.__fillAnything.fillForms('all', {
        animationDelay: 0, highlightFilled: false,
        skipDisabled: true, skipReadonly: true,
      });
    });

    // Retrieve values
    const values = await page.evaluate(() => {
      return {
        fnVal: document.getElementById('first_name')?.value,
        lnVal: document.getElementById('last_name')?.value,
        countryVal: document.getElementById('country')?.value,
        genderVal: document.getElementById('gender')?.value
      };
    });

    expect(values.fnVal).toBe('Aman'); // Should be overwritten from "RandomValue" to "Aman"
    expect(values.lnVal).toBe('Kumar'); // Should remain "Kumar"
    expect(values.countryVal).toBe('IN'); // Should be overwritten from "US" to "IN"
    expect(values.genderVal).toBe('Male'); // Should remain "Male"

    // Clean up
    await page.evaluate(() => {
      const container = document.getElementById('overwrite-test-container');
      if (container) document.body.removeChild(container);
    });

    await context.close();
  });
});
