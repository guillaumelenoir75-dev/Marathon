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
