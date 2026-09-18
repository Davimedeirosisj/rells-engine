import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const arrobaDir = path.join(rootDir, 'arroba');

function findArrobaPng() {
  if (!fs.existsSync(arrobaDir)) return '';
  const file = fs.readdirSync(arrobaDir)
    .filter((name) => /\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b))[0];
  return file ? path.join(arrobaDir, file) : '';
}

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  rootDir,
  dirs: {
    app: path.join(rootDir, 'app'), backend: path.join(rootDir, 'backend'), worker: path.join(rootDir, 'worker'),
    fonts: path.join(rootDir, 'fonts'), assets: path.join(rootDir, 'assets'), projects: path.join(rootDir, 'projects'),
    temp: path.join(rootDir, 'temp'), output: path.join(rootDir, 'output'), tests: path.join(rootDir, 'tests'), docs: path.join(rootDir, 'docs'),
    data: path.join(rootDir, 'data'),
  },
  globalSettingsPath: path.join(rootDir, 'global-settings.json'),
  ffmpegPath: process.env.FFMPEG_PATH || '',
  ffprobePath: process.env.FFPROBE_PATH || '',
  fontPath: process.env.FONT_PATH || path.join(rootDir, 'fonts', 'Gobold-Bold.ttf'),
  avatarPath: process.env.AVATAR_PATH || path.join(rootDir, 'assets', 'avatar.png'),
  verificationPath: process.env.VERIFICATION_PATH || path.join(rootDir, 'assets', 'verification.png'),
  arrobaPath: process.env.ARROBA_PATH || findArrobaPng(),
  profileHandle: process.env.PROFILE_HANDLE || '@apostololuizhenrique',
};

export default config;
