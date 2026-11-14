/* Ane's mangoes. Tap the fruit, count it into the basket. */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var WORDS = ['One!', 'Two!', 'Three!', 'Four!', 'Five!'];
  var TREE = [[58, 16], [84, 24], [52, 34], [82, 44], [64, 54]];
  var GRASS = [[14, 58], [44, 62], [16, 76], [46, 80], [28, 90]];
  var BALLS = ['#ff5a5a', '#3aa0ff', '#ffe14a', '#3dcc6e', '#b06bff'];
  var LEVELS = {
    ane: {
      id: 'ane', name: 'Ane', kind: 'mango', plural: 'mangoes', label: 'Mango',
      where: 'tree',
      idle: 'assets/ane-idle.webp',
      cheer: 'assets/ane-cheer.webp',
      win: 'assets/ane-win.webp'
    },
    myna: {
      id: 'myna', name: 'Myna', kind: 'apple', plural: 'apples', label: 'Apple',
      where: 'tree',
      idle: 'assets/myna-idle.webp',
      cheer: 'assets/myna-cheer.webp',
      win: 'assets/myna-cheer.webp'
    },
    kapi: {
      id: 'kapi', name: 'Kapi', kind: 'banana', plural: 'bananas', label: 'Banana',
      where: 'tree',
      idle: 'assets/kapi-idle.webp',
      cheer: 'assets/kapi-cheer.webp',
      win: 'assets/kapi-cheer.webp'
    },
    ziggy: {
      id: 'ziggy', name: 'Ziggy', kind: 'ball', plural: 'balls', label: 'Ball',
      where: 'grass',
      idle: 'assets/ziggy-idle.webp',
      cheer: 'assets/ziggy-cheer.webp',
      chase: 'assets/ziggy-chase.webp',
      win: 'assets/ziggy-cheer.webp'
    }
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var audio = null;
  var level = LEVELS.ane;
  var found = 0;
  var round = 0;
  var pending = [];
  var busy = false;
  var winTimer = 0;

  function speak(text) {
    var synth = window.speechSynthesis;
    if (!synth || !text) return;
    try { synth.cancel(); } catch (e) {}
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.92;
      synth.speak(u);
    } catch (e2) {}
  }

  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audio) audio = new AC();
      var pendingAudio = audio.resume();
      if (pendingAudio && pendingAudio.catch) pendingAudio.catch(function () {});
    } catch (e) {}
  }

  function pop() {
    if (!audio) return;
    try {
      var t = audio.currentTime;
      var o = audio.createOscillator();
      var g = audio.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(523.25, t);
      o.frequency.exponentialRampToValueAtTime(784, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + 0.3);
      var len = Math.floor(audio.sampleRate * 0.06);
      var buf = audio.createBuffer(1, len, audio.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = audio.createBufferSource();
      var ng = audio.createGain();
      src.buffer = buf;
      ng.gain.setValueAtTime(0.04, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(ng);
      ng.connect(audio.destination);
      src.start(t);
    } catch (e) {}
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function show(id) {
    ['story', 'pick', 'play', 'win'].forEach(function (name) {
      document.getElementById(name).hidden = name !== id;
    });
    document.getElementById('back').hidden = id !== 'play';
    document.getElementById('count').hidden = id !== 'play' && id !== 'win';
  }

  function svgWrap(inner) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + inner + '</svg>';
  }

  function fruitSVG(kind, color) {
    if (kind === 'mango') {
      return svgWrap(
        '<g transform="rotate(-24 32 36)">' +
          '<ellipse cx="32" cy="38" rx="15" ry="20" fill="#f0a020" stroke="#243028" stroke-width="3.5"/>' +
          '<ellipse cx="38" cy="42" rx="6" ry="9" fill="#e4532c"/>' +
          '<ellipse cx="25" cy="30" rx="4" ry="7" fill="#fff3c4" opacity="0.85"/>' +
        '</g>' +
        '<path d="M30 16c8-10 18-8 20-2-8 0-14 4-16 10z" fill="#3e9a45" stroke="#243028" stroke-width="3" stroke-linejoin="round"/>'
      );
    }
    if (kind === 'apple') {
      return svgWrap(
        '<circle cx="32" cy="36" r="18" fill="#e23d3d" stroke="#243028" stroke-width="3.5"/>' +
        '<ellipse cx="24" cy="30" rx="5" ry="7" fill="#fff" opacity="0.4"/>' +
        '<path d="M32 20c1-8 8-12 13-9" fill="none" stroke="#6b3a16" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M33 16c8-4 14 2 10 9-6-1-10-4-10-9z" fill="#3e9a45" stroke="#243028" stroke-width="3" stroke-linejoin="round"/>'
      );
    }
    if (kind === 'banana') {
      return svgWrap(
        '<path d="M16 42c6-20 20-28 36-22 1 7-6 12-12 14-8 3-14 8-18 16-4-2-6-5-6-8z" fill="#ffe14a" stroke="#243028" stroke-width="3.5" stroke-linejoin="round"/>' +
        '<path d="M46 18c7-3 12 2 9 7" fill="none" stroke="#8a5a12" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="24" cy="30" rx="3.5" ry="6" fill="#fff6c4" opacity="0.9" transform="rotate(-28 24 30)"/>'
      );
    }
    return svgWrap(
      '<circle cx="32" cy="32" r="20" fill="' + color + '" stroke="#243028" stroke-width="3.5"/>' +
      '<path d="M14 32h36M32 13c7 8 7 30 0 38M32 13c-7 8-7 30 0 38" fill="none" stroke="#243028" stroke-width="2.5"/>' +
      '<ellipse cx="24" cy="22" rx="6" ry="4" fill="#fff" opacity="0.55"/>'
    );
  }

  function mini(kind, i) {
    var x = 22 + (i % 5) * 16;
    var y = i > 2 ? 30 : 22;
    if (kind === 'ball') {
      return '<circle cx="' + x + '" cy="' + y + '" r="6" fill="' + BALLS[i] + '" stroke="#243028" stroke-width="2"/>';
    }
    if (kind === 'apple') {
      return '<circle cx="' + x + '" cy="' + (y + 2) + '" r="6" fill="#e23d3d" stroke="#243028" stroke-width="2"/>';
    }
    if (kind === 'banana') {
      return '<path d="M' + (x - 6) + ' ' + (y + 4) + 'c3-8 10-10 14-6" fill="none" stroke="#ffe14a" stroke-width="4" stroke-linecap="round"/>';
    }
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="5" ry="7" fill="#f0a020" stroke="#243028" stroke-width="2" transform="rotate(-20 ' + x + ' ' + y + ')"/>';
  }

  function basketMarkup(kind, n) {
    var fruits = '';
    for (var i = 0; i < n; i++) fruits += mini(kind, i);
    return '<svg viewBox="0 0 120 86" aria-hidden="true">' +
      fruits +
      '<path d="M18 28h84l-10 46H28z" fill="#c6863a" stroke="#243028" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M34 32v38M50 30v42M66 30v42M82 32v36" stroke="#a56a28" stroke-width="3"/>' +
      '<path d="M24 46h74M26 58h68" stroke="#8a4e18" stroke-width="3" opacity="0.85"/>' +
      '<path d="M12 28h96" fill="none" stroke="#8a4e18" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M12 28h96" fill="none" stroke="#243028" stroke-width="4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function paintCount() {
    var text = found + '/5';
    document.getElementById('count').textContent = text;
    document.getElementById('play').setAttribute('data-found', String(found));
  }

  function setPose(pose) {
    var img = document.getElementById('character');
    img.setAttribute('data-pose', pose);
    img.alt = level.name;
    var src = level[pose] || level.idle;
    if (img.getAttribute('src') !== src) img.src = src;
  }

  function placeObjects() {
    var host = document.getElementById('objects');
    host.textContent = '';
    var spots = level.where === 'grass' ? GRASS : TREE;
    spots.forEach(function (spot, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fruit';
      btn.setAttribute('data-kind', level.kind);
      btn.setAttribute('aria-label', level.label);
      btn.style.left = spot[0] + '%';
      btn.style.top = spot[1] + '%';
      var move = document.createElement('span');
      move.className = 'fruit-move';
      move.innerHTML = fruitSVG(level.kind, BALLS[i]);
      btn.appendChild(move);
      host.appendChild(btn);
    });
  }

  function hop(btn) {
    var mover = btn.querySelector('.fruit-move');
    var basket = document.getElementById('basket');
    if (!mover) return Promise.resolve();
    if (reduce || !mover.animate) {
      mover.style.opacity = '0';
      return wait(180);
    }
    var a = mover.getBoundingClientRect();
    var b = basket.getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var lift = -Math.max(56, Math.min(130, Math.abs(dx) * 0.2 + 48));
    btn.style.zIndex = '6';
    var anim = mover.animate([
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      { transform: 'translate(' + (dx * 0.48) + 'px, ' + (dy * 0.28 + lift) + 'px) scale(0.9)', opacity: 1, offset: 0.55 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.35)', opacity: 0 }
    ], { duration: 520, easing: EASE, fill: 'forwards' });
    return (anim.finished || Promise.resolve()).catch(function () {});
  }

  function bound(btn) {
    var run = document.getElementById('hero-run');
    if (level.id !== 'ziggy' || reduce || !run.animate) return Promise.resolve();
    var a = run.getBoundingClientRect();
    var b = btn.getBoundingClientRect();
    var dx = ((b.left + b.width / 2) - (a.left + a.width / 2)) * 0.42;
    var dy = ((b.top + b.height / 2) - (a.top + a.height / 2)) * 0.28;
    var anim = run.animate([
      { transform: 'translate(0px, 0px)' },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px)' }
    ], { duration: 260, easing: EASE, fill: 'forwards' });
    return (anim.finished || Promise.resolve()).catch(function () {});
  }

  function returnHero() {
    var run = document.getElementById('hero-run');
    if (level.id !== 'ziggy') return Promise.resolve();
    if (reduce || !run.animate) {
      run.getAnimations().forEach(function (item) { item.cancel(); });
      run.style.transform = '';
      return Promise.resolve();
    }
    var from = getComputedStyle(run).transform;
    var anim = run.animate([
      { transform: from && from !== 'none' ? from : 'translate(0px, 0px)' },
      { transform: 'translate(0px, 0px)' }
    ], { duration: 240, easing: EASE, fill: 'forwards' });
    return (anim.finished || Promise.resolve()).catch(function () {}).then(function () {
      run.getAnimations().forEach(function (item) { item.cancel(); });
      run.style.transform = '';
    });
  }

  function showWin() {
    var line = 'Five ' + level.plural + '! Shabhash!';
    document.getElementById('win-line').textContent = line;
    var img = document.getElementById('win-character');
    img.src = level.win;
    img.alt = level.name;
    var basket = document.getElementById('win-basket');
    if (level.id === 'ane') {
      basket.hidden = true;
      basket.innerHTML = '';
    } else {
      basket.hidden = false;
      basket.innerHTML = basketMarkup(level.kind, 5);
    }
    show('win');
    var token = round;
    clearTimeout(winTimer);
    winTimer = setTimeout(function () {
      if (token !== round) return;
      speak(line);
    }, 700);
  }

  function drain() {
    if (busy || !pending.length) return;
    busy = true;
    var token = round;
    var btn = pending.shift();
    setPose(level.chase ? 'chase' : 'cheer');
    bound(btn).then(function () {
      if (token !== round) return;
      return hop(btn);
    }).then(function () {
      if (token !== round) return;
      found += 1;
      paintCount();
      document.getElementById('basket').innerHTML = basketMarkup(level.kind, found);
      pop();
      if (level.chase) setPose('cheer');
      speak(WORDS[found - 1]);
      if (found >= 5) return wait(520).then(function () { if (token === round) showWin(); });
      return returnHero().then(function () { if (token === round) setPose('idle'); });
    }).then(function () {
      busy = false;
      if (token === round) drain();
    }, function () {
      busy = false;
    });
  }

  function startLevel(id) {
    round += 1;
    clearTimeout(winTimer);
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    pending = [];
    busy = false;
    found = 0;
    level = LEVELS[id] || LEVELS.ane;
    var play = document.getElementById('play');
    play.setAttribute('data-level', level.id);
    paintCount();
    setPose('idle');
    document.getElementById('hero-run').style.transform = '';
    document.getElementById('basket').innerHTML = basketMarkup(level.kind, 0);
    placeObjects();
    show('play');
  }

  document.addEventListener('pointerdown', unlock);
  document.getElementById('story-go').addEventListener('click', function () {
    unlock();
    show('pick');
    speak('Who are we counting with?');
  });
  document.getElementById('back').addEventListener('click', function () {
    unlock();
    round += 1;
    clearTimeout(winTimer);
    pending = [];
    busy = false;
    show('pick');
  });
  document.getElementById('again').addEventListener('click', function () {
    unlock();
    startLevel(level.id);
  });
  document.getElementById('another').addEventListener('click', function () {
    unlock();
    round += 1;
    clearTimeout(winTimer);
    show('pick');
    speak('Who are we counting with?');
  });
  document.querySelector('.levels').addEventListener('click', function (e) {
    var btn = e.target.closest('.level');
    if (!btn) return;
    unlock();
    startLevel(btn.getAttribute('data-level'));
  });
  document.getElementById('objects').addEventListener('click', function (e) {
    var btn = e.target.closest('.fruit');
    if (!btn || btn.disabled) return;
    unlock();
    btn.disabled = true;
    pending.push(btn);
    drain();
  });

  show('story');
  speak("Ane's mangoes are up in the tree. Let's count them into her basket!");
})();
