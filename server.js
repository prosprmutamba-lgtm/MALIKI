require('dotenv').config();
const express = require('express'), helmet = require('helmet'), session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const rateLimit = require('express-rate-limit'), bcrypt = require('bcryptjs'), crypto = require('crypto');
const QRCode = require('qrcode'), mysql = require('mysql2/promise'), path = require('path');

const L = { fr: require('./locales/fr.json'), en: require('./locales/en.json') };
const MAX_LINKS = 100, MAX_SEATS = 115, PROD = process.env.NODE_ENV === 'production';
const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const pool = mysql.createPool({ host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 8 });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const w = f => (q, r, n) => f(q, r, n).catch(n);
const rnd = n => crypto.randomBytes(n).toString('base64url');
const cleanName = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
  styleSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: null } } }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.get('/vendor/jsQR.js', (q, r) => r.sendFile(path.join(__dirname, 'node_modules/jsqr/dist/jsQR.js')));
app.use(session({ name: 'sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  store: new MySQLStore({ createDatabaseTable: true }, pool),
  cookie: { httpOnly: true, secure: PROD, sameSite: 'lax', maxAge: 8 * 3600 * 1000 } }));

// Langue (FR par défaut) + CSRF
app.use((req, res, next) => {
  const m = /(?:^|; )lang=(fr|en)/.exec(req.headers.cookie || '');
  let lang = m ? m[1] : 'fr';
  if (req.query.lang === 'fr' || req.query.lang === 'en') { lang = req.query.lang;
    res.cookie('lang', lang, { maxAge: 365 * 864e5, sameSite: 'lax', secure: PROD }); }
  req.lang = lang; req.t = k => L[lang][k] ?? L.fr[k] ?? k;
  if (!req.session.csrf) req.session.csrf = rnd(24);
  if (req.method === 'POST') {
    const tok = req.body?._csrf || req.get('x-csrf');
    if (!tok || tok.length !== req.session.csrf.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(req.session.csrf)))
      return res.status(403).send(layout(req, 'Erreur', `<p>${esc(req.t('err_csrf'))}</p>`));
  }
  next();
});

const fs = require('fs'), site = require('./config/site');
function layout(req, title, body, o = {}) {
  const l = req.lang, adm = o.cls === 'admin';
  const sw = `<nav class="lang"><a href="?lang=fr" class="${l === 'fr' ? 'on' : ''}">FR</a> | <a href="?lang=en" class="${l === 'en' ? 'on' : ''}">EN</a></nav>`;
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><link rel="stylesheet" href="/${adm ? 'admin' : 'public'}.css"></head>
<body class="${o.cls || ''}">${o.nolang ? '' : sw}${body}
<script type="application/json" id="T">${JSON.stringify(L[l]).replace(/</g, '\\u003c')}</script>
${(o.scripts || []).map(s => `<script src="${s}" defer></script>`).join('')}</body></html>`;
}

async function getSettings() {
  const [rows] = await pool.query('SELECT k, v FROM settings'); const s = {}; rows.forEach(r => s[r.k] = r.v); return s;
}
const bi = (s, k, l) => (s[`${k}_${l}`] || s[`${k}_fr`] || '').trim();

// ---------- Invitation publique ----------
const lines = s => (s || '').split('\n').map(x => x.trim()).filter(Boolean).map(x => x.split('|').map(p => p.trim()));
async function invitePage(req, res, inv, flash) {
  const s = await getSettings(), t = req.t, l = req.lang, im = site.images, [n1, n2] = site.names, loc = l === 'fr' ? 'fr-FR' : 'en-GB';
  const pic = (f, cls, alt) => f && fs.existsSync(path.join(__dirname, 'public', site.imageDir, f))
    ? `<img class="${cls}" src="/${site.imageDir}/${encodeURIComponent(f)}" alt="${esc(alt)}" loading="lazy">`
    : `<div class="ph ${cls}" role="img" aria-label="${esc(alt)}"><span>${esc(t('ph'))}</span></div>`;
  const ev = s.event_at ? new Date(s.event_at) : null, ok = ev && !isNaN(ev);
  const dLong = ok ? ev.toLocaleDateString(loc, { dateStyle: 'full' }) : '', dTime = ok ? ev.toLocaleString(loc, { dateStyle: 'full', timeStyle: 'short' }) : t('tbd');
  const sec = (id, title, inner) => inner ? `<section class="sec" id="${id}"><h2>${esc(title)}</h2>${inner}</section>` : '';
  const ics = ok ? `<a class="btn ghost" href="/calendar.ics">${esc(t('addcal'))}</a>` : '';
  const intro = bi(s, 'intro', l);
  const story = lines(bi(s, 'story', l)).map(([a, b], i) => `<article class="card"><small>${String(i + 1).padStart(2, '0')}</small><h3>${esc(a)}</h3><p>${esc(b || '')}</p></article>`).join('');
  const gal = (im.gallery || []).map((f, i) => pic(f, 'g g' + (i % 4 + 1), t('gallery') + ' ' + (i + 1))).join('');
  const prog = lines(bi(s, 'program', l)).map(([a, b]) => `<li><b>${esc(b ? a : '')}</b><span>${esc(b || a)}</span></li>`).join('');
  const venue = (label, vk, ak, mk, f) => {
    const v = bi(s, vk, l), a = bi(s, ak, l); if (!v && !a) return '';
    const m = /^https?:\/\//.test(s[mk] || '') ? s[mk] : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a || v)}`;
    return `<article class="card venue">${pic(f, 'vp', v || label)}<small>${esc(label)}</small><h3>${esc(v)}</h3><p>${esc(a)}</p><a class="btn" target="_blank" rel="noopener" href="${esc(m)}">${esc(t('directions'))}</a></article>`;
  };
  const ven = venue(t('ceremony'), 'venue', 'address', 'map_url', im.ceremony) + venue(t('reception'), 'reception_venue', 'reception_address', 'reception_map_url', im.reception);
  const party = lines(bi(s, 'party', l)).map(([a, r, m], i) => `<article class="mem">${pic((im.party || [])[i], 'av', a)}<h3>${esc(a)}</h3><small>${esc(r || '')}</small><p>${esc(m || '')}</p></article>`).join('');
  const faq = lines(bi(s, 'faq', l)).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a || '')}</p></details>`).join('');
  const notes = bi(s, 'notes', l);
  let action;
  if (inv.status === 'pending') {
    const inputs = Array.from({ length: inv.seats }, (_, i) => `<label>${esc(t('guestname'))} ${i + 1}<input name="n${i}" maxlength="80" ${i === 0 ? 'required' : ''}></label>`).join('');
    action = `<form method="post" action="/i/${esc(inv.token)}/rsvp" class="card">${flash ? `<p class="err">${esc(t(flash))}</p>` : ''}
<input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><p>${esc(t('seats'))} : <b>${inv.seats}</b></p>
<label class="r"><input type="radio" name="attending" value="yes" checked> ${esc(t('yes'))}</label><label class="r"><input type="radio" name="attending" value="no"> ${esc(t('no'))}</label>
<label>${esc(t('household'))}<input name="household" maxlength="120" required></label>${inputs}<p class="muted">${esc(t('once'))}</p><button class="btn">${esc(t('send'))}</button></form>`;
  } else {
    const qr = inv.status === 'confirmed' ? await QRCode.toDataURL(inv.qr_token, { margin: 2, width: 280, color: { dark: '#14142b', light: '#f3ead8' } }) : '';
    action = `<div class="card"><p>${esc(t('used'))}</p>${qr ? `<h3>${esc(t('yourqr'))}</h3><img class="qr" alt="QR" src="${qr}"><p class="muted">${esc(t('qrhelp'))}</p>` : `<p>${esc(t('declined'))}</p>`}</div>`;
  }
  const body = `<div id="env" class="env" role="button" tabindex="0"><div class="flap"></div><div class="seal">❀</div><p>${esc(t('tap'))}</p></div>
<main id="inv" class="hidden"><section class="hero">${pic(im.cover, 'cover', n1 + ' & ' + n2)}<div class="ov"><p class="kick">${esc(t('youre'))}</p><h1>${esc(n1)}<span>&amp;</span>${esc(n2)}</h1>${ok ? `<p class="date">${esc(dLong)}</p>` : ''}</div></section>
${sec('invitation', t('invited'), `${intro ? `<p class="lead pre">${esc(intro)}</p>` : ''}<p class="when">${esc(dTime)}</p><div id="cd" data-target="${esc(s.countdown_at || s.event_at || '')}"></div>${ics}`)}
${sec('story', t('story'), story ? `<div class="grid">${story}</div>` : '')}${sec('gallery', t('gallery'), `<div class="collage">${gal}</div>`)}
${sec('program', t('program'), prog ? `<ul class="tl">${prog}</ul>` : '')}${sec('venues', t('venues'), ven ? `<div class="grid">${ven}</div>` : '')}
${sec('notes', t('notes'), notes ? `<p class="pre">${esc(notes)}</p>` : '')}${sec('party', t('party'), party ? `<div class="grid mems">${party}</div>` : '')}
${sec('rsvp', t('rsvp'), action)}${sec('faq', t('faq'), faq)}
<section class="closing">${pic(im.closing, 'cover', n1 + ' & ' + n2)}</section><footer><p>${esc(n1)} ${esc(t('and'))} ${esc(n2)}</p><small>${esc(t('foot'))}</small></footer></main>`;
  res.send(layout(req, `${n1} & ${n2}`, body, { scripts: ['/invite.js'], cls: 'guest' }));
}
app.get('/calendar.ics', w(async (req, res) => {
  const s = await getSettings(), m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s.event_at || '');
  if (!m) return res.status(404).end();
  const e = x => String(x || '').replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');
  const loc = [bi(s, 'venue', req.lang), bi(s, 'address', req.lang)].filter(Boolean).join(', ');
  res.type('text/calendar').set('Content-Disposition', 'attachment; filename="mariage.ics"').send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mariage//FR', 'BEGIN:VEVENT',
    `UID:${crypto.randomBytes(8).toString('hex')}@mariage`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`,
    `SUMMARY:${e(site.names.join(' & '))}`, ...(loc ? [`LOCATION:${e(loc)}`] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
}));
async function loadInv(token) {
  if (!/^[\w-]{20,64}$/.test(token || '')) return null;
  const [r] = await pool.execute('SELECT * FROM invitations WHERE token = ?', [token]); return r[0] || null;
}
app.get('/', (q, r) => r.send(layout(q, site.names.join(' & '), `<main class="center"><h1>${esc(site.names[0])}<br><span>&amp;</span><br>${esc(site.names[1])}</h1><div class="orn">❀ ❦ ❀</div></main>`)));
app.get('/i/:token', w(async (req, res) => { const inv = await loadInv(req.params.token);
  if (!inv) return res.status(404).send(layout(req, '404', `<main class="center"><p>${esc(req.t('err_notfound'))}</p></main>`)); await invitePage(req, res, inv); }));

app.post('/i/:token/rsvp', w(async (req, res) => {
  const pre = await loadInv(req.params.token);
  if (!pre) return res.status(404).send(layout(req, '404', `<main class="center"><p>${esc(req.t('err_notfound'))}</p></main>`));
  const yes = req.body.attending === 'yes';
  const household = cleanName(req.body.household);
  const names = Array.from({ length: pre.seats }, (_, i) => cleanName(req.body['n' + i])).filter(Boolean);
  if (!household || (yes && (names.length < 1 || names.length > pre.seats)) || !['yes', 'no'].includes(req.body.attending))
    return invitePage(req, res, pre, 'err_invalid');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.execute('SELECT id FROM capacity WHERE id = 1 FOR UPDATE');
    const [[inv]] = await c.execute('SELECT * FROM invitations WHERE id = ? FOR UPDATE', [pre.id]);
    if (inv.status !== 'pending') { await c.rollback(); return invitePage(req, res, inv); }
    const n = yes ? names.length : 0;
    if (n > inv.seats) throw Object.assign(new Error('seats'), { code: 'INVALID' });
    if (yes) await c.execute('UPDATE capacity SET confirmed = confirmed + ? WHERE id = 1', [n]); // CHECK SQL = garde-fou
    await c.execute('UPDATE invitations SET status=?, household_name=?, names=?, guests=?, qr_token=?, confirmed_at=NOW() WHERE id=? AND status="pending"',
      [yes ? 'confirmed' : 'declined', household, JSON.stringify(yes ? names : []), n, yes ? 'WED-' + crypto.randomBytes(18).toString('hex') : null, inv.id]);
    await c.commit();
  } catch (e) {
    await c.rollback().catch(() => {});
    const full = e.errno === 3819 || /check constraint/i.test(e.message);
    return invitePage(req, res, pre, full ? 'err_full' : e.code === 'INVALID' ? 'err_invalid' : 'err_generic');
  } finally { c.release(); }
  res.redirect(`/i/${pre.token}`);
}));

// ---------- Admin ----------
const needAdmin = (req, res, next) => req.session.admin ? next() : (req.method === 'GET' ? res.redirect('/admin/login') : res.status(401).json({ error: 'auth' }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).send(layout(req, 'Admin', `<main class="center"><p class="err">${esc(req.t('a_toomany'))}</p></main>`)) });
const csrf = req => `<input type="hidden" name="_csrf" value="${esc(req.session.csrf)}">`;

app.get('/admin/login', (req, res) => res.send(layout(req, 'Admin', `<main class="center"><form method="post" class="card"><h1>${esc(req.t('a_login'))}</h1>${req.query.e ? `<p class="err">${esc(req.t('a_bad'))}</p>` : ''}${csrf(req)}
<label>${esc(req.t('a_email'))}<input type="email" name="email" required autocomplete="username"></label><label>${esc(req.t('a_password'))}<input type="password" name="password" required autocomplete="current-password"></label><button>${esc(req.t('a_signin'))}</button></form></main>`, { cls: 'admin' })));
app.post('/admin/login', loginLimiter, w(async (req, res) => {
  const [r] = await pool.execute('SELECT * FROM admins WHERE email = ?', [String(req.body.email || '').toLowerCase().slice(0, 190)]);
  const ok = await bcrypt.compare(String(req.body.password || '').slice(0, 200), r[0]?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
  if (!r[0] || !ok) return res.redirect('/admin/login?e=1');
  req.session.regenerate(err => { if (err) throw err; req.session.admin = r[0].id; req.session.email = r[0].email; req.session.csrf = rnd(24); res.redirect('/admin'); });
}));
app.post('/admin/logout', needAdmin, (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

function adm(req, inner, scripts = []) {
  const t = req.t, l = req.lang, p = req.path;
  const nav = [['/admin', 'a_dash', '⌂'], ['/admin/invitations', 'nav_inv', '✉'], ['/admin/rsvp', 'nav_rsvp', '✔'], ['/admin/scan', 'a_scan', '▣'], ['/admin/settings', 'a_settings', '✎'], ['/admin/prefs', 'nav_prefs', '⚙']]
    .map(([h, k, i]) => `<a href="${h}" class="${p === h ? 'act' : ''}"><i>${i}</i>${esc(t(k))}</a>`).join('');
  const em = req.session.email || '';
  return layout(req, 'Admin', `<div class="shell"><aside><div class="logo">A &amp; M</div><nav>${nav}</nav><form method="post" action="/admin/logout">${csrf(req)}<button class="out">⏻ ${esc(t('a_logout'))}</button></form></aside>
<div class="content"><div class="topbar"><form action="/admin/rsvp" method="get"><input name="q" maxlength="80" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"></form>
<nav class="lang"><a href="?lang=fr" class="${l === 'fr' ? 'on' : ''}">FR</a> | <a href="?lang=en" class="${l === 'en' ? 'on' : ''}">EN</a></nav><span class="prof"><i>${esc((em[0] || 'A').toUpperCase())}</i>${esc(em)}</span></div><main>${inner}</main></div></div>`,
    { cls: 'admin', nolang: true, scripts });
}
const rsvpRows = (t, rows) => rows.length ? `<div class="scroll"><table><tr><th>#</th><th>${esc(t('c_house'))}</th><th>${esc(t('c_guests'))}</th><th>${esc(t('a_status'))}</th><th>${esc(t('c_date'))}</th></tr>${rows.map(i =>
  `<tr><td>${i.number}</td><td>${esc(i.household_name)}<br><small>${esc((i.names || []).join(', '))}</small></td><td>${i.guests}/${i.seats}</td><td>${esc(t('a_' + i.status))}${i.checked_in_at ? ' · ' + esc(t('a_entered')) : ''}</td><td>${esc(i.confirmed_at ? new Date(i.confirmed_at).toLocaleString(t('loc')) : '')}</td></tr>`).join('')}</table></div>`
  : `<p class="empty">${esc(t('empty_rsvp'))}</p>`;
app.get('/admin', needAdmin, w(async (req, res) => {
  const t = req.t;
  const [[r]] = await pool.query(`SELECT COUNT(*) created, COALESCE(SUM(status<>'pending'),0) used, COALESCE(SUM(status='pending'),0) pend, COALESCE(SUM(status='declined'),0) decl,
    COALESCE(SUM(CASE WHEN status='confirmed' THEN guests END),0) conf, COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL THEN guests END),0) ent FROM invitations`);
  const [[cap]] = await pool.query('SELECT allocated FROM capacity WHERE id = 1');
  const [rec] = await pool.query("SELECT * FROM invitations WHERE status<>'pending' ORDER BY confirmed_at DESC LIMIT 6");
  const n = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v]));
  const card = (v, lab, hl) => `<div class="stat ${hl ? 'hl' : ''}"><small>${esc(lab)}</small><b>${v}</b></div>`;
  const bar = (lab, v, m) => `<div class="bar"><span>${esc(lab)}</span><b>${v} / ${m}</b><progress value="${v}" max="${m || 1}"></progress></div>`;
  res.send(adm(req, `<h1>${esc(t('a_dash'))}</h1><p class="warn">${esc(t('a_warn'))}</p>
<div class="stats">${card(`${n.created}/${MAX_LINKS}`, t('a_created'), 1)}${card(`${n.conf}/${MAX_SEATS}`, t('a_conf'))}${card(n.pend, t('pending_resp'))}${card(n.ent, t('a_in'))}${card(n.used, t('a_usedn'))}${card(MAX_LINKS - n.created, t('a_avail'))}</div>
<div class="panel"><h2>${esc(t('progress'))}</h2>${bar(t('a_created'), n.created, MAX_LINKS)}${bar(t('a_conf'), n.conf, MAX_SEATS)}${bar(t('a_alloc'), cap.allocated, MAX_SEATS)}${bar(t('a_in'), n.ent, n.conf)}</div>
<div class="panel"><h2>${esc(t('recent'))}</h2>${n.created ? rsvpRows(t, rec) : `<p class="empty">${esc(t('empty_links'))}</p>`}</div>`));
}));
app.get('/admin/invitations', needAdmin, w(async (req, res) => {
  const t = req.t, [rows] = await pool.query('SELECT * FROM invitations ORDER BY number');
  const tr = rows.map(i => `<tr><td>${i.number}</td><td><input readonly class="lnk" value="${esc(BASE)}/i/${esc(i.token)}"><button type="button" class="copy">${esc(t('a_copy'))}</button></td>
<td>${esc(t('a_' + i.status))}${i.checked_in_at ? ' · ' + esc(t('a_entered')) : ''}<br><small>${esc(i.household_name || '')}</small></td>
<td><form method="post" action="/admin/seats" class="inl">${csrf(req)}<input type="hidden" name="id" value="${i.id}"><select name="seats">${[1, 2].map(n => `<option ${n === i.seats ? 'selected' : ''}>${n}</option>`).join('')}</select><button>OK</button></form></td></tr>`).join('');
  res.send(adm(req, `<h1>${esc(t('nav_inv'))}</h1><p class="warn">${esc(t('a_warn'))}</p>${req.query.e ? `<p class="err">${esc(t(req.query.e))}</p>` : ''}
<form method="post" action="/admin/create-links">${csrf(req)}<button class="btn">${esc(t('a_create'))}</button></form>
<div class="panel">${rows.length ? `<div class="scroll"><table><tr><th>#</th><th>${esc(t('a_link'))}</th><th>${esc(t('a_status'))}</th><th>${esc(t('seats'))}</th></tr>${tr}</table></div>` : `<p class="empty">${esc(t('empty_links'))}</p>`}</div>`, ['/admin.js']));
}));
app.get('/admin/rsvp', needAdmin, w(async (req, res) => {
  const t = req.t, q = String(req.query.q || '').trim().slice(0, 80), like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
  const [rows] = q ? await pool.execute("SELECT * FROM invitations WHERE status<>'pending' AND (number = ? OR household_name LIKE ? OR CAST(names AS CHAR) LIKE ?) ORDER BY number", [+q || -1, like, like])
    : await pool.query("SELECT * FROM invitations WHERE status<>'pending' ORDER BY confirmed_at DESC");
  res.send(adm(req, `<h1>${esc(t('nav_rsvp'))}</h1><div class="panel">${rsvpRows(t, rows)}</div>`));
}));

app.post('/admin/create-links', needAdmin, w(async (req, res) => {
  const c = await pool.getConnection(); let err = '';
  try {
    await c.beginTransaction(); await c.execute('SELECT id FROM capacity WHERE id = 1 FOR UPDATE');
    const [[{ n, mx }]] = await c.query('SELECT COUNT(*) n, COALESCE(MAX(number),0) mx FROM invitations');
    const add = MAX_LINKS - n;
    for (let i = 1; i <= add; i++) await c.execute('INSERT INTO invitations (number, token, seats) VALUES (?, ?, 1)', [mx + i, rnd(32)]);
    if (add > 0) await c.execute('UPDATE capacity SET allocated = allocated + ? WHERE id = 1', [add]);
    await c.commit();
  } catch (e) { await c.rollback().catch(() => {}); err = '?e=err_full'; } finally { c.release(); }
  res.redirect('/admin/invitations' + err);
}));
app.post('/admin/seats', needAdmin, w(async (req, res) => {
  const id = +req.body.id, seats = +req.body.seats; let err = '';
  if (!Number.isInteger(id) || ![1, 2].includes(seats)) return res.redirect('/admin/invitations?e=err_invalid');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction(); await c.execute('SELECT id FROM capacity WHERE id = 1 FOR UPDATE');
    const [[inv]] = await c.execute('SELECT * FROM invitations WHERE id = ? FOR UPDATE', [id]);
    if (!inv || seats < inv.guests) throw new Error('invalid');
    await c.execute('UPDATE capacity SET allocated = allocated + ? WHERE id = 1', [seats - inv.seats]);
    await c.execute('UPDATE invitations SET seats = ? WHERE id = ?', [seats, id]);
    await c.commit();
  } catch (e) { await c.rollback().catch(() => {}); err = /check constraint/i.test(e.message) ? '?e=err_full' : '?e=err_invalid'; } finally { c.release(); }
  res.redirect('/admin/invitations' + err);
}));

const FIELDS = [['event_at', 'a_event_at', 'datetime-local'], ['countdown_at', 'a_countdown_at', 'datetime-local'], ['intro', 'a_intro', 'area', 1],
  ['venue', 'a_venue', 'text', 1], ['address', 'a_address', 'text', 1], ['map_url', 'a_mapurl', 'url'],
  ['reception_venue', 'a_rvenue', 'text', 1], ['reception_address', 'a_raddress', 'text', 1], ['reception_map_url', 'a_rmap', 'url'],
  ['program', 'a_program', 'area', 1], ['story', 'a_story', 'area', 1], ['party', 'a_party', 'area', 1], ['faq', 'a_faq', 'area', 1], ['notes', 'a_notes', 'area', 1]];
app.get('/admin/settings', needAdmin, w(async (req, res) => {
  const s = await getSettings(), t = req.t;
  const inp = (lab, type, name) => `<label>${esc(lab)}${type === 'area' ? `<textarea name="${name}" rows="5" maxlength="3000">${esc(s[name])}</textarea>` : `<input type="${type}" name="${name}" value="${esc(s[name])}" maxlength="500">`}</label>`;
  const f = FIELDS.map(([k, lab, type, b]) => b ? ['fr', 'en'].map(l => inp(`${t(lab)} (${l.toUpperCase()})`, type, `${k}_${l}`)).join('') : inp(t(lab), type, k)).join('');
  res.send(adm(req, `<h1>${esc(t('a_settings'))}</h1><form method="post" class="panel">${req.query.ok ? `<p class="ok">${esc(t('a_saved'))}</p>` : ''}${csrf(req)}${f}<button class="btn">${esc(t('a_save'))}</button></form>`));
}));
app.post('/admin/settings', needAdmin, w(async (req, res) => {
  const keys = FIELDS.flatMap(([k, , , b]) => b ? [`${k}_fr`, `${k}_en`] : [k]);
  for (const k of keys) { let v = String(req.body[k] || '').slice(0, 3000).trim();
    if (/map_url$/.test(k) && v && !/^https?:\/\//i.test(v)) v = '';
    await pool.execute('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, v]); }
  res.redirect('/admin/settings?ok=1');
}));
app.get('/admin/prefs', needAdmin, (req, res) => { const t = req.t;
  res.send(adm(req, `<h1>${esc(t('nav_prefs'))}</h1><div class="panel"><h2>${esc(t('lang_label'))}</h2><p><a class="btn" href="?lang=fr">Français</a> <a class="btn" href="?lang=en">English</a></p>
<h2>${esc(t('profile'))}</h2><p>${esc(req.session.email || '')}</p><h2>${esc(t('a_warn').split(':')[0])}</h2><p>${esc(t('a_warn'))}</p><p class="muted">${esc(t('backup'))}</p></div>`)); });

app.get('/admin/scan', needAdmin, (req, res) => res.send(adm(req, `<h1>${esc(req.t('a_scan'))}</h1><div class="panel"><video id="v" playsinline muted></video><canvas id="cv" class="hidden"></canvas>
<button id="start" class="btn">${esc(req.t('s_start'))}</button><p id="cam" class="muted"></p></div>
<form id="sf" class="panel"><label>${esc(req.t('s_search'))}<input id="q" maxlength="80"></label><button class="btn">${esc(req.t('s_go'))}</button></form><div id="out"></div><input type="hidden" id="csrf" value="${esc(req.session.csrf)}">`,
  ['/vendor/jsQR.js', '/scan.js'])));
const card = i => ({ id: i.id, number: i.number, household: i.household_name, names: i.names, seats: i.seats, guests: i.guests, status: i.status, entered: !!i.checked_in_at });
app.post('/admin/api/lookup', needAdmin, w(async (req, res) => {
  if (req.body.qr) {
    const [r] = await pool.execute('SELECT * FROM invitations WHERE qr_token = ?', [String(req.body.qr).slice(0, 80)]);
    return res.json(r[0] ? { results: [card(r[0])] } : { results: [], code: 's_invalid' });
  }
  const q = String(req.body.q || '').trim().slice(0, 80); if (!q) return res.json({ results: [] });
  const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%';
  const [r] = await pool.execute("SELECT * FROM invitations WHERE status='confirmed' AND (number = ? OR household_name LIKE ? OR JSON_SEARCH(names,'one',?) IS NOT NULL) LIMIT 20", [+q || -1, like, like]);
  res.json({ results: r.map(card) });
}));
app.post('/admin/api/checkin', needAdmin, w(async (req, res) => {
  const [r] = await pool.execute("UPDATE invitations SET checked_in_at = NOW() WHERE id = ? AND status = 'confirmed' AND checked_in_at IS NULL", [+req.body.id || 0]);
  res.json({ ok: r.affectedRows === 1, code: r.affectedRows === 1 ? 's_done' : 's_dup' });
}));

app.use((req, res) => res.status(404).send(layout(req, '404', `<main class="center"><p>${esc(req.t('err_notfound'))}</p></main>`)));
app.use((err, req, res, next) => { console.error(err.message); res.status(500).send(layout(req, 'Erreur', `<main class="center"><p>${esc(req.t('err_generic'))}</p></main>`)); });
app.listen(process.env.PORT || 3000, () => console.log('Serveur démarré'));
