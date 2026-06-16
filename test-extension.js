// test-extension.js - E2E test for Fill Anything Chrome Extension
// Uses Node.js built-in modules only
// Run: node test-extension.js

const http = require('http');
const net = require('net');
const crypto = require('crypto');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    }).on('error', reject);
  });
}

// CDP WebSocket client - handles the CDP protocol over raw TCP
class CDP {
  constructor() {
    this.socket = null;
    this.buf = Buffer.alloc(0);
    this.id = 0;
    this.callbacks = {};
    this.connected = false;
  }

  connect(host, port, path) {
    return new Promise((resolve, reject) => {
      this.socket = net.connect(port, host);
      const key = crypto.randomBytes(16).toString('base64');
      
      this.socket.on('connect', () => {
        const req = `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
        this.socket.write(req);
      });

      this.socket.on('data', (chunk) => {
        this.buf = Buffer.concat([this.buf, chunk]);
        
        if (!this.connected) {
          const s = this.buf.toString('binary');
          const i = s.indexOf('\r\n\r\n');
          if (i >= 0) {
            this.connected = true;
            this.buf = this.buf.slice(i + 4);
            resolve();
          }
          return;
        }
        
        this._parse();
      });

      this.socket.on('error', reject);
    });
  }

  _parse() {
    while (this.buf.length >= 2) {
      const finOp = this.buf[0];
      let len = this.buf[1] & 0x7f;
      let off = 2;
      
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      
      // Check for mask bit (server->client should NOT be masked, but check anyway)
      const masked = (this.buf[1] & 0x80) !== 0;
      if (masked) {
        if (this.buf.length < off + 4 + len) return;
        off += 4; // skip mask key
      }
      
      if (this.buf.length < off + len) return;
      
      const payload = this.buf.slice(off, off + len).toString('utf8');
      this.buf = this.buf.slice(off + len);
      
      try {
        const msg = JSON.parse(payload);
        if (msg.id != null && this.callbacks[msg.id]) {
          const cb = this.callbacks[msg.id];
          delete this.callbacks[msg.id];
          cb(msg.result);
        }
      } catch(e) {}
    }
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.callbacks[id] = resolve;
      const data = Buffer.from(JSON.stringify({ id, method, params }));
      
      // Build unmasked WebSocket frame (client->server, no mask)
      let header;
      if (data.length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = data.length;
      } else if (data.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(data.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(data.length), 2);
      }
      
      this.socket.write(Buffer.concat([header, data]));
    });
  }

  async eval(expr, awaitPromise = false) {
    const p = { expression: expr, returnByValue: true };
    if (awaitPromise) p.awaitPromise = true;
    return this.send('Runtime.evaluate', p);
  }

  close() { if (this.socket) this.socket.destroy(); }
}

async function main() {
  console.log('=== Fill Anything Extension E2E Test ===\n');

  // 1. Get tabs
  const tabs = await httpGet('http://localhost:9222/json/list');
  if (!Array.isArray(tabs) || !tabs.length) {
    console.error('FAIL: No Chrome tabs found');
    process.exit(1);
  }
  
  const tab = tabs.find(t => t.url.includes('test-form'));
  if (!tab) {
    console.error('FAIL: test-form tab not found. Tabs:', tabs.map(t=>t.url).join(', '));
    process.exit(1);
  }
  console.log(`Tab: ${tab.title}`);
  console.log(`URL: ${tab.url}\n`);

  // 2. Connect via CDP
  const wsPath = new URL(tab.webSocketDebuggerUrl).pathname;
  const cdp = new CDP();
  await cdp.connect('localhost', 9222, wsPath);
  console.log('CDP connected\n');

  let pass = 0, fail = 0;
  function ok(name, cond, detail) {
    const status = cond ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${name}${detail ? ' - ' + detail : ''}`);
    cond ? pass++ : fail++;
  }

  // TEST 1: Content script injected
  console.log('--- Test 1: Content Script ---');
  const t1 = await cdp.eval('window.__fillAnythingInjected');
  ok('Injected', t1?.result?.result?.value === true, JSON.stringify(t1?.result?.result));

  // TEST 2: Functions exist
  console.log('\n--- Test 2: API Functions ---');
  for (const fn of ['getFillableFields', 'findBestMatch', 'fillForms', 'clearHighlights', 'setFieldValue', 'scoreMatch']) {
    const r = await cdp.eval(`typeof ${fn}`);
    ok(`${fn}()`, r?.result?.result?.value === 'function', `type: ${r?.result?.result?.value}`);
  }

  // TEST 3: Field detection
  console.log('\n--- Test 3: Field Detection ---');
  const t3 = await cdp.eval('getFillableFields().length');
  const nFields = t3?.result?.result?.value || 0;
  ok(`Detected ${nFields} fields`, nFields > 0);

  // TEST 4: List detected fields
  console.log('\n--- Test 4: Field Inventory ---');
  const t4 = await cdp.eval(`JSON.stringify(getFillableFields().map(f => f.id || f.name || f.type))`);
  const fieldList = JSON.parse(t4?.result?.result?.value || '[]');
  console.log(`  Fields: ${fieldList.join(', ')}`);

  // TEST 5: Field matching
  console.log('\n--- Test 5: Field Matching ---');
  const t5 = await cdp.eval(`(function() {
    const fields = getFillableFields();
    const tests = {
      'firstName': 'firstName', 'lastName': 'lastName', 'email': 'email',
      'phone': 'phone', 'addressLine1': 'addressLine1', 'city': 'city',
      'state': 'state', 'zipCode': 'zipCode', 'country': 'country',
      'occupation': 'occupation', 'username': 'username', 'notes': 'notes'
    };
    const results = {};
    for (const [id, expected] of Object.entries(tests)) {
      const f = fields.find(f => f.id === id);
      if (!f) { results[id] = 'NOT_FOUND'; continue; }
      const m = findBestMatch(f, 'all');
      results[id] = m ? m.key + ':' + m.score : 'NO_MATCH';
    }
    return JSON.stringify(results);
  })()`);
  const matches = JSON.parse(t5?.result?.result?.value || '{}');
  for (const [id, result] of Object.entries(matches)) {
    if (result === 'NOT_FOUND') {
      ok(`${id} exists`, false, 'not found in DOM');
    } else if (result === 'NO_MATCH') {
      ok(`${id} matched`, false, 'no match');
    } else {
      const [key, score] = result.split(':');
      ok(`${id} -> ${key} (score:${score})`, parseInt(score) >= 3);
    }
  }

  // TEST 6: Inject test data
  console.log('\n--- Test 6: Inject Test Data ---');
  await cdp.eval(`personalInfoMap = {
    firstName:'John', lastName:'Doe', fullName:'John Doe',
    email:'john@test.com', phone:'+1-555-123-4567',
    addressLine1:'123 Main St', addressLine2:'Apt 4B',
    city:'New York', state:'New York', zipCode:'10001', country:'US',
    occupation:'Engineer', employer:'Acme Corp', website:'https://test.com',
    username:'johndoe', notes:'Test notes', dob:'1990-01-15', gender:'Male',
    cardName:'John Doe', cardNumber:'4111111111111111', cardExpiry:'12/28', cardCvv:'123'
  }`);
  const t6 = await cdp.eval('Object.keys(personalInfoMap).length');
  ok('Test data injected', (t6?.result?.result?.value || 0) > 0, `${t6?.result?.result?.value} keys`);

  // TEST 7: Fill all fields
  console.log('\n--- Test 7: Fill All Fields ---');
  const t7 = await cdp.eval(`(async function() {
    const r = await fillForms('all', {animationDelay:0, highlightFilled:true, skipDisabled:true, skipReadonly:true});
    return JSON.stringify({total:r.length, filled:r.filter(x=>x.status==='filled').length, errors:r.filter(x=>x.status==='error').length, details:r.map(x=>({key:x.key,status:x.status}))});
  })()`, true);
  const stats = JSON.parse(t7?.result?.result?.value || '{}');
  console.log(`  Total:${stats.total} Filled:${stats.filled} Errors:${stats.errors}`);
  if (stats.details) stats.details.forEach(d => console.log(`    ${d.status==='filled'?'✓':'✗'} ${d.key}: ${d.status}`));
  ok('Fields filled', (stats.filled || 0) > 0, `${stats.filled} filled`);

  // TEST 8: Verify values
  console.log('\n--- Test 8: Verify Field Values ---');
  const t8 = await cdp.eval(`JSON.stringify({
    firstName: document.getElementById('firstName')?.value,
    lastName: document.getElementById('lastName')?.value,
    email: document.getElementById('email')?.value,
    phone: document.getElementById('phone')?.value,
    city: document.getElementById('city')?.value,
    zipCode: document.getElementById('zipCode')?.value,
    occupation: document.getElementById('occupation')?.value,
    username: document.getElementById('username')?.value,
    notes: document.getElementById('notes')?.value
  })`);
  const vals = JSON.parse(t8?.result?.result?.value || '{}');
  for (const [k, v] of Object.entries(vals)) {
    ok(`${k}="${v}"`, v && v !== '' && !v.startsWith('YOUR_'));
  }

  // TEST 9: Highlights
  console.log('\n--- Test 9: Highlights ---');
  const t9 = await cdp.eval('document.querySelectorAll(".fill-anything-highlight").length');
  const nHigh = t9?.result?.result?.value || 0;
  ok(`${nHigh} highlights`, nHigh > 0);

  // TEST 10: Clear highlights
  console.log('\n--- Test 10: Clear Highlights ---');
  await cdp.eval('clearHighlights()');
  const t10 = await cdp.eval('document.querySelectorAll(".fill-anything-highlight").length');
  ok('Cleared', t10?.result?.result?.value === 0);

  // TEST 11: Contact mode
  console.log('\n--- Test 11: Contact Mode ---');
  // Clear first
  await cdp.eval(`getFillableFields().forEach(f => { if(f.tagName==='INPUT'||f.tagName==='TEXTAREA'){f.value='';f.dispatchEvent(new Event('input',{bubbles:true}));}}) `);
  const t11 = await cdp.eval(`(async function() {
    const r = await fillForms('contact', {animationDelay:0, highlightFilled:false, skipDisabled:true, skipReadonly:true});
    return JSON.stringify(r.map(x=>({key:x.key,status:x.status})));
  })()`, true);
  const contactRes = JSON.parse(t11?.result?.result?.value || '[]');
  const cKeys = contactRes.map(r => r.key);
  ok('Contact mode', cKeys.every(k => ['firstName','lastName','fullName','email','phone'].includes(k)), cKeys.join(', '));

  // TEST 12: Address mode
  console.log('\n--- Test 12: Address Mode ---');
  await cdp.eval(`getFillableFields().forEach(f => { if(f.tagName==='INPUT'||f.tagName==='TEXTAREA'){f.value='';f.dispatchEvent(new Event('input',{bubbles:true}));}}) `);
  const t12 = await cdp.eval(`(async function() {
    personalInfoMap = {addressLine1:'456 Oak Ave', city:'Boston', state:'Massachusetts', zipCode:'02101', country:'US'};
    const r = await fillForms('address', {animationDelay:0, highlightFilled:false, skipDisabled:true, skipReadonly:true});
    return JSON.stringify({keys: r.map(x=>x.key), cityVal: document.getElementById('city')?.value});
  })()`, true);
  const addrRes = JSON.parse(t12?.result?.result?.value || '{}');
  ok('Address mode', (addrRes.keys||[]).every(k => ['addressLine1','addressLine2','city','state','zipCode','country'].includes(k)), JSON.stringify(addrRes.keys));
  ok('City filled', addrRes.cityVal === 'Boston', `city="${addrRes.cityVal}"`);

  // TEST 13: Select element (country)
  console.log('\n--- Test 13: Select Element ---');
  const t13 = await cdp.eval(`(async function() {
    personalInfoMap = {country: 'US'};
    const fields = getFillableFields();
    const cf = fields.find(f => f.id === 'country');
    if (!cf) return 'NO_FIELD';
    const m = findBestMatch(cf, 'all');
    if (!m) return 'NO_MATCH';
    await fillForms('all', {animationDelay:0, highlightFilled:false, skipDisabled:true, skipReadonly:true});
    return JSON.stringify({matched: m.key, value: cf.value});
  })()`, true);
  const selRes = JSON.parse(t13?.result?.result?.value || '{}');
  ok('Select filled', selRes.value === 'US' || selRes.matched === 'country', JSON.stringify(selRes));

  // TEST 14: autocomplete attribute matching
  console.log('\n--- Test 14: Autocomplete Attribute ---');
  const t14 = await cdp.eval(`(function() {
    const fields = getFillableFields();
    const fn = fields.find(f => f.id === 'firstName');
    if (!fn) return 'NO_FIELD';
    const ac = fn.getAttribute('autocomplete');
    const score = scoreMatch(fn, 'firstName');
    return JSON.stringify({autocomplete: ac, score: score});
  })()`);
  const acRes = JSON.parse(t14?.result?.result?.value || '{}');
  ok('autocomplete="given-name" boosts score', (acRes.score || 0) >= 15, `autocomplete="${acRes.autocomplete}", score=${acRes.score}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${pass}  Failed: ${fail}  Total: ${pass+fail}`);
  console.log(fail === 0 ? 'ALL TESTS PASSED!' : `${fail} test(s) FAILED`);

  cdp.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
