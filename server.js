import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

console.log('====================================================');
console.log('🚀 Starting DeliveryFlow: Backend & Frontend...');
console.log('====================================================\n');

// 1. Start Backend (Express API on port 4000)
const backendDir = path.join(__dirname, 'backend');
const backend = spawn('node', ['src/index.js'], {
  cwd: backendDir,
  env: { ...process.env, PORT: '4000' },
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe']
});

backend.stdout.on('data', (chunk) => {
  process.stdout.write(`[BACKEND] ${chunk}`);
});
backend.stderr.on('data', (chunk) => {
  process.stderr.write(`[BACKEND] ${chunk}`);
});
backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[BACKEND] Process exited with code ${code}`);
  }
});

// 2. Start Frontend (Vite Dev Server on port 5173)
const frontendDir = path.join(__dirname, 'frontend');
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: frontendDir,
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe']
});

frontend.stdout.on('data', (chunk) => {
  process.stdout.write(`[FRONTEND] ${chunk}`);
});
frontend.stderr.on('data', (chunk) => {
  process.stderr.write(`[FRONTEND] ${chunk}`);
});
frontend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[FRONTEND] Process exited with code ${code}`);
  }
});

// Clean shutdown handler
const shutdown = () => {
  console.log('\n🛑 Shutting down backend and frontend...');
  if (backend) backend.kill('SIGINT');
  if (frontend) frontend.kill('SIGINT');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
