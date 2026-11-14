/**
 * iPhone-viewport audio gate for Ane's mangoes.
 *
 * No speechSynthesis.speak and no AudioContext before the first tap.
 * Tapping "Tap to start" speaks the intro and leaves AudioContext running.
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
    window.__contexts = [];
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
    contexts: window.__contexts.length,
  }));
  assert(before.speaks.length === 0, name + ' speak before gesture: ' + before.speaks.join(' | '));
  assert(before.contexts === 0, name + ' AudioContext before gesture');
  await page.locator('#tap-start').tap();
  await page.waitForFunction((line) => window.__speaks.indexOf(line) !== -1, STORY);
  if (name === 'chromium') {
    await page.waitForFunction(() => {
      const ctx = window.__contexts[0];
      return ctx && ctx.state === 'running';
    });
  }
  const after = await page.evaluate(() => ({
    speaks: window.__speaks.slice(),
    state: window.__contexts[0] && window.__contexts[0].state,
  }));
  assert(after.speaks.indexOf(STORY) !== -1, name + ' intro not spoken: ' + after.speaks.join(' | '));
  assert(pageErrors.length === 0, name + ' page errors ' + pageErrors.join('\n'));
  assert(consoleErrors.length === 0, name + ' console errors ' + consoleErrors.join('\n'));
  await page.close();
  return after.state;
}

let webkitBrowser = null;
let chromeBrowser = null;
try {
  webkitBrowser = await webkit.launch({ headless: true });
  const webkitState = await runEngine('webkit', webkitBrowser);
  console.log('webkit AudioContext', webkitState);
  chromeBrowser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const chromeState = await runEngine('chromium', chromeBrowser);
  assert(chromeState === 'running', 'AudioContext ' + chromeState);
  console.log('audio iphone passed');
  console.log('chromium AudioContext', chromeState);
} catch (err) {
  console.error('audio iphone failed');
  console.error(err);
  process.exitCode = 1;
} finally {
  if (webkitBrowser) await webkitBrowser.close();
  if (chromeBrowser) await chromeBrowser.close();
  server.close();
}
