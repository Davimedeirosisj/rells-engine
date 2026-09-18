import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { msToFfmpegTime, buildCutCommand, buildPreviewCommand } from '../backend/ffmpeg.js';
import { buildVideoFilter, OUTPUT_WIDTH, OUTPUT_HEIGHT, escapeFilterText } from '../backend/filter.js';

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

test('buildCutCommand preserva áudio e gera saída vertical', () => {
  const args = buildCutCommand('in.mp4', 0, 2000);
  assert.ok(args.includes('-filter_complex'));
  assert.ok(args.includes('[v]'));
  assert.ok(args.includes('0:a:0'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
});

test('buildCutCommand gera array (sem shell/concatenação)', () => {
  const args = buildCutCommand('in.mp4', 0, 1000);
  assert.ok(Array.isArray(args));
  assert.ok(args.every((a) => typeof a === 'string'));
});

test('buildVideoFilter produz 1080x1920 (9:16) sem extras quando desligado', () => {
  const result = buildVideoFilter({ titleMode: 'hidden', showArroba: false });
  assert.ok(result.filter.includes('scale=1080:1920'));
  assert.ok(result.filter.includes('[base]null[v]'));
  assert.match(result.filter, /\[v\]$/);
  assert.deepEqual(result.extraInputs, []);
});

test('buildVideoFilter titleMode=overlay desenha o tema', () => {
  const font = path.join(os.tmpdir(), `rells-font-${Date.now()}.ttf`);
  fs.writeFileSync(font, 'fake');
  try {
    const withTitle = buildVideoFilter({ theme: 'TEMA', fontPath: font, titleMode: 'overlay', showArroba: false });
    assert.ok(withTitle.filter.includes('drawtext'));
    assert.ok(withTitle.filter.includes("text='TEMA'"));
    assert.ok(!withTitle.filter.includes('overlay='));

    const filenameOnly = buildVideoFilter({ theme: 'TEMA', fontPath: font, titleMode: 'filename', showArroba: false });
    assert.ok(!filenameOnly.filter.includes('drawtext'));

    const hidden = buildVideoFilter({ theme: 'TEMA', fontPath: font, titleMode: 'hidden', showArroba: false });
    assert.ok(!hidden.filter.includes('drawtext'));
  } finally {
    fs.rmSync(font, { force: true });
  }
});

test('buildVideoFilter showArroba=false remove overlay e inputs extras', () => {
  const withArroba = buildVideoFilter({ theme: '', showArroba: false });
  assert.ok(!withArroba.filter.includes('overlay='));
  assert.deepEqual(withArroba.extraInputs, []);
});

test('OUTPUT_WIDTH/OUTPUT_HEIGHT estão no formato 9:16', () => {
  assert.equal(OUTPUT_WIDTH, 1080);
  assert.equal(OUTPUT_HEIGHT, 1920);
});

test('escapeFilterText escapa caracteres especiais do drawtext', () => {
  assert.equal(escapeFilterText("O'reilly: 100%"), "O\\'reilly\\: 100\\%");
});

test('buildPreviewCommand usa a MESMA config visual que o corte final', () => {
  const cut = buildCutCommand('in.mp4', 0, 5000);
  const preview = buildPreviewCommand('in.mp4', 0, 5000);

  const cutFilter = cut[cut.indexOf('-filter_complex') + 1];
  const previewFilter = preview[preview.indexOf('-filter_complex') + 1];
  assert.equal(previewFilter, cutFilter);
});

test('buildPreviewCommand limita duração e usa qualidade mais leve', () => {
  const preview = buildPreviewCommand('in.mp4', 0, 20000);
  assert.ok(preview.includes('-t'));
  assert.ok(preview.includes('ultrafast'));
  assert.ok(preview.includes('-crf'));
});