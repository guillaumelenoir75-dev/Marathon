// Carte « Organisation course » : parcours, 3 trajets voiture, plein écran.
// Partagée entre l'app (onglet Compte admin) et la page publique /parcours.

let _raceMapInstance = null;
let _raceMapFullscreen = false;
let _raceMapRefit = null;

const _FS_ICON_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

function _toggleRaceMapFS(force){
  const wrap = document.getElementById('race-map-wrap');
  if(!wrap) return;
  _raceMapFullscreen = typeof force === 'boolean' ? force : !_raceMapFullscreen;
  wrap.classList.toggle('is-fs', _raceMapFullscreen);
  document.body.style.overflow = _raceMapFullscreen ? 'hidden' : '';
  if(_raceMapFullscreen){ const c = document.getElementById('race-map-close'); if(c) c.focus(); }
  if(_raceMapInstance) setTimeout(function(){ _raceMapInstance.invalidateSize(); if(_raceMapRefit) _raceMapRefit(); }, 60);
}

const RACE_MAP_PUBLIC_URL = 'https://prepa-marathon.web.app/parcours';

async function shareRaceMap(){
  const btn = document.getElementById('race-share-btn');
  const label = btn && btn.querySelector('span');
  const data = { title: 'Suivre le marathon en voiture', text: 'Le parcours et les 3 trajets pour rejoindre les points de passage :', url: RACE_MAP_PUBLIC_URL };
  if(navigator.share){
    try { await navigator.share(data); } catch(e) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(RACE_MAP_PUBLIC_URL);
    if(label){ label.textContent = 'Lien copié'; setTimeout(function(){ label.textContent = 'Partager'; }, 2000); }
  } catch(e) {
    window.prompt('Lien à partager :', RACE_MAP_PUBLIC_URL);
  }
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && _raceMapFullscreen) _toggleRaceMapFS(false);
});

function initRaceOrgMap(){
  const container = document.getElementById('race-map');
  if(!container) return;
  if(_raceMapInstance) return;

  function _buildMap(){
    if(_raceMapInstance) return;

    // Tracé exact GPX — Marathon Seine-Eure 2026 (OpenRunner #22022506)
    const ROUTE = [[49.14762,1.15084],[49.14845,1.15258],[49.14977,1.15458],[49.15112,1.15793],[49.15229,1.15974],[49.15311,1.16187],[49.15319,1.16233],[49.15266,1.1678],[49.1541,1.17141],[49.15464,1.17336],[49.15623,1.17633],[49.15657,1.17774],[49.1652,1.17919],[49.16524,1.17949],[49.16633,1.18052],[49.16796,1.18132],[49.16859,1.18186],[49.16906,1.18499],[49.16924,1.18519],[49.17009,1.18483],[49.17068,1.18396],[49.17253,1.18339],[49.17286,1.18556],[49.17403,1.18773],[49.17526,1.18688],[49.17794,1.18448],[49.18025,1.18191],[49.18082,1.18149],[49.18194,1.18093],[49.18328,1.18059],[49.18463,1.18074],[49.18565,1.17855],[49.1872,1.17739],[49.18826,1.17722],[49.18914,1.17685],[49.18851,1.17473],[49.18846,1.17391],[49.1888,1.17349],[49.18933,1.17329],[49.19008,1.17353],[49.19083,1.17348],[49.19078,1.16991],[49.19235,1.17037],[49.19388,1.17119],[49.19925,1.17512],[49.20184,1.1758],[49.20457,1.17767],[49.20439,1.17868],[49.20486,1.1791],[49.20582,1.17961],[49.2083,1.18048],[49.2088,1.18],[49.20927,1.17999],[49.20935,1.17983],[49.21053,1.17402],[49.2105,1.17313],[49.21135,1.17316],[49.21234,1.17355],[49.21328,1.1736],[49.21431,1.17313],[49.2152,1.1721],[49.21583,1.1717],[49.21544,1.16897],[49.21561,1.16845],[49.21889,1.16651],[49.22029,1.16652],[49.23613,1.17095],[49.23712,1.1715],[49.23637,1.17715],[49.23791,1.17874],[49.23854,1.17974],[49.23839,1.18001],[49.23698,1.18003],[49.23616,1.17949],[49.23627,1.17727],[49.23577,1.17672],[49.23533,1.17658],[49.23406,1.17661],[49.23149,1.1751],[49.22984,1.17439],[49.22764,1.174],[49.2246,1.17274],[49.22415,1.17275],[49.22363,1.17299],[49.22048,1.17277],[49.2189,1.17139],[49.218,1.17105],[49.21558,1.17211],[49.21558,1.17262],[49.21646,1.17475],[49.21913,1.17711],[49.21952,1.17797],[49.21971,1.17891],[49.2199,1.17908],[49.22301,1.17872],[49.22336,1.17913],[49.22401,1.18156],[49.23112,1.18453],[49.23416,1.18679],[49.23801,1.19021],[49.24012,1.19291],[49.24146,1.1951],[49.24483,1.20285],[49.24632,1.20723],[49.24726,1.2106],[49.24747,1.21347],[49.24686,1.21797],[49.24644,1.21864],[49.24488,1.21993],[49.24278,1.22021],[49.239,1.22003],[49.2366,1.22472],[49.23635,1.22604],[49.2376,1.22642],[49.2381,1.22667],[49.23842,1.22707],[49.23891,1.22893],[49.23933,1.2297],[49.24672,1.24072],[49.24604,1.24268],[49.24547,1.24726],[49.2453,1.25167],[49.24542,1.25336],[49.24557,1.25364],[49.24679,1.25511],[49.252,1.25697],[49.25273,1.257],[49.25524,1.25657],[49.25667,1.2568],[49.25765,1.25674],[49.26025,1.25825],[49.26148,1.25853],[49.26455,1.25882],[49.26607,1.25868],[49.26712,1.25921],[49.26813,1.25947],[49.27037,1.25892],[49.27304,1.25911],[49.27477,1.25947],[49.27974,1.25914],[49.28101,1.25949],[49.28171,1.25986],[49.28241,1.25985],[49.28379,1.25951],[49.28489,1.25949],[49.28602,1.25971],[49.28629,1.26168],[49.28804,1.26205],[49.28958,1.26179],[49.29162,1.2609],[49.292,1.26023],[49.29259,1.25764],[49.29363,1.25683],[49.29634,1.25542],[49.29722,1.25472],[49.29836,1.25222],[49.2989,1.25139],[49.29955,1.25258],[49.30207,1.2505],[49.30283,1.24899],[49.30466,1.24694],[49.30606,1.24349],[49.30759,1.24098],[49.30816,1.23826],[49.30845,1.23814],[49.30863,1.23762],[49.30843,1.23531],[49.30887,1.23388],[49.30893,1.23262],[49.30947,1.2302],[49.30936,1.22872],[49.3091,1.22763],[49.30911,1.22773],[49.30882,1.22712],[49.30812,1.22654],[49.30694,1.22507],[49.30644,1.21944],[49.30616,1.21896],[49.30628,1.21798],[49.30599,1.21779],[49.30461,1.21807],[49.30291,1.21494],[49.3025,1.21455],[49.30195,1.21451],[49.3012,1.21414],[49.3011,1.2139],[49.3026,1.21026],[49.30259,1.20957],[49.30227,1.20857],[49.30198,1.20803],[49.30164,1.20787],[49.30139,1.20795],[49.30088,1.20859],[49.29933,1.20909],[49.29757,1.21027],[49.29704,1.21032],[49.29648,1.20979],[49.29551,1.21039],[49.2949,1.21126],[49.29312,1.21249],[49.29213,1.21344],[49.29018,1.21644],[49.28939,1.21478],[49.28799,1.21577],[49.28751,1.21589],[49.28737,1.2154],[49.28778,1.21063],[49.2877,1.21019],[49.28757,1.21019],[49.28699,1.21068],[49.28664,1.21139],[49.28618,1.21351],[49.28566,1.21453],[49.28521,1.21493],[49.28427,1.21531],[49.28307,1.21606],[49.28283,1.21626],[49.28258,1.21699],[49.28159,1.21736],[49.27916,1.21993],[49.27812,1.22037],[49.27612,1.22167],[49.27361,1.22359],[49.27229,1.21911]];

    // Points ravitaillement (km exacts depuis GPX)
    const RAVITOS = [
      { km: '9,7', coord: [49.20905, 1.18025], heure: '~10h13', lieu: 'Rond-point de Folleville', rdv: true }, // RDV au bord du rond-point, avant le ravito km 10
      { km: 20, coord: [49.23748, 1.18973], heure: '~11h15', lieu: 'Incarville' },
      { km: 30, coord: [49.27756, 1.25922], heure: '~12h15', lieu: 'Poses nord' },
    ];


    // ─── Itinéraires voiture — calculés sur le réseau OpenStreetMap réel ─────
    // Parcours marathon retiré du graphe (routes + intersections : aucune traversée à niveau,
    // seuls les ponts sont autorisés, ex. A13 au-dessus de la D313). Plus court chemin en temps.
    // Tracés figés : pas de recalcul OSRM.
    const PARK_KM10 = [49.20841,1.18257]; // Louviers est, avenue des Peupliers (rond-point du Béquet)
    const PARK_KM20 = [49.24091,1.19644]; // Petite route à l'est de la D313, sous l'A13 (même rive que le ravito)
    const PARK_KM30 = [49.27367,1.25606]; // Bord de route, chemin de Poses (cul-de-sac côté parcours)

    // Trajet 1 : A13 (depuis Paris) → sortie 18 Louviers-la-Roquette → D6155 → Louviers est
    const DRIVE_A = [[49.17357,1.24681],[49.17547,1.24483],[49.17732,1.24305],[49.18122,1.23972],[49.1847,1.23716],[49.18853,1.23454],[49.18958,1.23393],[49.19148,1.23329],[49.19195,1.23297],[49.19405,1.23214],[49.19472,1.23192],[49.19514,1.23192],[49.19539,1.23201],[49.19571,1.23234],[49.19681,1.23392],[49.197,1.2345],[49.19711,1.23456],[49.19723,1.23446],[49.19722,1.23417],[49.19697,1.23401],[49.1959,1.23243],[49.19563,1.23192],[49.19546,1.23132],[49.19542,1.23062],[49.19637,1.22245],[49.19648,1.22237],[49.19653,1.22221],[49.19643,1.22194],[49.19666,1.21988],[49.1971,1.21678],[49.19762,1.21219],[49.19823,1.20743],[49.19853,1.20668],[49.20103,1.20385],[49.20577,1.1928],[49.20636,1.19127],[49.20671,1.18988],[49.20768,1.18323],[49.20776,1.18293],[49.20801,1.18256],[49.20841,1.18257]];
    // Trajet 2 : D6155 → chemin de la Roquette → chaussée Decretot → D77 → rue de Crémonville
    const DRIVE_B = [[49.20841,1.18257],[49.20851,1.18241],[49.20851,1.18217],[49.20839,1.18201],[49.20827,1.18201],[49.20801,1.18256],[49.20776,1.18293],[49.20727,1.18613],[49.20735,1.18617],[49.20737,1.18638],[49.20815,1.18716],[49.20843,1.18758],[49.20906,1.18623],[49.20905,1.18592],[49.20934,1.18565],[49.20994,1.18556],[49.21152,1.18494],[49.21351,1.18362],[49.21382,1.18352],[49.21457,1.18355],[49.21479,1.18342],[49.21568,1.18222],[49.21611,1.18187],[49.21702,1.18137],[49.21911,1.18094],[49.21979,1.18105],[49.22026,1.1809],[49.2206,1.18128],[49.22073,1.18182],[49.22045,1.18278],[49.22045,1.18342],[49.22061,1.18394],[49.22125,1.18489],[49.2215,1.18554],[49.22153,1.18587],[49.22103,1.18723],[49.22093,1.18787],[49.22154,1.19163],[49.22222,1.19468],[49.22276,1.19612],[49.22335,1.19738],[49.22362,1.19817],[49.2243,1.20072],[49.22463,1.20136],[49.22505,1.20254],[49.22526,1.2034],[49.22567,1.20588],[49.22575,1.20808],[49.22582,1.20851],[49.22663,1.21122],[49.22668,1.21174],[49.22663,1.21188],[49.22665,1.21205],[49.22674,1.21216],[49.22685,1.21214],[49.22696,1.21244],[49.22706,1.2125],[49.2273,1.21247],[49.22774,1.21225],[49.22867,1.21213],[49.2357,1.2115],[49.23576,1.21096],[49.23584,1.21081],[49.23622,1.2105],[49.23651,1.21005],[49.2379,1.20723],[49.2395,1.20312],[49.24057,1.20079],[49.24063,1.20042],[49.24061,1.20005],[49.24024,1.19884],[49.24011,1.19816],[49.24054,1.19643],[49.24072,1.19628],[49.24091,1.19644]];
    // Trajet 3 : D77 → D6015 (pont au-dessus de la D313) → Val-de-Reuil → D71 → D110 → route de Poses
    const DRIVE_C = [[49.24091,1.19644],[49.24072,1.19628],[49.24054,1.19643],[49.24011,1.19816],[49.24013,1.19834],[49.24018,1.19859],[49.24024,1.19884],[49.24061,1.20005],[49.24063,1.20042],[49.24057,1.20079],[49.2395,1.20312],[49.23822,1.20647],[49.23742,1.20826],[49.23651,1.21005],[49.23622,1.2105],[49.23584,1.21081],[49.23565,1.21108],[49.23557,1.21141],[49.22813,1.2122],[49.22774,1.21225],[49.22717,1.21251],[49.22696,1.21244],[49.22688,1.21228],[49.22685,1.21214],[49.22694,1.21195],[49.22841,1.21124],[49.22915,1.21075],[49.22958,1.21036],[49.22997,1.20988],[49.23233,1.2063],[49.23343,1.20507],[49.23449,1.20414],[49.2355,1.20349],[49.23724,1.2026],[49.23824,1.20178],[49.23916,1.20058],[49.23935,1.20024],[49.23997,1.19903],[49.24026,1.19848],[49.24056,1.19794],[49.241,1.19728],[49.24482,1.19288],[49.24588,1.192],[49.24857,1.19012],[49.24881,1.19016],[49.2492,1.19051],[49.2497,1.19107],[49.24995,1.19148],[49.25023,1.19245],[49.25059,1.19316],[49.25079,1.19395],[49.25109,1.19471],[49.25133,1.19557],[49.25164,1.19626],[49.25191,1.19666],[49.25193,1.19689],[49.24932,1.20306],[49.24881,1.20451],[49.24856,1.20567],[49.24851,1.20616],[49.2485,1.20744],[49.24859,1.20881],[49.24851,1.20924],[49.24872,1.20958],[49.24891,1.21038],[49.25115,1.22305],[49.25158,1.22564],[49.25168,1.22651],[49.2517,1.22756],[49.25158,1.22881],[49.25074,1.23377],[49.25052,1.23472],[49.25016,1.23587],[49.25067,1.23619],[49.25282,1.23695],[49.25462,1.23708],[49.25622,1.2367],[49.26372,1.23436],[49.26459,1.2343],[49.26638,1.23452],[49.26687,1.23449],[49.26756,1.23427],[49.26852,1.23373],[49.26921,1.23348],[49.26965,1.23342],[49.27008,1.23624],[49.27111,1.24104],[49.27146,1.24439],[49.27226,1.25081],[49.27249,1.25191],[49.27285,1.25312],[49.2735,1.2549],[49.27367,1.25606]];

    // Trajets à pied calculés sur le réseau routier (ponts compris)
    const WALK_A = [[49.20841,1.18257],[49.20851,1.18241],[49.2086,1.18193],[49.20911,1.18079],[49.20911,1.18059],[49.20904,1.18039],[49.20905,1.18025]];
    const WALK_B = [[49.24091,1.19644],[49.2411,1.19657],[49.24121,1.19656],[49.24129,1.1964],[49.24129,1.19629],[49.24082,1.19437],[49.24084,1.19401],[49.24023,1.19307],[49.23904,1.1915],[49.23808,1.19032],[49.23735,1.18959],[49.23748,1.18973]];
    const WALK_C = [[49.27367,1.25606],[49.27399,1.25932],[49.27459,1.25949],[49.27756,1.25922]];

    container.innerHTML = '';
    container.style.background = '';
    _raceMapInstance = L.map(container, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_raceMapInstance);

    // ─── Helpers géométriques (distances en mètres, cap en degrés depuis le nord) ─
    const RAD = Math.PI / 180;
    const _d = function(a, b){ const dy = (b[0]-a[0]) * 110540, dx = (b[1]-a[1]) * 111320 * Math.cos(a[0]*RAD); return Math.sqrt(dx*dx + dy*dy); };
    const _cap = function(a, b){ return Math.atan2((b[1]-a[1]) * Math.cos(a[0]*RAD), b[0]-a[0]) / RAD; };
    const _len = function(line){ let L = 0; for(let i = 1; i < line.length; i++) L += _d(line[i-1], line[i]); return L; };
    const _along = function(line, every, offset){
      const out = []; let acc = 0, next = offset;
      for(let i = 1; i < line.length; i++){
        const a = line[i-1], b = line[i], d = _d(a, b);
        while(d > 0 && acc + d >= next){
          const f = (next - acc) / d;
          out.push({ p: [a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f], cap: _cap(a, b), at: next });
          next += every;
        }
        acc += d;
      }
      return out;
    };
    const _at = function(line, dist){ const r = _along(line, Infinity, Math.max(0, dist))[0]; return r ? r.p : line[line.length - 1]; };
    // Tracé avec liseré blanc dessous (lisibilité aux croisements)
    const _cased = function(line, color, weight, extra){
      const casing = L.polyline(line, { color: '#fff', weight: weight + 4, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false });
      const main = L.polyline(line, Object.assign({ color: color, weight: weight, opacity: 1, lineJoin: 'round', lineCap: 'round' }, extra || {}));
      return [casing, main];
    };

    // Parcours marathon — orange, fermé à la circulation
    // Parcours : rouge « route barrée » à tirets blancs (lisible aussi sans distinguer rouge/vert)
    const COURSE_RED = '#DC2626';
    const courseLayers = _cased(ROUTE, COURSE_RED, 6);
    courseLayers.push(L.polyline(ROUTE, { color: '#fff', weight: 2, opacity: 1, dashArray: '7 9', lineCap: 'butt', interactive: false }));
    courseLayers[1].bindPopup('<b>🚫 Parcours du marathon</b><br>Routes fermées à la circulation de 9h à 14h45<br>Ne pas l\'emprunter ni le traverser en voiture');
    courseLayers.forEach(function(l){ l.addTo(_raceMapInstance); });

    // Bornes kilométriques tous les 5 km (les km 10/20/30 sont les ravitos)
    const kmLayer = L.layerGroup();
    _along(ROUTE, 5000, 5000).forEach(function(k){
      const km = Math.round(k.at / 1000);
      if(km % 10 === 0) return;
      L.marker(k.p, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10],
        html: '<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:#fff;color:#B91C1C;font:800 9px/1 system-ui,sans-serif;border-radius:50%;border:2px solid #DC2626;">'+km+'</div>' }) }).addTo(kmLayer);
    });
    const _kmVis = function(){ if(_raceMapInstance.getZoom() >= 11) kmLayer.addTo(_raceMapInstance); else kmLayer.remove(); };
    _raceMapInstance.on('zoomend', _kmVis);

    // ─── Marqueurs (icônes centrées sur leur point) ──────────────────────────
    const SH = 'box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    const pill = function(text, bg, w){
      return L.divIcon({ className: '', iconSize: [w, 22], iconAnchor: [w / 2, 11],
        html: '<div style="height:22px;display:flex;align-items:center;justify-content:center;background:'+bg+';color:#fff;font:800 10.5px/1 system-ui,sans-serif;border-radius:11px;border:2px solid #fff;'+SH+'white-space:nowrap;">'+text+'</div>' });
    };
    const iRav = function(km){
      return L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: '<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:#1B4FD8;color:#fff;font:800 11px/1 system-ui,sans-serif;border-radius:50%;border:2.5px solid #fff;'+SH+'">'+km+'</div>' });
    };
    const iPark = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      html: '<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#fff;color:#1B4FD8;font:900 12px/1 system-ui,sans-serif;border-radius:6px;border:2px solid #1B4FD8;'+SH+'">P</div>' });

    L.marker(ROUTE[0], { icon: pill('Départ', '#B91C1C', 58) }).addTo(_raceMapInstance).bindPopup('<b>Départ — 9h15</b><br>Amfreville-sur-Iton');
    L.marker(ROUTE[ROUTE.length-1], { icon: pill('Arrivée', '#B91C1C', 60) }).addTo(_raceMapInstance).bindPopup('<b>Arrivée — 13h15–14h45</b><br>Val-de-Reuil');

    // ─── Trajets ─────────────────────────────────────────────────────────────
    const CAR = '#16A34A';
    const iArrow = function(cap){
      return L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
        html: '<div style="width:18px;height:18px;border-radius:50%;background:'+CAR+';border:2px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;transform:rotate('+cap.toFixed(0)+'deg);"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1L8.6 8.6L5 6.6L1.4 8.6Z" fill="#fff" stroke="#fff" stroke-width="0.8" stroke-linejoin="round"/></svg></div>' });
    };
    const iNum = function(n){
      return L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
        html: '<div style="width:24px;height:24px;border-radius:50%;background:'+CAR+';color:#fff;border:2.5px solid #fff;'+SH+'display:flex;align-items:center;justify-content:center;font:900 11.5px/1 system-ui,sans-serif;">'+n+'</div>' });
    };
    const TRAJETS = [
      { tab: 'Trajet 1', sub: 'A13 → km 10', drive: DRIVE_A, walk: WALK_A, park: PARK_KM10, rav: RAVITOS[0],
        km: '24,6 km', min: '16 min', marche: '200 m', from: 'depuis Gaillon',
        extra: [L.marker([49.1915, 1.2333], { icon: pill('A13 · sortie 18', '#1DA054', 104) }).bindPopup('<b>A13 — sortie 18</b><br>Louviers-la-Roquette')],
        steps: ['A13 depuis Paris, sortie 18 <b>Louviers-la-Roquette</b>',
                'D6155 vers Louviers sur ~4,5 km',
                'Se garer <b>avenue des Peupliers</b>, au rond-point du Béquet'],
        walkStep: '~200 m à pied (~3 min) : revenir au rond-point du Béquet, suivre la D6155 vers l\'ouest jusqu\'au <b>rond-point de Folleville</b>. Se placer au bord du rond-point, là où arrivent les coureurs (chemin du Roy) — sans aller sur le parcours' },
      { tab: 'Trajet 2', sub: 'km 10 → km 20', drive: DRIVE_B, walk: WALK_B, park: PARK_KM20, rav: RAVITOS[1],
        km: '6,9 km', min: '10 min', marche: '750 m', extra: [],
        steps: ['D6155 vers l\'est, puis <b>chemin de la Roquette</b>',
                '<b>Chaussée Decretot</b> puis ancien chemin Saint-Pierre',
                '<b>D77</b> puis rue de Crémonville',
                'Petite route vers l\'ouest : se garer avant la D313, sous l\'A13'],
        walkStep: '~750 m à pied : rejoindre la D313 et la longer vers le sud-ouest (même rive de l\'Eure, rien à traverser)' },
      { tab: 'Trajet 3', sub: 'km 20 → km 30', drive: DRIVE_C, walk: WALK_C, park: PARK_KM30, rav: RAVITOS[2],
        km: '12,8 km', min: '14 min', marche: '650 m', extra: [],
        steps: ['Rue de Crémonville puis <b>D77</b> vers le nord',
                '<b>D6015</b> vers Val-de-Reuil — elle passe en pont au-dessus du parcours',
                'Rue Bernard Chédeville puis <b>D71</b> vers l\'est',
                '<b>D110</b> vers le nord, puis route de Poses vers l\'est',
                'Se garer en bord de route, avant le barrage'],
        walkStep: '~650 m à pied jusqu\'au ravito (~8 min)' },
    ];
    TRAJETS.forEach(function(t, k){
      const drive = _cased(t.drive, CAR, 5);
      drive[1].bindPopup('<b>'+t.tab+' — '+t.sub+'</b><br>'+t.km+' · ~'+t.min);
      const walk = _cased(t.walk, '#1D4ED8', 3, { dashArray: '1 7', weight: 4 });
      walk[1].bindPopup('<b>À pied</b> ~'+t.marche);
      t.group = L.layerGroup(drive.concat(walk, [
        L.marker(t.rav.coord, { icon: iRav(t.rav.km), zIndexOffset: 500 }).bindPopup('<b>'+(t.rav.rdv ? 'Point de RDV' : 'Ravito')+' km '+t.rav.km+' — '+t.rav.lieu+'</b><br>Passage estimé : <b>'+t.rav.heure+'</b>'),
      ])).addTo(_raceMapInstance);

      const L_ = _len(t.drive);
      const every = Math.min(2500, Math.max(700, L_ / 6));
      const arrows = _along(t.drive, every, every / 2).map(function(a){
        const cap = _cap(_at(t.drive, a.at - 60), _at(t.drive, a.at + 60));
        return L.marker(a.p, { icon: iArrow(cap), interactive: false, keyboard: false });
      });
      t.detail = L.layerGroup([
        L.circleMarker(t.drive[0], { radius: 6, color: '#fff', weight: 3, fillColor: CAR, fillOpacity: 1 }).bindPopup('<b>Départ '+t.tab.toLowerCase()+'</b>'),
        L.marker(t.park, { icon: iPark, zIndexOffset: 400 }).bindPopup('<b>Stationnement km '+t.rav.km+'</b><br>~'+t.marche+' à pied jusqu\'au '+(t.rav.rdv ? 'point de RDV' : 'ravito')),
      ].concat(arrows, t.extra));

      const mid = _along(t.drive, L_, L_ * 0.5)[0];
      t.badge = L.layerGroup(mid ? [L.marker(mid.p, { icon: iNum(k + 1), zIndexOffset: 300 }).on('click', function(){ select(k + 1); })] : []);
      t.bounds = L.polyline(t.drive.concat(t.walk)).getBounds();
    });


    // ─── Bouton plein écran (dans la carte, sous forme de contrôle) ──────────
    const fsCtl = L.control({ position: 'topright' });
    fsCtl.onAdd = function(){
      const b = L.DomUtil.create('button', 'rm-fs');
      b.id = 'race-map-fs-btn';
      b.type = 'button';
      b.innerHTML = _FS_ICON_OPEN + '<span>Plein écran</span>';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', function(){ _toggleRaceMapFS(); });
      return b;
    };
    fsCtl.addTo(_raceMapInstance);

    // ─── Onglets + panneau d'étapes ──────────────────────────────────────────
    const tabsEl = document.getElementById('race-tabs');
    const infoEl = document.getElementById('race-info');
    const courseBounds = L.polyline(ROUTE).getBounds();
    const TABS = [{ tab: 'Vue d\'ensemble', sub: '3 ravitos' }].concat(TRAJETS);

    const sumEl = document.getElementById('race-fs-sum');
    function renderSum(i){
      if(!sumEl) return;
      const leg = '<div class="rm-sum-leg"><span><i class="course"></i>Parcours fermé</span><span><i class="car"></i>Voiture</span><span><i class="walk"></i>À pied</span></div>';
      if(i === 0){ sumEl.innerHTML = leg + '<b>3 trajets</b> · touchez un onglet pour voir un trajet'; return; }
      const t = TRAJETS[i - 1];
      sumEl.innerHTML = leg + '<b>'+t.tab+' · '+t.sub+'</b><br>🚗 '+t.km+' · ⏱ ~'+t.min+' · 🚶 '+t.marche+' · ravito '+t.rav.heure;
    }

    function renderInfo(i){
      renderSum(i);
      if(!infoEl) return;
      if(i === 0){
        infoEl.innerHTML = '<div class="rm-head"><b>Suivre la course en voiture</b><span>Dim. 18 oct. · départ 9h15</span></div>'
          + TRAJETS.map(function(t, k){
              return '<button type="button" class="rm-row" data-tab="'+(k+1)+'"><span class="n">'+(k+1)+'</span>'
                + '<span class="t"><b>'+t.sub+'</b> · '+t.rav.lieu+'</span>'
                + '<span class="m">'+t.km+' · '+t.min+'<br>passage '+t.rav.heure+'</span></button>';
            }).join('');
        infoEl.querySelectorAll('.rm-row').forEach(function(r){ r.onclick = function(){ select(+r.dataset.tab); }; });
        return;
      }
      const t = TRAJETS[i - 1];
      infoEl.innerHTML = '<div class="rm-head"><b>'+t.tab+' · '+t.sub+'</b><span>'+(t.rav.rdv ? 'RDV ' : 'Ravito ')+t.rav.lieu+' · '+t.rav.heure+'</span></div>'
        + '<div class="rm-stats"><span class="rm-stat">🚗 '+t.km+'</span><span class="rm-stat">⏱ ~'+t.min+(t.from ? ' '+t.from : '')+'</span><span class="rm-stat">🚶 '+t.marche+'</span></div>'
        + '<ol class="rm-steps">'+t.steps.map(function(s){ return '<li>'+s+'</li>'; }).join('')
        + '<li class="walk">'+t.walkStep+'</li></ol>';
    }

    let current = 0;
    _raceMapRefit = function(){
      const b = current === 0 ? courseBounds : TRAJETS[current - 1].bounds;
      const pad = _raceMapFullscreen ? { paddingTopLeft: [24, 90], paddingBottomRight: [24, 100] } : { padding: [24, 24] };
      _raceMapInstance.fitBounds(b, pad);
    };

    function select(i){
      current = i;
      if(tabsEl) tabsEl.querySelectorAll('.rm-tab').forEach(function(b, j){ b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      TRAJETS.forEach(function(t, k){
        if(i === 0 || k === i - 1) t.group.addTo(_raceMapInstance); else t.group.remove();
        if(k === i - 1) t.detail.addTo(_raceMapInstance); else t.detail.remove();
        if(i === 0) t.badge.addTo(_raceMapInstance); else t.badge.remove();
      });
      _raceMapRefit();
      renderInfo(i);
    }

    if(tabsEl){
      const _tabsEnd = function(){ tabsEl.classList.toggle('at-end', tabsEl.scrollLeft + tabsEl.clientWidth >= tabsEl.scrollWidth - 2); };
      tabsEl.addEventListener('scroll', _tabsEnd, { passive: true });
      window.addEventListener('resize', _tabsEnd);
      setTimeout(_tabsEnd, 0);
      tabsEl.innerHTML = '';
      TABS.forEach(function(t, i){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rm-tab';
        b.setAttribute('role', 'tab');
        b.innerHTML = '<b>'+t.tab+'</b><span>'+t.sub+'</span>';
        b.onclick = function(){ select(i); b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); };
        tabsEl.appendChild(b);
      });
    }
    select(0);
  }

  // Chargement dynamique de Leaflet
  if(window.L){ _buildMap(); return; }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  script.onload = _buildMap;
  script.onerror = () => { container.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Impossible de charger la carte.</p>'; };
  document.head.appendChild(script);
}
