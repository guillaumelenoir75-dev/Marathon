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
