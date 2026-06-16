// debug-cdp.js - Debug CDP connection
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

async function main() {
  const tabs = await httpGet('http://localhost:9222/json/list');
  const tab = tabs.find(t => t.url.includes('test-form'));
  if (!tab) { console.log('No test tab'); return; }

  const wsPath = new URL(tab.webSocketDebuggerUrl).pathname;
  console.log('Connecting to:', wsPath);

  const socket = net.connect(9222, 'localhost');
  const key = crypto.randomBytes(16).toString('base64');
  
  socket.on('connect', () => {
    const req = `GET ${wsPath} HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
    socket.write(req);
    console.log('Handshake sent');
  });

  let buf = Buffer.alloc(0);
  let handshakeDone = false;
  let msgId = 0;

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    
    if (!handshakeDone) {
      const s = buf.toString('binary');
      const i = s.indexOf('\r\n\r\n');
      if (i >= 0) {
        handshakeDone = true;
        buf = buf.slice(i + 4);
        console.log('Handshake complete, remaining buf:', buf.length, 'bytes');
        
        // Now send a CDP command
        msgId++;
        const cmd = JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression: '1+1', returnByValue: true } });
        const payload = Buffer.from(cmd);
        const header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = payload.length;
        socket.write(Buffer.concat([header, payload]));
        console.log('Sent evaluate command, waiting for response...');
        
        // Set a timeout
        setTimeout(() => {
          console.log('Timeout - no response received');
          console.log('Buffer state:', buf.length, 'bytes');
          if (buf.length > 0) {
            console.log('Raw buffer (first 200 bytes):', buf.slice(0, 200).toString('hex'));
          }
          socket.destroy();
          process.exit(1);
        }, 5000);
      }
      return;
    }

    // Parse response frames
    console.log('Received data, buf length:', buf.length);
    
    while (buf.length >= 2) {
      const finOp = buf[0];
      const opcode = finOp & 0x0f;
      let len = buf[1] & 0x7f;
      const masked = (buf[1] & 0x80) !== 0;
      let off = 2;
      
      console.log(`Frame: finOp=${finOp.toString(16)} opcode=${opcode} len=${len} masked=${masked}`);
      
      if (len === 126) {
        if (buf.length < 4) { console.log('Need more data for 126 length'); return; }
        len = buf.readUInt16BE(2);
        off = 4;
        console.log('Extended length:', len);
      } else if (len === 127) {
        if (buf.length < 10) { console.log('Need more data for 127 length'); return; }
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
        console.log('Extended length:', len);
      }
      
      if (masked) {
        if (buf.length < off + 4 + len) { console.log('Need more data for mask'); return; }
        off += 4;
      }
      
      if (buf.length < off + len) {
        console.log('Need more data: have', buf.length - off, 'need', len);
        return;
      }
      
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      
      if (opcode === 0x1) { // text
        console.log('Text frame:', payload.toString('utf8'));
      } else if (opcode === 0x2) { // binary
        console.log('Binary frame:', payload.length, 'bytes');
      } else if (opcode === 0x8) { // close
        console.log('Close frame');
        socket.destroy();
        process.exit(0);
      } else if (opcode === 0x9) { // ping
        console.log('Ping frame');
      } else {
        console.log('Unknown opcode:', opcode, 'payload:', payload.toString('utf8').slice(0, 200));
      }
    }
  });

  socket.on('error', (e) => {
    console.error('Socket error:', e.message);
    process.exit(1);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
