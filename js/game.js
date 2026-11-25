/* Ane's mangoes. Tap the fruit, count it into the basket. */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)';
  var WORDS = ['One!', 'Two!', 'Three!', 'Four!', 'Five!'];
  var TREE = [[66, 24], [84, 28], [58, 32], [74, 36], [56, 40]];
  var GRASS = [[20, 66], [46, 66], [20, 76], [46, 76], [34, 58]];
  var BALLS = ['#ff5a5a', '#3aa0ff', '#ffe14a', '#3dcc6e', '#f0a020'];
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
      cheer: 'assets/kapi-idle.webp',
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

  var INTRO = "Ane's mangoes are up in the tree. Let's count them into her basket!";
  var WHO = 'Who are we counting with?';
  var LINES = {};
  LINES[INTRO] = 'assets/voice/intro.mp3';
  LINES[WHO] = 'assets/voice/who.mp3';
  LINES['One!'] = 'assets/voice/one.mp3';
  LINES['Two!'] = 'assets/voice/two.mp3';
  LINES['Three!'] = 'assets/voice/three.mp3';
  LINES['Four!'] = 'assets/voice/four.mp3';
  LINES['Five!'] = 'assets/voice/five.mp3';
  LINES['Five mangoes! Shabhash!'] = 'assets/voice/win-mangoes.mp3';
  LINES['Five apples! Shabhash!'] = 'assets/voice/win-apples.mp3';
  LINES['Five bananas! Shabhash!'] = 'assets/voice/win-bananas.mp3';
  LINES['Five balls! Shabhash!'] = 'assets/voice/win-balls.mp3';
  var clips = {};
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var screenId = 'story';
  var audio = null;
  var audioUnlocked = false;
  var started = false;
  var level = LEVELS.ane;
  var found = 0;
  var round = 0;
  var pending = [];
  var busy = false;
  var winTimer = 0;

  function prepareVoice() {
    Object.keys(LINES).forEach(function (text) {
      var el = document.createElement('audio');
      el.preload = 'auto';
      el.src = LINES[text];
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.setAttribute('data-line', text);
      el.setAttribute('aria-hidden', 'true');
      el.addEventListener('error', function () { el.setAttribute('data-broken', '1'); });
      document.body.appendChild(el);
      clips[text] = el;
    });
  }

  function chooseVoice(synth) {
    var voices = [];
    try { voices = (synth.getVoices && synth.getVoices()) || []; } catch (e) {}
    var i;
    var lang;
    for (i = 0; i < voices.length; i++) {
      lang = voices[i].lang || '';
      if (/^en-US/i.test(lang)) return voices[i];
    }
    for (i = 0; i < voices.length; i++) {
      lang = voices[i].lang || '';
      if (/^en/i.test(lang)) return voices[i];
    }
    return voices[0] || null;
  }

  function speakFallback(text) {
    if (!started || !text) return;
    var synth = window.speechSynthesis;
    if (!synth) return;
    try {
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      var voice = chooseVoice(synth);
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
    } catch (e) {}
  }

  function setPlaybackSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
  }

  function watchPlay(el, text) {
    var pendingPlay;
    try { pendingPlay = el.play(); }
    catch (e) {
      speakFallback(text);
      return;
    }
    if (pendingPlay && pendingPlay.catch) {
      pendingPlay.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        el.setAttribute('data-broken', '1');
        speakFallback(text);
      });
    }
  }

  function say(text) {
    if (!started || !text) return;
    var el = clips[text];
    if (!el || el.getAttribute('data-broken') === '1') {
      speakFallback(text);
      return;
    }
    Object.keys(clips).forEach(function (key) {
      if (key === text) return;
      var other = clips[key];
      if (!other.paused) {
        try { other.pause(); } catch (e) {}
      }
    });
    try { el.currentTime = 0; } catch (e2) {}
    el.muted = false;
    el.volume = 1;
    watchPlay(el, text);
  }

  // iOS only allows playback that begins inside the tap. Every clip is play()'d
  // here; the line we want is audible and the rest are silent unlocks.
  function beginVoice(text) {
    setPlaybackSession();
    Object.keys(clips).forEach(function (key) {
      var el = clips[key];
      var hear = key === text;
      el.muted = !hear;
      el.volume = 1;
      try { el.currentTime = 0; } catch (e) {}
      if (hear) {
        if (el.getAttribute('data-broken') === '1') speakFallback(key);
        else watchPlay(el, key);
        return;
      }
      var pendingPlay;
      try { pendingPlay = el.play(); } catch (e2) { return; }
      if (pendingPlay && pendingPlay.then) {
        pendingPlay.then(function () {
          try { el.pause(); el.currentTime = 0; } catch (e3) {}
          el.muted = false;
        }).catch(function () { el.muted = false; });
      }
    });
    if (!clips[text]) speakFallback(text);
  }

  function playSilence() {
    if (!audio) return;
    var rate = audio.sampleRate || 22050;
    var frames = Math.max(1, Math.floor(rate * 0.02));
    var buffer = audio.createBuffer(1, frames, rate);
    var source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
  }

  function unlock() {
    if (!started) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audio) audio = new AC();
      var pendingAudio = audio.resume();
      if (pendingAudio && pendingAudio.catch) pendingAudio.catch(function () {});
      if (!audioUnlocked) {
        audioUnlocked = true;
        try { playSilence(); } catch (e2) {}
        if (pendingAudio && pendingAudio.then) {
          pendingAudio.then(function () {
            try { playSilence(); } catch (e3) {}
          }).catch(function () {});
        }
      }
    } catch (e) {}
  }

  function pop() {
    if (!started || !audio) return;
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
    screenId = id;
    ['story', 'pick', 'play', 'win'].forEach(function (name) {
      document.getElementById(name).hidden = name !== id;
    });
    var back = document.getElementById('back');
    back.hidden = id === 'story';
    back.setAttribute('aria-label', id === 'pick' ? 'Story' : 'Pick a friend');
    document.getElementById('count').hidden = id !== 'play' && id !== 'win';
  }

  function svgWrap(inner) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + inner + '</svg>';
  }

  function fruitSVG(kind, color) {
    if (kind === 'mango') {
      return svgWrap(
        '<path d="M34 12c1-6 7-8 9-3" fill="none" stroke="#6b442c" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path d="M30 13c7-3 14 2 11 9-5 0-9-2-11-7z" fill="#2f6f4e"/>' +
        '<path d="M32 20c13 1 22 14 18 28-4 12-16 16-22 14-12-4-20-16-16-30 2-8 11-13 20-12z" fill="#f0a020"/>' +
        '<path d="M22 32c5-7 12-8 16-3-5 2-10 3-14 1z" fill="#ffe14a" opacity="0.9"/>' +
        '<path d="M38 42c5 1 8 7 4 11-5-1-8-5-8-9z" fill="#e08a14"/>'
      );
    }
    if (kind === 'apple') {
      return svgWrap(
        '<path d="M32 12c1-6 7-8 10-4" fill="none" stroke="#6b442c" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M30 14c7-3 13 1 10 8-5 0-9-2-11-6z" fill="#2f6f4e"/>' +
        '<circle cx="32" cy="38" r="18" fill="#e23d3d"/>' +
        '<ellipse cx="24" cy="32" rx="5" ry="7" fill="#fff" opacity="0.4"/>'
      );
    }
    if (kind === 'banana') {
      return svgWrap(
        '<path d="M14 42c6-18 18-26 34-20 1 6-5 11-11 13-8 3-14 8-17 16-4-2-6-5-6-9z" fill="#ffe14a" stroke="#1c2b22" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M44 20c6-2 10 2 8 6" fill="none" stroke="#6b442c" stroke-width="2.5" stroke-linecap="round"/>' +
        '<ellipse cx="22" cy="30" rx="3" ry="6" fill="#fff6c4" opacity="0.9" transform="rotate(-28 22 30)"/>'
      );
    }
    return svgWrap(
      '<circle cx="32" cy="34" r="20" fill="' + color + '" stroke="#1c2b22" stroke-width="3"/>' +
      '<path d="M14 34h36M32 15c7 8 7 28 0 36M32 15c-7 8-7 28 0 36" fill="none" stroke="#1c2b22" stroke-width="2.4"/>' +
      '<ellipse cx="24" cy="24" rx="6" ry="4" fill="#fff" opacity="0.55"/>'
    );
  }

  function mini(kind, i, n) {
    var gap = n <= 1 ? 0 : Math.min(36, 150 / (n - 1));
    var x = 160 - (gap * (n - 1)) / 2 + gap * i;
    var y = 66;
    var shape;
    if (kind === 'ball') {
      shape = '<circle cx="' + x + '" cy="' + y + '" r="16" fill="' + BALLS[i] + '" stroke="#1c2b22" stroke-width="3"/>';
    } else if (kind === 'apple') {
      shape = '<circle cx="' + x + '" cy="' + y + '" r="16" fill="#e23d3d" stroke="#1c2b22" stroke-width="3"/>' +
        '<path d="M' + x + ' ' + (y - 16) + 'c4-7 10-6 11-1" fill="none" stroke="#6b442c" stroke-width="2.4" stroke-linecap="round"/>';
    } else if (kind === 'banana') {
      shape = '<path d="M' + (x - 16) + ' ' + (y + 8) + 'c5-16 16-20 26-14" fill="none" stroke="#ffe14a" stroke-width="9" stroke-linecap="round"/>';
    } else {
      shape = '<path d="M' + (x - 4) + ' ' + (y - 18) + 'c5-8 12-8 14-2-6 1-10 2-12 7z" fill="#2f6f4e"/>' +
        '<path d="M' + x + ' ' + (y - 10) + 'c10 1 16 10 13 20-3 8-11 11-16 10-8-2-14-11-12-20 1-6 8-11 15-10z" fill="#f0a020" stroke="#1c2b22" stroke-width="3"/>';
    }
    return '<g transform="translate(' + x + ' ' + y + ') scale(1.35) translate(' + (-x) + ' ' + (-y) + ')">' + shape + '</g>';
  }

  function basketMarkup(kind, n) {
    var fruits = '';
    for (var i = 0; i < n; i++) fruits += mini(kind, i, n);
    return '<svg viewBox="0 0 320 128" aria-hidden="true">' +
      '<path d="M104 68c16-34 96-34 112 0" fill="none" stroke="#6b442c" stroke-width="8" stroke-linecap="round"/>' +
      fruits +
      '<path d="M24 70h272l-24 44c-4 8-14 10-28 10H76c-14 0-24-2-28-10z" fill="#c47a32" stroke="#1c2b22" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M42 84h238M48 98h226" stroke="#8a4e18" stroke-width="4" stroke-linecap="round" opacity="0.85"/>' +
      '<path d="M24 70h272" fill="none" stroke="#6b442c" stroke-width="9" stroke-linecap="round"/>' +
      '</svg>';
  }

  function paintCount() {
    var el = document.getElementById('count');
    el.textContent = found + '/5';
    el.setAttribute('data-kind', level.kind);
    document.getElementById('play').setAttribute('data-found', String(found));
    if (found > 0 && !reduce && el.animate) {
      el.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.06)', offset: 0.4 },
        { transform: 'scale(1)' }
      ], { duration: 180, easing: EASE });
    }
  }

  function nudgeBasket() {
    var basket = document.getElementById('basket');
    if (reduce || !basket.animate) return;
    basket.animate([
      { transform: 'translateX(-50%) scale(1)' },
      { transform: 'translateX(-50%) scale(1.035)', offset: 0.45 },
      { transform: 'translateX(-50%) scale(1)' }
    ], { duration: 200, easing: EASE });
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
      { transform: 'translate(' + (dx * 0.48) + 'px, ' + (dy * 0.28 + lift) + 'px) scale(0.92)', opacity: 1, offset: 0.55 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.6)', opacity: 0 }
    ], { duration: 300, easing: EASE_MOVE, fill: 'forwards' });
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
    ], { duration: 240, easing: EASE, fill: 'forwards' });
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
      say(line);
    }, 420);
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
      nudgeBasket();
      pop();
      if (level.chase) setPose('cheer');
      say(WORDS[found - 1]);
      if (found >= 5) return wait(280).then(function () { if (token === round) showWin(); });
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
    Object.keys(clips).forEach(function (key) {
      try { if (!clips[key].paused) clips[key].pause(); } catch (e) {}
    });
    try {
      if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) {
        speechSynthesis.cancel();
      }
    } catch (e2) {}
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

  document.addEventListener('pointerdown', function () {
    if (!started || !audio) return;
    try {
      var pendingAudio = audio.resume();
      if (pendingAudio && pendingAudio.catch) pendingAudio.catch(function () {});
    } catch (e) {}
  });
  function beginAudio(line) {
    if (started) return;
    started = true;
    unlock();
    beginVoice(line || INTRO);
    document.getElementById('tap-start').hidden = true;
  }

  document.getElementById('tap-start').addEventListener('click', function () {
    beginAudio(INTRO);
  });
  document.getElementById('story-go').addEventListener('click', function () {
    if (!started) beginAudio(WHO);
    else say(WHO);
    unlock();
    show('pick');
  });
  document.getElementById('back').addEventListener('click', function () {
    unlock();
    if (screenId === 'pick') {
      show('story');
      return;
    }
    round += 1;
    clearTimeout(winTimer);
    pending = [];
    busy = false;
    var fromWin = screenId === 'win';
    show('pick');
    if (fromWin) say(WHO);
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
    say(WHO);
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

  prepareVoice();
  show('story');
})();
