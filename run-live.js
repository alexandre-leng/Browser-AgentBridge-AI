const { execSync } = require('child_process');

const command = process.argv[2];
const payload = process.argv[3] || '{}';

try {
  const result = execSync(`node live.js ${command} '${payload}'`, {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 15000
  });
  console.log(result);
} catch (e) {
  console.error(e.stdout || e.message);
}
