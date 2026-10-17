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
  if(!_raceMapFullscreen && typeof RaceNav !== 'undefined' && RaceNav.active()) RaceNav.stop(true);
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
      { km: 10, coord: [49.20905, 1.18025], heure: '~10h01', lieu: 'Rond-point de Folleville', rdv: true, side: 's' }, // RDV au bord du rond-point, avant le ravito km 10
      { km: 20, coord: [49.23748, 1.18973], heure: '~10h55', lieu: 'D313 sous l\'A13', side: 's' },
      { km: 30, coord: [49.27160, 1.25909], heure: '~11h44', lieu: '24 route de Portejoie', addr: '24 route de Portejoie', rdv: true, side: 's' }, // devant la maison de Guillaume (≈ km 29,4, la famille y attend)
    ];


    // ─── Itinéraires voiture — calculés sur le réseau OpenStreetMap réel ─────
    // Parcours marathon retiré du graphe (routes + intersections : aucune traversée à niveau,
    // seuls les ponts sont autorisés, ex. A13 au-dessus de la D313). Plus court chemin en temps.
    // Tracés figés : pas de recalcul OSRM.
    const PARK_KM10 = [49.20633,1.18227]; // Rue Dutens (Louviers est) — rue de Paris et rond-point du Béquet fermés 8h-13h (arrêté DPSU26-495AMA)
    const PARK_KM20 = [49.24091,1.19644]; // Petite route à l'est de la D313, sous l'A13 (même rive que le ravito)
    const PARK_KM30 = [49.27367,1.25606]; // Bord de route, chemin de Poses (cul-de-sac côté parcours)

    // Trajet 1 : A13 (depuis Paris) → sortie 18 → D6155 → chaussée de Paris → D164 route de Pacy → rue Dutens
    const DRIVE_A = [[49.17357,1.24681],[49.17547,1.24483],[49.17732,1.24305],[49.18122,1.23972],[49.1847,1.23716],[49.18853,1.23454],[49.18958,1.23393],[49.19148,1.23329],[49.19195,1.23297],[49.19405,1.23214],[49.19472,1.23192],[49.19514,1.23192],[49.19539,1.23201],[49.19571,1.23234],[49.19681,1.23392],[49.197,1.2345],[49.19711,1.23456],[49.19723,1.23446],[49.19722,1.23417],[49.19697,1.23401],[49.1959,1.23243],[49.19563,1.23192],[49.19546,1.23132],[49.19542,1.23062],[49.19637,1.22245],[49.19648,1.22237],[49.19653,1.22221],[49.19643,1.22194],[49.19666,1.21988],[49.1971,1.21678],[49.19762,1.21219],[49.19823,1.20743],[49.19853,1.20668],[49.20103,1.20385],[49.20577,1.1928],[49.20636,1.19127],[49.20671,1.18988],[49.20744,1.18497],[49.20622,1.18513],[49.20633,1.18227]];
    // Trajet 2 : rue Dutens → D164 → D6155 → Vironvay (route de Louviers, route des Saisons) → D6015 → D77 → rue de Crémonville
    // (évite l'ancien chemin Saint-Pierre, fermé 8h-13h à Louviers)
    const DRIVE_B = [[49.20633,1.18227],[49.20622,1.18513],[49.20744,1.18497],[49.20742,1.18515],[49.20671,1.18988],[49.20653,1.1907],[49.20577,1.1928],[49.20479,1.19504],[49.20513,1.19533],[49.20512,1.19541],[49.20439,1.19704],[49.20416,1.19768],[49.20396,1.19849],[49.20344,1.2013],[49.20322,1.20296],[49.20314,1.20433],[49.20326,1.20622],[49.20436,1.2095],[49.20547,1.21496],[49.20603,1.2174],[49.20612,1.21823],[49.20609,1.2184],[49.20638,1.2197],[49.20648,1.2201],[49.20697,1.22114],[49.20731,1.22227],[49.20739,1.22291],[49.20772,1.22389],[49.20797,1.22525],[49.21994,1.21473],[49.22096,1.21394],[49.22209,1.2133],[49.22327,1.21285],[49.22549,1.2124],[49.22665,1.21205],[49.22674,1.21216],[49.22685,1.21214],[49.22696,1.21244],[49.22717,1.21251],[49.22774,1.21225],[49.22867,1.21213],[49.2357,1.2115],[49.23576,1.21096],[49.23584,1.21081],[49.23622,1.2105],[49.23651,1.21005],[49.2379,1.20723],[49.2395,1.20312],[49.24057,1.20079],[49.24063,1.20042],[49.24061,1.20005],[49.24024,1.19884],[49.24011,1.19816],[49.24054,1.19643],[49.24072,1.19628],[49.24091,1.19644]];
    // Trajet 3 : D77 → D6015 (pont) → D6154 / avenue des Falaises ouest → chaussée du Village → route de Seine → Tournedos
    // (évite le 1er km du semi-marathon au Vaudreuil et la portion fermée de l'avenue des Falaises)
    const DRIVE_C = [[49.24091,1.19644],[49.24072,1.19628],[49.24054,1.19643],[49.24011,1.19816],[49.24013,1.19834],[49.24018,1.19859],[49.24024,1.19884],[49.24061,1.20005],[49.24063,1.20042],[49.24057,1.20079],[49.2395,1.20312],[49.23822,1.20647],[49.23742,1.20826],[49.23651,1.21005],[49.23622,1.2105],[49.23584,1.21081],[49.23565,1.21108],[49.23557,1.21141],[49.22813,1.2122],[49.22774,1.21225],[49.22717,1.21251],[49.22696,1.21244],[49.22688,1.21228],[49.22685,1.21214],[49.22694,1.21195],[49.22841,1.21124],[49.22915,1.21075],[49.22958,1.21036],[49.22997,1.20988],[49.23233,1.2063],[49.23343,1.20507],[49.23449,1.20414],[49.2355,1.20349],[49.23724,1.2026],[49.23824,1.20178],[49.23916,1.20058],[49.23935,1.20024],[49.23997,1.19903],[49.24026,1.19848],[49.24056,1.19794],[49.241,1.19728],[49.24453,1.19319],[49.24511,1.1926],[49.24624,1.19174],[49.24846,1.19022],[49.24951,1.18921],[49.25002,1.18854],[49.25045,1.1882],[49.25071,1.18821],[49.25098,1.18843],[49.25202,1.18956],[49.25228,1.18954],[49.25247,1.18928],[49.25267,1.18917],[49.25296,1.1893],[49.2539,1.19088],[49.2542,1.19161],[49.25427,1.19208],[49.25437,1.19218],[49.25467,1.19224],[49.25486,1.19242],[49.25573,1.19389],[49.25724,1.19581],[49.25802,1.19654],[49.25935,1.19756],[49.25942,1.19772],[49.26117,1.1987],[49.26307,1.19959],[49.2639,1.20008],[49.26513,1.20106],[49.26613,1.20214],[49.26676,1.20298],[49.26676,1.20313],[49.26664,1.20339],[49.26479,1.20503],[49.26411,1.20592],[49.26367,1.20677],[49.26353,1.20715],[49.26332,1.20793],[49.26318,1.20878],[49.26314,1.20958],[49.26328,1.21144],[49.26324,1.21155],[49.26331,1.21163],[49.26347,1.21334],[49.26367,1.21454],[49.26438,1.21765],[49.26449,1.22208],[49.26443,1.22332],[49.26445,1.22423],[49.26449,1.22447],[49.26473,1.22473],[49.26822,1.22699],[49.26824,1.22724],[49.26925,1.23028],[49.26932,1.23063],[49.26943,1.23224],[49.27008,1.23624],[49.27111,1.24104],[49.27146,1.24439],[49.27226,1.25081],[49.27249,1.25191],[49.27285,1.25312],[49.2735,1.2549],[49.27367,1.25606]];

    // Trajets à pied calculés sur le réseau routier (ponts compris)
    const WALK_A = [[49.20633,1.18227],[49.20633,1.18219],[49.207,1.18204],[49.20801,1.18256],[49.20822,1.18206],[49.20833,1.18199],[49.20845,1.18205],[49.2086,1.18193],[49.20911,1.18079],[49.20905,1.18025]];
    const WALK_B = [[49.24091,1.19644],[49.2411,1.19657],[49.24121,1.19656],[49.24129,1.1964],[49.24129,1.19629],[49.24082,1.19437],[49.24084,1.19401],[49.24023,1.19307],[49.23904,1.1915],[49.23808,1.19032],[49.23735,1.18959],[49.23748,1.18973]];
    const WALK_C = [[49.27367,1.25606],[49.27399,1.25932],[49.27303,1.25911],[49.27160,1.25909]];

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
    courseLayers[1].bindPopup('<b>🚫 Parcours du marathon</b><br>Routes fermées à la circulation (8h–15h selon les arrêtés)<br>Ne pas l\'emprunter ni le traverser en voiture');
    courseLayers.forEach(function(l){ l.addTo(_raceMapInstance); });

    // Bornes kilométriques tous les 5 km (les km 10/20/30 sont les ravitos)
    const kmLayer = L.layerGroup();
    _along(ROUTE, 5000, 5000).forEach(function(k){
      const km = Math.round(k.at / 1000);
      if(km % 10 === 0) return;
      L.marker(k.p, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10],
        html: '<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:#fff;color:#B91C1C;font:800 9px/1 system-ui,sans-serif;border-radius:50%;border:2px solid #DC2626;">'+km+'</div>' }) }).addTo(kmLayer);
    });
    const _kmVis = function(){ if(_raceMapInstance.getZoom() >= 12) kmLayer.addTo(_raceMapInstance); else kmLayer.remove(); };
    _raceMapInstance.on('zoomend', _kmVis);

    // ─── Marqueurs (icônes centrées sur leur point) ──────────────────────────
    const SH = 'box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    const pill = function(text, bg, w, ax){
      return L.divIcon({ className: '', iconSize: [w, 22], iconAnchor: [ax === undefined ? w / 2 : ax, 11],
        html: '<div style="height:22px;display:flex;align-items:center;justify-content:center;background:'+bg+';color:#fff;font:800 10.5px/1 system-ui,sans-serif;border-radius:11px;border:2px solid #fff;'+SH+'white-space:nowrap;">'+text+'</div>' });
    };
    // Pastille du point + étiquette « Passage ~hh:mm » dans la même icône (aucun débordement)
    const iRav = function(km, heure, side, addr){
      const dot = '<div style="flex:0 0 30px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:#1B4FD8;color:#fff;font:800 11px/1 system-ui,sans-serif;border-radius:50%;border:2.5px solid #fff;box-sizing:border-box;'+SH+'">'+km+'</div>';
      if(!heure) return L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: dot });
      const LW = 112;
      const lab = '<div style="height:22px;padding:0 8px;display:flex;align-items:center;gap:4px;background:#fff;color:#1B4FD8;font:700 11px/1 system-ui,sans-serif;border-radius:11px;border:1.5px solid #1B4FD8;white-space:nowrap;box-sizing:border-box;'+SH+'">Passage <b style="font-weight:900;">'+heure+'</b></div>';
      if(side === 's' && addr){
        // point chez un proche : l'adresse au-dessus de l'heure de passage
        const AW = 156, lab2 = '<div style="padding:4px 9px;display:flex;flex-direction:column;align-items:center;gap:3px;background:#fff;color:#1B4FD8;font:700 11px/1.1 system-ui,sans-serif;border-radius:10px;border:1.5px solid #1B4FD8;white-space:nowrap;box-sizing:border-box;'+SH+'"><b style="font-weight:900;color:#0C447C;font-size:11.5px;">'+addr+'</b><span>Passage <b style="font-weight:900;">'+heure+'</b></span></div>';
        return L.divIcon({ className: '', iconSize: [AW, 74], iconAnchor: [AW / 2, 15],
          html: '<div style="width:'+AW+'px;display:flex;flex-direction:column;align-items:center;gap:4px;">'+dot+lab2+'</div>' });
      }
      if(side === 's'){
        return L.divIcon({ className: '', iconSize: [LW, 56], iconAnchor: [LW / 2, 15],
          html: '<div style="width:'+LW+'px;display:flex;flex-direction:column;align-items:center;gap:4px;">'+dot+lab+'</div>' });
      }
      const W = 30 + 4 + LW;
      return L.divIcon({ className: '', iconSize: [W, 30], iconAnchor: [side === 'w' ? W - 15 : 15, 15],
        html: '<div style="width:'+W+'px;height:30px;display:flex;align-items:center;gap:4px;flex-direction:'+(side === 'w' ? 'row-reverse' : 'row')+';justify-content:flex-start;">'+dot+lab+'</div>' });
    };
    const iRavCompact = function(km, heure){
      const W = 84;
      return L.divIcon({ className: '', iconSize: [W, 26], iconAnchor: [13, 13],
        html: '<div style="width:'+W+'px;height:26px;display:flex;align-items:center;background:#fff;border:2px solid #1B4FD8;border-radius:13px;box-sizing:border-box;overflow:hidden;'+SH+'">'
          + '<span style="flex:0 0 auto;min-width:24px;height:100%;padding:0 5px;display:flex;align-items:center;justify-content:center;background:#1B4FD8;color:#fff;font:800 11px/1 system-ui,sans-serif;">'+km+'</span>'
          + '<span style="flex:1;text-align:center;color:#1B4FD8;font:800 11.5px/1 system-ui,sans-serif;white-space:nowrap;">'+heure.replace('~', '')+'</span></div>' });
    };
    const iPark = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      html: '<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#fff;color:#1B4FD8;font:900 12px/1 system-ui,sans-serif;border-radius:6px;border:2px solid #1B4FD8;'+SH+'">P</div>' });

    L.marker(ROUTE[0], { icon: pill('Départ · 9h15', '#B91C1C', 96) }).addTo(_raceMapInstance).bindPopup('<b>Départ — 9h15</b><br>Amfreville-sur-Iton');
    L.marker(ROUTE[ROUTE.length-1], { icon: pill('Arrivée · ~12h48', '#B91C1C', 112, 104) }).addTo(_raceMapInstance).bindPopup('<b>Arrivée — Val-de-Reuil</b><br>Passage estimé : <b>~12h48</b> (objectif 3h38, 5 min de marge)');

    // ─── Trajets ─────────────────────────────────────────────────────────────
    // Une nuance de vert par trajet, très différentes en clarté (foncé / franc / clair)
    const CARS = [
      { c: '#14532D', ink: '#fff', casing: '#fff' },
      { c: '#16A34A', ink: '#fff', casing: '#fff' },
      { c: '#A3E635', ink: '#1A2E05', casing: '#3F6212' },
    ];
    const iArrow = function(cap, col){
      return L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
        html: '<div style="width:18px;height:18px;border-radius:50%;background:'+col.c+';border:2px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;transform:rotate('+cap.toFixed(0)+'deg);"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1L8.6 8.6L5 6.6L1.4 8.6Z" fill="'+col.ink+'" stroke="'+col.ink+'" stroke-width="0.8" stroke-linejoin="round"/></svg></div>' });
    };
    const iNum = function(n, col){
      return L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
        html: '<div style="width:24px;height:24px;border-radius:50%;background:'+col.c+';color:'+col.ink+';border:2.5px solid #fff;'+SH+'display:flex;align-items:center;justify-content:center;font:900 11.5px/1 system-ui,sans-serif;">'+n+'</div>' });
    };
    const TRAJETS = [
      { tab: 'Trajet 1', sub: 'A13 → km 10', drive: DRIVE_A, walk: WALK_A, park: PARK_KM10, rav: RAVITOS[0],
        km: '24,7 km', min: '16 min', marche: '430 m', from: 'depuis Gaillon',
        extra: [L.marker([49.1915, 1.2333], { icon: pill('A13 · sortie 18', CARS[0].c, 104) }).bindPopup('<b>A13 — sortie 18</b><br>Louviers-la-Roquette')],
        nav: [[49.1999, 1.20515], [49.20672, 1.18507]],
        steps: ['Depuis votre adresse, le GPS mène à l\'<b>A13 direction Rouen</b> ; dès Flins il suit le trajet sûr, puis sortie 18 <b>Louviers-la-Roquette</b>',
                'D6155 vers Louviers (route de Paris puis chaussée de Paris)',
                'Avant la rue de Paris (<b>fermée 8h–13h</b>), à gauche <b>route de Pacy (D164)</b>',
                'À droite <b>rue Dutens</b> : se garer'],
        walkStep: '~430 m à pied (~6 min) : rue de l\'Adjudant-Chef Mourad, rue de Paris et rond-point du Béquet (fermés aux voitures, ouverts aux piétons), puis la D6155 jusqu\'au <b>rond-point de Folleville</b>. Se placer au bord, là où arrivent les coureurs (chemin du Roy)' },
      { tab: 'Trajet 2', sub: 'km 10 → km 20', drive: DRIVE_B, walk: WALK_B, park: PARK_KM20, rav: RAVITOS[1],
        km: '8,2 km', min: '11 min', marche: '750 m', extra: [],
        nav: [[49.21107, 1.22249]],
        steps: ['Rue Dutens, à gauche <b>route de Pacy</b>, puis à droite <b>D6155</b> vers l\'est',
                'À droite <b>route de Louviers à Vironvay</b>, puis route des Saisons',
                '<b>D6015</b> vers le nord, puis au rond-point 1ʳᵉ sortie : <b>D77</b>',
                'À gauche <b>rue de Crémonville</b>, puis petite route vers l\'ouest : se garer avant la D313, sous l\'A13'],
        walkStep: '~750 m à pied : rejoindre la D313 et la longer vers le sud-ouest (même rive de l\'Eure, rien à traverser)' },
      { tab: 'Trajet 3', sub: 'km 20 → km 30', drive: DRIVE_C, walk: WALK_C, park: PARK_KM30, rav: RAVITOS[2],
        km: '12,1 km', min: '14 min', marche: '500 m', extra: [],
        nav: [[49.2387, 1.20124], [49.25573, 1.19389]],
        steps: ['Repartir vers l\'est par la petite route, puis <b>rue de Crémonville</b> et <b>D77</b>',
                'Au rond-point, 1ʳᵉ sortie : <b>D6015</b> vers Val-de-Reuil — elle passe en pont au-dessus du parcours',
                '<b>D6154</b> puis, au rond-point, <b>avenue des Falaises</b> (partie ouest, ouverte)',
                'Au rond-point, <b>chaussée du Village</b>, puis au suivant <b>route de Seine</b> (déviation officielle)',
                'Serrer à droite sur la <b>route de Tournedos</b> (ouverte vers Val-de-Reuil) ; se garer en bord de route, hors de la zone de croisement et de demi-tour des bus'],
        walkStep: '~500 m à pied (~7 min) : descendre la route de Tournedos jusqu\'au carrefour, puis à droite sur la <b>route de Portejoie</b> (parcours, sur le bas-côté) jusqu\'au <b>n°24</b>, devant la maison où attend la famille de Guillaume. Traverser prudemment entre deux coureurs pour rejoindre le côté de la maison (est)' },
    ];
    TRAJETS.forEach(function(t, k){
      t.col = CARS[k];
      const drive = _cased(t.drive, t.col.c, 5);
      drive[0].setStyle({ color: t.col.casing, weight: t.col.casing === '#fff' ? 9 : 7 });
      drive[1].bindPopup('<b>'+t.tab+' — '+t.sub+'</b><br>'+t.km+' · ~'+t.min);
      const walk = _cased(t.walk, '#1D4ED8', 3, { dashArray: '1 7', weight: 4 });
      walk[1].bindPopup('<b>À pied</b> ~'+t.marche);
      t.group = L.layerGroup(drive.concat(walk, [
        (t.ravMarker = L.marker(t.rav.coord, { icon: iRav(t.rav.km, t.rav.heure, t.rav.side, t.rav.addr), zIndexOffset: 500 })).bindPopup('<b>'+(t.rav.rdv ? 'Point de RDV' : 'Ravito')+' km '+t.rav.km+' — '+t.rav.lieu+'</b><br>Passage estimé : <b>'+t.rav.heure+'</b>'),
      ])).addTo(_raceMapInstance);

      const L_ = _len(t.drive);
      const every = Math.min(2500, Math.max(700, L_ / 6));
      const arrows = _along(t.drive, every, every / 2).map(function(a){
        const cap = _cap(_at(t.drive, a.at - 60), _at(t.drive, a.at + 60));
        return L.marker(a.p, { icon: iArrow(cap, t.col), interactive: false, keyboard: false });
      });
      t.detail = L.layerGroup([
        L.circleMarker(t.drive[0], { radius: 6, color: '#fff', weight: 3, fillColor: t.col.c, fillOpacity: 1 }).bindPopup('<b>Départ '+t.tab.toLowerCase()+'</b>'),
        (t.parkLeader = L.polyline([t.park, t.park], { color: '#1B4FD8', weight: 1.5, opacity: 0.9, interactive: false })),
        (t.parkMarker = L.marker(t.park, { icon: iPark, zIndexOffset: 450 })).bindPopup('<b>Stationnement km '+t.rav.km+'</b><br>~'+t.marche+' à pied jusqu\'au '+(t.rav.rdv ? 'point de RDV' : 'ravito')),
      ].concat(arrows, t.extra));

      const mid = _along(t.drive, L_, L_ * 0.5)[0];
      t.badge = L.layerGroup(mid ? [L.marker(mid.p, { icon: iNum(k + 1, t.col), zIndexOffset: 300 }).on('click', function(){ select(k + 1); })] : []);
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

    // ─── Localisation en direct + suivi de progression ───────────────────────
    const _LOC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
    const gps = { watch: null, follow: false, fix: null, marker: null, circle: null, btn: null };
    const gpsEl = document.createElement('div');
    gpsEl.className = 'rm-gps'; gpsEl.setAttribute('aria-live', 'polite'); gpsEl.hidden = true;
    container.parentNode.insertBefore(gpsEl, container);

    // Projection d'un point sur une polyligne (mètres) : distance au tracé, distance parcourue, longueur totale
    const _proj = function(line, p){
      const kx = 111320 * Math.cos(p[0] * RAD), ky = 110540;
      let best = { dist: Infinity, along: 0 }, acc = 0;
      for(let i = 1; i < line.length; i++){
        const ax = (line[i-1][1] - p[1]) * kx, ay = (line[i-1][0] - p[0]) * ky;
        const bx = (line[i][1] - p[1]) * kx, by = (line[i][0] - p[0]) * ky;
        const dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy, seg = Math.sqrt(L2);
        const u = L2 ? Math.max(0, Math.min(1, -(ax*dx + ay*dy) / L2)) : 0;
        const d = Math.hypot(ax + u*dx, ay + u*dy);
        if(d < best.dist) best = { dist: d, along: acc + u * seg };
        acc += seg;
      }
      best.total = acc;
      return best;
    };
    const _fmtD = function(m){ return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : (Math.round(m / 10) * 10) + ' m'; };

    const _gpsStatus = function(){
      const f = gps.fix; if(!f) return;
      const p = [f.lat, f.lon];
      const list = current > 0 ? [TRAJETS[current - 1]] : TRAJETS;
      let best = null;
      list.forEach(function(t, k){
        const dr = _proj(t.drive, p), dw = _proj(t.walk, p);
        const c = { t: t, n: current > 0 ? current : k + 1, dr: dr, dw: dw, d: Math.min(dr.dist, dw.dist) };
        if(!best || c.d < best.d) best = c;
      });
      const onCourse = _proj(ROUTE, p).dist < 25 && f.speed !== null && f.speed > 4;
      const dest = function(t){ return t.rav.rdv ? 'point de RDV' : 'ravito'; };
      let cls = 'ok', html;
      if(onCourse){
        cls = 'alert';
        html = '<b>⚠️ Vous êtes sur le parcours fermé.</b> Quittez-le dès que possible et rejoignez le tracé vert.';
      } else if(best.dw.dist <= 60 && best.dw.dist <= best.dr.dist){
        const rest = Math.max(0, best.dw.total - best.dw.along);
        html = rest < 40 ? '<b>📍 Vous y êtes</b> · ' + dest(best.t) + ' ' + best.t.rav.lieu + ' · passage ' + best.t.rav.heure
                         : '<b>🚶 Encore ' + _fmtD(rest) + ' à pied</b> jusqu\'au ' + dest(best.t) + ' · passage ' + best.t.rav.heure;
      } else if(best.dr.dist <= 120){
        const rest = Math.max(0, best.dr.total - best.dr.along);
        const min = Math.max(1, Math.round(parseInt(best.t.min, 10) * rest / best.dr.total));
        html = rest < 60 ? '<b>🅿 Vous êtes au stationnement</b> · puis ' + best.t.marche + ' à pied'
                         : '<b>🚗 Trajet ' + best.n + ' · encore ' + _fmtD(rest) + '</b> (~' + min + ' min) jusqu\'au stationnement';
      } else if(current > 0 && best.d > 3000){
        html = '<b>📍 Stationnement à ' + _fmtD(_d(p, best.t.park)) + '</b> à vol d\'oiseau · lancez le « Guidage GPS » ci-dessous pour y aller.';
      } else if(current > 0){
        cls = 'warn';
        html = '<b>📍 Hors du trajet ' + current + '</b> · stationnement à ' + _fmtD(_d(p, best.t.park)) + ' à vol d\'oiseau. Rejoignez le tracé vert.';
      } else {
        html = '<b>📍 Position affichée</b> · choisissez votre trajet en haut pour suivre la distance restante.';
      }
      if(f.acc > 150) html += ' <span class="acc">(précision ±' + Math.round(f.acc) + ' m)</span>';
      gpsEl.className = 'rm-gps ' + cls; gpsEl.innerHTML = html; gpsEl.hidden = false;
    };

    const _gpsBtnState = function(){
      if(!gps.btn) return;
      gps.btn.classList.toggle('on', !!gps.watch);
      gps.btn.classList.toggle('follow', !!gps.watch && gps.follow);
      gps.btn.setAttribute('aria-label', !gps.watch ? 'Afficher ma position' : gps.follow ? 'Arrêter la localisation' : 'Centrer sur ma position');
      gps.btn.title = gps.btn.getAttribute('aria-label');
    };

    const _gpsOnPos = function(pos){
      const c = pos.coords, first = !gps.fix;
      gps.fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed, heading: c.heading };
      const ll = [c.latitude, c.longitude];
      const head = (c.heading !== null && !isNaN(c.heading) && c.speed > 1)
        ? '<div class="rm-me-head" style="transform:rotate(' + Math.round(c.heading) + 'deg)"></div>' : '';
      const icon = L.divIcon({ className: '', iconSize: [44, 44], iconAnchor: [22, 22], html: '<div class="rm-me">' + head + '<div class="rm-me-dot"></div></div>' });
      if(!gps.marker){
        gps.circle = L.circle(ll, { radius: c.accuracy, color: '#1A73E8', weight: 1, opacity: 0.4, fillColor: '#1A73E8', fillOpacity: 0.1, interactive: false }).addTo(_raceMapInstance);
        gps.marker = L.marker(ll, { icon: icon, zIndexOffset: 1000, keyboard: false }).addTo(_raceMapInstance).bindPopup('<b>Vous êtes ici</b>');
      } else {
        gps.marker.setLatLng(ll).setIcon(icon);
        gps.circle.setLatLng(ll).setRadius(c.accuracy);
      }
      if(gps.follow){
        if(first) _raceMapInstance.setView(ll, Math.max(_raceMapInstance.getZoom(), 15));
        else _raceMapInstance.panTo(ll, { animate: true });
      }
      _gpsStatus();
    };
    const _gpsOnErr = function(err){
      gpsEl.className = 'rm-gps warn'; gpsEl.hidden = false;
      gpsEl.innerHTML = err.code === 1
        ? '<b>Localisation refusée.</b> Autorisez-la pour ce site dans les réglages du téléphone (iPhone : Réglages › Confidentialité › Service de localisation › Safari).'
        : '<b>Position introuvable pour l\'instant.</b> Nouvel essai en cours…';
      if(err.code === 1) _gpsStop();
    };
    const _gpsStart = function(){
      if(!navigator.geolocation){ gpsEl.className = 'rm-gps warn'; gpsEl.hidden = false; gpsEl.innerHTML = 'La localisation n\'est pas disponible sur cet appareil.'; return; }
      gps.follow = true;
      gpsEl.className = 'rm-gps'; gpsEl.hidden = false; gpsEl.innerHTML = '📍 Recherche de votre position…';
      gps.watch = navigator.geolocation.watchPosition(_gpsOnPos, _gpsOnErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      _gpsBtnState();
    };
    const _gpsStop = function(){
      if(gps.watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(gps.watch);
      gps.watch = null; gps.follow = false; gps.fix = null;
      if(gps.marker){ gps.marker.remove(); gps.circle.remove(); gps.marker = gps.circle = null; }
      if(!gpsEl.classList.contains('warn')) gpsEl.hidden = true;
      _gpsBtnState();
    };
    _raceMapInstance.on('dragstart', function(){ if(gps.follow){ gps.follow = false; _gpsBtnState(); } });

    const locCtl = L.control({ position: 'topleft' });
    locCtl.onAdd = function(){
      const b = L.DomUtil.create('button', 'rm-loc');
      b.type = 'button'; b.innerHTML = _LOC_ICON;
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', function(){
        if(!gps.watch) _gpsStart();
        else if(!gps.follow){ gps.follow = true; if(gps.fix) _raceMapInstance.setView([gps.fix.lat, gps.fix.lon], Math.max(_raceMapInstance.getZoom(), 15)); }
        else _gpsStop();
        _gpsBtnState();
      });
      gps.btn = b; _gpsBtnState();
      return b;
    };
    locCtl.addTo(_raceMapInstance);

    // ─── Onglets + panneau d'étapes ──────────────────────────────────────────
    const tabsEl = document.getElementById('race-tabs');
    const infoEl = document.getElementById('race-info');
    const courseBounds = L.polyline(ROUTE).getBounds();
    const TABS = [{ tab: 'Les 3 trajets', sub: 'parcours complet' }].concat(TRAJETS);

    const sumEl = document.getElementById('race-fs-sum');
    function renderSum(i){
      if(!sumEl) return;
      const leg = '<div class="rm-sum-leg"><span><i class="course"></i>Parcours fermé</span><span><i class="car"></i>Voiture</span><span><i class="walk"></i>À pied</span></div>';
      if(i === 0){ sumEl.innerHTML = leg + '<b>Choisissez votre trajet</b> · touchez Trajet 1, 2 ou 3 en haut'; return; }
      const t = TRAJETS[i - 1];
      sumEl.innerHTML = leg + '<b>'+t.tab+' · '+t.sub+'</b><br>🚗 '+t.km+' · ⏱ ~'+t.min+' · 🚶 '+t.marche+' · ravito '+t.rav.heure
        + '<button type="button" class="rm-nav sm" onclick="RaceNav.start('+t.rav.km+')">▶ Me guider</button>';
    }

    function renderInfo(i){
      renderSum(i);
      if(!infoEl) return;
      if(i === 0){
        infoEl.innerHTML = '<div class="rm-guide"><b>🧭 Me guider jusqu\'au point</b><span>GPS intégré, guidage vocal, évite les routes fermées</span><div class="rm-guide-btns">'
          + TRAJETS.map(function(t){ const k = t.rav.km; return '<button type="button" onclick="RaceNav.start('+k+')"><b>'+('km '+t.rav.km)+'</b><span>passage '+t.rav.heure+'</span></button>'; }).join('')
          + '</div></div>'
          + '<div class="rm-head"><b>Choisissez votre trajet</b><span>Dim. 18 oct. · départ 9h15</span></div>'
          + '<p class="rm-hint">Touchez un trajet pour voir les étapes, où se garer et le chemin à pied.<br>Heures de passage estimées d\'après le plan de course (objectif 3h38, départ 9h15), avancées de 5 min pour garder une marge.</p>'
          + TRAJETS.map(function(t, k){
              return '<button type="button" class="rm-row" data-tab="'+(k+1)+'"><span class="n" style="background:'+t.col.c+';color:'+t.col.ink+'">'+(k+1)+'</span>'
                + '<span class="t"><b>'+t.sub+'</b> · '+t.rav.lieu+'</span>'
                + '<span class="m">'+t.km+' · '+t.min+'<br>passage '+t.rav.heure+'</span><span class="chev" aria-hidden="true">›</span></button>';
            }).join('');
        infoEl.querySelectorAll('.rm-row').forEach(function(r){ r.onclick = function(){ select(+r.dataset.tab); }; });
        return;
      }
      const t = TRAJETS[i - 1];
      infoEl.innerHTML = '<div class="rm-head"><b>'+t.tab+' · '+t.sub+'</b><span>'+(t.rav.rdv ? 'RDV ' : 'Ravito ')+t.rav.lieu+' · '+t.rav.heure+'</span></div>'
        + '<div class="rm-stats"><span class="rm-stat">🚗 '+t.km+'</span><span class="rm-stat">⏱ ~'+t.min+(t.from ? ' '+t.from : '')+'</span><span class="rm-stat">🚶 '+t.marche+'</span></div>'
        + '<ol class="rm-steps" style="--c:'+t.col.c+';--ink:'+t.col.ink+'">'+t.steps.map(function(s){ return '<li>'+s+'</li>'; }).join('')
        + '<li class="walk">'+t.walkStep+'</li></ol>'
        + '<button type="button" class="rm-nav" onclick="RaceNav.start('+t.rav.km+')">▶ Me guider jusqu\'au '+('km '+t.rav.km)+'</button>'
        + '<p class="rm-nav-note">Guidage vocal intégré sur cet itinéraire sécurisé, sans autre chemin possible (depuis votre adresse, guidage jusqu\'à l\'A13 à Flins). Gardez l\'écran allumé.</p>';
    }

    let current = 0;
    _raceMapRefit = function(){
      const b = current === 0 ? courseBounds : TRAJETS[current - 1].bounds;
      const pad = _raceMapFullscreen ? { paddingTopLeft: [64, 90], paddingBottomRight: [64, 130] } : { paddingTopLeft: [64, 24], paddingBottomRight: [64, 48] };
      _raceMapInstance.fitBounds(b, pad);
    };

    // Le P est souvent à quelques pixels du point de RDV : on l'écarte sur le côté avec un trait de rappel
    const _placeParks = function(){
      TRAJETS.forEach(function(t){
        const m = _raceMapInstance;
        const a = m.latLngToLayerPoint(t.rav.coord), b = m.latLngToLayerPoint(t.park);
        let dx = b.x - a.x, dy = Math.min(0, b.y - a.y);
        if(Math.abs(dx) < 1 && dy === 0) dx = 1;
        const d = Math.hypot(dx, dy), MIN = 40;
        const target = Math.hypot(b.x - a.x, b.y - a.y) < MIN ? L.point(a.x + dx / d * MIN, a.y + dy / d * MIN) : b;
        const ll = m.layerPointToLatLng(target);
        t.parkMarker.setLatLng(ll);
        t.parkLeader.setLatLngs([t.park, ll]);
      });
    };
    _raceMapInstance.on('zoomend', _placeParks);

    function select(i){
      current = i;
      TRAJETS.forEach(function(t){
        t.ravMarker.setIcon(i === 0 ? iRavCompact(t.rav.km, t.rav.heure) : iRav(t.rav.km, t.rav.heure, t.rav.side, t.rav.addr));
      });
      if(tabsEl) tabsEl.querySelectorAll('.rm-tab').forEach(function(b, j){ b.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      TRAJETS.forEach(function(t, k){
        if(i === 0 || k === i - 1) t.group.addTo(_raceMapInstance); else t.group.remove();
        if(k === i - 1) t.detail.addTo(_raceMapInstance); else t.detail.remove();
        if(i === 0) t.badge.addTo(_raceMapInstance); else t.badge.remove();
      });
      if(gps.follow){ gps.follow = false; _gpsBtnState(); }
      _raceMapRefit();
      _placeParks();
      renderInfo(i);
      _gpsStatus();
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
        b.innerHTML = '<b>'+(t.col ? '<i class="rm-dot" style="background:'+t.col.c+'"></i>' : '')+t.tab+'</b><span>'+t.sub+'</span>';
        b.onclick = function(){ select(i); b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); };
        tabsEl.appendChild(b);
      });
    }
    select(0);
    window._raceCtx = { map: _raceMapInstance, TRAJETS: TRAJETS, RAVITOS: RAVITOS, ROUTE: ROUTE, select: select, gpsStop: _gpsStop };
    if(typeof RaceNav !== 'undefined') RaceNav.attach(window._raceCtx);
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
