// Carte du plan de secours famille (page /secours, indépendante de /parcours) :
// parcours fermé, itinéraire voiture numéroté (mêmes étapes que le PDF), marches, repères, plein écran.

let _secMapInstance = null;
let _secMapFullscreen = false;
let _secMapRefit = null;

function _toggleSecMapFS(force){
  const wrap = document.getElementById('race-map-wrap');
  if(!wrap) return;
  _secMapFullscreen = typeof force === 'boolean' ? force : !_secMapFullscreen;
  if(!_secMapFullscreen && typeof SecoursNav !== 'undefined' && SecoursNav.active()) SecoursNav.stop(true);
  wrap.classList.toggle('is-fs', _secMapFullscreen);
  document.body.style.overflow = _secMapFullscreen ? 'hidden' : '';
  if(_secMapFullscreen){ const c = document.getElementById('race-map-close'); if(c) c.focus(); }
  if(_secMapInstance) setTimeout(function(){ _secMapInstance.invalidateSize(); if(_secMapRefit) _secMapRefit(); }, 60);
}
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && _secMapFullscreen) _toggleSecMapFS(false); });

function initSecoursMap(){
  const container = document.getElementById('race-map');
  if(!container || _secMapInstance) return;

  function build(){
    if(_secMapInstance) return;
    const D = SEC_DATA, R = D.routes.S;
    container.innerHTML = '';
    const map = _secMapInstance = L.map(container, { zoomControl: true, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);

    const RAD = Math.PI / 180;
    const _d = function(a, b){ const dy = (b[0]-a[0]) * 110540, dx = (b[1]-a[1]) * 111320 * Math.cos(a[0]*RAD); return Math.sqrt(dx*dx + dy*dy); };
    const _cap = function(a, b){ return Math.atan2((b[1]-a[1]) * Math.cos(a[0]*RAD), b[0]-a[0]) / RAD; };
    const _at = function(line, dist){
      let acc = 0;
      for(let i = 1; i < line.length; i++){
        const d = _d(line[i-1], line[i]);
        if(acc + d >= dist){ const f = (dist - acc) / (d || 1); return [line[i-1][0] + (line[i][0]-line[i-1][0]) * f, line[i-1][1] + (line[i][1]-line[i-1][1]) * f]; }
        acc += d;
      }
      return line[line.length - 1];
    };
    const cased = function(line, color, weight, extra){
      return [L.polyline(line, { color: '#fff', weight: weight + 4, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false }),
              L.polyline(line, Object.assign({ color: color, weight: weight, opacity: 1, lineJoin: 'round', lineCap: 'round' }, extra || {}))];
    };
    const SH = 'box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    const tag = function(html, bg, fg, w, h, ax, ay){
      return L.divIcon({ className: '', iconSize: [w, h], iconAnchor: [ax === undefined ? w / 2 : ax, ay === undefined ? h / 2 : ay],
        html: '<div style="height:' + h + 'px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 9px;background:' + bg + ';color:' + fg + ';font:800 11px/1.1 system-ui,sans-serif;border-radius:' + h / 2 + 'px;border:2px solid #fff;white-space:nowrap;' + SH + '">' + html + '</div>' });
    };

    // parcours fermé
    const course = cased(D.course, '#DC2626', 6);
    course.push(L.polyline(D.course, { color: '#fff', weight: 2, opacity: 1, dashArray: '7 9', lineCap: 'butt', interactive: false }));
    course[1].bindPopup('<b>🚫 Parcours du marathon</b><br>Routes fermées à la circulation (8h–15h)<br>Ne pas l\'emprunter ni le traverser en voiture');
    course.forEach(function(l){ l.addTo(map); });

    // itinéraire voiture + flèches de sens
    const drive = cased(R.line, '#15803D', 6);
    drive[1].bindPopup('<b>En voiture</b> · ' + (R.len / 1000).toFixed(1).replace('.', ',') + ' km · ~' + Math.round(R.t / 60) + ' min');
    drive.forEach(function(l){ l.addTo(map); });
    for(let s = 600; s < R.len - 300; s += 1400){
      const p = _at(R.line, s), c = _cap(_at(R.line, s - 40), _at(R.line, s + 40));
      L.marker(p, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#15803D;border:2px solid #fff;display:flex;align-items:center;justify-content:center;transform:rotate(' + Math.round(c) + 'deg);' + SH + '"><svg width="9" height="9" viewBox="0 0 10 10"><path d="M5 1L8.6 8.6L5 6.6L1.4 8.6Z" fill="#fff"/></svg></div>' }) }).addTo(map);
    }
    // marches (pointillés)
    [D.walks.start, D.walks.end].forEach(function(w){
      const l = cased(w.line, '#1D4ED8', 3, { dashArray: '1 7', weight: 4 });
      l[1].bindPopup('<b>À pied</b> ~' + Math.round(w.len / 10) * 10 + ' m');
      l.forEach(function(x){ x.addTo(map); });
    });
    // étapes numérotées (identiques au PDF)
    R.man.filter(function(m){ return m.type !== 'park' && !(m.type === 'continue' && /D6155/.test(m.road || '')); }).forEach(function(m, k){
      L.marker(_at(R.line, m.at), { zIndexOffset: 400, keyboard: false, icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
        html: '<div style="width:24px;height:24px;border-radius:50%;background:#15803D;color:#fff;border:2.5px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:800 11px/1 system-ui,sans-serif;' + SH + '">' + (k + 1) + '</div>' }) })
        .bindPopup('<b>Étape ' + (k + 1) + '</b>').addTo(map);
    });
    // repères
    const P = D.points;
    L.marker(P.house, { zIndexOffset: 600, icon: tag('🏠 Maison · 24 route de Portejoie', '#C2410C', '#fff', 214, 26, 204, 40) }).bindPopup('<b>Départ à pied</b><br>24 route de Portejoie (Tournedos)').addTo(map);
    const park = function(p, txt){ return L.marker(p, { zIndexOffset: 500, icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: '<div style="width:26px;height:26px;border-radius:7px;background:#fff;color:#1D4ED8;border:2px solid #1D4ED8;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:900 14px/1 system-ui,sans-serif;' + SH + '">P</div>' }) }).bindPopup(txt).addTo(map); };
    park(P.car, '<b>Voiture</b><br>Garée la veille route de Tournedos, dans le sens de Val-de-Reuil');
    park(P.park, '<b>Stationnement</b><br>Rue Dutens (Louviers est)');
    L.marker(P.rdv, { zIndexOffset: 700, icon: tag('<span style="background:#fff;color:#1B4FD8;border-radius:9px;padding:2px 6px;">10</span> RDV · passage ~10h01', '#1B4FD8', '#fff', 176, 28, 10, 42) })
      .bindPopup('<b>RDV km 10 — rond-point de Folleville</b><br>Passage de Guillaume environ 10h01').addTo(map);

    const bounds = L.polyline(R.line.concat(D.walks.start.line, D.walks.end.line)).getBounds();
    _secMapRefit = function(){ map.fitBounds(bounds, { paddingTopLeft: [30, 56], paddingBottomRight: [30, 30] }); };
    _secMapRefit();

    // plein écran
    const fsCtl = L.control({ position: 'topright' });
    fsCtl.onAdd = function(){
      const b = L.DomUtil.create('button', 'rm-fs'); b.type = 'button';
      b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Plein écran</span>';
      L.DomEvent.disableClickPropagation(b); L.DomEvent.on(b, 'click', function(){ _toggleSecMapFS(); });
      return b;
    };
    fsCtl.addTo(map);

    window._secCtx = { map: map, RAVITOS: [{ km: 10, heure: '~10h01', lieu: 'Rond-point de Folleville' }], ROUTE: D.course, select: function(){}, gpsStop: function(){} };
    if(typeof SecoursNav !== 'undefined') SecoursNav.attach(window._secCtx);
  }

  if(window.L){ build(); return; }
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(link);
  const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  script.onload = build;
  script.onerror = function(){ container.innerHTML = '<p style="color:#888;padding:16px;text-align:center;">Impossible de charger la carte.</p>'; };
  document.head.appendChild(script);
}
