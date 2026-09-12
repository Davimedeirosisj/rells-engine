import { test } from 'node:test';
import { existsSync } from 'fs';
import path from 'path';

const rootDir = path.join(__dirname, '..', '..', '..');
const fontPath = path.join(rootDir, 'fonts', 'Gobold-Bold.ttf');
const avatarPath = path.join(rootDir, 'assets', 'avatar.png');
const verifyPath = path.join(rootDir, 'assets', 'verification.png');

test('FFmpeg assets exist', () => {
  console.log('Testing FFmpeg asset paths...');
  console.log('Font exists:', existsSync(fontPath), fontPath);
  console.log('Avatar exists:', existsSync(avatarPath), avatarPath);
  console.log('Verification exists:', existsSync(verifyPath), verifyPath);
  
  const allExist = existsSync(fontPath) && existsSync(avatarPath) && existsSync(verifyPath);
  if (!allExist) {
    throw new Error('FFmpeg assets not found!');
  }
});

test('FFmpeg is available in PATH', () => {
  const { spawnSync } = require('child_process');
  const result = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  
  if (result.error) {
    throw new Error('FFmpeg not found: ' + result.stderr);
  }
  console.log('? FFmpeg available:', result.stdout.substring(0, 100));
});
