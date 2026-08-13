/* ==========================================================================
   GERAENERGY — main.js
   Vanilla JS, sem dependências.
   ========================================================================== */
(function () {
  'use strict';

  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  /* ---------------------------------------------------------------- FOTOS */
  /* Cada imagem nasce com a ilustração técnica. Se a foto real existir em
     assets/img/fotos/, ela assume o lugar — sem editar código.
     Preferimos perguntar ao servidor quais arquivos existem (uma requisição,
     console limpo). Sem servidor (file://), testamos imagem por imagem. */
  (function fotos() {
    const alvos = $$('img[data-photo]').filter((i) => i.dataset.photo);
    if (!alvos.length) return;

    const aplicar = (img) => {
      img.src = img.dataset.photo;
      img.dataset.real = '1';
    };

    fetch('api/fotos')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const existentes = new Set(d.fotos || []);
        alvos.forEach((img) => {
          const nome = img.dataset.photo.split('/').pop();
          if (existentes.has(nome)) aplicar(img);
        });
      })
      .catch(() => {
        // Sem backend: testa cada arquivo direto.
        alvos.forEach((img) => {
          const probe = new Image();
          probe.onload = () => aplicar(img);
          probe.src = img.dataset.photo;
        });
      });
  })();

  /* ------------------------------------------------------------ PRELOADER */
  const preloader = $('#preloader');
  const plBar = $('#plBar');
  const plPct = $('#plPct');
  let progress = 0;

  const tick = setInterval(() => {
    progress = Math.min(96, progress + Math.random() * 13);
    if (plBar) plBar.style.width = progress + '%';
    if (plPct) plPct.textContent = Math.round(progress);
  }, 130);

  let booted = false;
  function bootDone() {
    if (booted) return;
    booted = true;
    clearInterval(tick);
    if (plBar) plBar.style.width = '100%';
    if (plPct) plPct.textContent = '100';
    setTimeout(() => {
      preloader && preloader.classList.add('is-done');
      document.body.classList.add('is-ready');
      measureAll();
    }, 400);
  }
  addEventListener('load', bootDone);
  setTimeout(bootDone, 4000);

  /* --------------------------------------------------------------- CURSOR */
  const cursor = $('#cursor');
  const cursorDot = $('#cursorDot');
  const cursorLabel = $('#cursorLabel');
  const LABELS = { plus: 'ver +', zoom: 'ampliar', drag: 'arraste' };

  if (cursor && canHover) {
    let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;

    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      cursorDot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    }, { passive: true });

    (function loop() {
      cx = lerp(cx, mx, 0.17); cy = lerp(cy, my, 0.17);
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();

    document.addEventListener('mouseover', (e) => {
      const marked = e.target.closest('[data-cursor]');
      const kind = marked && marked.dataset.cursor;
      const label = LABELS[kind];
      cursor.classList.toggle('is-label', !!label);
      cursor.classList.toggle('is-link', !label && !!(kind || e.target.closest('a, button')));
      if (label) cursorLabel.textContent = label;
    });
  }

  /* ---------------------------------------------------------- SCROLL / UI */
  const scrollBar = $('#scrollBar');
  const toTop = $('#toTop');

  function onScrollUI() {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (scrollBar) scrollBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    document.body.classList.toggle('is-scrolled', y > 60);
    toTop && toTop.classList.toggle('is-on', y > 700);
  }
  addEventListener('scroll', onScrollUI, { passive: true });
  onScrollUI();
  toTop && toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------------------------------------------------------- MENU MOBILE */
  const burger = $('#burger');
  const mobileMenu = $('#mobileMenu');
  function closeMenu() {
    document.body.classList.remove('menu-open', 'is-locked');
    burger && burger.setAttribute('aria-expanded', 'false');
  }
  burger && burger.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    document.body.classList.toggle('is-locked', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  mobileMenu && $$('a', mobileMenu).forEach((a) => a.addEventListener('click', closeMenu));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ------------------------------------------------------------ SCROLLSPY */
  const navLinks = $$('.nav__link');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = '#' + en.target.id;
      navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => spy.observe(s));

  /* --------------------------------------------------------------- REVEAL */
  const revealIO = new IntersectionObserver((entries, obs) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const d = parseInt(en.target.dataset.delay || '0', 10);
      setTimeout(() => en.target.classList.add('is-in'), reduced ? 0 : d);
      obs.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => revealIO.observe(el));

  /* Rede de segurança: se o IntersectionObserver não entregar (navegador
     antigo, aba em segundo plano, motor sem composição), revela pela posição.
     Nada aqui pode deixar conteúdo invisível para o usuário. */
  (function revealFallback() {
    let pendentes = $$('.reveal, .split');
    let agendado = false;
    function checar() {
      agendado = false;
      const limite = innerHeight * 0.94;
      pendentes = pendentes.filter((el) => {
        if (el.classList.contains('is-in')) return false;
        if (el.getBoundingClientRect().top < limite) { el.classList.add('is-in'); return false; }
        return true;
      });
      if (!pendentes.length) removeEventListener('scroll', pedir);
    }
    // Throttle por timer (e não por rAF) de propósito: em aba oculta ou
    // motor sem composição o rAF não dispara, e o conteúdo ficaria invisível.
    function pedir() { if (!agendado) { agendado = true; setTimeout(checar, 90); } }
    addEventListener('scroll', pedir, { passive: true });
    setTimeout(checar, 1400);
  })();

  const stepIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add('is-in'); });
  }, { threshold: 0.3 });
  $$('.step').forEach((el) => stepIO.observe(el));

  /* ------------------------------------------------- TÍTULOS POR CARACTERE */
  $$('.split').forEach((el) => {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split('').forEach((c) => {
            const s = document.createElement('span');
            s.className = 'ch';
            s.textContent = c === ' ' ? ' ' : c;
            frag.appendChild(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    $$('.ch', el).forEach((ch, i) => { ch.style.animationDelay = (i * 14) + 'ms'; });
  });
  const splitIO = new IntersectionObserver((entries, obs) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      obs.unobserve(en.target);
    });
  }, { threshold: 0.25 });
  $$('.split').forEach((el) => splitIO.observe(el));

  /* ----------------------------------------------------------- CONTADORES */
  const countIO = new IntersectionObserver((entries, obs) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const to = parseFloat(el.dataset.to || '0');
      const suffix = el.dataset.suffix || '';
      const dur = 1500, t0 = performance.now();
      (function step(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  $$('.count').forEach((c) => countIO.observe(c));

  /* -------------------------------------------------------- PALAVRA GIRANDO */
  (function rotator() {
    const el = $('.hero__rot em');
    if (!el || reduced) return;
    const words = (el.dataset.rot || '').split('|').filter(Boolean);
    if (words.length < 2) return;
    let i = 0;
    setInterval(() => {
      el.classList.add('is-out');
      setTimeout(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
        el.classList.remove('is-out');
      }, 320);
    }, 2600);
  })();

  /* -------------------------------------------------------------- PARALLAX */
  const pxItems = $$('[data-parallax]').map((el) => ({
    el,
    factor: parseFloat(el.dataset.parallax) || 0,
    asVar: el.hasAttribute('data-px-var'),
    current: 0, target: 0
  }));

  function measureParallax() {
    const vh = innerHeight;
    pxItems.forEach((it) => {
      const r = it.el.getBoundingClientRect();
      it.target = (r.top + r.height / 2 - vh / 2) * it.factor;
    });
  }
  function parallaxLoop() {
    pxItems.forEach((it) => {
      it.current = lerp(it.current, it.target, 0.09);
      if (Math.abs(it.current - it.target) < 0.05) it.current = it.target;
      const y = it.current.toFixed(2) + 'px';
      if (it.asVar) it.el.style.setProperty('--py', y);
      else it.el.style.transform = `translate3d(0, ${y}, 0)`;
    });
    requestAnimationFrame(parallaxLoop);
  }
  if (!reduced && pxItems.length) {
    measureParallax();
    addEventListener('scroll', measureParallax, { passive: true });
    parallaxLoop();
  }

  /* --------------------------------------------------- BOTÕES MAGNÉTICOS */
  if (!reduced && canHover) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.2}px, ${y * 0.3}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* --------------------------------------------- SERVIÇOS: SCROLL HORIZONTAL */
  const hs = $('#servicos');
  const hsTrack = $('#hsTrack');
  const hsBar = $('#hsBar');
  let hsDistance = 0;

  function measureHScroll() {
    if (!hs || !hsTrack) return;
    const pinned = !reduced && innerWidth >= 900;
    hs.classList.toggle('is-pinned', pinned);
    if (!pinned) { hs.style.height = ''; hsTrack.style.transform = ''; hsDistance = 0; return; }

    hsDistance = Math.max(0, hsTrack.scrollWidth - innerWidth);
    hs.style.height = (innerHeight + hsDistance) + 'px';
    updateHScroll();
  }
  function updateHScroll() {
    if (!hs || !hsTrack || hsDistance <= 0) return;
    const r = hs.getBoundingClientRect();
    const p = clamp(-r.top / hsDistance, 0, 1);
    hsTrack.style.transform = `translate3d(${-p * hsDistance}px,0,0)`;
    if (hsBar) hsBar.style.width = (p * 100) + '%';
  }
  addEventListener('scroll', updateHScroll, { passive: true });

  /* ------------------------------------------------------- GALERIA / FILTRO */
  (function galeria() {
    const wrap = $('#gal');
    const bar = $('#filters');
    if (!wrap || !bar) return;
    const items = $$('.gitem', wrap);

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn) return;
      $$('.filter', bar).forEach((b) => b.classList.toggle('is-on', b === btn));
      const cat = btn.dataset.filter;
      items.forEach((it) => {
        const show = cat === 'todos' || it.dataset.cat === cat;
        it.classList.toggle('is-hidden', !show);
      });
    });
  })();

  /* ------------------------------------------------------------- ACCORDION */
  $$('.acc__item').forEach((item) => {
    const q = $('.acc__q', item);
    const a = $('.acc__a', item);
    q.addEventListener('click', () => {
      const open = item.classList.contains('is-open');
      $$('.acc__item').forEach((o) => {
        o.classList.remove('is-open');
        const oa = $('.acc__a', o);
        if (oa) oa.style.height = '0px';
      });
      if (!open) {
        item.classList.add('is-open');
        a.style.height = a.scrollHeight + 'px';
      }
    });
  });

  /* ------------------------------------------------------ TIMELINE PROGRESS */
  const tlFill = $('#tlFill');
  const tlWrap = $('.timeline');
  function updateTimeline() {
    if (!tlFill || !tlWrap) return;
    const r = tlWrap.getBoundingClientRect();
    const p = clamp((innerHeight * 0.62 - r.top) / r.height, 0, 1);
    tlFill.style.height = (p * 100) + '%';
  }
  addEventListener('scroll', updateTimeline, { passive: true });

  /* ------------------------------------------------------ HERO — CANVAS */
  const canvas = $('#grid');
  if (canvas && !reduced) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, nodes = [], pulses = [], raf = null, alive = true;
    const mouse = { x: -9999, y: -9999 };

    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(clamp((w * h) / 19000, 26, 90));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.3 + 0.6
      }));
    }

    function spawnPulse() {
      if (!alive || nodes.length < 2) return;
      const a = Math.floor(Math.random() * nodes.length);
      let b = -1, best = 1e9;
      nodes.forEach((n, i) => {
        if (i === a) return;
        const d = Math.hypot(n.x - nodes[a].x, n.y - nodes[a].y);
        if (d < best && d > 40) { best = d; b = i; }
      });
      if (b >= 0 && best < 190) pulses.push({ a, b, t: 0, speed: 0.012 + Math.random() * 0.02 });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const d = Math.hypot(n.x - m.x, n.y - m.y);
          if (d < 150) {
            ctx.strokeStyle = `rgba(14,143,209,${(1 - d / 150) * 0.2})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
          }
        }

        const dm = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        const near = dm < 170;
        if (near) {
          ctx.strokeStyle = `rgba(87,196,245,${(1 - dm / 170) * 0.38})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
        ctx.fillStyle = near ? 'rgba(150,225,255,.9)' : 'rgba(87,196,245,.45)';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }

      pulses = pulses.filter((p) => p.t < 1);
      pulses.forEach((p) => {
        const A = nodes[p.a], B = nodes[p.b];
        if (!A || !B) { p.t = 1; return; }
        p.t += p.speed;
        const x = lerp(A.x, B.x, p.t), y = lerp(A.y, B.y, p.t);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(160,230,255,.9)');
        g.addColorStop(1, 'rgba(14,143,209,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    }, { passive: true });
    canvas.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });

    size();
    draw();
    setInterval(spawnPulse, 640);

    new IntersectionObserver((es) => {
      es.forEach((en) => {
        alive = en.isIntersecting;
        if (alive) { if (!raf) draw(); }
        else if (raf) { cancelAnimationFrame(raf); raf = null; }
      });
    }, { threshold: 0 }).observe(canvas);

    window.__geResizeCanvas = size;
  }

  /* ---------------------------------------------------------- FORMULÁRIO */
  (function form() {
    const form = $('#form');
    if (!form) return;
    const btn = $('#submitBtn');
    const ok = $('#formOk');
    const tel = $('#telefone');

    tel && tel.addEventListener('input', () => {
      let v = tel.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, '($1) $2-$3');
      else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
      else if (v.length) v = v.replace(/^(\d{0,2})/, '($1');
      tel.value = v;
    });

    function setError(field, msg) {
      const wrap = field.closest('.field');
      const err = $('.err', wrap);
      wrap.classList.toggle('has-error', !!msg);
      if (err) err.textContent = msg || '';
      return !msg;
    }

    function validate() {
      let valid = true;
      const nome = $('#nome'), email = $('#email'), assunto = $('#assunto'), msg = $('#mensagem');
      valid = setError(nome, nome.value.trim().length < 3 ? 'Informe seu nome completo.' : '') && valid;
      valid = setError(email, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.value.trim()) ? '' : 'E-mail inválido.') && valid;
      valid = setError(tel, tel.value.replace(/\D/g, '').length < 10 ? 'Telefone incompleto (com DDD).' : '') && valid;
      valid = setError(assunto, assunto.value ? '' : 'Selecione um assunto.') && valid;
      valid = setError(msg, msg.value.trim().length < 10 ? 'Descreva com um pouco mais de detalhe.' : '') && valid;
      return valid;
    }

    $$('input, textarea, select', form).forEach((f) => {
      f.addEventListener('blur', () => {
        if (f.closest('.field').classList.contains('has-error')) validate();
      });
    });

    function showOk(title, sub) {
      $('b', ok).textContent = title;
      $('span', ok).textContent = sub;
      ok.classList.add('is-on');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      ok.classList.remove('is-on');
      if (!validate()) {
        const first = $('.field.has-error input, .field.has-error textarea, .field.has-error select');
        first && first.focus();
        return;
      }
      btn.classList.add('is-loading');
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        const res = await fetch('api/contato', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('http ' + res.status);
        showOk('Solicitação enviada!', 'Nosso time retorna em até 1 dia útil.');
        form.reset();
      } catch (err) {
        // Sem backend: abre o cliente de e-mail já preenchido.
        const corpo =
          `Nome: ${data.nome}\nE-mail: ${data.email}\nTelefone: ${data.telefone}\n` +
          `Empresa: ${data.empresa || '-'}\nAssunto: ${data.assunto}\n\n${data.mensagem}`;
        location.href = 'mailto:comercial1@geraenergy.com'
          + '?subject=' + encodeURIComponent('[Site] ' + data.assunto)
          + '&body=' + encodeURIComponent(corpo);
        showOk('Abrimos seu e-mail', 'Basta confirmar o envio para comercial1@geraenergy.com.');
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  })();

  /* ----------------------------------------------------------------- MISC */
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + scrollY - 74;
      scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* --------------------------------------------------------- MEDIÇÕES */
  function measureAll() {
    measureHScroll();
    measureParallax();
    updateTimeline();
    onScrollUI();
    const open = $('.acc__item.is-open .acc__a');
    if (open) open.style.height = open.scrollHeight + 'px';
    if (window.__geResizeCanvas) window.__geResizeCanvas();
  }

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(measureAll, 150); });
  measureAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
})();
