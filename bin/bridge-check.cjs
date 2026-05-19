const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 8080;
const BRIDGE_URL = `http://localhost:${PORT}/health`;

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(BRIDGE_URL, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.abort(); resolve(false); });
  });
}

async function main() {
  const isUp = await checkHealth();
  if (isUp) {
    console.log('✅ Browser bridge already running on localhost:8080');
    process.exit(0);
  }

  console.log('🚀 Starting browser bridge...');
  const bridge = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  // Wait a bit then verify
  await new Promise(r => setTimeout(r, 4000));
  const nowUp = await checkHealth();
  if (nowUp) {
    console.log('✅ Browser bridge started successfully');
  } else {
    console.log('⚠️  Bridge may still be starting...');
  }
}

main().catch(console.error);
