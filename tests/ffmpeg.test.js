import { test } from 'node:test';
import assert from 'node:assert/strict';
import { msToFfmpegTime, buildCutCommand } from '../backend/ffmpeg.js';

test('msToFfmpegTime preserva milissegundos', () => {
  assert.equal(msToFfmpegTime(0), '00:00:00.000');
  assert.equal(msToFfmpegTime(280), '00:00:00.280');
  assert.equal(msToFfmpegTime(988280), '00:16:28.280');
  assert.equal(msToFfmpegTime(1042500), '00:17:22.500');
  assert.equal(msToFfmpegTime(3600000), '01:00:00.000');
});

test('msToFfmpegTime rejeita valores negativos', () => {
  assert.throws(() => msToFfmpegTime(-1), /negativo/);
});

test('buildCutCommand usa input seeking com -ss e -to precisos', () => {
  const args = buildCutCommand('C:/v/original.mp4', 988280, 1042500);

  assert.equal(args[0], '-y');

  const ssIndex = args.indexOf('-ss');
  const toIndex = args.indexOf('-to');
  assert.notEqual(ssIndex, -1);
  assert.notEqual(toIndex, -1);
  assert.equal(args[ssIndex + 1], '00:16:28.280');
  assert.equal(args[toIndex + 1], '00:17:22.500');

  const iIndex = args.indexOf('-i');
  assert.equal(args[iIndex + 1], 'C:/v/original.mp4');
});

test('buildCutCommand preserva áudio e vídeo', () => {
  const args = buildCutCommand('in.mp4', 0, 2000);
  assert.ok(args.includes('-map'));
  assert.ok(args.includes('0:v:0'));
  assert.ok(args.includes('0:a:0'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
});

test('buildCutCommand gera array (sem shell/concatenação)', () => {
  const args = buildCutCommand('in.mp4', 0, 1000);
  assert.ok(Array.isArray(args));
  assert.ok(args.every((a) => typeof a === 'string'));
});