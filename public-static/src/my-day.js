// ─── « Ma journée » : l'accueil suit le moment de la journée ────────────────────────────────────────────────
// Un fil unique en tête de l'accueil : matin (réveil, alcool, brief, forme du jour), séance du jour (consigne, météo,
// chaussure → Valider / J'ai fini), après (ressenti, image à partager), renfo du jour, soir (coucher, séance de demain).
// Ce qui est fait se replie en pastilles ; l'étape « maintenant » est mise en avant ; la suite en lignes courtes.
// Moteur : mjSteps(st, today, nowMin) → étapes {id, ic, t, s, at, done, act, btn, info} triées par heure ; mjPhase(nowMin).
// Affichage : mjRender() dans #home-day-card (appelé par homeNextCard, qui laisse alors sa carte vide : pas de doublon).

const MJ_DAYS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
function mjPhase(nowMin){ return nowMin < 11 * 60 ? 'matin' : nowMin < 18 * 60 ? 'jour' : 'soir'; }
const _mjMin = function(t){ const m = String(t || '').match(/^(\d{1,2})[:h](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const _mjHm = function(m){ return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
const _mjEsc = function(x){ return typeof prEsc === 'function' ? prEsc(x) : String(x == null ? '' : x); };
function _mjTime(st, s){ let sc = {}; try { sc = JSON.parse(st[s.key + '_sched'] || '{}') || {}; } catch(e) {} return sc.time || (s.x && s.x.sched_time) || ''; }
function _mjAdmin(){ return typeof isAdmin === 'function' && isAdmin(); }
// semaine du plan pour le renfo : semaine en cours de l'app, sinon d'après le début du plan
function _mjWeek(st, today){
  const cw = typeof getEffectiveCW === 'function' ? getEffectiveCW() : 0;
  if(cw >= 1) return cw;
  if(!st.plan_start_date || typeof prMonday !== 'function') return 1;
  return Math.max(1, Math.floor(prDays(prIso(prMonday(st.plan_start_date)), today) / 7) + 1);
}
function mjSteps(st, today, nowMin){
  st = st || state; today = today || prTodayIso();
  if(nowMin == null){ const d = new Date(); nowMin = d.getHours() * 60 + d.getMinutes(); }
  const out = [], admin = _mjAdmin(), tomorrow = prAddDays(today, 1);
  const sess = typeof prSessions === 'function' ? prSessions(st) : [];
  // ── matin (compte admin : réveil, alcool, brief) ──
  if(admin){
    const woke = !!st['_wakeup_' + today];
    if(woke || nowMin < 14 * 60) out.push({ id: 'wake', ic: '🌅', t: woke ? 'Réveil' : 'Je suis réveillé', s: woke ? '' : 'Lance la synchro WHOOP et ta forme du jour', at: 5 * 60, done: woke,
      act: 'wakeupStart()', btn: 'Réveillé', short: 'Réveil' });
    if(typeof alcEntry === 'function'){
      const e = alcEntry(today);
      out.push({ id: 'alc', ic: '🍷', t: e ? (e.l ? 'Alcool hier soir : ' + e.l + '/10' : 'Pas d\'alcool hier soir') : 'Alcool hier soir ?', s: e ? '' : 'Pour séparer son effet de celui de l\'entraînement',
        at: 5 * 60 + 1, done: !!e, act: 'alcAsk()', btn: 'Répondre', short: e ? (e.l ? 'Alcool ' + e.l + '/10' : 'Sans alcool') : '' });
    }
    if(typeof coachAI !== 'function' || coachAI()){
      const pend = st._brief_pending && (st._brief_pending.date === today || !st._brief_pending.date);
      const late = typeof briefTooLate === 'function' && briefTooLate();
      const seen = !!st['_brief_matin_' + today] && !pend;
      if(pend && !late) out.push({ id: 'brief', ic: '☀️', t: 'Ton brief du matin', s: 'Prêt à lire', at: 5 * 60 + 2, done: false, act: 'openCoachFromNotif()', btn: 'Lire', listen: true });   // 🎧 = l'écouter (coach-voice.js)
      else if(seen) out.push({ id: 'brief', ic: '☀️', t: 'Brief du matin', s: '', at: 5 * 60 + 2, done: true, act: 'showScreen(\'coach\')', short: 'Brief' });
    }
  }
  // (forme du jour : carte « Forme du jour » juste au-dessus, pas répétée ici)
  // ── séances du jour ──
  const feel = typeof avPendingFeel === 'function' ? avPendingFeel().map(function(x){ return x.key; }) : [];
  const todays = sess.filter(function(s){ return !s.skip && s.type !== 'rest' && (s.done ? s.date === today : (s.x && s.x.sched_date) === today); });
  todays.forEach(function(s){
    const tm = _mjTime(st, s), at = _mjMin(tm) != null ? _mjMin(tm) : 12 * 60;
    const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(s.title, s.type, s.detail) : s.title;
    const ic = (typeof typeEmoji !== 'undefined' && typeEmoji[s.type]) || '🏃';
    if(s.done){
      const p = s.perf || {}, km = s.km ? String(Math.round(s.km * 100) / 100).replace('.', ',') + ' km' : '';
      out.push({ id: 'sess-' + s.key, kind: 'sess', ic: ic, t: title, s: [km, p.pace ? String(p.pace).replace(':', '\'') : ''].filter(Boolean).join(' · '), at: at, done: true, key: s.key,
        act: 'homeNextGo(' + s.w + ',' + s.ei + ')', share: true });
      if(feel.indexOf(s.key) >= 0) out.push({ id: 'feel-' + s.key, ic: '💬', t: 'Ton ressenti', s: 'Effort, douleur, en 20 secondes', at: at + 1, done: false, act: 'avFeelOpen(\'' + s.key + '\')', btn: 'Raconter' });
    } else {
      const dur = typeof estimateDuration === 'function' ? estimateDuration(s.x) : '';
      const pace = s.pace && s.pace.text ? s.pace.text.replace(/\s+/g, ' ') : '';
      const fin = typeof avFinish === 'function' && typeof avOn === 'function' && avOn() && admin && st.whoop_token;
      let shoe = null; try { shoe = typeof shoeDayAdvice === 'function' ? shoeDayAdvice(s.x, today) : null; } catch(e) { diagSilent(e, 'my-day:mjSteps'); }
      out.push({ id: 'sess-' + s.key, kind: 'sess', ic: ic, t: title, s: [s.kmPlan ? s.kmPlan + ' km' : '', pace || (dur ? '~' + dur : '')].filter(Boolean).join(' · '),
        tm: tm, at: at, done: false, key: s.key, w: s.w, ei: s.ei, x: s.x, shoe: shoe && shoe.name ? shoe.name : null,
        act: 'homeNextGo(' + s.w + ',' + s.ei + ')', btn: fin ? '🏁 J\'ai fini' : '✓ Valider', btnAct: fin ? 'avFinish()' : 'toggleDoneExtra(' + s.w + ',' + s.ei + ')' });
    }
  });
  // ── renfo du jour ──
  const wd = new Date(today + 'T12:00:00').getDay() || 7, w = _mjWeek(st, today);
  const rfk = function(w, r){ return 'rf' + w + 'r' + r; };          // mêmes clés que l'écran Renfo (plan-state.js)
  if(!st['rf' + w + 'skip']){
    [1, 2].forEach(function(r){
      let sc = null; const raw = st[rfk(w, r) + 'sched']; try { sc = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) {}
      if(!sc || +sc.day !== wd) return;
      const name = typeof getRenfoData === 'function' ? (getRenfoData(r) || {}).name : 'Renfo';
      const done = !!st[rfk(w, r) + 'done'], at = _mjMin(sc.time) != null ? _mjMin(sc.time) : 18 * 60;
      out.push({ id: 'renfo-' + r, ic: '🏋️', t: 'Renfo · ' + (name || 'séance'), s: done ? '' : 'Séance guidée, adaptée à ton plan', tm: sc.time || '', at: at, done: done,
        act: 'showScreen(\'renfo\',' + r + ')', btn: '▶ Guidée', btnAct: 'showScreen(\'renfo\',' + r + ');openRenfoGuide()' });
    });
  }
  // ── zones FC : une séance a révélé une nouvelle FC max / FC seuil → proposé ici (avant : seulement dans Statistiques) ──
  try {
    if(typeof hrZonesEstimate === 'function' && !(typeof _prepView !== 'undefined' && _prepView)){
      const E = hrZonesEstimate(today);
      if(E && E.propose){
        const t = E.manual ? 'FC max relevée : ' + E.declared + ' → ' + E.obs.v + ' bpm' : 'Plafond d\'endurance : ' + E.cur + ' → ' + E.efMax + ' bpm';
        out.push({ id: 'zones', ic: '❤️', t: t, s: 'Tes séances récentes recalent tes zones FC', at: 5 * 60 + 4, done: false,
          act: 'showScreen(\'stats\');if(typeof statsTab===\'function\')statsTab(\'train\');setTimeout(function(){if(typeof statsGo===\'function\')statsGo(\'bs-stats-card\')},450)',
          btn: 'Appliquer', btnAct: 'hrZonesApply();if(typeof sessionChanged===\'function\')sessionChanged()' });
      }
    }
  } catch(e) { diagSilent(e, 'my-day:mjSteps'); }
  // ── jour de repos ──
  const hasTraining = out.some(function(x){ return x.kind === 'sess' || /^renfo/.test(x.id); });
  if(!hasTraining) out.push({ id: 'rest', ic: '😌', t: 'Repos aujourd\'hui', s: 'Récupère : c\'est là que tu progresses', at: 12 * 60, done: true, info: true });
  // ── soir : coucher, demain ──
  try {
    const B = typeof bsBedtime === 'function' ? bsBedtime(today) : null;
    const S = B && typeof bsBedtimeStatus === 'function' ? bsBedtimeStatus(today) : { ready: true };
    if(B && S.ready && nowMin >= 19 * 60){   // le soir seulement : dans la journée, la pastille 🌙 de l'en-tête suffit
      const bm = _mjMin(String(B.bed).replace('h', ':'));
      out.push({ id: 'bed', ic: '🌙', t: 'Couche-toi vers ' + B.bed, s: B.sleep + ' de sommeil' + (B.wake ? ' · réveil ' + B.wake : ''), tm: B.bed.replace('h', ':'),
        at: bm != null ? Math.max(20 * 60, bm - 60) : 21 * 60, done: false, soft: true, act: 'openSleepPlan()' });
    }
  } catch(e) { diagSilent(e, 'my-day:mjSteps'); }
  const next = sess.filter(function(s){ return !s.done && !s.skip && s.type !== 'rest' && s.x && s.x.sched_date && s.x.sched_date > today; })
    .sort(function(a, b){ return a.x.sched_date === b.x.sched_date ? String(_mjTime(st, a)).localeCompare(String(_mjTime(st, b))) : a.x.sched_date < b.x.sched_date ? -1 : 1; })[0];
  if(next){
    const d = prDays(today, next.x.sched_date), tm = _mjTime(st, next);
    const day = d === 1 ? 'Demain' : (MJ_DAYS[new Date(next.x.sched_date + 'T12:00:00').getDay() || 7] + ' ' + new Date(next.x.sched_date + 'T12:00:00').getDate());
    const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(next.title, next.type, next.detail) : next.title;
    out.push({ id: 'next', ic: '📅', t: day + (tm ? ' ' + tm.replace(/^0(\d)/, '$1').replace(':', 'h') : '') + ' · ' + title, s: next.kmPlan ? next.kmPlan + ' km' : '',
      at: 23 * 60 + 50, done: false, soft: true, info: true, act: 'homeNextGo(' + next.w + ',' + next.ei + ')' });
  }
  out.sort(function(a, b){ return a.at - b.at; });
  // étape « maintenant » : la première non faite, hors repères (coucher / demain seulement le soir ou quand tout est fait)
  const todo = out.filter(function(x){ return !x.done && !x.info; });
  // à partir de midi, une séance ou un renfo de la journée passe avant les questions du matin (alcool…)
  const real = todo.filter(function(x){ return !x.soft; }), dayItem = real.filter(function(x){ return x.at >= 6 * 60 && x.at <= nowMin; })[0];
  const firstReal = (nowMin >= 12 * 60 && dayItem) || real[0];
  const cur = firstReal || (nowMin >= 18 * 60 || !todo.length ? todo[0] : null) || todo[0];
  out.forEach(function(x){ x.st = x.done ? 'done' : x === cur ? 'now' : 'later'; });
  return out;
}

// « Ma journée » est affichée (accueil) : elle porte alors les actions du jour (réveil, alcool, ressenti) — les autres cartes
// de l'accueil ne les répètent pas (en-tête, Forme du jour, ligne de la séance)
function mjActive(){
  if(typeof document === 'undefined' || !document.getElementById || !document.getElementById('home-day-card')) return false;
  if((typeof _prepView !== 'undefined' && _prepView) || (typeof isPlaisirMode === 'function' && isPlaisirMode()) || typeof prSessions !== 'function') return false;
  return true;
}
// ─── Affichage ─────────────────────────────────────────────────────────────────────────────────────────────
let _mjOpen = false;
function mjRender(){
  const el = typeof document !== 'undefined' ? document.getElementById('home-day-card') : null; if(!el) return false;
  try {
    if((typeof _prepView !== 'undefined' && _prepView) || (typeof isPlaisirMode === 'function' && isPlaisirMode()) || typeof prSessions !== 'function'){ el.innerHTML = ''; return false; }
    const d = new Date(), nowMin = d.getHours() * 60 + d.getMinutes(), today = prTodayIso();
    const L = mjSteps(state, today, nowMin); if(!L.length){ el.innerHTML = ''; return false; }
    _mjCss();
    const ph = mjPhase(nowMin), head = { matin: ['☀️', 'Ce matin'], jour: ['🏃', 'Aujourd\'hui'], soir: ['🌙', 'Ce soir'] }[ph];
    const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
    const done = L.filter(function(x){ return x.st === 'done'; }), now = L.filter(function(x){ return x.st === 'now'; })[0], later = L.filter(function(x){ return x.st === 'later'; });
    const n = L.filter(function(x){ return !x.info && !x.soft; }), nd = n.filter(function(x){ return x.done; }).length;
    let h = '<div class="mj mj-' + ph + '"><div class="mj-hd"><p><span aria-hidden="true">' + head[0] + '</span> <b>' + head[1] + '</b> · ' + date + '</p>'
      + '<span class="mj-hr">' + (n.length ? '<span class="mj-cnt" aria-label="' + nd + ' sur ' + n.length + ' fait">' + nd + '/' + n.length + '</span>' : '')
      + (typeof coachAI === 'function' && coachAI() && typeof openCoachVoice === 'function' ? '<button type="button" class="mj-mic" onclick="openCoachVoice()" aria-label="Parler au Coach à la voix">🎙️</button>' : '') + '</span></div>';   // Coach à la voix (coach-voice.js)
    // fait : une seule ligne courte (✓ Réveil · Alcool 2/10 · Brief) ; séances faites en ligne avec 📸
    const ds = done.filter(function(x){ return x.kind === 'sess'; }), dc = done.filter(function(x){ return x.kind !== 'sess'; });
    if(dc.length) h += '<div class="mj-dline"><span class="mj-ck" aria-hidden="true">✓</span>' + dc.map(function(x){
      return '<button type="button"' + (x.act ? ' onclick="' + x.act + '"' : '') + '>' + _mjEsc(x.short || x.t) + '</button>'; }).join('<i aria-hidden="true">·</i>') + '</div>';
    ds.forEach(function(x){
      h += '<div class="mj-done"><button type="button" class="mj-dl" onclick="' + x.act + '"><span class="mj-ck" aria-hidden="true">✓</span><b>' + _mjEsc(x.t) + '</b><span>' + _mjEsc(x.s) + '</span></button>'
        + (x.share && typeof openSessionShare === 'function' ? '<button type="button" class="mj-sh" onclick="openSessionShare(\'' + x.key + '\')" aria-label="Image de ta séance à partager">📸</button>' : '') + '</div>';
    });
    if(now){
      const when = now.tm ? _mjHm(_mjMin(now.tm)) : '', ahead = now.at - nowMin;
      // séance encore loin (> 30 min) : compte à rebours, pas de bouton « J'ai fini » / « Valider » trop tôt
      const early = now.kind === 'sess' && ahead > 30;
      const lab = now.kind === 'sess' && ahead < -90 ? 'À valider' + (when ? ' · ' + when : '')
        : early ? when + ' · dans ' + (ahead >= 60 ? Math.floor(ahead / 60) + ' h' + (ahead % 60 >= 5 ? ' ' + String(ahead % 60).padStart(2, '0') : '') : ahead + ' min')
        : ahead <= 30 ? 'Maintenant' + (when ? ' · ' + when : '') : 'Ensuite' + (when ? ' · ' + when : '');
      const extra = [];
      if(now.kind === 'sess' && now.x){
        if(now.shoe) extra.push('<span class="mj-shoe">👟 ' + _mjEsc(now.shoe) + '</span>');
        if(typeof prWeatherLine === 'function'){ const wl = prWeatherLine(now.x); if(wl) extra.push(wl); }
      }
      h += '<div class="mj-now" role="group" aria-label="' + _mjEsc(lab + ' : ' + now.t) + '"><div class="mj-nr"><button type="button" class="mj-nb"' + (now.act ? ' onclick="' + now.act + '"' : '') + '><span class="mj-ic" aria-hidden="true">' + now.ic + '</span>'
        + '<span class="mj-nt"><small>' + lab + '</small><b>' + _mjEsc(now.t) + '</b>' + (now.s ? '<span>' + _mjEsc(now.s) + '</span>' : '') + '</span></button>'
        + (now.listen && typeof coachAI === 'function' && coachAI() && typeof openCoachVoice === 'function' ? '<button type="button" class="mj-go mj-ear" onclick="openCoachVoice({brief:true})" aria-label="Écouter le brief">🎧</button>' : '')
        + (now.btn && !early ? '<button type="button" class="mj-go" onclick="' + (now.btnAct || now.act) + '">' + now.btn + '</button>' : early ? '<span class="mj-chev" aria-hidden="true">›</span>' : '') + '</div>'
        + (extra.length ? '<div class="mj-ex">' + extra.join('') + '</div>' : '') + '</div>';
    }
    if(later.length){
      const shown = _mjOpen ? later : later.slice(0, 3);
      h += '<div class="mj-later">' + shown.map(function(x){
        return '<button type="button" class="mj-l"' + (x.act ? ' onclick="' + x.act + '"' : '') + '><span class="mj-lt">' + (x.id === 'next' ? '' : x.tm ? _mjHm(_mjMin(x.tm)) : x.id === 'bed' ? 'soir' : '') + '</span><span aria-hidden="true">' + x.ic + '</span><span class="mj-lx"><b>' + _mjEsc(x.t) + '</b>' + (x.s ? ' · ' + _mjEsc(x.s) : '') + '</span></button>';
      }).join('') + (later.length > 3 ? '<button type="button" class="mj-more" onclick="mjToggle()">' + (_mjOpen ? 'Moins' : '+ ' + (later.length - 3) + ' autre' + (later.length > 4 ? 's' : '')) + '</button>' : '') + '</div>';
    }
    h += '</div>';
    el.innerHTML = h;
    return true;
  } catch(e) { console.warn('[ma journée]', e); el.innerHTML = ''; return false; }
}
function mjToggle(){ _mjOpen = !_mjOpen; mjRender(); }
function _mjCss(){
  if(document.getElementById('mj-css')) return;
  const st = document.createElement('style'); st.id = 'mj-css';
  st.textContent = '.mj{background:#fff;border:1px solid #DCE6F5;border-radius:18px;padding:12px;box-shadow:0 1px 3px rgba(12,52,122,.06);display:flex;flex-direction:column;gap:8px;}'
    + '.mj-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-2px 0 0;}.mj-hd p{margin:0;font-size:12px;font-weight:600;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.mj-hd b{color:#0F172A;font-weight:800;font-size:13.5px;}'
    + '.mj-matin .mj-hd b{color:#B45309;}.mj-jour .mj-hd b{color:#1D4ED8;}.mj-soir .mj-hd b{color:#4338CA;}'
    + '.mj-hr{display:flex;align-items:center;gap:6px;flex-shrink:0;}.mj-mic{border:none;background:#EEF2FF;color:#4338CA;width:30px;height:30px;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}.mj-go.mj-ear{padding:9px 10px;background:#E0E7FF;color:#4338CA;margin-right:6px;}'
    + '.mj-cnt{font-size:11px;font-weight:800;color:#475569;background:#F1F5F9;border-radius:20px;padding:2px 8px;font-variant-numeric:tabular-nums;flex-shrink:0;}'
    + '.mj-dline{display:flex;align-items:center;gap:5px;min-width:0;white-space:nowrap;overflow:hidden;font-size:12px;color:#166534;}.mj-dline .mj-ck{width:16px;height:16px;font-size:9px;}.mj-dline button{border:none;background:none;padding:2px 0;font:inherit;font-weight:700;color:#166534;cursor:pointer;flex-shrink:0;}.mj-dline i{font-style:normal;color:#86EFAC;}'
    + '.mj-done{display:flex;align-items:center;gap:6px;}.mj-dl{flex:1;min-width:0;display:flex;align-items:center;gap:7px;border:1px solid #D1FAE5;background:#F0FDF4;border-radius:12px;padding:7px 10px;font:inherit;font-size:12.5px;color:#334155;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;}'
    + '.mj-dl b{color:#14532D;font-weight:800;overflow:hidden;text-overflow:ellipsis;}.mj-dl span:last-child{color:#475569;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;}.mj-ck{width:18px;height:18px;border-radius:50%;background:#16A34A;color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;}'
    + '.mj-sh{width:34px;height:34px;border-radius:10px;border:1px solid #DCE6F5;background:#fff;font-size:15px;cursor:pointer;flex-shrink:0;}'
    + '.mj-now{display:flex;flex-direction:column;gap:6px;background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:14px;padding:9px 10px;}.mj-nr{display:flex;align-items:center;gap:8px;min-width:0;}.mj-chev{font-size:20px;color:#93A5C4;flex-shrink:0;}.mj-matin .mj-now{background:#FFFBEB;border-color:#FDE68A;}.mj-soir .mj-now{background:#EEF2FF;border-color:#C7D2FE;}'
    + '.mj-nb{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border:none;background:none;padding:0;font:inherit;text-align:left;cursor:pointer;color:inherit;}'
    + '.mj-ic{width:38px;height:38px;border-radius:11px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;}'
    + '.mj-nt{min-width:0;display:flex;flex-direction:column;}.mj-nt small{font-size:10.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#64748B;}.mj-nt b{font-size:14.5px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.mj-nt span{font-size:12px;font-weight:600;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}'
    + '.mj-go{flex-shrink:0;background:#1D4ED8;color:#fff;border:none;border-radius:20px;padding:9px 13px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;}.mj-matin .mj-go{background:#B45309;}.mj-soir .mj-go{background:#4338CA;}'
    + '.mj-ex{display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;padding:6px 0 0 48px;border-top:1px dashed rgba(100,116,139,.25);font-size:11.5px;}.mj-ex p{margin:0!important;}.mj-shoe{font-weight:650;color:#475569;white-space:nowrap;}'
    + '.mj-later{display:flex;flex-direction:column;gap:2px;}.mj-l{display:flex;align-items:center;gap:7px;border:none;background:none;padding:5px 2px;font:inherit;font-size:12.5px;color:#475569;text-align:left;cursor:pointer;min-width:0;}'
    + '.mj-lt{width:38px;flex-shrink:0;font-size:11px;font-weight:800;color:#94A3B8;font-variant-numeric:tabular-nums;}.mj-lx{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.mj-lx b{color:#1E293B;font-weight:700;}'
    + '.mj-more{align-self:flex-start;border:none;background:none;color:#1D4ED8;font:inherit;font-size:12px;font-weight:700;padding:2px 2px;cursor:pointer;}';
  document.head.appendChild(st);
}
