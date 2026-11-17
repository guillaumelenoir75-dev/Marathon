// Parler au Coach à la voix : texte prononçable et découpage du flux en phrases (lecture dès la 1re phrase)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/frontend');
const app = loadApp({ now: '2026-11-13T09:00:00+01:00', state: {} });

test('cvSpeakable : allures, FC, abréviations et émojis rendus prononçables', () => {
  assert.equal(app.cvSpeakable("🏃 **Footing EF** de 8 km à 5'40/km, FC < 145 bpm."),
    'Footing endurance fondamentale de 8 kilomètres à 5 minutes 40 au kilomètre, fréquence cardiaque < 145 pulsations.');
  assert.equal(app.cvSpeakable('Objectif 3h37 en S12, J-21.'), 'Objectif 3 heures 37 en semaine 12, J moins 21.');
  assert.equal(app.cvSpeakable('[FEU:🟢] Bien joué ✅\n- 21,4 km'), 'Bien joué. - 21 virgule 4 kilomètres');
  assert.equal(app.cvSpeakable("Vise 4'05 sur le seuil"), 'Vise 4 minutes 05 sur le seuil');
  // chiffres écrits en chiffres par le Coach : bien prononcés (minutes rondes, minutes seules, pourcentages)
  assert.equal(app.cvSpeakable("Vise 42'00, soit 4'12/km."), 'Vise 42 minutes, soit 4 minutes 12 au kilomètre.');
  assert.equal(app.cvSpeakable("Garde 2' de marge, confiance 80 %."), 'Garde 2 minutes de marge, confiance 80 pour cent.');
});

test('cvKeep : tour de parole court — 2 phrases, 40 mots au plus, une courte question de relance en 3e', () => {
  const w = (n) => Array(n).fill('mot').join(' ') + '.';
  assert.equal(app.cvKeep(0, 0, w(60)), true, '1re phrase toujours lue');
  assert.equal(app.cvKeep(1, 12, w(10)), true, '2e phrase si le total reste court');
  assert.equal(app.cvKeep(1, 30, w(15)), false, 'au-delà de 40 mots : coupé');
  assert.equal(app.cvKeep(2, 20, 'Tu veux que je détaille ?'), true, 'courte question de relance');
  assert.equal(app.cvKeep(2, 20, w(6)), false, '3e phrase sans question : coupée');
  assert.equal(app.cvKeep(3, 20, 'Ça te va ?'), false, 'jamais une 4e phrase');
  // réponse trop longue (celle du test sur iPhone) : seules les 2 premières phrases passent
  const long = "Le modèle me donne 43'47 avec une confiance de 80 %. C'est honnête : tu sors d'un marathon il y a moins d'un mois. Ton objectif à toi c'est 41'50, c'est ambitieux. Ma recommandation : vise 42'00.";
  const S = app.cvSentences(long, true).out; let n = 0, words = 0; const kept = [];
  for (const x of S) { if (!app.cvKeep(n, words, x)) break; kept.push(x); n++; words += x.split(/\s+/).length; }
  assert.equal(kept.length, 2);
});

test('cvWantsLong / cvKeep long : détail demandé (plan km par km, liste…) → réponse complète, sinon courte', () => {
  assert.equal(app.cvWantsLong("Tu peux me faire un plan de course kilomètre par kilomètre pour 42 minutes"), true);
  assert.equal(app.cvWantsLong('Détaille-moi ma séance de demain'), true);
  assert.equal(app.cvWantsLong('Je dois faire quel temps dimanche ?'), false, 'question simple : réponse courte');
  assert.equal(app.cvWantsLong('Oui vas-y', true), true, '« oui » juste après une réponse coupée = le détail');
  assert.equal(app.cvWantsLong('Oui', false), false);
  const w = (n) => Array(n).fill('mot').join(' ') + '.';
  assert.equal(app.cvKeep(5, 90, w(15), true), true, 'long : on continue');
  assert.equal(app.cvKeep(5, 160, w(15), true), false, 'long : 170 mots au plus');
  assert.equal(app.cvKeep(14, 100, w(5), true), false, 'long : 14 phrases au plus');
});

test('cvSentences : chaque phrase complète part tout de suite, la fin attend la suite du flux', () => {
  let S = app.cvSentences('Très bonne idée. Ta séance de ce soir se pré', false);
  assert.deepEqual(JSON.parse(JSON.stringify(S.out)), ['Très bonne idée.']);
  assert.equal(S.rest, 'Ta séance de ce soir se pré');
  S = app.cvSentences(S.rest + 'sente bien ! Garde 5,5 km facile', false);
  assert.deepEqual(JSON.parse(JSON.stringify(S.out)), ['Ta séance de ce soir se présente bien !']);
  S = app.cvSentences(S.rest, true);
  assert.deepEqual(JSON.parse(JSON.stringify(S.out)), ['Garde 5,5 km facile'], 'fin du flux : le reste part');
  assert.deepEqual(JSON.parse(JSON.stringify(app.cvSentences('Oui. Et demain repos complet. ', false).out)), ['Oui. Et demain repos complet.'], 'bout de phrase trop court rattaché');
  assert.equal(app.cvSentences('Allure 5.40 au km', false).out.length, 0, 'pas de coupure au milieu d\'un nombre');
});

test('cvTurnWait : on attend plus quand la phrase n\'est pas finie, moins après une vraie question', () => {
  assert.equal(app.cvTurnWait('Je voulais savoir si je peux courir demain parce que', true), 2600, '« parce que » : il continue');
  assert.equal(app.cvTurnWait('euh', false), 2600);
  assert.equal(app.cvTurnWait("Est-ce que je peux faire mon tempo demain ?", true), 600, 'question finie');
  assert.ok(app.cvTurnWait('Ma séance de ce soir', true) <= 800);
  assert.ok(app.cvTurnWait('Ma séance de ce soir', false) > app.cvTurnWait('Ma séance de ce soir', true), 'texte encore provisoire : un peu plus');
});

test('cvSuggest : suggestions selon le moment et la séance du jour', () => {
  const { synthPlan } = require('../helpers/frontend');
  const st = synthPlan({ start: '2026-11-09' });
  st.extra_w1_s3 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|5\'45', sched_date: '2026-11-13', sched_day: 5, sched_time: '18:30' });
  const a = loadApp({ now: '2026-11-13T08:00:00+01:00', state: st });
  const m = JSON.parse(JSON.stringify(a.cvSuggest(st, new Date('2026-11-13T08:00:00+01:00'))));
  assert.equal(m.length, 3);
  assert.equal(m[0], 'Comment j\'aborde ma séance de ce soir ?');
  assert.ok(m.includes('Qu\'est-ce que j\'ai aujourd\'hui ?'), 'le matin');
  const sun = JSON.parse(JSON.stringify(a.cvSuggest({}, new Date('2026-11-15T19:00:00+01:00'))));
  assert.deepEqual(sun.slice(0, 2), ['Fais-moi le bilan de ma semaine', 'Qu\'est-ce que je fais demain ?'], 'dimanche soir');
});

test('cvIntent : commandes vocales reconnues, questions jamais prises pour une commande', () => {
  const I = (t) => JSON.parse(JSON.stringify(app.cvIntent(t)));
  assert.deepEqual(I('Pas d\'alcool hier soir'), { k: 'alc', l: 0, t: [] });
  assert.deepEqual(I("J'ai bu 3 bières"), { k: 'alc', l: 3, t: ['beer'], n: 3 });
  assert.deepEqual(I("J'ai bu deux verres de vin."), { k: 'alc', l: 2, t: ['wine'], n: 2 });
  assert.deepEqual(I("J'ai bu 2 pintes"), { k: 'alc', l: 5, t: ['beer'], n: 4 }, 'une pinte ≈ 2 verres → 4 verres = niveau 5');
  assert.deepEqual(I('alcool 4 sur 10'), { k: 'alc', l: 4, t: [] });
  assert.equal(app.cvIntent("Est-ce que l'alcool d'hier soir change ma séance ?"), null, 'question → le Coach');
  assert.equal(app.cvIntent("j'ai bu 3 verres hier, c'est grave ?"), null);
  assert.equal(I('Lis-moi mon brief').k, 'brief');
  assert.equal(I("J'ai fini ma séance").k, 'fin');
  assert.deepEqual(I('Ouvre mes statistiques'), { k: 'go', s: 'stats', label: 'tes statistiques' });
  assert.equal(I('Répète').k, 'repeat');
  assert.deepEqual(I('Parle plus lentement'), { k: 'rate', d: -1 });
  assert.equal(I('Merci, c\'est tout').k, 'bye');
  assert.equal(app.cvIntent('Salut'), null, 'un bonjour ne ferme pas la conversation');
  assert.equal(app.cvIntent('Comment je cours ce soir'), null);
});

test('cvBriefText : brief en attente du jour, sinon dernier brief du jour dans le fil', () => {
  assert.equal(app.cvBriefText({ _brief_pending: { date: '2026-11-13', content: 'Bonjour ! Récup 70 %…' } }, '2026-11-13', []), 'Bonjour ! Récup 70 %…');
  assert.equal(app.cvBriefText({ _brief_pending: { date: '2026-11-12', content: 'hier' } }, '2026-11-13', []), null, 'jamais celui de la veille');
  const long = '## ❤️ FC REPOS & RÉCUPÉRATION\n' + 'x'.repeat(300);
  assert.equal(app.cvBriefText({}, '2026-11-13', [{ role: 'assistant', date: '2026-11-13', content: long }]), long);
});

test('image de séance : l\'allure de chaque km a sa place au-dessus de sa barre (14 km, 21 km, 30 km)', () => {
  const S = 1080, M = 64;
  [14, 21, 30].forEach((n) => {
    const gw = n > 20 ? 4 : 8, bw = (S - 2 * M - gw * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const L = app.ssSplitLabel(n, bw, gw, i);
      assert.ok(L.font >= 14 && L.font <= 24, n + ' km : police lisible');
      if (L.rotate) assert.ok(n > 20 && L.font <= bw + gw - 4, n + ' km : à la verticale, la hauteur du texte tient dans la largeur de la barre');
      else assert.ok(L.font * 2.3 <= L.room + 1, n + ' km : « 5\'13 » tient dans sa place');
    }
  });
  assert.equal(app.ssSplitLabel(14, 60, 8, 3).font, 24, '14 km (cas de la capture) : grande police, toutes les allures');
});

test('cvGreeting : le Coach ouvre la conversation selon la journée (séance du soir, repos, brief prêt)', () => {
  const { synthPlan } = require('../helpers/frontend');
  const st = synthPlan({ start: '2026-11-09' });
  st.extra_w1_s3 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|5\'45', sched_date: '2026-11-13', sched_day: 5, sched_time: '18:30' });
  const a = loadApp({ now: '2026-11-13T19:10:00+01:00', state: st });
  const G = a.cvGreeting(st, new Date('2026-11-13T19:10:00+01:00'), 'Léa');
  assert.match(G.text, /^Bonsoir Léa\. Ce soir : Footing EF de 8 km à 18h30\. Une question \?$/);
  assert.equal(G.offer, null);
  st._brief_pending = { content: 'Brief…', date: '2026-11-13' };
  const b = loadApp({ now: '2026-11-13T08:00:00+01:00', state: st });
  const B = b.cvGreeting(st, new Date('2026-11-13T08:00:00+01:00'), '');
  assert.equal(B.offer, 'brief'); assert.match(B.text, /brief du matin est prêt/);
});

test('cvCardKind / cvTimeIn / cvRaceCard : la bonne carte sous la réponse, plan de course lisible', () => {
  assert.equal(app.cvCardKind('Fais-moi mon plan de course kilomètre par kilomètre'), 'race');
  assert.equal(app.cvCardKind('Quel temps je peux viser dimanche ?'), 'pred');
  assert.equal(app.cvCardKind('Comment est ma récup ce matin ?'), 'form');
  assert.equal(app.cvCardKind('Comment j\'aborde ma séance de ce soir ?'), 'sess');
  assert.equal(app.cvCardKind('Merci'), null);
  assert.equal(app.cvTimeIn("Vise 42'00, soit 4'12/km."), 2520);
  assert.equal(app.cvTimeIn('Objectif 1h35 au semi'), 5700);
  assert.equal(app.cvTimeIn("Pars en 4'18/km"), null, 'une allure n\'est pas un temps de course');
  // bug iPhone : « départ à 9h00. Objectif 42'00 » → 42'00, jamais l'heure de départ
  assert.equal(app.cvTimeIn("Course dimanche à 9h00. Objectif 42'00, soit 4'12/km.", 10), 2520);
  assert.equal(app.cvTimeIn("Départ 9h00, vise 42'00", 10), 2520, 'heure hors allure possible : écartée');
  assert.equal(app.cvTimeIn('Vise 3h45 au marathon', 42.195), 13500);
  assert.equal(app.cvTimeIn('Rendez-vous à 9h00', 10), null);
  assert.equal(app.cvRaceCard(32400, 10), null, 'allure impossible (54\'/km) : pas de carte');
  const C = app.cvRaceCard(2520, 10);
  assert.equal(C.rows.length, 10); assert.equal(Math.round(C.pace), 252);
  assert.ok(Math.abs(C.rows[9].cum - 2520) < 1, 'le cumul retombe sur le temps visé');
  assert.ok(app.cvRaceCard(12600, 42.195).rows.length <= 12, 'marathon : regroupé');
});

test('cvActionIntent / cvMemoIntent / cvChangeLine : le Coach agit sur le plan, note ce qu\'on lui dit', () => {
  assert.equal(app.cvActionIntent('Décale ma séance de demain à jeudi'), true);
  assert.equal(app.cvActionIntent('Tu peux alléger ma semaine, je suis crevé'), true);
  assert.equal(app.cvActionIntent('Ajoute un footing samedi'), true);
  assert.equal(app.cvActionIntent('Comment je passe ma semaine ?'), false);
  assert.equal(app.cvActionIntent('Quel temps dimanche ?'), false);
  assert.equal(app.cvMemoIntent("Note que j'ai mal au mollet gauche"), "j'ai mal au mollet gauche");
  assert.equal(app.cvMemoIntent('Retiens que je cours mieux le matin.'), 'je cours mieux le matin');
  assert.equal(app.cvMemoIntent('Comment je note ma séance ?'), null);
  assert.equal(app.cvChangeLine({ title: 'Footing EF', date: '2026-11-19', field: 'km', before: 8, after: 6 }), 'Footing EF de jeudi : 6 km au lieu de 8 km');
});

test('cvFixTranscript / cvEcho / cvLatMedian : vocabulaire course, écho du haut-parleur, délai mesuré', () => {
  assert.equal(app.cvFixTranscript('Je vise 4 minutes 12 en e f'), "Je vise 4'12 en EF");
  assert.equal(app.cvFixTranscript('Mon seuil à 4 05 au kilomètre'), "Mon seuil à 4'05/km");
  assert.equal(app.cvFixTranscript('ma v m a'), 'ma VMA');
  assert.equal(app.cvEcho('vise 42 minutes soit', "Vise 42 minutes, soit 4 minutes 12 au kilomètre"), true, 'sa propre voix : pas d\'interruption');
  assert.equal(app.cvEcho('attends attends stop', 'Vise 42 minutes, soit 4 minutes 12'), false, 'toi qui parles : interruption');
  assert.equal(app.cvEcho('ok', 'Vise 42 minutes'), true, 'trop court pour décider');
  assert.equal(app.cvLatMedian([{ say: 1800 }, { say: 900 }, { say: 1200 }, { say: 5000, long: 1 }]), 1200);
});

test('écran vocal : libellés des états, pastilles de contexte, chiffres en pastilles et phrase lue surlignée', () => {
  assert.equal(app.cvStateLabels('speak').t, 'Le Coach parle');
  assert.equal(app.cvStateLabels('listen').t, 'Je t\'écoute…');
  assert.equal(app.cvStateLabels('listen', { ask: true }).t, 'Je valide ?', 'un changement attend ton « oui »');
  assert.equal(app.cvStateLabels('idle', { canListen: false }).t, 'Écris ta question');
  const html = app.cvRich("Vise 42'00, soit 4'12/km. Pars prudent sur 8 km.", "Pars prudent sur 8 km.");
  assert.match(html, /<span class="cv-num">42'00<\/span>/); assert.match(html, /<span class="cv-num">4'12\/km<\/span>/);
  assert.match(html, /<mark>Pars prudent sur <span class="cv-num">8 km<\/span>\.<\/mark>/);
  assert.equal(app.cvRich('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;', 'texte échappé');
  const { synthPlan } = require('../helpers/frontend');
  const st = synthPlan({ start: '2026-11-09' });
  st.extra_w1_s3 = JSON.stringify({ type: 'ef', km: 8, d: 'Footing EF|5\'45', sched_date: '2026-11-13', sched_day: 5, sched_time: '18:30' });
  st._form_today = { date: '2026-11-13', score: 45 };
  const a = loadApp({ now: '2026-11-13T19:10:00+01:00', state: st });
  const C = JSON.parse(JSON.stringify(a.cvContext(st, new Date('2026-11-13T19:10:00+01:00'))));
  assert.ok(C.some((c) => c.t === '💛 Forme 45' && c.c === 'mid'), JSON.stringify(C));
  assert.ok(C.some((c) => c.t === '🏃 Ce soir · EF 8 km'), JSON.stringify(C));
});
