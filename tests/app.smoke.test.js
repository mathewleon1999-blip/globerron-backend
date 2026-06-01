const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert');

let serverProcess;

function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

before(async () => {
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'app.js')], {
    env: { ...process.env, PORT: '5055', STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_123' },
    stdio: 'ignore'
  });
  await wait(1500);
});

after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

function httpGet(pathname){
  return new Promise((resolve, reject)=>{
    const req = http.request({ hostname: '127.0.0.1', port: 5055, path: pathname, method: 'GET' }, res => {
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('server starts and serves index fallback', async () => {
  const status = await httpGet('/non-existent');
  assert.ok([200, 304].includes(status));
});
