/**
 * iPhone-viewport voice check for Ane's mangoes.
 *
 * The intro clip's audio.play() runs inside the tap, and that promise fulfills.
 * Nothing speaks or plays before the tap.
 *
 *   node tests/audio-iphone.mjs
 */
import { chromium, webkit } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORY = "Ane's mangoes are up in the tree. Let's count them into her basket!";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  const file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

async function arm(page) {
  await page.evaluate(() => {
    window.__speaks = [];
    window.__plays = [];
    window.__contexts = [];
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function () {
      const rec = {
        line: this.getAttribute('data-line'),
        muted: this.muted,
        volume: this.volume,
        during: !!(window.event && /^(click|pointerup|pointerdown|touchend|touchstart)$/.test(window.event.type)),
        settled: 'pending'
      };
      window.__plays.push(rec);
      let pendingPlay;
      try {
        pendingPlay = origPlay.apply(this, arguments);
      } catch (err) {
        rec.settled = 'throw ' + (err && err.name);
        throw err;
      }
      if (pendingPlay && pendingPlay.then) {
        pendingPlay.then(function () { rec.settled = 'ok'; }, function (err) {
          rec.settled = 'err ' + (err && err.name);
        });
      } else rec.settled = 'ok';
      return pendingPlay;
    };
    const synth = window.speechSynthesis;
    if (synth && !synth.__wrapped) {
      const orig = synth.speak.bind(synth);
      synth.speak = function (utterance) {
        window.__speaks.push(utterance && utterance.text);
        try { return orig(utterance); } catch (err) { /* speaker is optional */ }
      };
      synth.__wrapped = true;
    }
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (Orig && !Orig.__wrapped) {
      const Wrapped = function AudioContextWrapped() {
        const ctx = new Orig();
        window.__contexts.push(ctx);
        return ctx;
      };
      Wrapped.prototype = Orig.prototype;
      Wrapped.__wrapped = true;
      window.AudioContext = Wrapped;
      window.webkitAudioContext = Wrapped;
    }
  });
}

async function runEngine(name, browser) {
  const page = await browser.newPage(iphone);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(origin + '/', { waitUntil: 'load' });
  await arm(page);
  const before = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    plays: window.__plays.length,
    contexts: window.__contexts.length,
  }));
  assert(before.speaks.length === 0, name + ' speak before gesture: ' + before.speaks.join(' | '));
  assert(before.plays === 0, name + ' audio.play before gesture');
  assert(before.contexts === 0, name + ' AudioContext before gesture');
  await page.locator('#tap-start').tap();
  await page.waitForFunction((line) => {
    const plays = window.__plays;
    if (!plays.length || plays.some((p) => p.settled === 'pending')) return false;
    return plays.some((p) => p.line === line && !p.muted && p.during && p.settled === 'ok');
  }, STORY);
  const after = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    plays: window.__plays.map((p) => ({ line: p.line, muted: p.muted, during: p.during, settled: p.settled })),
    state: window.__contexts[0] && window.__contexts[0].state,
  }));
  const intro = after.plays.find((p) => p.line === STORY && !p.muted);
  assert(intro && intro.during && intro.settled === 'ok', name + ' intro play ' + JSON.stringify(intro));
  const rejected = after.plays.filter((p) => p.settled.indexOf('err') === 0 || p.settled.indexOf('throw') === 0);
  assert(rejected.length === 0, name + ' play rejected ' + JSON.stringify(rejected));
  assert(after.speaks.length === 0, name + ' fell back to speech ' + after.speaks.join(' | '));
  assert(pageErrors.length === 0, name + ' page errors ' + pageErrors.join('\n'));
  assert(consoleErrors.length === 0, name + ' console errors ' + consoleErrors.join('\n'));
  await page.close();
  return { state: after.state, plays: after.plays.length };
}

let webkitBrowser = null;
let chromeBrowser = null;
try {
  webkitBrowser = await webkit.launch({ headless: true });
  const webkitResult = await runEngine('webkit', webkitBrowser);
  console.log('webkit', webkitResult);
  chromeBrowser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const chromeResult = await runEngine('chromium', chromeBrowser);
  assert(chromeResult.state === 'running', 'AudioContext ' + chromeResult.state);
  console.log('audio iphone passed');
  console.log('chromium', chromeResult);
} catch (err) {
  console.error('audio iphone failed');
  console.error(err);
  process.exitCode = 1;
} finally {
  if (webkitBrowser) await webkitBrowser.close();
  if (chromeBrowser) await chromeBrowser.close();
  server.close();
}
