// Calcul dynamique de la semaine courante
const weekDates=[
  '2026-03-09','2026-03-16','2026-03-23','2026-03-30',
  '2026-04-06','2026-04-13','2026-04-20','2026-04-27',
  '2026-05-04','2026-05-11','2026-05-18','2026-05-25',
  '2026-06-01','2026-06-08','2026-06-15','2026-06-22',
  '2026-06-29','2026-07-06','2026-07-13','2026-07-20',
  '2026-07-27','2026-08-03','2026-08-10','2026-08-17',
  '2026-08-24','2026-08-31','2026-09-07','2026-09-14',
  '2026-09-21','2026-09-28','2026-10-05','2026-10-12',
];
function getCurrentWeek(){
  const now=new Date();
  const today=now.getFullYear()*10000+(now.getMonth()+1)*100+now.getDate();
  const dates=weekDates.map(d=>{const p=d.split('-');return parseInt(p[0])*10000+parseInt(p[1])*100+parseInt(p[2]);});
  let cw=1;
  for(let i=0;i<dates.length;i++){
    if(today>=dates[i]) cw=i+1;
    else break;
  }
  return Math.min(cw,32);
}
const CW=getCurrentWeek();
// Flag global pour ne pas afficher le brief du matin plus d'une fois par session
let _briefShownToday = false;
// Semaine affichée sur l'accueil (peut différer de CW via navigation)
let homeViewWeek = CW;

function getAthleteMaxWeek(){
  // Nombre de semaines dans le plan de l'athlète
  let max=0;
  for(let ws=1;ws<=52;ws++){if(state['extra_w'+ws+'_s0'])max=ws; else if(ws>max+4)break;}
  return max||16;
}

function getEffectiveCW(){
  return isAdmin()?CW:getAthleteCW();
}

// Km total planifié pour une semaine athlète (extra_w*)
function getAthleteWeekKm(ws){
  let t=0,ei=0;
  while(ei<=20&&state[`extra_w${ws}_s${ei}`]){
    try{t+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}
    ei++;
  }
  return Math.round(t*10)/10;
}

function homeNavWeek(dir){
  const newW = homeViewWeek + dir;
  const maxW = isAdmin()?32:getAthleteMaxWeek();
  if(newW < 1 || newW > maxW) return;
  const savedScroll = window.scrollY || document.documentElement.scrollTop || 0;
  homeViewWeek = newW;
  renderHome();
  // Restaurer la position de scroll après le rendu (iOS remet à 0 lors du reflow DOM)
  requestAnimationFrame(()=>{
    window.scrollTo(0, savedScroll);
  });
}
function homeGoCurrentWeek(){
  homeViewWeek = getEffectiveCW();
  renderHome();
  window.scrollTo(0, 0);
}
const KM_AVANT_S7=219;
// Km réellement courus avant la semaine courante (hors plan + semaines passées)
// Mis à jour manuellement à chaque début de semaine si nécessaire
const KM_HISTORIQUE_BASE = 243; // km faits S1-S8 inclus (193 plan + ~50 hors plan)
function getGrandTotal(){
  if(!isAdmin()){
    // Pour les athlètes : total des km de leurs séances extra uniquement
    let t=0;
    for(let ws=1;ws<=52;ws++){let ei=0;while(ei<=20&&state[`extra_w${ws}_s${ei}`]){try{t+=parseFloat(JSON.parse(state[`extra_w${ws}_s${ei}`]).km)||0;}catch(e){}ei++;}}
    return Math.round(t);
  }
  return Math.round(weeks.reduce((a,w)=>a+getWeekTotalKm(w.s),0));
}

const P='Pegasus',S='Salomon',Z='Zoom Fly';
const shoeStyle={
  [P]:{bg:'#EEF2FD',color:'#102B8A',dot:'#1438A8'},
  [S]:{bg:'#FBEAF0',color:'#72243E',dot:'#D4537E'},
  [Z]:{bg:'#FEFCE8',color:'#854F0B',dot:'#EAB308'}
};
const defaultShoeColors=['#1438A8','#D4537E','#EAB308','#3B6D11','#534AB7','#E8530A','#888780'];
function getShoes(){
  if(state._shoes){try{return JSON.parse(state._shoes);}catch(e){}}
  // Les chaussures de Guillaume sont prédéfinies uniquement pour son compte admin
  if(isAdmin()) return [{name:P,color:'#1438A8',max:600},{name:S,color:'#D4537E',max:600},{name:Z,color:'#EAB308',max:600}];
  return [];
}
function saveShoes(arr){state._shoes=JSON.stringify(arr);save();}
const typeColor={ef:'#3B6D11',tempo:'#E8530A',frac:'#C4141B',long:'#534AB7',rest:'#888780',race:'#C4960A'};
const typeBg={ef:'#EAF3DE',tempo:'#FDF0EB',frac:'#FEF0F0',long:'#EEEDFE',rest:'#F1EFE8',race:'#FEFCE8'};
const typeLabel={ef:'EF',tempo:'Tempo',frac:'Frac',long:'Long',rest:'Repos',race:'Course'};

function normalizeSessionTitle(title, type){
  if(!title) return title;
  if(type === 'ef') return 'Footing EF';
  if(type === 'long') {
    // Séances longues : ne jamais afficher "Footing EF" — normaliser vers "EF Long"
    if(/^(Séance EF|EF longue|Footing EF|Endurance fondamentale|Sortie longue)/i.test(title)) return 'EF Long';
    return title;
  }
  if(/^(Séance EF|Endurance fondamentale|Footing aérobie)(\b|$)/.test(title)) return 'Footing EF';
  if(/^Fartlek/.test(title)) return title.replace(/^Fartlek [a-zéèàû]+/, 'Footing avec accélérations');
  return title;
}

const weeks=[
  {s:1,km:23,date:'09/03',month:'Mars',sessions:[{d:"Séance EF",km:7,type:"ef",shoe:null},{d:"Séance EF",km:8,type:"ef",shoe:"Pegasus"},{d:"Séance EF longue|8 EF",km:8,type:"long",shoe:"Pegasus"}]},
  {s:2,km:30,date:'16/03',month:'Mars',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:"Pegasus"},{d:"Séance EF",km:10,type:"ef",shoe:"Pegasus"},{d:"Séance EF longue|11 EF",km:11,type:"long",shoe:"Pegasus"}]},
  {s:3,km:23,date:'23/03',month:'Mars',sessions:[{d:"Séance EF",km:7,type:"ef",shoe:"Pegasus"},{d:"Séance EF",km:8,type:"ef",shoe:"Pegasus"},{d:"Séance EF longue|8 EF",km:8,type:"long",shoe:"Pegasus"}]},
  {s:4,km:18,date:'30/03',month:'Mars',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:"Pegasus"},{d:"Repos genoux",km:0,type:"rest",shoe:null},{d:"Séance EF longue|9 EF",km:9,type:"long",shoe:"Pegasus"}]},
  {s:5,km:23,date:'06/04',month:'Avril',sessions:[{d:"Séance EF",km:7,type:"ef",shoe:"Pegasus"},{d:"Tempo 2×5 min|5'00 — 5'20 /km",km:7,type:"tempo",shoe:"Pegasus"},{d:"Séance EF longue|9 EF",km:9,type:"long",shoe:"Pegasus"}]},
  {s:6,km:25,date:'13/04',month:'Avril',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:"Pegasus"},{d:"Tempo 2×6 min|5'00 — 5'20 /km",km:8,type:"tempo",shoe:"Pegasus"},{d:"Séance EF longue|9 EF",km:9,type:"long",shoe:"Salomon"}]},
  {s:7,km:27,date:'20/04',month:'Avril',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:"Pegasus"},{d:"Tempo 3×8 min|5'00 — 5'20 /km",km:8,type:"tempo",shoe:"Pegasus"},{d:"Séance EF longue|8 EF · 3 AM @ 5'40/km",km:11,type:"long",shoe:S}]},
  {s:8,km:24,date:'27/04',month:'Avril',sessions:[{d:"Tempo 2×10 min|5'00 — 5'20 /km",km:8,type:"tempo",shoe:"Pegasus"},{d:"Séance EF légère",km:7,type:"ef",shoe:P},{d:"Séance EF longue|7 EF · 2 AM @ 5'40/km",km:9,type:"long",shoe:S}]},
  {s:9,km:27,date:'04/05',month:'Mai',sessions:[{d:"Tempo 2×12 min|5'00 — 5'20 /km",km:9,type:"tempo",shoe:"Pegasus"},{d:"Séance EF légère",km:8,type:"ef",shoe:P},{d:"Séance EF longue|7 EF · 3 AM @ 5'40/km",km:10,type:"long",shoe:S}]},
  {s:10,km:30,date:'11/05',month:'Mai',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 1×18 min|5:00 — 5:15 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|9 EF · 3 AM @ 5'40/km",km:12,type:"long",shoe:S}]},
  {s:11,km:33,date:'18/05',month:'Mai',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:P},{d:"Tempo 2×12 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|10 EF · 4 AM @ 5'40/km",km:14,type:"long",shoe:S}]},
  {s:12,km:29,date:'25/05',month:'Mai',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 2×8 min|5'00 — 5'20 /km",km:9,type:"tempo",shoe:"Pegasus"},{d:"EF longue|9 EF · 3 AM @ 5'40/km",km:12,type:"long",shoe:S}]},
  {s:13,km:35,date:'01/06',month:'Juin',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:P},{d:"Tempo 3×10 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|11 EF · 5 AM @ 5'40/km",km:16,type:"long",shoe:S}]},
  {s:14,km:37,date:'08/06',month:'Juin',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:P},{d:"Tempo 1×25 min|5:00 — 5:15 /km",km:11,type:"tempo",shoe:"Pegasus"},{d:"EF longue|12 EF · 5 AM @ 5'40/km",km:17,type:"long",shoe:S}]},
  {s:15,km:38,date:'15/06',month:'Juin',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:P},{d:"Tempo 1×30 min|5:00 — 5:15 /km",km:11,type:"tempo",shoe:"Pegasus"},{d:"Séance EF longue|13 EF · 5 AM @ 5'40/km",km:18,type:"long",shoe:S}]},
  {s:16,km:32,date:'22/06',month:'Juin',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|10 EF · 4 AM @ 5'40/km",km:14,type:"long",shoe:S}]},
  {s:17,km:38,date:'29/06',month:'Juin',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"Séance EF longue|13 EF · 5 AM @ 5'40/km",km:18,type:"long",shoe:S}]},
  {s:18,km:41,date:'06/07',month:'Juillet',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 3×10 min|5'00 — 5'20 /km",km:11,type:"tempo",shoe:"Pegasus"},{d:"EF longue|16 EF · 4 AM @ 5'40/km",km:20,type:"long",shoe:S}]},
  {s:19,km:43,date:'13/07',month:'Juillet',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:11,type:"tempo",shoe:"Pegasus"},{d:"EF longue|14 EF · 8 AM @ 5'40/km",km:22,type:"long",shoe:S}]},
  {s:20,km:33,date:'20/07',month:'Juillet',sessions:[{d:"9 km EF",km:9,type:"ef",shoe:P},{d:"Tempo 2×8 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|10 EF · 4 AM @ 5'40/km",km:14,type:"long",shoe:S}]},
  {s:21,km:30,date:'28/07',month:'Juillet',sessions:[{d:"EF (Paris)",km:10,type:"ef",shoe:P},{d:"Séance EF (Paris)",km:8,type:"ef",shoe:P},{d:"EF longue (Paris)|10 EF · 2 AM @ 5'40/km",km:12,type:"long",shoe:S}]},
  {s:22,km:22,date:'03/08',month:'Août',sessions:[{d:"EF (Sri Lanka)",km:10,type:"ef",shoe:P},{d:"Repos",km:0,type:"rest",shoe:null},{d:"EF longue (Sri Lanka)|10 EF · 2 AM @ 5'40/km",km:12,type:"long",shoe:P}]},
  {s:23,km:28,date:'10/08',month:'Août',sessions:[{d:"EF (Sri Lanka)",km:8,type:"ef",shoe:P},{d:"EF (Sri Lanka)",km:8,type:"ef",shoe:null},{d:"EF longue (Paris)|8 EF · 3 AM @ 5'40/km · 2 EF",km:12,type:"long",shoe:"Pegasus"}]},
  {s:24,km:35,date:'17/08',month:'Août',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 3×10 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|10 EF · 3 AM @ 5'40/km · 2 EF",km:15,type:"long",shoe:S}]},
  {s:25,km:38,date:'24/08',month:'Août',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Pegasus"},{d:"EF longue|12 EF · 4 AM @ 5'40/km · 2 EF",km:18,type:"long",shoe:S}]},
  {s:26,km:34,date:'31/08',month:'Septembre',sessions:[{d:"Séance EF",km:9,type:"ef",shoe:P},{d:"Tempo 3×10 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Zoom Fly"},{d:"EF longue|10 EF · 3 AM @ 5'40/km · 2 EF",km:15,type:"long",shoe:Z}]},
  {s:27,km:41,date:'07/09',month:'Septembre',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Zoom Fly"},{d:"Semi-Marathon Bois d'Arcy",km:21,type:"race",shoe:Z}]},
  {s:28,km:44,date:'14/09',month:'Septembre',sessions:[{d:"EF 7/3 AM",km:10,type:"ef",shoe:P},{d:"Tempo 2×15 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Zoom Fly"},{d:"EF longue|14 EF · 6 AM @ 5'40/km · 4 EF",km:24,type:"long",shoe:S}]},
  {s:29,km:48,date:'21/09',month:'Septembre',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 2×10 min|5'00 — 5'20 /km",km:10,type:"tempo",shoe:"Zoom Fly"},{d:"EF longue|18 EF · 4 AM · 4 EF · 4 AM @ 5'40/km",km:30,type:"long",shoe:Z}]},
  {s:30,km:33,date:'28/09',month:'Septembre',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 2×8 min|5'00 — 5'20 /km",km:9,type:"tempo",shoe:"Pegasus"},{d:"EF longue|11 EF · 3 AM @ 5'40/km · 2 EF",km:16,type:"long",shoe:S}]},
  {s:31,km:29,date:'05/10',month:'Octobre',sessions:[{d:"Séance EF",km:8,type:"ef",shoe:P},{d:"Tempo 2×5 min|5'00 — 5'20 /km",km:9,type:"tempo",shoe:"Zoom Fly"},{d:"EF longue|9 EF · 3 AM @ 5'40/km",km:12,type:"long",shoe:S}]},
  {s:32,km:51,date:'12/10',month:'Octobre',sessions:[{d:"Séance EF",km:5,type:"ef",shoe:P},{d:"Séance EF légère",km:4,type:"ef",shoe:Z},{d:"MARATHON",km:42,type:"race",shoe:Z}]},
];

const renfo1=[
  {nom:"Pont fessier",desc:"Genoux fléchis, talons au sol — levez le bassin lentement puis redescendez.",series:"3 séries × 10 rép."},
  {nom:"Pont fessier unipodal",desc:"Idem avec une jambe levée. Gardez le bassin bien droit.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Battements latéraux",desc:"Allongé sur le côté, jambe du dessus tendue — battements avec élastique à la cheville.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Ouvertures de hanche",desc:"Allongé sur le côté, élastique au-dessus des genoux — ouvrez en gardant les pieds serrés.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Extension de jambe",desc:"Assis, tendez une jambe lentement (4 sec) puis repliez doucement (4 sec).",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Montées sur banc",desc:"Montez puis descendez doucement d'un banc ou d'une marche.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
];
const renfo2=[
  {nom:"Battements latéraux",desc:"Allongé sur le côté, jambe du dessus tendue — battements avec élastique à la cheville.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Bird dog",desc:"À 4 pattes, tendez simultanément la jambe droite et le bras gauche, maintenez 2 sec puis alternez. Gardez le dos plat et les abdos gainés.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Relevé de jambes",desc:"Allongé sur le dos, jambes tendues — montez-les lentement à 90° puis redescendez doucement.",series:"3 séries × 10 rép."},
  {nom:"Kick-back élastique",desc:"À 4 pattes, élastique autour des chevilles — extension de jambe vers l'arrière en gardant le dos plat et les abdos gainés.",series:"4 séries × 10 rép. (2 à gauche · 2 à droite)"},
  {nom:"Superman",desc:"Allongé sur le ventre, bras tendus devant toi — soulevez simultanément les bras et les jambes en creusant légèrement le bas du dos, maintenez 2 sec puis redescendez lentement.",series:"3 séries × 10 rép."},
];
const renfo3=[
  {nom:"Planche frontale",desc:"Abdos gainés, dos plat, bras à 90° — maintenez la position sans laisser le bassin tomber.",series:"3 séries × 45 sec"},
  {nom:"Planche latérale",desc:"Corps aligné de la tête aux pieds, hanche haute, regard vers l'avant.",series:"3 séries × 30 sec (chaque côté)"},
  {nom:"Dead bug",desc:"Allongé sur le dos, tendez alternativement le bras droit et la jambe gauche sans cambrer le bas du dos.",series:"3 séries × 10 rép. (chaque côté)"},
  {nom:"Crunch inverse",desc:"Allongé sur le dos, ramenez les genoux vers la poitrine en décollant légèrement le bassin — redescendez lentement.",series:"3 séries × 15 rép."},
  {nom:"Mountain climber",desc:"Position pompe, amenez alternativement les genoux vers la poitrine rapidement en maintenant le dos plat.",series:"3 séries × 20 rép."},
];
const renfo4=[
  {nom:"Montées sur pointe de pieds",desc:"Debout, montez lentement sur la pointe des pieds, maintenez 1 sec en haut puis redescendez lentement.",series:"4 séries × 20 rép."},
  {nom:"Montées excentriques",desc:"Sur une marche, montez à deux pieds puis descendez lentement sur un seul pied — contrôlez l'amortissement.",series:"3 séries × 12 rép. (chaque jambe)"},
  {nom:"Cercles de cheville",desc:"Assis, jambe tendue — tournez lentement la cheville dans les deux sens avec une amplitude maximale.",series:"2 séries × 15 rép. (chaque sens, chaque cheville)"},
  {nom:"Fentes marchées",desc:"Faites de grandes fentes en marchant, genou avant aligné au-dessus du pied, buste droit.",series:"3 séries × 10 rép. (chaque jambe)"},
  {nom:"Saut unipodal stabilisé",desc:"Sautez légèrement sur un pied et atterrissez en contrôlant l'amortissement — maintenez 2 sec en équilibre.",series:"3 séries × 10 rép. (chaque pied)"},
];
const renfo5=[
  {nom:"Pompes",desc:"Corps aligné, coudes à 45° — descendez lentement (3 sec) et remontez de façon explosive.",series:"3 séries × 10 rép."},
  {nom:"Extension dorsale alternée",desc:"Allongé sur le ventre, levez alternativement le bras droit et la jambe gauche, maintenez 2 sec — dos plat.",series:"3 séries × 12 rép. (chaque côté)"},
  {nom:"Tirage élastique",desc:"Élastique fixé devant vous à hauteur de poitrine — tirez vers vous en serrant les omoplates et en gardant les coudes près du corps.",series:"3 séries × 15 rép."},
  {nom:"Rotation thoracique",desc:"À 4 pattes, une main derrière la tête — ouvrez le coude vers le plafond en faisant tourner la colonne, regard qui suit.",series:"3 séries × 10 rép. (chaque côté)"},
  {nom:"Gainage dynamique",desc:"Position pompe, touchez alternativement l'épaule opposée sans bouger le bassin — abdos bien gainés.",series:"3 séries × 20 rép."},
];
// Map globale des programmes de renforcement
const RENFO_PROGRAMS={
  1:{name:'Ischio-fessiers',    sub:'Fémoro-patellaire · 6 exos',     exos:renfo1},
  2:{name:'Bas du dos',         sub:'Core stabilisation · 5 exos',    exos:renfo2},
  3:{name:'Gainage & Core',     sub:'Stabilité centrale · 5 exos',    exos:renfo3},
  4:{name:'Mollets & Chevilles',sub:'Proprioception · 5 exos',        exos:renfo4},
  5:{name:'Haut du corps',      sub:'Posture de course · 5 exos',     exos:renfo5},
};
// Retourne les données du programme sélectionné pour le slot r (1 ou 2)
function getRenfoData(r){
  const progId=parseInt(state&&state['renfo_prog'+r])||r;
  return RENFO_PROGRAMS[progId]||RENFO_PROGRAMS[r]||RENFO_PROGRAMS[1];
}
const gels=[{km:12,nb:1,t:"À 6 km"},{km:16,nb:2,t:"6 & 12 km"},{km:20,nb:3,t:"6, 12 & 17 km"},{km:24,nb:4,t:"6, 12, 17 & 22 km"},{km:28,nb:5,t:"6, 12, 17, 22 & 26 km"},{km:'Marathon',nb:8,t:"6, 12, 17, 22, 26, 30, 34 & 38 km"}];
const shoes=[{name:P,color:'#1438A8',max:600},{name:S,color:'#D4537E',max:500},{name:Z,color:'#EAB308',max:600}];
function getShoeStyle(name){
  const predefined=shoeStyle[name];
  if(predefined) return predefined;
  const sh=getShoes().find(s=>s.name===name);
  if(!sh) return {bg:'#F1EFE8',color:'#444441',dot:'#888780'};
  return {bg:sh.color+'22',color:sh.color,dot:sh.color};
}
const shoeKm=[[16,46,69,87,110,126,142,157,174,192,211,228,247,267,287,305,325,346,367,386,396,416,439,459,479,488,498,508,516,533,541,546],[0,0,0,0,0,9,20,29,39,51,65,77,93,110,128,142,160,180,202,216,230,230,230,245,263,263,263,287,287,303,315,315],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,25,56,66,106,106,115,161]];

function shoeBadge(shoe){
  if(!shoe)return '';
  const st=getShoeStyle(shoe);
  const abbr=shoe.length>6?shoe.substring(0,3):shoe;
  return `<span style="background:${st.bg};color:${st.color};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:3px;"><span style="width:6px;height:6px;border-radius:50%;background:${st.dot};display:inline-block;"></span>${abbr}</span>`;
}
function shoeFullBadge(shoe){
  if(!shoe)return '';
  const st=getShoeStyle(shoe);
  return `<span style="background:${st.bg};color:${st.color};padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span style="width:7px;height:7px;border-radius:50%;background:${st.dot};display:inline-block;"></span>${shoe}</span>`;
}
function getShoeOptions(currentShoe){
  const list=getShoes();
  return [...list.map(sh=>`<option value="${sh.name}" ${currentShoe===sh.name?'selected':''}>${sh.name}</option>`),
    `<option value="" ${!currentShoe?'selected':''}>— aucune —</option>`].join('');
}

