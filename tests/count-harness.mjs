/**
 * Phone harness for Ane's mangoes.
 *
 * Chromium at 390×844 and 320×700. Every level counts to 5/5.
 * There is no spoons line. Speech is recorded, not heard.
 *
 *   node tests/count-harness.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir, copyFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
const shots = join(artifacts, 'bubbles');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const banned = [];
for (const rel of ['index.html', 'css/game.css', 'js/game.js']) {
  const text = await readFile(join(root, rel), 'utf8');
  if (/spoon/i.test(text)) banned.push(rel);
}
assert(banned.length === 0, 'spoons text in ' + banned.join(', '));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = (urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
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

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  recordVideo: { dir: '/tmp/count-video', size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const requests = [];
const failed = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('request', (req) => requests.push(req.url()));
page.on('response', (res) => { if (res.status() >= 400) failed.push(res.status() + ' ' + res.url()); });

await page.addInitScript(() => {
  window.__utters = [];
  window.__audioResumes = 0;
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (Orig) {
    const Wrapped = function AudioContextWrapped() {
      const ctx = new Orig();
      const resume = ctx.resume.bind(ctx);
      ctx.resume = () => {
        window.__audioResumes += 1;
        return resume();
      };
      return ctx;
    };
    Wrapped.prototype = Orig.prototype;
    window.AudioContext = Wrapped;
    window.webkitAudioContext = Wrapped;
  }
  const synth = window.speechSynthesis;
  if (synth && !synth.__wrapped) {
    const orig = synth.speak.bind(synth);
    synth.speak = function (utterance) {
      window.__utters.push({ text: utterance.text, lang: utterance.lang });
      try { return orig(utterance); } catch (err) { /* speaker is optional */ }
    };
    synth.__wrapped = true;
  }
});

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function utters() {
  return page.evaluate(() => window.__utters.map((u) => u.text));
}
async function shot(name) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, name) });
}
const STORY = "Ane's mangoes are up in the tree. Let's count them into her basket!";
const WINS = {
  ane: 'Five mangoes! Shabhash!',
  myna: 'Five apples! Shabhash!',
  kapi: 'Five bananas! Shabhash!',
  ziggy: 'Five balls! Shabhash!',
};

async function openLevel(id) {
  await page.locator('.level[data-level="' + id + '"]').click();
  await page.waitForFunction((levelId) => {
    const play = document.getElementById('play');
    return play && !play.hidden && play.getAttribute('data-level') === levelId && play.getAttribute('data-found') === '0';
  }, id);
}

async function countAll(pageUnderTest) {
  for (let n = 1; n <= 5; n++) {
    await pageUnderTest.locator('.fruit:not([disabled])').first().click();
    await pageUnderTest.waitForFunction((want) => {
      const play = document.getElementById('play');
      const win = document.getElementById('win');
      const found = play && play.getAttribute('data-found');
      return found === String(want) || (want === 5 && win && !win.hidden);
    }, n, { timeout: 8000 });
  }
  await pageUnderTest.waitForFunction(() => !document.getElementById('win').hidden);
}

try {
  await page.goto(origin + '/', { waitUntil: 'load' });
  assert(await page.locator('#story').isVisible(), 'story hidden');
  assert((await page.locator('#story-text').textContent()) === STORY, 'story copy');
  assert((await utters()).some((t) => t === STORY), 'story not spoken');
  const storyImg = await page.locator('.story-ane').evaluate((el) => el.complete && el.naturalWidth > 0);
  assert(storyImg, 'sad Ane did not load');
  const go = await page.locator('#story-go').boundingBox();
  assert(go && go.height >= 88 && go.width >= 88, 'story button small');
  await shot('story.png');

  await page.locator('#story-go').click();
  await pause(150);
  assert(await page.locator('#pick').isVisible(), 'level select hidden');
  assert(await page.locator('.level').count() === 4, 'not four levels');
  const names = await page.locator('.level').evaluateAll((els) => els.map((el) => el.getAttribute('data-level')));
  assert(names.join(',') === 'ane,myna,kapi,ziggy', 'levels ' + names.join(','));
  for (const card of await page.locator('.level').all()) {
    const r = await card.boundingBox();
    assert(r && r.width >= 88 && r.height >= 88, 'level card small');
  }
  await shot('levels.png');
  assert((await page.evaluate(() => window.__audioResumes)) >= 1, 'audio not unlocked');

  await openLevel('ane');
  assert(await page.locator('.fruit').count() === 5, 'ane objects');
  const kinds = await page.locator('.fruit').evaluateAll((els) => els.map((el) => el.getAttribute('data-kind')));
  assert(kinds.every((k) => k === 'mango'), 'ane kinds ' + kinds.join(','));
  for (const fruit of await page.locator('.fruit').all()) {
    const r = await fruit.boundingBox();
    assert(r && r.width >= 88 && r.height >= 88, 'mango target ' + (r && r.width));
  }
  await page.locator('.fruit').first().click();
  await page.waitForFunction(() => document.getElementById('character').getAttribute('data-pose') === 'cheer');
  await page.waitForFunction(() => document.getElementById('play').getAttribute('data-found') === '1');
  await page.locator('.fruit:not([disabled])').first().click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('data-found') === '2');
  assert((await page.locator('#count').textContent()) === '2/5', 'mid count');
  const said = await utters();
  assert(said.includes('One!') && said.includes('Two!'), 'count words ' + said.join(' | '));
  await shot('ane-count.png');
  await page.locator('.fruit:not([disabled])').first().click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('data-found') === '3');
  await page.locator('.fruit:not([disabled])').first().click();
  await page.waitForFunction(() => document.getElementById('play').getAttribute('data-found') === '4');
  await page.locator('.fruit:not([disabled])').first().click();
  await page.waitForFunction(() => !document.getElementById('win').hidden);
  assert((await page.locator('#win-line').textContent()) === WINS.ane, 'ane win line');
  await page.waitForFunction((line) => window.__utters.some((u) => u.text === line), WINS.ane);
  const winSrc = await page.locator('#win-character').getAttribute('src');
  assert(winSrc && winSrc.includes('ane-win'), 'win pose ' + winSrc);
  const again = await page.locator('#again').boundingBox();
  const another = await page.locator('#another').boundingBox();
  assert(again && again.height >= 88, 'play again small');
  assert(another && another.height >= 88, 'another friend small');
  await shot('win.png');

  await page.locator('#again').click();
  await page.waitForFunction(() => {
    const play = document.getElementById('play');
    return play && !play.hidden && play.getAttribute('data-found') === '0';
  });
  assert(await page.locator('.fruit:not([disabled])').count() === 5, 'play again did not reset');
  await page.locator('#back').click();
  await page.waitForFunction(() => !document.getElementById('pick').hidden);

  for (const id of ['myna', 'kapi', 'ziggy']) {
    await openLevel(id);
    const levelKinds = await page.locator('.fruit').evaluateAll((els) => els.map((el) => el.getAttribute('data-kind')));
    const expectKind = id === 'myna' ? 'apple' : id === 'kapi' ? 'banana' : 'ball';
    assert(levelKinds.every((k) => k === expectKind), id + ' kinds ' + levelKinds.join(','));
    if (id === 'ziggy') {
      const loaded = await page.locator('#character').evaluate((el) => el.complete && el.naturalWidth > 0 && el.getAttribute('src').includes('ziggy'));
      assert(loaded, 'ziggy did not load');
      await shot('ziggy.png');
    }
    await countAll(page);
    assert((await page.locator('#win-line').textContent()) === WINS[id], id + ' win');
    await page.waitForFunction((line) => window.__utters.some((u) => u.text === line), WINS[id]);
    if (id !== 'ziggy') await page.locator('#another').click();
  }

  const bodyText = await page.locator('body').innerText();
  assert(!/spoon/i.test(bodyText), 'spoons text on screen');
  const outside = requests.filter((url) => !url.startsWith(origin));
  assert(outside.length === 0, 'left the page ' + outside.join(', '));
  assert(pageErrors.length === 0, 'page errors ' + pageErrors.join('\n'));
  assert(failed.length === 0, 'failed loads ' + failed.join(', '));
  assert(consoleErrors.length === 0, 'console errors ' + consoleErrors.join('\n'));

  const narrow = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(origin + '/', { waitUntil: 'load' });
  await narrowPage.locator('#story-go').click();
  const cards = await narrowPage.locator('.level').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }));
  for (const card of cards) assert(card.w >= 88 && card.h >= 88, '320 card ' + card.w + 'x' + card.h);
  await narrowPage.locator('.level[data-level="ziggy"]').click();
  await narrowPage.waitForFunction(() => !document.getElementById('play').hidden);
  const narrowSize = await narrowPage.evaluate(() => {
    const fruits = [...document.querySelectorAll('.fruit')].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return {
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
      fruits,
    };
  });
  assert(narrowSize.sw <= narrowSize.cw + 1, '320 overflow ' + narrowSize.sw);
  assert(narrowSize.fruits.length === 5, '320 balls');
  for (const fruit of narrowSize.fruits) {
    assert(fruit.w >= 88 && fruit.h >= 88, '320 target ' + fruit.w);
    assert(fruit.left >= -1 && fruit.right <= narrowSize.cw + 1, '320 ball off the side');
    assert(fruit.top >= -1 && fruit.bottom <= narrowSize.ch + 1, '320 ball off the end');
  }
  await narrowPage.screenshot({ path: join(shots, 'narrow-320.png') });
  await narrow.close();

  console.log('count harness passed');
} catch (err) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
  console.error('count harness failed');
  console.error(err);
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();
  if (video && process.exitCode !== 1) {
    await mkdir(artifacts, { recursive: true });
    await copyFile(await video.path(), join(artifacts, 'bubbles-walkthrough.webm'));
  }
  const files = await readdir(shots).catch(() => []);
  console.log('shots', files.join(', '));
}
