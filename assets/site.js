// غِراس — زرُّ الوضع وحقلُ الجزيئات.
(function () {
  'use strict';

  // ── الوضع ─────────────────────────────────────────────────────────────
  // الأصلُ يتبع النظام. ومن ضغط الزرَّ حُفظ اختيارُه في هذا المتصفّح وحدَه.
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function current() {
    return root.getAttribute('data-theme') || (media.matches ? 'dark' : 'light');
  }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // لقطاتُ التطبيق تتبع وضعَ الصفحة: <img data-light="…"> يحمل نسخةَ الفاتح،
  // وsrc الأصليُّ هو الداكن. ما لا data-light له يبقى كما هو.
  function shotsFor(t) {
    var imgs = document.querySelectorAll('img[data-light]');
    var waits = [];
    imgs.forEach(function (img) {
      if (!img.dataset.dark) img.dataset.dark = img.getAttribute('src');
      var want = t === 'light' ? img.dataset.light : img.dataset.dark;
      if (img.getAttribute('src') !== want) {
        img.setAttribute('src', want);
        // ننتظر فكَّ الصورة كي تدخل لقطةَ الانتقال الجديدةَ كاملةً لا فارغة.
        if (img.decode) waits.push(img.decode().catch(function () {}));
      }
    });
    return Promise.all(waits);
  }

  function apply(t, save) {
    root.setAttribute('data-theme', t);
    if (save) {
      try { localStorage.setItem('ghiras-theme', t); } catch (e) { /* خاصٌّ أو محجوب: يبقى للجلسة */ }
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0D121C' : '#F9FAFB');
    document.dispatchEvent(new Event('ghiras-theme'));
  }

  // الانتقال: دائرةٌ تنكشف من الزرّ وتتّسع حتّى أبعدِ زاويةٍ في الشاشة، والصفحةُ
  // الجديدةُ (بلقطاتها) داخلها. وحين يغيب View Transitions أو يُطلب تقليلُ
  // الحركة: تبديلٌ مباشر تليّنه انتقالاتُ الألوان في CSS.
  var switching = false;
  function toggle(e) {
    if (switching) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    if (!document.startViewTransition || reduceMotion.matches) {
      apply(next, true); shotsFor(next);
      return;
    }
    var b = e.currentTarget.getBoundingClientRect();
    var x = b.left + b.width / 2, y = b.top + b.height / 2;
    var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    switching = true;
    root.classList.add('vt-theme'); // يوقف انتقالاتِ الألوان كي تُلتقط الحالةُ النهائيّة
    var vt = document.startViewTransition(function () {
      apply(next, true);
      return shotsFor(next);
    });
    vt.ready.then(function () {
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 750, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(function () {});
    vt.finished.finally(function () {
      root.classList.remove('vt-theme');
      switching = false;
      document.dispatchEvent(new Event('ghiras-theme-landed'));
    });
  }
  document.querySelectorAll('.theme-btn').forEach(function (b) { b.addEventListener('click', toggle); });
  media.addEventListener && media.addEventListener('change', function () {
    shotsFor(current());
    document.dispatchEvent(new Event('ghiras-theme'));
  });
  shotsFor(current());

  // ── حقلُ الجزيئات ─────────────────────────────────────────────────────
  // منقولٌ عن lib/core/widgets/dhikr_particle_field.dart: حلقاتٌ من نقاطٍ حول
  // مركز، تومض وتتموّج، وتدخل من المركز إلى الخارج (الداخليّةُ أوّلاً)، وموجةٌ
  // تتمدّد من المركز كما مع كلّ تسبيحةٍ في العدّاد، ثمّ تعود النقاطُ بنابض.
  // الثوابتُ نفسُها؛ وما تغيّر مكتوبٌ بجانبه.
  var hero = document.querySelector('.hero');
  var hub = hero && hero.querySelector('.shot');
  if (!hero || !hub) return;

  var K = {
    springK: 0.045, friction: 0.86,
    push: 24, forceScale: 0.045, waveBoost: 1.4,
    ringSpacing: 14, pointSpacing: 16, pointSize: 1.8,
    maxParticles: 900,         // التطبيق 850 على شاشة هاتف؛ هنا عرضُ صفحة
    twinkleAmp: 0.35, twinkleSpeed: 0.9, driftAmp: 2.4,
    waveSpeed: 620, waveWidth: 38, waveDecay: 0.55, waveGlow: 0.45, maxWaves: 4,
    entranceDur: 1.4, entranceStagger: 0.35,
    maxAlpha: 0.55,
    autoWave: 3.2,             // ثوانٍ بين «تسبيحةٍ» وأختها حين لا يلمس أحد
    touchRadius: 110, touchForce: 46  // دفعُ المؤشّر: --wf-touch-* في نظام الساعة
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = document.createElement('canvas');
  canvas.className = 'particles';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.firstChild);
  var ctx = canvas.getContext('2d');

  var dpr = 1, W = 0, H = 0, cx = 0, cy = 0, hubR = 0;
  var parts = [], waves = [];
  var color = '26,126,81', boost = 1;
  var t = 0, sinceMount = 0, sinceWave = 0, last = 0, running = false, visible = true;
  var pointer = null;

  function readColor() {
    var cs = getComputedStyle(root);
    color = cs.getPropertyValue('--particle').trim().replace(/\s+/g, '') || color;
    boost = parseFloat(cs.getPropertyValue('--particle-boost')) || 1;
  }

  // مولّدٌ ثابتُ البذرة كي لا يتبدّل الحقلُ بين زيارةٍ وأخرى.
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function build() {
    var r = hero.getBoundingClientRect();
    var h = hub.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cx = h.left - r.left + h.width / 2;
    cy = h.top - r.top + h.height / 2;
    hubR = Math.min(h.width, h.height) / 2 * 0.92;
    var rim = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));

    // تقديرُ العدد ثمّ تخفيفٌ بجذر النسبة — كما في التطبيق.
    var estimate = 0;
    for (var rr = hubR; rr < rim; rr += K.ringSpacing) estimate += Math.floor(2 * Math.PI * rr / K.pointSpacing);
    var thin = estimate > K.maxParticles ? Math.sqrt(K.maxParticles / estimate) : 1;

    seed = 7; parts = [];
    for (var ring = hubR; ring < rim; ring += K.ringSpacing / thin) {
      var n = Math.floor(2 * Math.PI * ring * thin / K.pointSpacing);
      var off = rnd() * Math.PI * 2;
      for (var i = 0; i < n; i++) {
        var a = off + i / n * Math.PI * 2;
        var x = cx + Math.cos(a) * ring, y = cy + Math.sin(a) * ring;
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        var tt = (ring - hubR) / (rim - hubR); // 0 عند المركز، 1 عند الحافّة
        parts.push({ bx: x, by: y, x: x, y: y, vx: 0, vy: 0, dx: Math.cos(a), dy: Math.sin(a),
                     r: ring, t: tt, phase: rnd() * Math.PI * 2 });
      }
    }
  }

  function emitWave() {
    if (waves.length >= K.maxWaves) waves.shift();
    waves.push({ r: hubR, s: 1 });
  }

  function step(dt) {
    t += dt; sinceMount += dt; sinceWave += dt;
    if (sinceWave > K.autoWave) { sinceWave = 0; emitWave(); }
    for (var w = waves.length - 1; w >= 0; w--) {
      waves[w].r += K.waveSpeed * dt;
      waves[w].s *= Math.pow(K.waveDecay, dt);
      if (waves[w].s < 0.03) waves.splice(w, 1);
    }
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var hx = p.bx + Math.sin(t * 0.7 + p.phase) * K.driftAmp;
      var hy = p.by + Math.cos(t * 0.53 + p.phase * 1.7) * K.driftAmp;
      // نابضُ العودة
      p.vx += (hx - p.x) * K.springK; p.vy += (hy - p.y) * K.springK;
      // الموجة تدفع ما تعبره للخارج
      for (var j = 0; j < waves.length; j++) {
        var d = Math.abs(p.r - waves[j].r);
        if (d < K.waveWidth) {
          var f = (1 - d / K.waveWidth) * waves[j].s * K.push * K.forceScale * K.waveBoost;
          p.vx += p.dx * f; p.vy += p.dy * f;
        }
      }
      // المؤشّر يُبعد ما حوله
      if (pointer) {
        var ex = p.x - pointer.x, ey = p.y - pointer.y, dd = Math.hypot(ex, ey);
        if (dd < K.touchRadius && dd > 0.01) {
          var g = (1 - dd / K.touchRadius) * K.touchForce * K.forceScale * 0.18;
          p.vx += ex / dd * g; p.vy += ey / dd * g;
        }
      }
      p.vx *= K.friction; p.vy *= K.friction;
      p.x += p.vx; p.y += p.vy;
    }
  }

  function draw(stat) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var entering = !stat && sinceMount < K.entranceDur;
    var eP = Math.min(sinceMount / K.entranceDur, 1);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      // يخفت كلّما ابتعد عن المركز، فيبقى الحقلُ هالةً لا ورقاً منقّطاً.
      // التطبيقُ يرسم على أرضيّةٍ داكنةٍ صغيرة؛ هنا صفحةٌ عريضةٌ قد تكون بيضاء،
      // فيُضخَّم بـ--particle-boost ويخفت أبطأ مع البعد (1.1 لا 1.6).
      var a = K.maxAlpha * boost * Math.pow(1 - p.t, 1.1);
      if (!stat) a *= 1 + Math.sin(t * K.twinkleSpeed * Math.PI + p.phase) * K.twinkleAmp;
      var x = p.x, y = p.y;
      if (entering) {
        var k = Math.min(Math.max((eP - p.t * K.entranceStagger) / (1 - K.entranceStagger), 0), 1);
        k = 1 - Math.pow(1 - k, 3); // ease-out
        x = cx + (p.x - cx) * k; y = cy + (p.y - cy) * k; a *= k;
      }
      for (var j = 0; j < waves.length; j++) {
        var d = Math.abs(p.r - waves[j].r);
        if (d < K.waveWidth) a += (1 - d / K.waveWidth) * waves[j].s * K.waveGlow;
      }
      if (a <= 0.01) continue;
      ctx.fillStyle = 'rgba(' + color + ',' + Math.min(a, 1).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, K.pointSize / 2 + 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    step(dt); draw(false);
    requestAnimationFrame(frame);
  }

  function start() {
    if (reduce.matches) { running = false; draw(true); return; }
    if (running || !visible || document.hidden) return;
    running = true; last = 0; requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  readColor(); build(); start();

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { build(); if (!running) draw(true); }, 120);
  });
  document.addEventListener('ghiras-theme', function () { readColor(); if (!running) draw(true); });
  // حين يستقرّ الوضعُ الجديد تخرج موجةٌ من الهاتف، كأنّ التطبيقَ ردّ على الصفحة.
  document.addEventListener('ghiras-theme-landed', function () { if (running) { sinceWave = 0; emitWave(); } });
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  reduce.addEventListener && reduce.addEventListener('change', function () { stop(); start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? start() : stop(); }).observe(hero);
  }
  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  hero.addEventListener('pointerleave', function () { pointer = null; });
  // نقرةٌ على الهاتف تُطلق موجةً كما تُطلقها التسبيحةُ في العدّاد.
  hub.addEventListener('click', function () { sinceWave = 0; emitWave(); });
  hub.style.cursor = 'pointer';
  // الخطوطُ تُغيّر ارتفاعَ النصّ فتُزيح الهاتف: أعِد القياسَ بعد تحميلها.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
})();
