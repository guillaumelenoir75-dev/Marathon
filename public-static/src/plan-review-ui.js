// ─── Style de « MAJ le plan » et « Comprendre ton plan » (chargé avec ces écrans) ───
const PR_CSS = '.pr-head{flex-shrink:0;background:linear-gradient(135deg,#0C447C,#1D4ED8);color:#fff;padding:16px;border-radius:24px 24px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}'
  + '.pr-eb{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.8;margin:0 0 2px;}.pr-title{font-size:21px;font-weight:900;margin:0;}.pr-sub{font-size:12.5px;opacity:.85;margin:3px 0 0;font-weight:600;}'
  + '.pr-x{flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:18px;cursor:pointer;}'
  + '.pr-body{background:#F3F6FC;}.pr-sec{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748B;margin:6px 2px -2px;display:flex;justify-content:space-between;align-items:baseline;}'
  + '.pr-card{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;}'
  + '.pr-note{font-size:12.5px;color:#5B6675;line-height:1.45;margin:0;}'
  + '.pr-lvl{display:flex;align-items:center;gap:14px;}.pr-lvl b{font-size:30px;font-weight:900;color:#0C447C;line-height:1;font-variant-numeric:tabular-nums;}.pr-lvl span{font-size:12px;color:#64748B;font-weight:700;line-height:1.35;}'
  + '.pr-chips{display:flex;flex-wrap:wrap;gap:6px;}.pr-chip{background:#F1F5FB;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;color:#334155;font-variant-numeric:tabular-nums;}.pr-chip b{color:#0C447C;}'
  + '.pr-warn{display:flex;gap:8px;font-size:12.5px;line-height:1.4;color:#334155;}.pr-warn i{font-style:normal;flex-shrink:0;}'
  + '.pr-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #EEF2F7;}.pr-item:first-of-type{border-top:none;padding-top:2px;}'
  + '.pr-item input{width:20px;height:20px;flex-shrink:0;margin-top:1px;accent-color:#1B4FD8;}.pr-item-b{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;}'
  + '.pr-item-t{font-size:13px;font-weight:800;color:#0F172A;}.pr-item-t small{font-weight:700;color:#64748B;font-size:11.5px;margin-left:4px;}'
  + '.pr-old{font-size:12px;color:#94A3B8;text-decoration:line-through;overflow-wrap:anywhere;}.pr-new{font-size:12.5px;color:#0F172A;font-weight:700;overflow-wrap:anywhere;}'
  + '.pr-why{font-size:11.5px;color:#5B6675;line-height:1.35;}.pr-tag{display:inline-block;font-size:10px;font-weight:800;border-radius:6px;padding:1px 6px;margin-right:5px;vertical-align:1px;}'
  + '.pr-tag.calc{background:#E0E9FF;color:#1B4FD8;}.pr-tag.coach{background:#DCFCE7;color:#15803D;}'
  + '.pr-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:1px solid transparent;border-radius:12px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;}'
  + '.pr-btn.pri{background:#1B4FD8;color:#fff;}.pr-btn.sec{background:#EEF3FC;color:#1B4FD8;border-color:#D3DFF5;}.pr-btn.ok{background:#15803D;color:#fff;}.pr-btn:disabled{opacity:.55;cursor:default;}'
  + '.pr-link{background:none;border:none;color:#1B4FD8;font-weight:800;font-size:12.5px;cursor:pointer;padding:0;font-family:inherit;}'
  + '.pr-foot{flex-shrink:0;background:#fff;border-top:1px solid #E2E8F0;padding:10px 16px calc(env(safe-area-inset-bottom) + 10px);}'
  + '.pr-rec-top{display:flex;justify-content:space-between;align-items:center;}.pr-rec-top b{font-size:15px;color:#0C447C;}'
  + '.pr-rec-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.pr-card label{font-size:11.5px;font-weight:700;color:#5B6675;display:flex;flex-direction:column;gap:3px;}'
  + '.pr-card input:not([type=checkbox]){width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #D6DFEC;border-radius:9px;font-size:15px;font-family:inherit;background:#fff;}'
  + '.pr-coach{background:#F0FDF4;border-color:#BBF7D0;}.pr-coach p{margin:0;font-size:13px;line-height:1.5;color:#14532D;white-space:pre-line;}'
  + '.rec-list{padding:4px 14px;gap:0;}.rec-row{display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:10px;row-gap:6px;align-items:center;padding:12px 0;border-bottom:1px solid #EEF2F7;}.rec-row:last-child{border-bottom:none;}'
  + '.rec-dist{display:flex;flex-direction:column;gap:2px;grid-row:span 2;align-self:start;padding-top:9px;}.rec-dist b{font-size:15px;font-weight:850;color:#0C447C;}.rec-dist span{font-size:10.5px;font-weight:700;color:#15803D;line-height:1.3;}'
  + '.rec-fields{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:8px;min-width:0;}'
  + '.rec-row input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;margin:0;border:1px solid #D6DFEC;border-radius:10px;background:#fff;font-family:inherit;color:#0F172A;-webkit-appearance:none;appearance:none;}'
  + '.rec-time{height:44px;padding:0 10px;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;}.rec-time::placeholder{color:#C3CCD9;font-weight:600;}'
  + '.rec-date{position:relative;display:block;min-width:0;}.rec-date input{height:44px;line-height:44px;padding:0 8px 0 10px;font-size:14px;text-align:left;white-space:nowrap;overflow:hidden;}'
  + '.rec-date input::-webkit-date-and-time-value{text-align:left;white-space:nowrap;margin:0;line-height:44px;font-size:14px;}.rec-date input:not(.has):not(:focus){color:transparent;}.rec-date input:not(.has):not(:focus)::-webkit-datetime-edit{color:transparent;}.rec-dph{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:14px;color:#A3AEBE;pointer-events:none;}'
  + '.rec-race{grid-column:2;height:34px;padding:0 10px;font-size:13px;border-color:#E6ECF5 !important;background:#F8FAFD !important;}'
  + '.rec-sugg{grid-column:2;justify-self:start;font-size:12px;}'
  + '.pr-tab{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;}.pr-tab th,.pr-tab td{padding:7px 4px;text-align:left;border-top:1px solid #EEF2F7;vertical-align:top;}'
  + '.pr-tab thead th{border-top:none;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748B;padding-top:0;}.pr-tab tbody th{font-weight:800;color:#0C447C;width:28%;}'
  + '.pr-tab td b{display:block;font-size:14px;color:#0F172A;}.pr-tab td small{display:block;font-size:11px;color:#64748B;font-weight:600;}.pr-tab td:last-child b{color:#1B4FD8;}'
  + '.pr-hero{gap:14px;}.pr-verdict{display:flex;align-items:center;gap:14px;}.pr-big{flex-shrink:0;width:54px;height:54px;border-radius:16px;background:#1B4FD8;color:#fff;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;box-shadow:0 6px 16px -6px rgba(27,79,216,.6);}.pr-big.ok{background:#15803D;box-shadow:0 6px 16px -6px rgba(21,128,61,.55);}'
  + '.pr-verdict b{display:block;font-size:18px;font-weight:900;color:#0F172A;line-height:1.2;}.pr-verdict>div>span{display:block;font-size:12.5px;color:#5B6675;line-height:1.4;margin-top:2px;}'
  + '.pr-gauge{background:#F6F8FD;border-radius:12px;padding:10px 12px 12px;}.pr-gl{margin:0 0 42px;line-height:1.35;font-size:13px;font-weight:800;color:#0C447C;}'
  + '.pr-track{position:relative;height:8px;border-radius:4px;background:#E2E8F3;margin:0 14px 30px;}.pr-fill{position:absolute;top:0;bottom:0;border-radius:4px;background:linear-gradient(90deg,#9DB4EC,#1B4FD8);}'
  + '.pr-mk{position:absolute;top:50%;}.pr-mk i{position:absolute;left:-8px;top:-8px;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 4px rgba(15,23,42,.25);}'
  + '.pr-mk.plan i{background:#94A3B8;}.pr-mk.you i{background:#1B4FD8;width:20px;height:20px;left:-10px;top:-10px;}'
  + '.pr-mk em{position:absolute;left:0;transform:translateX(-50%);font-style:normal;font-size:10.5px;font-weight:700;color:#64748B;text-align:center;line-height:1.2;white-space:nowrap;}.pr-mk.plan em{top:14px;}.pr-mk.you em{bottom:16px;color:#1B4FD8;}.pr-mk em b{font-size:13px;font-weight:900;}'
  + '.pr-pills{display:flex;flex-wrap:wrap;gap:6px;}.pr-pill{font-size:12px;font-weight:700;border-radius:999px;padding:5px 10px;line-height:1.3;}.pr-pill.goal{background:#EEF3FC;color:#1E3A8A;}.pr-pill.rest{background:#FEF3C7;color:#92400E;}.pr-pill.base{background:#F1F5F9;color:#334155;}'
  + '.pr-coach-h{font-weight:900 !important;font-size:13.5px !important;}.pr-coach-n{font-size:12px !important;color:#166534 !important;opacity:.85;margin-top:2px !important;}.pr-tag.rev{background:#FEF3C7;color:#92400E;}.pr-hist summary{cursor:pointer;}.pr-hist ul{margin:6px 0 2px;padding-left:18px;font-size:12px;color:#475569;line-height:1.5;}'
  + '.pr-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 4px;margin:0 -2px;scrollbar-width:none;}.pr-strip::-webkit-scrollbar{display:none;}'
  + '.pr-wk{flex:0 0 auto;min-width:62px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px 7px;border-radius:12px;border:1.5px solid #DCE5F3;background:#fff;font-family:inherit;cursor:pointer;}.pr-wk:disabled{cursor:default;}'
  + '.pr-wk-s{font-size:13px;font-weight:900;color:#0F172A;}.pr-wk-d{font-size:10px;font-weight:700;color:#64748B;white-space:nowrap;}.pr-wk-i{margin-top:2px;min-width:26px;height:20px;border-radius:10px;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 6px;box-sizing:border-box;}'
  + '.pr-wk.ok .pr-wk-i{background:#DCFCE7;color:#15803D;}.pr-wk.chg{border-color:#1B4FD8;background:#F2F6FF;}.pr-wk.chg .pr-wk-i{background:#1B4FD8;color:#fff;}.pr-wk.vig{border-color:#F5C46B;}.pr-wk.vig .pr-wk-i{background:#FEF3C7;color:#B45309;}'
  + '.pr-wk.now{box-shadow:0 0 0 3px rgba(27,79,216,.15);}'
  + '.pr-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:-4px 2px 0;font-size:11px;font-weight:700;}.pr-legend .chg{color:#1B4FD8;}.pr-legend .vig{color:#B45309;}.pr-legend .ok{color:#15803D;}'
  + '.pr-week{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;scroll-margin-top:8px;}'
  + '.pr-week header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}.pr-week header b{display:block;font-size:16px;font-weight:900;color:#0C447C;}.pr-week header div>span{display:block;font-size:12px;font-weight:700;color:#64748B;margin-top:1px;}'
  + '.pr-now{display:inline-block;font-size:10px;font-weight:800;color:#1B4FD8;background:#E0E9FF;border-radius:6px;padding:1px 6px;vertical-align:2px;margin-left:4px;}'
  + '.pr-kind{flex-shrink:0;font-size:11.5px;font-weight:800;border-radius:999px;padding:4px 9px;background:#F1F5F9;color:#334155;}.pr-kind.k-race{background:#FEF9C3;color:#854D0E;}.pr-kind.k-recov,.pr-kind.k-taper{background:#ECFDF5;color:#047857;}.pr-kind.k-peak{background:#FFF1E6;color:#C2410C;}'
  + '.pr-chg{border:1.5px solid #1B4FD8;background:#F7F9FF;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;transition:opacity .2s,border-color .2s,background .2s;}.pr-chg.off{border-color:#DCE5F3;background:#fff;opacity:.6;}'
  + '.pr-chg-h{display:flex;align-items:center;gap:10px;}.pr-dot{flex-shrink:0;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;}'
  + '.pr-chg-t{flex:1;min-width:0;}.pr-chg-t b{display:block;font-size:14px;font-weight:850;color:#0F172A;line-height:1.25;}.pr-chg-t small{display:block;font-size:11.5px;font-weight:700;color:#64748B;margin-top:1px;}'
  + '.pr-tick{flex-shrink:0;width:30px;height:30px;border-radius:50%;border:2px solid #C3CEE0;background:#fff;cursor:pointer;position:relative;padding:0;}.pr-tick[aria-pressed=true]{background:#1B4FD8;border-color:#1B4FD8;}'
  + '.pr-tick[aria-pressed=true]::after{content:"";position:absolute;left:9px;top:4px;width:7px;height:13px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg);}'
  + '.pr-swap{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-variant-numeric:tabular-nums;}.pr-p{font-size:15px;font-weight:800;border-radius:9px;padding:5px 9px;white-space:nowrap;}.pr-p.old{background:#F1F5F9;color:#94A3B8;text-decoration:line-through;font-size:13px;}.pr-p.new{background:#1B4FD8;color:#fff;}'
  + '.pr-arr{font-weight:900;color:#1B4FD8;}.pr-u{font-size:12px;font-weight:700;color:#64748B;margin-left:-2px;}.pr-d{display:inline-block;font-size:11.5px;font-weight:900;border-radius:999px;padding:2px 8px;margin-right:6px;white-space:nowrap;}.pr-d.fast{background:#DCFCE7;color:#15803D;}.pr-d.slow{background:#FFEDD5;color:#C2410C;}'
  + '.pr-chg .pr-why{font-size:12.5px;color:#334155;font-weight:600;margin:0;line-height:1.4;}.pr-txt{display:flex;flex-direction:column;gap:4px;}.pr-txt p,.pr-full p{margin:0;}'
  + '.pr-full summary{font-size:11.5px;font-weight:800;color:#1B4FD8;cursor:pointer;}.pr-full[open]{display:flex;flex-direction:column;gap:4px;}'
  + '.pr-vig{display:flex;flex-direction:column;gap:6px;background:#FFFBEB;border-radius:12px;padding:9px 11px;}.pr-vig p{margin:0;display:flex;gap:8px;font-size:12.5px;line-height:1.4;color:#713F12;}.pr-vig i{font-style:normal;flex-shrink:0;}.pr-vig .pr-vig-n{font-size:11.5px;color:#A16207;font-weight:700;}'
  + '.pr-ask{display:flex;flex-direction:column;gap:6px;}.pr-held{border:1.5px dashed #F5C46B;background:#FFFBEB;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:8px;}.pr-held-t b{display:block;font-size:14px;font-weight:850;color:#0F172A;}.pr-held-t small{display:block;font-size:11.5px;font-weight:700;color:#A16207;margin-top:1px;}.pr-p.cur{background:#fff;color:#334155;font-size:13px;border:1px solid #E2E8F0;}.pr-p.sug{background:#FEF3C7;color:#92400E;}.pr-held-b{padding:9px;font-size:13px;}'
  + '.pr-fold{display:block;}.pr-fold[open]>*:not(summary){margin-top:10px;}.pr-fold summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;}.pr-fold summary::-webkit-details-marker{display:none;}.pr-fold summary::after{content:"Détail ▾";font-size:12px;font-weight:800;color:#1B4FD8;}.pr-fold[open] summary::after{content:"Masquer ▴";}'
  + '.pr-load{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;}.pr-load-h{display:flex;justify-content:space-between;align-items:baseline;}.pr-load-h b{font-size:16px;font-weight:900;color:#0C447C;}.pr-load-h span{font-size:12px;font-weight:800;color:#1B4FD8;font-variant-numeric:tabular-nums;}'
  + '.pr-bar{height:6px;border-radius:3px;background:#E2E8F3;overflow:hidden;position:relative;}.pr-bar i{display:block;height:100%;width:0;border-radius:3px;background:linear-gradient(90deg,#60A5FA,#1B4FD8);transition:width .35s ease;}'
  + '.pr-bar.indet i{width:40%;position:absolute;animation:_prInd 1.4s ease-in-out infinite;}@keyframes _prInd{0%{left:-40%;}100%{left:100%;}}'
  + '.pr-step{display:flex;align-items:center;gap:12px;opacity:.35;transition:opacity .25s;}.pr-step.run,.pr-step.ok{opacity:1;}'
  + '.pr-step-ic{position:relative;flex-shrink:0;width:36px;height:36px;border-radius:11px;background:#F1F5FB;display:flex;align-items:center;justify-content:center;font-size:17px;transition:background .25s;}.pr-step.ok .pr-step-ic{background:#E7F0FF;}'
  + '.pr-step.run .pr-step-ic::after{content:"";position:absolute;inset:-3px;border-radius:13px;border:2.5px solid transparent;border-top-color:#1B4FD8;border-right-color:#1B4FD8;animation:_prSpin .7s linear infinite;}'
  + '.pr-step-t{flex:1;min-width:0;}.pr-step-t b{display:block;font-size:13.5px;font-weight:800;color:#0F172A;}.pr-step-t small{display:block;font-size:12px;font-weight:600;color:#64748B;margin-top:1px;transition:opacity .25s;}.pr-step:not(.ok) small{opacity:0;}'
  + '.pr-step-ok{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#15803D;color:#fff;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;transform:scale(0);transition:transform .25s cubic-bezier(.3,1.6,.5,1);}.pr-step.ok .pr-step-ok{transform:scale(1);}'
  + '#pr-content.pr-in>*{animation:_prFade .4s ease both;}#pr-content.pr-in>*:nth-child(2){animation-delay:.06s;}#pr-content.pr-in>*:nth-child(3){animation-delay:.12s;}#pr-content.pr-in>*:nth-child(n+4){animation-delay:.18s;}@keyframes _prFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}'
  + '.pr-cl{background:#fff;border:1.5px solid #1B4FD8;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;}.pr-cl-h{display:flex;align-items:center;gap:12px;}.pr-cl-ic{font-size:22px;width:42px;height:42px;border-radius:13px;background:#EEF3FC;display:flex;align-items:center;justify-content:center;animation:_prBob 1.6s ease-in-out infinite;}@keyframes _prBob{50%{transform:translateY(-3px);}}'
  + '.pr-cl-h b{display:block;font-size:15px;font-weight:900;color:#0C447C;}.pr-cl-h small{display:block;font-size:11.5px;font-weight:700;color:#64748B;font-variant-numeric:tabular-nums;}.pr-cl-msg{margin:0;font-size:13px;font-weight:600;color:#334155;min-height:36px;line-height:1.4;}.pr-cl-msg.sw{animation:_prFade .35s ease both;}'
  + '.pr-pop{animation:_prFade .45s ease both;}'
  + '@media (prefers-reduced-motion:reduce){.pr-bar.indet i,.pr-cl-ic,.pr-step.run .pr-step-ic::after{animation:none;}#pr-content.pr-in>*{animation:none;}}'
  + '.pr-pill.ok{background:#DCFCE7;color:#166534;}.pr-tag.wh{background:#DCFCE7;color:#166534;}.pr-tag.ts{background:#EDE9FE;color:#5B21B6;}.pr-tag.vo{background:#E0F2FE;color:#075985;}.pr-tgt{color:#1B4FD8;font-weight:800;}'
  + '.pr-tj{gap:10px;}.pr-tj-h{margin:0;font-size:14px;font-weight:700;color:#0F172A;line-height:1.45;}.pr-tj-h b{font-variant-numeric:tabular-nums;color:#0C447C;}'
  + '.pr-verd{display:inline-block;font-size:11.5px;font-weight:800;border-radius:999px;padding:2px 9px;margin-left:2px;}.pr-verd.ok{background:#DCFCE7;color:#166534;}.pr-verd.mid{background:#FEF3C7;color:#92400E;}.pr-verd.hard{background:#FFE4E6;color:#9F1239;}'
  + '.tj-svg,.vc-svg{width:100%;height:auto;display:block;overflow:visible;}.tj-grid{stroke:#EEF2F7;stroke-width:1;}.tj-ax,.vc-ax{font-size:9px;fill:#94A3B8;font-weight:700;font-family:inherit;}'
  + '.tj-goal{stroke:#E8530A;stroke-width:1.2;stroke-dasharray:4 3;}.tj-goal-t{font-size:9px;fill:#E8530A;font-weight:800;}.tj-band{fill:rgba(27,79,216,.10);}.tj-proj{stroke:#1B4FD8;stroke-width:2;stroke-dasharray:5 4;}'
  + '.tj-race{fill:#E8530A;stroke:#fff;stroke-width:1.5;}.tj-ses{fill:#93B4F5;}.tj-now{fill:#1B4FD8;stroke:#fff;stroke-width:2;}.tj-end{fill:#fff;stroke:#1B4FD8;stroke-width:2.5;}.tj-end-t{font-size:10px;fill:#1B4FD8;font-weight:900;}'
  + '.pr-tj-leg{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;font-size:11px;font-weight:700;color:#64748B;}.pr-tj-leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:-1px;}'
  + '.lg-race{background:#E8530A;}.lg-ses{background:#93B4F5;}.lg-proj{background:transparent;border:2px dashed #1B4FD8;width:8px !important;height:8px !important;}.lg-plan{background:#E2E8F0;border-radius:2px !important;}.lg-tgt{background:#1B4FD8;height:3px !important;border-radius:2px !important;vertical-align:2px !important;}.lg-after{background:#1B4FD8;border-radius:2px !important;}.lg-done{background:#86EFAC;border-radius:2px !important;}'
  + '.pr-vol{gap:6px;padding:12px 12px 10px;}.pr-vol-h{margin:0;font-size:13px;font-weight:850;color:#0C447C;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;}.pr-vol-h span{font-size:11px;font-weight:700;color:#64748B;}'
  + '.vc-plan{fill:#E2E8F0;}.vc-after{fill:#1B4FD8;}.vc-done{fill:#86EFAC;}.vc-tgt{stroke:#1B4FD8;stroke-width:2.5;stroke-linecap:round;}'
  + '.pr-undo{display:block;margin:6px 0 2px;font-size:12px;}'
  + '.pr-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:_prSpin .7s linear infinite;}@keyframes _prSpin{to{transform:rotate(360deg);}}';
const PR_CSS2 = '.pr-top{display:flex;align-items:center;gap:10px;padding:2px 2px 0;}.pr-top b{font-size:17px;font-weight:900;color:#0F172A;flex:1;}.pr-top-n{min-width:34px;height:34px;padding:0 8px;border-radius:11px;background:#1D4ED8;color:#fff;font-weight:900;font-size:18px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;}'
  + '.pr-uptodate{display:flex;align-items:center;gap:12px;}.pr-uptodate b{display:block;font-size:17px;color:#0F172A;}.pr-uptodate span{font-size:12.5px;color:#64748B;}'
  + '.pr-keys{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.pr-key{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:9px 11px;display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;min-width:0;}'
  + '.pr-key-i{grid-row:span 2;font-size:20px;line-height:1;}.pr-key b{font-size:18px;font-weight:900;color:#0F172A;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.pr-key b.sm{font-size:14.5px;}.pr-key small{font-size:11px;color:#64748B;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
  + '.pr-key.ok{border-color:#BBF7D0;background:#F0FDF4;}.pr-key.mid{border-color:#FDE68A;background:#FFFBEB;}.pr-key.low{border-color:#FECACA;background:#FEF2F2;}'
  + '.pr-alerts{display:flex;flex-direction:column;gap:6px;}.pr-alerts p{margin:0;display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:700;border-radius:12px;padding:8px 11px;}.pr-alerts p.low{background:#FEF2F2;color:#991B1B;}.pr-alerts p.mid{background:#FFFBEB;color:#92400E;}.pr-alerts p.ok{background:#ECFDF5;color:#065F46;}'
  + '.pr-lead{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:10px 12px;margin-bottom:10px;}.pr-lead span{font-size:20px;}.pr-lead p{margin:0;font-size:14px;font-weight:700;color:#0F172A;line-height:1.35;}'
  + '.pr-grp{display:flex;align-items:center;gap:8px;margin:12px 0 6px;font-size:13px;}.pr-grp i{font-style:normal;font-weight:900;width:24px;height:24px;border-radius:8px;display:flex;align-items:center;justify-content:center;}.pr-grp b{font-weight:800;color:#0F172A;}.pr-grp span{color:#64748B;font-size:12px;min-width:0;}'
  + '.pr-grp.up i{background:#ECFDF5;color:#047857;}.pr-grp.down i{background:#FFFBEB;color:#B45309;}.pr-grp.move i{background:#EEF3FC;color:#1B4FD8;}.pr-grp.lib i{background:#F5F3FF;color:#6D28D9;}.pr-grp.other i{background:#F1F5F9;color:#334155;}'
  + '.pr-hl{margin:6px 0 2px;font-size:13.5px;font-weight:800;}.pr-hl.up{color:#047857;}.pr-hl.down{color:#B45309;}.pr-hl.move{color:#1B4FD8;}.pr-hl.lib{color:#6D28D9;}.pr-hl.other{color:#334155;}'
  + '.pr-goal,.pr-nw{background:#fff;border:1px solid #DCE5F3;border-radius:16px;padding:12px 14px;margin-bottom:10px;}.pr-goal.up{border-color:#A7F3D0;background:#F0FDF7;}.pr-goal.down{border-color:#FDE68A;background:#FFFBEB;}'
  + '.pr-goal-h{margin:0 0 6px;font-size:14px;font-weight:800;color:#0F172A;}.pr-goal-s{margin:6px 0 0;font-size:12.5px;color:#475569;line-height:1.4;}.pr-goal .pr-actions{margin-top:10px;}'
  + '.pr-nw-l{display:flex;flex-direction:column;gap:4px;margin-top:8px;}.pr-nw-l span{font-size:12.5px;color:#334155;background:#F5F8FD;border-radius:9px;padding:6px 9px;}.pr-nw-l span.chg{background:#EEF3FC;color:#1B4FD8;font-weight:700;}.pr-alerts i{font-style:normal;}'
  + '.pr-actions{display:flex;gap:8px;}.pr-chat-w{width:100%;margin:0 0 6px;}.pr-actions .pr-btn{flex:1;margin:0;padding:11px 8px;font-size:14px;}.pr-chat-b{background:#EEF2FF;color:#3730A3;border:1.5px solid #C7D2FE;}.pr-mini{margin:0;font-size:11.5px;color:#64748B;font-weight:600;}'
  + '.pr-more{background:#fff;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;}.pr-more>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;}.pr-more>summary::-webkit-details-marker{display:none;}'
  + '.pr-more-i{font-size:18px;}.pr-more-t{flex:1;min-width:0;display:flex;flex-direction:column;}.pr-more-t b{font-size:14px;color:#0F172A;}.pr-more-t small{font-size:11.5px;color:#64748B;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
  + '.pr-more-c{color:#94A3B8;font-size:18px;transition:transform .2s;}.pr-more[open] .pr-more-c{transform:rotate(90deg);}.pr-more-b{padding:0 12px 12px;display:flex;flex-direction:column;gap:8px;}.pr-coach-t{margin:0;font-size:13px;line-height:1.45;color:#334155;}'
  + '.pr-why{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.pr-why-t{font-size:12px;color:#475569;font-weight:600;}.pr-whatif-b{width:100%;margin:0;}.pr-vig-h{font-weight:800;color:#0C447C;font-size:12px;}'
  + '.pr-chg{padding:9px 11px;gap:6px;}.pr-chg .pr-dot{width:30px;height:30px;font-size:15px;}.pr-chg .pr-p{font-size:14px;padding:4px 8px;}'
  + '.pr-rest>summary{list-style:none;cursor:pointer;text-align:center;font-size:13px;font-weight:800;color:#1D4ED8;background:#EEF3FF;border:1.5px dashed #BFD0FF;border-radius:12px;padding:9px;}.pr-rest>summary::-webkit-details-marker{display:none;}.pr-rest[open]>summary{margin-bottom:8px;}.pr-rest-b{display:flex;flex-direction:column;gap:10px;}'
  + '@media (prefers-reduced-motion:reduce){.pr-more-c{transition:none;}}';
// mise en page simplifiée : « Où tu en es » → changements semaine par semaine (une ligne chacun) → « Comprendre ton plan »
const PR_CSS3 = '.pr-sum{background:#fff;border:1px solid #DCE5F3;border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:10px;margin-bottom:12px;}'
  + '.pr-sum .pr-lead{border:0;padding:0;margin:0;background:none;}.pr-sum .pr-lead p{font-size:15px;font-weight:800;}'
  + '.pr-sum .pr-keys{grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:6px;}.pr-sum .pr-key{display:flex;flex-direction:column;gap:1px;padding:7px 8px;border-radius:12px;}'
  + '.pr-sum .pr-key small{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;}.pr-sum .pr-key b{font-size:16px;}.pr-sum .pr-key span{font-size:11px;color:#475569;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
  + '.pr-sum .pr-alerts p{font-size:12.5px;}.pr-sum .pr-mini{margin:0;}'
  + '.pr-wsec{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 2px 6px;font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#64748B;}'
  + '.pr-wsec span,.pr-wsec p span{min-width:22px;height:22px;border-radius:11px;background:#EEF3FC;color:#1B4FD8;font-size:12px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;letter-spacing:0;}'
  + 'div.pr-wsec{display:block;background:#fff;border:1px solid #DCE5F3;border-radius:14px;padding:10px 12px;text-transform:none;letter-spacing:0;color:#0F172A;}div.pr-wsec>p{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;font-size:13.5px;font-weight:800;}'
  + '.pr-nw-b{width:100%;margin-top:8px;}'
  + '.pr-chg{flex-direction:row;align-items:flex-start;gap:10px;padding:10px 11px;margin-bottom:6px;}.pr-chg .pr-tick{width:26px;height:26px;margin-top:1px;}.pr-chg .pr-tick[aria-pressed=true]::after{left:7px;top:3px;width:6px;height:12px;}'
  + '.pr-chg-b{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}.pr-chg-t{margin:0;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;}.pr-chg-t b{display:inline;font-size:14px;}'
  + '.pr-day{font-size:12px;font-weight:800;color:#64748B;text-transform:capitalize;}'
  + '.pr-chg .pr-hl{margin:0;display:flex;gap:6px;align-items:baseline;}.pr-chg .pr-hl i{font-style:normal;}'
  + '.pr-chg .pr-why{margin:0;font-size:12px;}.pr-chg .pr-full{margin-top:2px;}.pr-chg .pr-full summary{font-size:12px;font-weight:700;color:#1B4FD8;cursor:pointer;}.pr-chg .pr-full .pr-swap{margin:6px 0 4px;}'
  + '.pr-goal .pr-goal-h{margin-bottom:8px;}'
  // cartes neutres (la coche seule dit ce qui est retenu), en 2 lignes, détail au toucher ; barres de km
  + '.pr-chg{border:1px solid #E2E8F0;background:#fff;}.pr-chg.off{border-color:#EEF2F7;background:#F8FAFC;opacity:.55;}'
  + '.pr-cd{flex:1;min-width:0;}.pr-cd>summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:2px;}.pr-cd>summary::-webkit-details-marker{display:none;}'
  + '.pr-cd .pr-hl>span:not(.pr-kb){flex:1;min-width:0;}.pr-cd .pr-hl .pr-kb{flex:0 0 40px;}.pr-cd-b{margin-top:8px;padding-top:8px;border-top:1px dashed #E2E8F0;display:flex;flex-direction:column;gap:6px;}.pr-cd-b .pr-swap{margin:0;}'
  + '.pr-kb{flex:0 0 44px;display:flex;flex-direction:column;gap:2px;align-self:center;}.pr-kb i{display:block;height:4px;border-radius:2px;background:#CBD5E1;}.pr-kb i.n{background:#1B4FD8;}.pr-kb.down i.n{background:#F59E0B;}.pr-kb.up i.n{background:#10B981;}'
  + '@keyframes prFlash{0%{box-shadow:0 0 0 3px rgba(27,79,216,.35);}100%{box-shadow:0 0 0 0 rgba(27,79,216,0);}}.pr-flash{animation:prFlash 1.2s ease-out;}'
  // repères calmes : fond neutre, seule la valeur qui pose problème en couleur
  + '.pr-sum .pr-key,.pr-sum .pr-key.ok,.pr-sum .pr-key.mid,.pr-sum .pr-key.low{background:#F8FAFC;border-color:#E2E8F0;}.pr-sum .pr-key.mid b{color:#B45309;}.pr-sum .pr-key.low b{color:#B91C1C;}'
  // frise de la semaine
  + '.pr-strip7{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin:0 0 8px;}.pr-d7{background:none;border:0;padding:2px 0;display:flex;flex-direction:column;align-items:center;gap:3px;font:inherit;cursor:pointer;}'
  + '.pr-d7 i{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:13px;border:1.5px dashed #E2E8F0;box-sizing:border-box;}'
  + '.pr-d7 i.plan{border:1.5px solid #CBD5E1;background:#fff;}.pr-d7 i.done{background:#CBD5E1;border:0;}.pr-d7 i.up{background:#ECFDF5;color:#047857;border:1.5px solid #6EE7B7;}.pr-d7 i.down{background:#FFFBEB;color:#B45309;border:1.5px solid #FCD34D;}'
  + '.pr-d7 i.move{background:#EEF3FC;color:#1B4FD8;border:1.5px solid #93C5FD;}.pr-d7 i.lib{background:#F5F3FF;color:#6D28D9;border:1.5px solid #C4B5FD;}.pr-d7 i.other{background:#F1F5F9;color:#334155;border:1.5px solid #CBD5E1;}'
  + '.pr-d7 small{font-size:10.5px;color:#94A3B8;font-weight:800;}.pr-d7.tod small{color:#1B4FD8;}'
  // icônes au trait
  + '.pr-lead .pi{width:22px;height:22px;color:#1B4FD8;}.pr-alerts .pi{width:15px;height:15px;}.pr-evo-b .pi,.pr-more-i .pi{width:20px;height:20px;color:#1B4FD8;}.pr-goal-h .pi,.pr-wsec .pi,.pr-mini .pi,.pr-chat-b .pi{width:16px;height:16px;}'
  + '.pe-ci{display:flex;gap:8px;margin:4px 0;}.pe-ci .pi{width:16px;height:16px;color:#1B4FD8;margin-top:1px;}.pe-th{margin-top:16px;}.pr-tic{width:22px;height:22px;vertical-align:-4px;}';
function _prCss(){ if(!document.getElementById('pr-css')){ const st = document.createElement('style'); st.id = 'pr-css'; st.textContent = PR_CSS + PR_CSS2 + PR_CSS3; document.head.appendChild(st); } }

// Écran « MAJ le plan » et « Mes records » (à la demande : groupe « review », points d'entrée dans config.js) — sortis de
// plan-review.js pour alléger le démarrage ; le moteur (prAnalyze, prApplyChanges, prCoachBody…) reste dans plan-review.js.
function openRecordsModal(onDone){
  _prCss();
  const meta = state._records || {}, mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'records-modal'; ov.style.zIndex = '720'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  const best = function(c){ return typeof prepBestTime === 'function' ? prepBestTime(c) : null; };
  const ph = ['mm:ss', 'mm:ss', 'h:mm:ss', 'h:mm:ss'];
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Entraînement</p><p class="pr-title">🏆 Mes records</p><p class="pr-sub">Ils fixent ton niveau et les allures de ton plan</p></div><button class="pr-x" onclick="document.getElementById(\'records-modal\').remove()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px;">'
    + '<div class="pr-card rec-list">'
    + PR_CATS.map(function(c, i){
        const k = PR_RECORD_KEY[c], m = meta[c] || {}, b = best(c), v = state[k] || '';
        return '<div class="rec-row">'
          + '<div class="rec-dist"><b>' + prCatLabel(c) + '</b><span id="rec-v-' + i + '"></span></div>'
          + '<div class="rec-fields">'
          +   '<input id="rec-t-' + i + '" class="rec-time" inputmode="numeric" autocomplete="off" aria-label="Temps ' + prCatLabel(c) + '" placeholder="' + ph[i] + '" value="' + prEsc(v) + '" oninput="prFmtTimeInput(this);prRecLive(' + i + ')">'
          +   '<label class="rec-date"><input id="rec-d-' + i + '" type="date" aria-label="Date du record ' + prCatLabel(c) + '" max="' + prTodayIso() + '" value="' + prEsc(m.date || '') + '" onchange="prRecLive(' + i + ')"><span id="rec-dp-' + i + '" class="rec-dph"' + (m.date ? ' hidden' : '') + '>Date</span></label>'
          + '</div>'
          + '<input id="rec-r-' + i + '" class="rec-race" aria-label="Course ' + prCatLabel(c) + '" placeholder="Nom de la course (facultatif)" value="' + prEsc(m.race || '') + '">'
          + (!v && b ? '<button type="button" class="pr-link rec-sugg" onclick="const t=document.getElementById(\'rec-t-' + i + '\');t.value=\'' + b.time + '\';prRecLive(' + i + ');this.remove()">↺ Reprendre ' + b.time + ' (' + prEsc(b.src === 'record' ? 'record' : b.src) + ')</button>' : '')
          + '</div>';
      }).join('')
    + '</div><p class="pr-note" style="padding:0 2px;">Tape seulement les chiffres : 4423 → 44:23 · 13700 → 1:37:00. Un record sans date ou de plus de 6 mois compte moins.</p></div></div>'
    + '<div class="pr-foot"><button type="button" class="pr-btn pri" onclick="saveRecordsModal()">Enregistrer mes records</button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) ov.remove(); });
  mc.appendChild(ov);
  PR_CATS.forEach(function(c, i){ prRecLive(i); });
  window._recordsDone = onDone || null;
}
function saveRecordsModal(){
  const meta = Object.assign({}, state._records || {}), up = {};
  for(let i = 0; i < PR_CATS.length; i++){
    const c = PR_CATS[i], k = PR_RECORD_KEY[c], raw = document.getElementById('rec-t-' + i).value.trim();
    const sec = raw ? prTimeSec(raw) : null, km = PR_RACE_M[c] / 1000;
    if(raw && (!sec || sec / km < 150 || sec / km > 600)){ alert(prCatLabel(c) + ' : temps invalide (ex. ' + (i < 2 ? '42:30' : '1:35:00') + ').'); return; }
    up[k] = sec ? prTime(sec) : null;
    const d = document.getElementById('rec-d-' + i).value, r = document.getElementById('rec-r-' + i).value.trim();
    if(sec) meta[c] = { date: d || null, race: r || null }; else delete meta[c];
  }
  Object.keys(up).forEach(function(k){ if(up[k]) state[k] = up[k]; else delete state[k]; });
  state._records = meta;
  save();
  const ov = document.getElementById('records-modal'); if(ov) ov.remove();
  renderRecordsRow();
  if(typeof showToast === 'function') showToast('Records enregistrés 🏆');
  if(typeof window._recordsDone === 'function') window._recordsDone();
}
function openPlanReview(opts){
  _prCss(); opts = opts || {};
  if(document.getElementById('plan-review')) return;
  const R0 = typeof prepRace === 'function' ? prepRace() : {};
  const a = { race: R0 };
  const mc = document.getElementById('modal-container'), ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'plan-review'; ov.style.setProperty('--_overlay-bg', 'rgba(0,0,0,0.45)');
  ov.innerHTML = '<div class="modal-box" style="max-height:94vh;"><div class="pr-head"><div><p class="pr-eb">Plan</p><p class="pr-title">' + piIc('🔄', 'pr-tic') + ' Mise à jour du plan</p><p class="pr-sub">' + prEsc(a.race.name || 'Prépa en cours') + (a.race.objectif && a.race.objectif !== 'non défini' ? ' · objectif ' + prEsc(a.race.objectif) : '') + '</p></div>'
    + '<button class="pr-x" onclick="closePlanReview()" aria-label="Fermer">×</button></div>'
    + '<div class="modal-scroll-body pr-body"><div id="pr-content" style="padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px;"></div></div>'
    + '<div class="pr-foot"><button type="button" id="pr-apply" class="pr-btn ok" onclick="applyPlanReview()"></button></div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePlanReview(); });
  mc.appendChild(ov);
  const box = document.getElementById('pr-content'); if(box) box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span>0 %</span></div><div class="pr-bar indet"><i></i></div></div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  (async function(){
    if(typeof prPrefetch === 'function'){ try { await prPrefetch(); } catch(e) {} }
    if(ov !== document.getElementById('plan-review')) return;
    const an = prAnalyze();
    _prReview = { a: an, items: an.proposals.map(function(p){ return Object.assign({ on: true }, p); }), held: an.held.slice(), coach: null, autoCoach: !!opts.autoCoach };
    _prReview.items.forEach(function(x){ const d = prRevertOf(x); if(d){ x.revert = d; x.on = false; } });
    _prReview.auto = _prReview.items.slice();
    _prRestoreCoach(_prReview);
    state._review_seen = prSig(an.proposals);
    if(dbRef) dbRef.child('_review_seen').set(state._review_seen).catch(function(){});
    _prLoading(an);
  })();
  try { if(typeof renderPlan === 'function'){ rendered.plan = false; } } catch(e) { diagSilent(e, 'plan-review:openPlanReview'); }
}
function closePlanReview(){ const ov = document.getElementById('plan-review'); if(ov) ov.remove(); if(_prReview && _prReview.clTimer) clearInterval(_prReview.clTimer); _prReview = null; try { renderPlan(); if(typeof planCardRender === 'function') planCardRender(); } catch(e) { diagSilent(e, 'plan-review:closePlanReview'); } }
// Analyse affichée étape par étape, avec les chiffres réellement calculés (records, séances, base, plan), puis le résultat
function _prLoading(a){
  const box = document.getElementById('pr-content'); if(!box) return;
  const f = a.fit, sess = prSessions(state), today = a.opt.today, pl = function(n, w){ return n + ' ' + w + (n > 1 ? 's' : ''); };
  const done = sess.filter(function(x){ return x.done; }).length, next = sess.filter(function(x){ return !x.done && (!x.date || x.date >= today); }).length;
  const nW = Object.keys(sess.reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const races = (f.sources || []).filter(function(x){ return x.kind === 'course'; }).length, qual = (f.sources || []).filter(function(x){ return x.kind === 'séance'; }).length;
  const n = a.proposals.length, nv = a.warnings.filter(function(x){ return x.w != null; }).length;
  const steps = [
    ['🏆', 'Tes records et tes courses', races ? pl(races, 'résultat') + ' → niveau ' + prV(f.vdot) : f.vdot ? 'niveau ' + prV(f.vdot) + ' d\'après tes ' + prEsc(f.basis) : 'aucun record daté'],
    ['✅', 'Tes séances réalisées', pl(done, 'séance') + ' validée' + (done > 1 ? 's' : '') + (qual ? ' · ' + pl(qual, 'séance') + ' de qualité mesurée' + (qual > 1 ? 's' : '') : '')],
    ['🏋️', 'Ta base d\'entraînement', a.opt.habitual ? '~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')' : 'pas de prépa précédente enregistrée'],
    ['📈', 'Ta charge réelle', a.load ? a.load.k7 + ' km sur 7 jours · ~' + a.load.chronic + ' km/sem sur 28 jours' + (a.drift ? ' · dérive cardiaque ' + prV(a.drift.avg) + ' %' : '') : 'non disponible'],
    ['💚', 'Ta récupération', a.whoop ? 'WHOOP : ' + a.whoop.avg3 + ' % en moyenne sur 3 jours' + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : '') : 'pas de données WHOOP récentes'],
    ['📅', 'Ton plan, semaine par semaine', pl(nW, 'semaine') + ' · ' + pl(next, 'séance') + ' à venir contrôlée' + (next > 1 ? 's' : '')],
    ['🎯', 'Propositions', (n ? pl(n, 'ajustement') + ' proposé' + (n > 1 ? 's' : '') : 'rien à ajuster') + (nv ? ' · ' + pl(nv, 'point') + ' de vigilance' : '')]
  ];
  box.innerHTML = '<div class="pr-load"><div class="pr-load-h"><b>Analyse de ton plan…</b><span id="pr-load-pct">0 %</span></div><div class="pr-bar"><i id="pr-load-bar"></i></div>'
    + steps.map(function(st, i){ return '<div class="pr-step" id="pr-step-' + i + '"><span class="pr-step-ic">' + st[0] + '</span><span class="pr-step-t"><b>' + st[1] + '</b><small>' + st[2] + '</small></span><span class="pr-step-ok">✓</span></div>'; }).join('') + '</div>';
  const b = document.getElementById('pr-apply'); if(b){ b.disabled = true; b.textContent = 'Analyse en cours…'; }
  const fast = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, T = fast ? 90 : 300, R = _prReview;
  steps.forEach(function(st, i){
    setTimeout(function(){
      if(_prReview !== R) return;
      const el = document.getElementById('pr-step-' + i); if(el) el.classList.add('run');
      setTimeout(function(){
        if(_prReview !== R) return;
        if(el){ el.classList.remove('run'); el.classList.add('ok'); }
        const pct = Math.round((i + 1) / steps.length * 100), bar = document.getElementById('pr-load-bar'), t = document.getElementById('pr-load-pct');
        if(bar) bar.style.width = pct + '%'; if(t) t.textContent = pct + ' %';
      }, T * 0.75);
    }, i * T);
  });
  setTimeout(function(){
    if(_prReview !== R) return;
    const c = document.getElementById('pr-content'); if(c){ c.classList.add('pr-in'); }
    _prRender();
    // ouverture depuis la notification du dimanche : avis du Coach s'il y a du nouveau
    if(R.autoCoach && typeof isAdmin === 'function' && isAdmin() && !(state._coach_review && state._coach_review.sig === prDataSig())) setTimeout(function(){ if(_prReview === R) askCoachPlanReview(); }, 400);
  }, steps.length * T + (fast ? 100 : 450));
}
function _prGoIt(i){ const el = document.getElementById('pr-it-' + i); if(!el) return; const d = el.closest('details.pr-rest'); if(d) d.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('pr-flash'); void el.offsetWidth; el.classList.add('pr-flash'); }
function _prGo(w){ const el = document.getElementById('pr-wk-' + w); if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
// séance mise en attente (début de récupération) : l'athlète choisit de l'accélérer quand même
function _prUnhold(i){
  const R = _prReview; if(!R || !R.held || !R.held[i]) return;
  const p = Object.assign({}, R.held.splice(i, 1)[0], { on: true, held: false });
  p.short = 'Accélérée à ta demande malgré la récupération : écoute tes sensations.';
  R.items.push(p); if(R.auto) R.auto.push(p); R.items.sort(function(x, y){ return (x.date || '').localeCompare(y.date || '') || x.w - y.w; });
  _prRender();
  const k = R.items.indexOf(p), el = document.getElementById('pr-it-' + k); if(el){ el.classList.add('pr-pop'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function _prToggle(i){
  const it = _prReview && _prReview.items[i]; if(!it) return;
  it.on = !it.on;
  _prReview.items.forEach(function(x, j){                                   // échange de jours : les deux séances ensemble
    if(j !== i && it.pair && x.pair === it.pair) x.on = it.on;
    if(j !== i && !(it.pair && x.pair === it.pair)) return;
    const el = document.getElementById('pr-it-' + j); if(el){ el.classList.toggle('off', !x.on); const t = el.querySelector('.pr-tick'); if(t) t.setAttribute('aria-pressed', x.on ? 'true' : 'false'); }
  });
  _prFoot();
}
// une proposition : séance, changement en grand (allure, km, titre), raison en une phrase
function _prItem(p, i, wo){
  const ty = p.type || 'ef';
  const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
  let swap = '', full = '', delta = '';
  if(p.field === 'detail' && !p.pb){                                       // consigne du Coach : allures extraites si elles changent
    const m1 = String(p.before).match(PR_PACE_RE), m2 = String(p.after).match(PR_PACE_RE);
    if(m1 && m2 && m1[0] !== m2[0]){
      const mid = function(m){ const x = prParsePace(m[1], m[2]), y = m[3] ? prParsePace(m[3], m[4]) : x; return (x + y) / 2; };
      p = Object.assign({}, p, { pb: m1[0].replace(/\s*\/\s*km$/, ''), pa: m2[0].replace(/\s*\/\s*km$/, ''), delta: Math.round(mid(m2) - mid(m1)) });
    }
  }
  const sw = function(a, b){ return '<div class="pr-swap"><span class="pr-p old">' + prEsc(a) + '</span><span class="pr-arr">→</span><span class="pr-p new">' + prEsc(b) + '</span></div>'; };
  if(p.pb && p.pa){
    const d = p.delta || 0;
    swap = sw(p.pb + ' /km', p.pa + ' /km');
    if(d) delta = '<span class="pr-d ' + (d < 0 ? 'fast' : 'slow') + '">' + (d < 0 ? '⚡ ' + (-d) + ' s/km plus vite' : '🐢 ' + d + ' s/km plus lent') + '</span>';
    full = '<p class="pr-old">' + prEsc(p.before) + '</p><p class="pr-new">' + prEsc(p.after) + '</p>';
  } else if(p.field === 'session'){
    swap = sw(p.before.t + ' · ' + p.before.km + ' km', p.after.t + ' · ' + p.after.km + ' km');
    full = '<p class="pr-old">' + prEsc(p.before.d) + '</p><p class="pr-new">' + prEsc(p.after.d) + '</p>';
  } else if(p.field === 'km') swap = sw(p.before + ' km', p.after + ' km');
  else if(p.field === 'date'){ const D = function(d){ return prFmtDate(d, { weekday: 'short', day: 'numeric' }); }; swap = sw(D(p.before), D(p.after)); }
  else if(p.field === 'type'){ const L = function(t){ return (typeof typeLabel !== 'undefined' && typeLabel[t]) || t; }; swap = sw(L(p.before), L(p.after)); }
  else full = '<p class="pr-old">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.before) + '</p><p class="pr-new">' + (p.field === 'title' ? 'Titre : ' : '') + prEsc(p.after) + '</p>';
  const tag = p.src === 'coach' ? '<span class="pr-tag coach">Coach</span>' : p.kind === 'pain' ? '<span class="pr-tag rev">Douleur</span>' : p.kind === 'whoop' ? '<span class="pr-tag wh">WHOOP</span>' : p.kind === 'test' ? '<span class="pr-tag ts">Test</span>' : p.revert ? '<span class="pr-tag rev">↩ annule ' + prFmtDate(p.revert) + '</span>' : '';
  const why = _prShortWhy(p.short || p.reason || ''), LN = paLine(p);
  const day = p.date ? prFmtDate(p.date, { weekday: 'short', day: 'numeric' }).replace('.', '') : 'S' + p.w;
  // km avant → après en deux barres (l'ancienne en gris, la nouvelle à la couleur du sens)
  const k0 = p.field === 'km' ? +p.before : p.field === 'session' && p.before ? +p.before.km : null, k1 = p.field === 'km' ? +p.after : p.field === 'session' && p.after ? +p.after.km : null;
  const kb = k0 && k1 && k0 !== k1 ? (function(){ const m = Math.max(k0, k1); return '<span class="pr-kb ' + LN.dir + '" aria-hidden="true"><i style="width:' + Math.round(k0 / m * 100) + '%"></i><i class="n" style="width:' + Math.round(k1 / m * 100) + '%"></i></span>'; })() : '';
  return '<div class="pr-chg' + (p.on ? '' : ' off') + '" id="pr-it-' + i + '">'
    + '<button type="button" class="pr-tick" aria-pressed="' + (p.on ? 'true' : 'false') + '" aria-label="Retenir ce changement" onclick="_prToggle(' + i + ')"></button>'
    + '<details class="pr-cd"><summary><p class="pr-chg-t"><span class="pr-day">' + prEsc(day) + '</span><b>' + prEsc(title) + '</b>' + tag + '</p>'
    + '<p class="pr-hl ' + LN.dir + '"><i aria-hidden="true">' + PA_DIR[LN.dir][0] + '</i><span>' + prEsc(LN.t) + '</span>' + kb + '</p></summary>'
    + '<div class="pr-cd-b">' + (why || delta ? '<p class="pr-why">' + (why ? '<span class="pr-why-t">' + prEsc(why) + '</span>' : '') + delta + '</p>' : '') + swap + full + '</div></details></div>';
}
// raison d'une proposition en quelques mots : 1re phrase, sans la partie « type : » redondante, 70 caractères au plus
function _prShortWhy(t){
  t = String(t || '').trim(); if(!t) return '';
  t = t.split(/[.!]\s/)[0].replace(/[.!]$/, '').split(' (')[0];
  for(let k = 0; k < 2; k++) t = t.replace(/^(Moins de volume|Plus de volume|Volume|Fractionné|Seuil|Tempo|Footing|Sortie longue|Allure course|EF|Endurance)\s*:\s*/i, '');
  t = t.replace(/^semaine \d+\s*→\s*(\d+) km conseillés/i, '$1 km conseillés sur la semaine');
  if(t.length > 70) t = t.slice(0, 68).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// volume par semaine : prévu (gris), conseillé (trait bleu), fait (vert) ; après les changements proposés (bleu)
function _prVolChart(V){
  const allW = V.weeks.filter(function(x){ return x.past ? x.done > 0 : true; }), i0 = allW.findIndex(function(x){ return !x.past; });
  const from = Math.max(0, Math.min((i0 < 0 ? allW.length : i0) - 4, allW.length - 16)), ws = allW.slice(from, from + 16); if(ws.length < 2) return '';
  const W = 320, H = 116, B = 18, T = 14, n = ws.length, bw = Math.min(22, (W - 16) / n * 0.62), gap = (W - 16) / n;
  const max = Math.max.apply(null, ws.map(function(x){ return Math.max(x.plan, x.target || 0, x.done || 0, x.after || 0); }).concat([10]));
  const Y = function(v){ return T + (1 - v / max) * (H - T - B); };
  let g = '';
  ws.forEach(function(x, i){
    const cx = 8 + gap * i + gap / 2, l = cx - bw / 2;
    if(x.past) g += '<rect x="' + l + '" y="' + Y(x.done) + '" width="' + bw + '" height="' + (H - B - Y(x.done)) + '" rx="3" class="vc-done"><title>S' + x.w + ' : ' + x.done + ' km faits</title></rect>';
    else {
      g += '<rect x="' + l + '" y="' + Y(x.plan) + '" width="' + bw + '" height="' + (H - B - Y(x.plan)) + '" rx="3" class="vc-plan"><title>S' + x.w + ' : ' + x.plan + ' km prévus</title></rect>';
      if(x.changed && x.after !== x.plan) g += '<rect x="' + (l + bw * 0.22) + '" y="' + Y(x.after) + '" width="' + bw * 0.56 + '" height="' + (H - B - Y(x.after)) + '" rx="2" class="vc-after"><title>S' + x.w + ' : ' + x.after + ' km après changements</title></rect>';
      if(x.target) g += '<line x1="' + (l - 3) + '" x2="' + (l + bw + 3) + '" y1="' + Y(x.target) + '" y2="' + Y(x.target) + '" class="vc-tgt"><title>S' + x.w + ' : ' + x.target + ' km conseillés</title></line>';
    }
    g += '<text x="' + cx + '" y="' + (H - 5) + '" class="vc-ax" text-anchor="middle">S' + x.w + '</text>';
  });
  return '<div class="pr-card pr-vol"><p class="pr-vol-h">Volume par semaine <span>base ~' + V.base + ' km · pic visé ~' + V.peak + ' km</span></p>'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vc-svg" role="img" aria-label="Volume prévu, conseillé et réalisé par semaine">' + g + '</svg>'
    + '<p class="pr-tj-leg"><span><i class="lg-plan"></i>prévu</span><span><i class="lg-tgt"></i>conseillé</span><span><i class="lg-after"></i>avec les changements</span><span><i class="lg-done"></i>fait</span></p></div>';
}
function _prRender(){
  const box = document.getElementById('pr-content'); if(!box || !_prReview) return;
  const a = _prReview.a, f = a.fit, R = _prReview, today = a.opt.today;
  const W = prWeeks(state, today), wk = Object.keys(W).map(Number).sort(function(x, y){ return x - y; }).map(function(w){ return W[w]; }).filter(function(o){ return !o.past; });
  const byW = {}, warnW = {};
  R.items.forEach(function(p, i){ (byW[p.w] = byW[p.w] || []).push(i); });
  a.warnings.forEach(function(x){ if(x.w != null && W[x.w] && !W[x.w].past) (warnW[x.w] = warnW[x.w] || []).push(x); });
  const heldW = {}; (R.held || []).forEach(function(p, i){ (heldW[p.w] = heldW[p.w] || []).push(i); });
  const nW = Object.keys(warnW).reduce(function(n, k){ return n + warnW[k].length; }, 0), nI = R.items.length;
  const goal = a.warnings.filter(function(x){ return x.goal; })[0];
  let h = '';
  const admin = typeof isAdmin === 'function' && isAdmin();
  const fold = function(id, ico, title, sub, body, open){ return '<details class="pr-more" id="pr-more-' + id + '"' + (open ? ' open' : '') + '><summary><span class="pr-more-i">' + ico + '</span><span class="pr-more-t"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="pr-more-c" aria-hidden="true">›</span></summary><div class="pr-more-b">' + body + '</div></details>'; };

  // ── 1. Où tu en es : la raison en une phrase, 4 repères, ce qui compte (2 alertes au plus), le Coach
  const GC = a.goalCheck, NW = a.nextWeek && state._week_ok !== a.nextWeek.from ? a.nextWeek : null, TJ = a.trajectory, LD = paLead(a);
  const tq = function(sec){ return prTime(sec).replace(/:(\d\d)$/, "'$1").replace(/^(\d+):(\d\d)'/, '$1h$2\''); };
  const keys = [];
  if(f.vdot){ const pv = a.planVdotNow || a.planVdot, gap = pv ? f.vdot - pv : 0; keys.push({ l: 'Niveau', v: prV(f.vdot), s: pv ? 'plan ' + prV(pv) : '', c: gap < -0.4 ? 'mid' : 'ok' }); }
  if(TJ && TJ.race) keys.push({ l: 'Prévu jour J', v: tq((TJ.race.lo + TJ.race.hi) / 2), s: a.opt.goalSec ? 'objectif ' + tq(a.opt.goalSec) : '', c: TJ.verdict === 'atteignable' ? 'ok' : TJ.verdict === 'à portée' ? 'mid' : 'low' });
  else if(goal && f.vdot && a.opt.raceCat) keys.push({ l: 'Aujourd\'hui', v: tq(f.preds[a.opt.raceCat]), s: 'objectif ' + tq(a.opt.goalSec), c: 'mid' });
  if(a.load && a.load.k7 != null) keys.push({ l: '7 jours', v: a.load.k7 + ' km', s: a.load.acwr ? 'charge ×' + prV(a.load.acwr) : '', c: a.load.acwr > 1.5 ? 'low' : a.load.acwr > 1.3 ? 'mid' : 'ok' });
  const alcX = a.whoop && a.whoop.alc && a.whoop.alc.explained;
  if(a.whoop) keys.push({ l: 'Récup', v: a.whoop.avg3 + ' %', s: alcX ? 'hors alcool' : '3 nuits', c: a.whoop.tired ? 'low' : a.whoop.fresh ? 'ok' : 'mid' });
  const alerts = [], pn = a.internal && a.internal.pains[0];
  if(a.greenLight) alerts.push(['🟢', a.greenLight.text, 'ok']);
  if(pn && pn.level >= 2) alerts.push(['🩹', 'Douleur ' + ['', 'légère', 'gênante', 'forte'][pn.level] + ' · ' + pn.zone.toLowerCase() + ' → allégé', 'low']);
  if(a.opt.postRace && wk.length && (!wk[0].from || a.opt.postRaceUntil >= wk[0].from)) alerts.push(['🛌', 'Récup jusqu\'au ' + prFmtDate(a.opt.postRaceUntil, { day: 'numeric', month: 'short' }) + (a.opt.noFasterUntil ? ' · allures gardées' : ''), 'mid']);
  if(a.stride && a.stride.level >= 2) alerts.push(['⚠️', 'Foulée fatiguée → pas de hausse de volume', 'low']);
  a.warnings.filter(function(x){ return !x.goal && x.level === 'warn'; }).forEach(function(x){ alerts.push(['⚠️', x.short || x.text, 'low']); });
  const CV = admin && typeof prCoachVerdict === 'function' ? prCoachVerdict() : null;
  let leadT = LD.t;
  if(LD.ic === '🛌' && a.opt.postRaceUntil){                                // la récup dite une fois : phrase + date, pas d'alerte en double
    leadT = 'Récup après ta course jusqu\'au ' + prFmtDate(a.opt.postRaceUntil, { day: 'numeric', month: 'short' }) + ' : on reprend doucement' + (a.opt.noFasterUntil ? ', allures gardées.' : '.');
    for(let x = alerts.length - 1; x >= 0; x--) if(alerts[x][0] === '🛌') alerts.splice(x, 1);
  }
  h += '<div class="pr-sum"><div class="pr-lead"><span>' + piIc(LD.ic) + '</span><p>' + prEsc(leadT) + '</p></div>'
    + (keys.length ? '<div class="pr-keys">' + keys.slice(0, 4).map(function(t){ return '<div class="pr-key ' + t.c + '"><small>' + t.l + '</small><b>' + t.v + '</b>' + (t.s ? '<span>' + prEsc(t.s) + '</span>' : '') + '</div>'; }).join('') + '</div>' : '')
    + (alerts.length ? '<div class="pr-alerts">' + alerts.slice(0, 2).map(function(x){ return '<p class="' + x[2] + '"><i>' + piIc(x[0]) + '</i><span>' + prEsc(x[1]) + '</span></p>'; }).join('') + '</div>' : '')
    + (CV && CV.fresh ? '<p class="pr-mini">' + piIc('🤖') + ' Relu par le Coach ' + (CV.date === a.opt.today ? 'aujourd\'hui' : 'le ' + prFmtDate(CV.date, { day: 'numeric', month: 'short' })) + ' · ' + (CV.agree ? 'd\'accord avec ces changements' : CV.applied ? 'ses changements sont appliqués' : CV.n + ' changement' + (CV.n > 1 ? 's' : '') + ' à lui, marqués « Coach »') + '</p>' : '')
    + '</div>';
  if(!f.vdot) h += '<button class="pr-btn sec" onclick="' + prReload + '">🏆 Saisir mes records pour calculer ton niveau</button>';

  // ── 2. Ce que je te propose : objectif à revoir, puis les changements semaine par semaine (cette semaine, la prochaine, plus tard)
  const nH = (R.held || []).length;
  if(nI || nH || GC || NW){
    h += '<div class="pr-top"><span class="pr-top-n">' + (nI || '✓') + '</span><b>' + (nI ? 'changement' + (nI > 1 ? 's' : '') + ' proposé' + (nI > 1 ? 's' : '') : 'rien à changer') + '</b>'
      + (nI > 1 ? '<button class="pr-link" onclick="const on=_prReview.items.some(function(x){return !x.on;});_prReview.items.forEach(function(x){x.on=on;});_prRender()">' + (R.items.every(function(x){ return x.on; }) ? 'Tout décocher' : 'Tout cocher') + '</button>' : '') + '</div>';
    if(GC) h += '<div class="pr-goal ' + GC.dir + '" id="pr-goal"><p class="pr-goal-h">' + piIc('🎯') + ' ' + (GC.dir === 'up' ? 'Tu es en avance sur ton objectif' : 'Ton objectif est loin') + ' · prévu ' + prTime(GC.mid) + '</p>'
      + '<div class="pr-actions"><button type="button" class="pr-btn pri" onclick="paGoalSet(' + GC.to + ')">' + (GC.dir === 'up' ? 'Relever à ' : 'Viser ') + prTime(GC.to) + '</button><button type="button" class="pr-btn sec" onclick="paGoalSet(0, true)">Garder ' + prTime(GC.from) + '</button></div></div>';
    const mon = prIso(prMonday(today)), nmon = prAddDays(mon, 7), nsun = prAddDays(mon, 13);
    const ord = R.items.map(function(p, i){ return [p, i]; }).sort(function(x, y){ return (x[0].date || '').localeCompare(y[0].date || '') || x[0].w - y[0].w; });
    const B = { now: [], next: [], later: [] }; ord.forEach(function(x){ const d = x[0].date || ''; B[d && d < nmon ? 'now' : d && d <= nsun ? 'next' : 'later'].push(x); });
    R.open = R.open || {};
    const list = function(L, k, max){ if(L.length <= max) return L.map(function(x){ return _prItem(x[0], x[1], W[x[0].w]); }).join('');
      return L.slice(0, max).map(function(x){ return _prItem(x[0], x[1], W[x[0].w]); }).join('') + '<details class="pr-rest"' + (R.open[k] ? ' open' : '') + ' ontoggle="if(_prReview)_prReview.open.' + k + '=this.open"><summary>+ ' + (L.length - max) + ' autre' + (L.length - max > 1 ? 's' : '') + '</summary><div class="pr-rest-b">'
        + L.slice(max).map(function(x){ return _prItem(x[0], x[1], W[x[0].w]); }).join('') + '</div></details>'; };
    // frise : 7 jours, une pastille par séance, à la couleur de ce qui change ; toucher = aller au changement
    const S0 = prSessions(state), byKey = {}; R.items.forEach(function(p, i){ if(p.key && byKey[p.key] == null) byKey[p.key] = i; });
    const strip = function(from){ return '<div class="pr-strip7">' + [0, 1, 2, 3, 4, 5, 6].map(function(d){ const iso = prAddDays(from, d), ss = S0.filter(function(x){ return x.date === iso && !x.skip && x.type !== 'rest'; });
      const it = ss.map(function(x){ return byKey[x.key]; }).filter(function(v){ return v != null; })[0], dir = it != null ? paDir(R.items[it]) : '';
      return '<button type="button" class="pr-d7' + (iso === today ? ' tod' : '') + '"' + (it != null ? ' onclick="_prGoIt(' + it + ')"' : ' tabindex="-1"') + '><i class="' + (dir || (ss.length ? (ss[0].done ? 'done' : 'plan') : '')) + '">' + (dir ? PA_DIR[dir][0] : '') + '</i><small>' + 'LMMJVSD'[d] + '</small></button>'; }).join('') + '</div>'; };
    if(B.now.length) h += '<p class="pr-wsec">Cette semaine<span>' + B.now.length + '</span></p>' + strip(mon) + list(B.now, 'now', 6);
    if(B.next.length || NW){
      if(!NW) h += '<p class="pr-wsec">Semaine prochaine · ' + prFmtDate(nmon) + ' – ' + prFmtDate(nsun) + '<span>' + B.next.length + '</span></p>' + strip(nmon);
      else {
        h += '<div class="pr-wsec nw" id="pr-nw"><p>' + piIc('📅') + ' Ta semaine prochaine · ' + prFmtDate(nmon) + ' – ' + prFmtDate(nsun) + ' · ' + NW.km + ' km<span>' + B.next.length + '</span></p>';
        h += '<div class="pr-nw-l">' + NW.sessions.map(function(x){ return '<span' + (x.changed ? ' class="chg"' : '') + '>' + prEsc(prFmtDate(x.date, { weekday: 'short' })) + ' · ' + prEsc(x.title) + (x.km ? ' · ' + x.km + ' km' : '') + '</span>'; }).join('') + '</div>'
          + (CV && CV.fresh && CV.agree ? '<p class="pr-mini">✓ Relue par le Coach : d\'accord</p>' : '')
          + strip(nmon) + '<button type="button" class="pr-btn sec pr-nw-b" onclick="prValidateWeek()">✓ Valider la semaine' + (B.next.length ? ' (ses ' + B.next.length + ' changement' + (B.next.length > 1 ? 's' : '') + ' cochés)' : '') + '</button></div>';
      }
      h += list(B.next, 'next', 6);
    }
    if(B.later.length) h += '<p class="pr-wsec">Plus tard<span>' + B.later.length + '</span></p>' + list(B.later, 'later', 3);
    (R.held || []).forEach(function(p, i){
      const title = typeof normalizeSessionTitle === 'function' ? normalizeSessionTitle(p.title, p.type, p.before) || p.title : p.title;
      h += '<div class="pr-held"><div class="pr-held-t"><b>⏳ ' + prEsc(title) + '</b><small>' + (p.date ? prFmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : '') + 'en attente (récup)</small></div>'
        + '<div class="pr-swap"><span class="pr-p cur">' + prEsc(p.pb) + '</span><span class="pr-arr">→</span><span class="pr-p sug">' + prEsc(p.pa) + '</span><span class="pr-u">/km</span></div>'
        + '<button type="button" class="pr-btn sec pr-held-b" onclick="_prUnhold(' + i + ')">⚡ Accélérer quand même</button></div>';
    });
    if(!nI && !nH) h += _prTraceHtml(a);
  } else h += '<div class="pr-card pr-uptodate"><span class="pr-big ok">✓</span><div><b>Ton plan est à jour</b><span>Rien à changer pour l\'instant</span></div></div>' + _prTraceHtml(a);

  // ── 3. En parler au Coach (admin) et comprendre (un seul écran pour tout le détail)
  if(R.coach) h += '<details class="pr-more" id="pr-more-coach"><summary><span class="pr-more-i">🤖</span><span class="pr-more-t"><b>Avis du Coach</b><small>lire</small></span><span class="pr-more-c" aria-hidden="true">›</span></summary><div class="pr-more-b"><p class="pr-coach-t">' + prEsc(R.coach) + '</p></div></details>';
  if(admin && typeof openPlanChat === 'function') h += '<button type="button" class="pr-btn pr-chat-b pr-chat-w" onclick="openPlanChat(_prReview && _prReview.items.length ? \'À propos des ajustements proposés par la mise à jour : \' : \'\')">' + piIc('💬') + ' En parler au Coach</button>';
  if(typeof openPlanEvolution === 'function'){ const ab = a.absorb, V = ab && ab.verdict && typeof PA_VERDICT !== 'undefined' ? PA_VERDICT[ab.verdict] : null;
    h += '<button type="button" class="pr-evo-b" onclick="openPlanEvolution()"><span>' + piIc('📊') + '</span><span><b>Comprendre ton plan</b><small>' + (V ? V[1] + ' séances : ' + V[0].toLowerCase() + ' · ' : '') + 'niveau, trajectoire, semaines, paliers, historique</small></span><span>›</span></button>'; }
  // repère invisible pour les tests et l'ouverture : la carte principale
  if(!/pr-card/.test(h)) h = '<div class="pr-card" style="display:none"></div>' + h;
  box.innerHTML = h;
  _prFoot();
}
// ─── Le détail du plan (trajectoire, semaines, signaux, niveau, mises à jour) : affiché dans « Comprendre ton plan » ───
function _prDetailsParts(a){
  const f = a.fit, today = a.opt.today, TJ = a.trajectory;
  const W = prWeeks(state, today), wk = Object.keys(W).map(Number).sort(function(x, y){ return x - y; }).map(function(w){ return W[w]; }).filter(function(o){ return !o.past; });
  const byW = {}, warnW = {}, heldW = {};
  (a.proposals || []).forEach(function(p, i){ (byW[p.w] = byW[p.w] || []).push(i); });
  (a.warnings || []).forEach(function(x){ if(x.w != null && W[x.w] && !W[x.w].past) (warnW[x.w] = warnW[x.w] || []).push(x); });
  (a.held || []).forEach(function(p, i){ (heldW[p.w] = heldW[p.w] || []).push(i); });
  const pn = a.internal && a.internal.pains[0];
  const tq = function(sec){ return prTime(sec).replace(/:(\d\d)$/, "'$1").replace(/^(\d+):(\d\d)'/, '$1h$2\''); };
  const fold = _prFold;
  const P = {};
  if(TJ && TJ.race){
    P.tj = fold('tj', '📈', 'Trajectoire', tq(TJ.race.lo) + '–' + tq(TJ.race.hi) + (TJ.verdict ? ' · ' + TJ.verdict : '') + ' · et si… ?',
      prTrajectorySvg(TJ) + '<p class="pr-tj-leg"><span><i class="lg-race"></i>courses</span><span><i class="lg-ses"></i>séances</span><span><i class="lg-proj"></i>projection</span></p>'
      + '<p class="pr-mini">' + (TJ.assumed ? 'Progression type : +0,1 / sem.' : 'Tendance 4 mois : ' + (TJ.slope >= 0 ? '+' : '') + prV(TJ.slope * 7) + ' / sem.') + ' · ± 0,6</p>'
      + (typeof openWhatIf === 'function' ? '<button type="button" class="pr-btn sec pr-whatif-b" onclick="openWhatIf()">🔮 Et si… ? Teste un scénario</button>' : ''));
  }
  if(wk.length){
    let wb = a.volume ? _prVolChart(a.volume) : '';
    wb += '<div class="pr-strip">' + wk.map(function(o){
        const ni = (byW[o.w] || []).length, nv = (warnW[o.w] || []).length + (heldW[o.w] || []).length, st = ni ? 'chg' : nv ? 'vig' : 'ok';
        return '<button type="button" class="pr-wk ' + st + (o.now ? ' now' : '') + '"' + (nv ? ' onclick="_prGo(' + o.w + ')"' : ' disabled') + '>'
          + '<span class="pr-wk-s">S' + o.w + '</span><span class="pr-wk-d">' + (o.now ? 'en cours' : o.from ? prFmtDate(o.from) : '') + '</span>'
          + '<span class="pr-wk-i">' + (ni ? ni + ' ✎' : nv ? '!' : (o.race ? '🏁' : '✓')) + '</span></button>';
      }).join('') + '</div>';
    wk.forEach(function(o){
      const ws = warnW[o.w] || []; if(!ws.length) return;
      wb += '<div class="pr-vig" id="pr-wk-' + o.w + '"><p class="pr-vig-h">S' + o.w + ' · ' + PR_KIND[o.kind][1] + ' ' + PR_KIND[o.kind][0] + '</p>' + ws.map(function(x){ return '<p><i>' + (x.level === 'warn' ? '⚠️' : '💡') + '</i><span>' + prEsc(x.short || x.text) + '</span></p>'; }).join('') + '</div>';
    });
    const nV = Object.keys(warnW).reduce(function(n, k){ return n + warnW[k].length; }, 0);
    P.wk = fold('wk', '🗂️', 'Semaine par semaine', wk.length + ' sem.' + (nV ? ' · ' + nV + ' vigilance' + (nV > 1 ? 's' : '') : ''), wb);
  }
  const pills = [];
  if(a.opt.habitual) pills.push('🏋️ Base ~' + a.opt.habitual + ' km/sem (' + prEsc(a.opt.habitualFrom) + ')');
  if(a.load && a.load.chronic) pills.push('📈 ~' + a.load.chronic + ' km/sem sur 28 j');
  if(a.whoop) pills.push((a.whoop.tired ? '😮‍💨' : '💚') + ' WHOOP ' + a.whoop.avg3 + ' %' + (a.whoop.hrvDrop != null ? ' · VFC ' + (a.whoop.hrvDrop > 0 ? '+' : '') + a.whoop.hrvDrop + ' %' : ''));
  if(pn) pills.push('🩹 Douleur ' + ['', 'légère', 'gênante', 'forte'][pn.level] + ' · ' + prEsc(pn.zone.toLowerCase()) + ' · ' + prFmtDate(pn.date));
  if(a.internal && a.internal.ratio) pills.push('💪 Charge ressentie ' + prV(a.internal.ratio) + '×');
  if(a.recette) pills.push('🧬 Ta recette : +' + Math.round((a.recette.progression - 1) * 100) + ' %/sem max' + (a.recette.calib ? ' · ' + a.recette.calib : ''));
  if(a.stride && a.stride.level) pills.push((a.stride.level >= 2 ? '⚠️' : '👀') + ' Foulée à surveiller');
  if(a.drift) pills.push('❤️ Dérive ' + prV(a.drift.avg) + ' % · ' + a.drift.label);
  if(a.calib && a.calib.n) pills.push('🎯 Allures tenues ' + a.calib.k + '/' + a.calib.n + (a.calib.mode ? ' · ' + a.calib.mode : ''));
  if(pills.length) P.sig = fold('sig', '🔎', 'Tous les signaux', pills.length + ' repères', '<div class="pr-pills">' + pills.map(function(t){ return '<span class="pr-pill base">' + t + '</span>'; }).join('') + '</div>');
  if(f.vdot){
    P.lvl = fold('lvl', '🎚️', 'Ton niveau', prV(f.vdot) + ' · d\'après tes ' + prEsc(f.basis),
      '<table class="pr-tab"><thead><tr><th></th><th>Record</th><th>À ton niveau</th></tr></thead><tbody>'
      + PR_CATS.map(function(c){
          const rec = state[PR_RECORD_KEY[c]], rs = prTimeSec(rec), rv = rs ? prResultVdot(c, rs, ((state._records || {})[c] || {}).date || null) : null;
          return '<tr><th>' + prCatLabel(c) + '</th><td>' + (rec ? '<b>' + prEsc(prTime(rs)) + '</b><small>' + (rv ? prV(rv.vdot) : 'ancien') + '</small>' : '<small>—</small>') + '</td><td><b>' + prTime(f.preds[c]) + '</b></td></tr>';
        }).join('') + '</tbody></table>'
      + '<p class="pr-mini">Seuil <b>' + prPace(f.paces.T) + '</b> · fractionné <b>' + prPace(f.paces.I) + '</b>' + (a.opt.efPace ? ' · EF <b>' + prPace(a.opt.efPace) + '</b>' : '') + ' /km' + (a.planVdot ? ' · plan écrit pour ' + prV(a.planVdot) : '') + '</p>'
      + '<details class="pr-hist"><summary class="pr-mini">Sur quoi c\'est calculé</summary><ul>' + f.sources.map(function(x){ return '<li>' + prEsc(x.label) + ' — ' + (x.time || x.pace + '/km' + (x.hr ? ', FC ' + x.hr : '')) + (x.date ? ' (' + prFmtDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ')' : '') + ' → <b>' + prV(x.vdot) + '</b></li>'; }).join('') + '</ul></details>'
      + '<button class="pr-link" onclick="openRecordsModal()">🏆 Mes records</button>');
  }
  const allH = state._plan_reviews || [], hist = allH.slice(-6).reverse();
  const short = function(c, v){ if(c.field === 'km') return v + ' km'; if(c.field === 'skip') return v ? 'non réalisée' : 'prévue'; if(c.field === 'date') return v ? prFmtDate(v, { weekday: 'short', day: 'numeric' }) : ''; if(c.field === 'session') return v && v.t ? v.t + ' · ' + v.km + ' km' : ''; const m = String(v).match(PR_PACE_RE); return c.field === 'detail' && m ? m[0].replace(/\s*\/\s*km$/, '') : String(v); };
  if(hist.length) P.hist = fold('hist', '🕘', 'Qui a changé ton plan', prFmtDate(hist[0].date, { day: 'numeric', month: 'short' }) + ' · ' + hist[0].n + ' séance' + (hist[0].n > 1 ? 's' : ''), hist.map(function(x){
      const idx = allH.indexOf(x);
      const line = (x.undone ? '↩ ' : x.imprevu ? '🧳 ' : '✓ ') + prFmtDate(x.date, { day: 'numeric', month: 'short' }) + ' · ' + (x.imprevu ? ({ indispo: 'indisponible', charge: 'semaine chargée', malade: 'malade' }[x.imprevu] || 'imprévu') + ' · ' : '') + x.n + ' séance' + (x.n > 1 ? 's' : '') + (x.kind && PE_KIND[x.kind] ? ' · ' + PE_KIND[x.kind] : x.coach ? ' · Coach' : '') + (x.vdot ? ' · niveau ' + String(x.vdot).replace('.', ',') : '');
      if(!(x.changes || []).length) return '<p class="pr-mini">' + line + '</p>';
      return '<details class="pr-hist"><summary class="pr-mini">' + line + '</summary><ul>' + x.changes.map(function(c){ return '<li><b>' + prEsc(typeof normalizeSessionTitle === 'function' && c.type ? normalizeSessionTitle(c.title, c.type, typeof c.before === 'string' ? c.before : '') || c.title : c.title) + '</b>' + (c.date ? ' · ' + prFmtDate(c.date) : '') + ' : ' + prEsc(short(c, c.before)) + ' → <b>' + prEsc(short(c, c.after)) + '</b></li>'; }).join('') + '</ul>'
        + (x.undone ? '<p class="pr-mini">Annulée le ' + prFmtDate(x.undone, { day: 'numeric', month: 'short' }) + '</p>' : '<button type="button" class="pr-link pr-undo" onclick="if(confirm(\'Annuler cette mise à jour ? Les séances pas encore faites retrouvent leur ancienne version.\')) prUndoReview(' + idx + ')">↩ Annuler</button>') + '</details>';
    }).join(''));
  return P;
}
// section repliée : titre + l'essentiel en une ligne, le détail au toucher
function _prFold(id, ico, title, sub, body, open){ return '<details class="pr-more" id="pr-more-' + id + '"' + (open ? ' open' : '') + '><summary><span class="pr-more-i">' + piIc(ico) + '</span><span class="pr-more-t"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="pr-more-c" aria-hidden="true">›</span></summary><div class="pr-more-b">' + body + '</div></details>'; }
function _prFoot(){
  const b = document.getElementById('pr-apply'); if(!b || !_prReview) return;
  const n = _prReview.items.filter(function(x){ return x.on; }).length;
  b.disabled = !n; b.textContent = n ? '✓ Appliquer ' + n + ' changement' + (n > 1 ? 's' : '') + ' au plan' : (_prReview.items.length ? 'Aucun changement retenu' : 'Rien à appliquer');
}
// Coach IA : relecture complète du plan (fonction planReview)
async function askCoachPlanReview(force){
  if(typeof coachAI === 'function' && !coachAI()) return;   // Coach IA : compte admin seulement (le serveur refuse aussi)
  if(!_prReview) return;
  const a = _prReview.a, today = a.opt.today, R = _prReview;
  force = !!force || !!(state._coach_review && state._coach_review.sig === prDataSig());   // redemande sans donnée nouvelle
  const ask = document.querySelector('#pr-content .pr-ask');
  const nW = Object.keys(prSessions(state).reduce(function(o, x){ o[x.w] = 1; return o; }, {})).length;
  const msgs = ['Il relit tes ' + nW + ' semaines de plan, séance par séance…', 'Il regarde tes séances réalisées : allures, FC, ressenti…']
    .concat(a.opt.habitual ? ['Il compare avec ta prépa ' + a.opt.habitualFrom + ' (~' + a.opt.habitual + ' km/sem)…'] : [])
    .concat(a.fit.vdot ? ['Il vérifie tes allures par rapport à ton niveau ' + prV(a.fit.vdot) + '…'] : [])
    .concat(a.opt.postRace ? ['Il tient compte de ta récupération après ta dernière course…'] : [])
    .concat(['Il prépare ses propositions…']);
  if(ask){
    ask.innerHTML = '<div class="pr-cl"><div class="pr-cl-h"><span class="pr-cl-ic">🤖</span><div><b>Le Coach relit ton plan</b><small id="pr-cl-t">0 s · en général 15 à 40 s</small></div></div>'
      + '<p id="pr-cl-msg" class="pr-cl-msg">' + prEsc(msgs[0]) + '</p><div class="pr-bar indet"><i></i></div></div>';
    ask.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  let k = 0; const t0 = Date.now();
  R.clTimer = setInterval(function(){
    const m = document.getElementById('pr-cl-msg'), t = document.getElementById('pr-cl-t'), sec = Math.round((Date.now() - t0) / 1000);
    if(t) t.textContent = sec + ' s · en général 15 à 40 s';
    if(sec && sec % 3 === 0 && m && k < msgs.length - 1){ k++; m.classList.remove('sw'); void m.offsetWidth; m.classList.add('sw'); m.textContent = msgs[k]; }
  }, 1000);
  const body = await prCoachBody(a, R, force);
  try {
    const token = await getAuthToken();
    const r = await fetch(FUNCTIONS_BASE + '/planReview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok || !j.success) throw new Error(j.error || 'HTTP ' + r.status);
    const items = prCoachItems(j.changes);
    clearInterval(R.clTimer); if(_prReview !== R) return;
    _prMergeCoach(R, items, j.rejected || [], j.assessment || '');
    // avis mémorisé avec ses changements : réaffiché tant qu'ils ne sont pas appliqués
    state._coach_review = { date: today, at: new Date().toISOString(), sig: prDataSig(), assessment: R.coach, rejected: (j.rejected || []).slice(0, 30),
      changes: items.map(function(x){ return { key: x.key, w: x.w, date: x.date, field: x.field, title: x.title, type: x.type, before: x.before, after: x.after, reason: x.reason }; }), applied: !items.length };
    if(dbRef) dbRef.child('_coach_review').set(state._coach_review).catch(function(){});
    _prRender();
    const cc = document.querySelector('#pr-content .pr-coach'); if(cc){ cc.classList.add('pr-pop'); cc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  } catch(e) {
    clearInterval(R.clTimer); if(_prReview !== R) return;
    alert('Le Coach n\'a pas pu relire le plan (' + e.message + '). Réessaie dans un instant.');
    _prRender();
  }
}
// Application des propositions cochées (séances à venir uniquement)
function applyPlanReview(){
  if(!_prReview) return;
  const sel = _prReview.items.filter(function(x){ return x.on; }); if(!sel.length) return;
  const r = prApplyChanges(sel, { coach: sel.some(function(p){ return p.src === 'coach'; }), vdot: _prReview.a.fit.vdot || null });
  const NW = _prReview.a.nextWeek;                                         // semaine prochaine montrée : validée avec ses changements
  if(NW && state._week_ok !== NW.from && sel.some(function(p){ return p.date && p.date >= NW.from && p.date <= NW.to; })) state._week_ok = NW.from;
  if(state._coach_review && sel.some(function(p){ return p.src === 'coach'; })) state._coach_review.applied = true;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  const k = r.n;
  closePlanReview();
  try { renderHome(); } catch(e) { diagSilent(e, 'plan-review:applyPlanReview'); }
  if(typeof showToast === 'function') showToast(k + ' séance' + (k > 1 ? 's' : '') + ' mise' + (k > 1 ? 's' : '') + ' à jour');
}

// « Valider la semaine » : ajustements de la semaine prochaine appliqués (ceux cochés), semaine marquée vue
function prValidateWeek(){
  if(!_prReview || !_prReview.a.nextWeek) return;
  const NW = _prReview.a.nextWeek;
  const sel = _prReview.items.filter(function(x){ return x.on && x.date && x.date >= NW.from && x.date <= NW.to; });
  const r = sel.length ? prApplyChanges(sel, { kind: 'week', vdot: _prReview.a.fit.vdot || null, at: new Date().toISOString() }) : { n: 0 };
  state._week_ok = NW.from;
  save();
  if(typeof rendered !== 'undefined'){ rendered.plan = false; rendered.stats = false; }
  closePlanReview();
  try { renderHome(); } catch(e) { diagSilent(e, 'plan-review:prValidateWeek'); }
  if(typeof showToast === 'function') showToast('Semaine validée' + (r.n ? ' · ' + r.n + ' séance' + (r.n > 1 ? 's' : '') + ' ajustée' + (r.n > 1 ? 's' : '') : ''), '📅');
}

// ─── Comprendre ton plan (plan-adapt.js : paEvolution) ─────────────────
const PE_KIND = { maj: 'MAJ le plan', autopilot: 'Pilote de nuit', after: 'Après une séance', chat: 'Mon plan (Coach)', coach: 'Coach', adapt: 'Séance écourtée', taper: 'Affûtage', imprevu: 'Imprévu', week: 'Semaine validée', hist: 'Recalé sur ton historique', pick: 'Choix classique / pro', libplan: 'Prépa version pro', lib: 'Séances de pro' };
function openPlanEvolution(){
  if(document.getElementById('pe-ov')) return;
  _prCss();
  const today = prTodayIso(), a = (_prReview && _prReview.a) || prAnalyze(), E = paEvolution(a, today);
  const esc = prEsc, T = E.trend || {}, V = T.verdict ? PA_VERDICT[T.verdict] : null, fold = function(id, ico, t, sub, body, open){ return _prFold('pe-' + id, ico, t, sub, body, open); };
  const tile = function(k, v, sub){ return '<div class="lvp-t"><small>' + k + '</small><b>' + v + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>'; };
  // ── En bref : 4 repères et une phrase (toujours visible)
  let h = '<div class="lvp-card"><div class="lvp-tiles">'
    + tile('Niveau', E.fit ? prV(E.fit) : '–', E.level && E.level.delta != null ? (E.level.delta >= 0 ? '+' : '') + prV(E.level.delta) + ' en 4 semaines' : '')
    + tile('Le plan', E.planVdot ? prV(E.planVdot) : '–', E.fit && E.planVdot ? (E.fit - E.planVdot >= 1 ? 'en retard sur toi : ça monte' : E.planVdot - E.fit >= 1 ? 'au-dessus de toi' : 'à ton niveau') : '')
    + tile('Tes séances', V ? V[1] + ' ' + V[0] : '–', T.n ? T.n + ' sur 3 semaines' : 'pas encore de ressenti')
    + tile('Volume visé', E.volume ? E.volume.peak + ' km' : '–', E.volume ? 'au pic · habitude ' + E.volume.base + ' km' + (E.volume.goalPeak && E.volume.goalPeak > E.volume.base ? ' · objectif ' + E.volume.goalPeak : '') : '')
    + '</div>' + (E.traj ? '<p class="lvp-n pe-ci">' + piIc('🎯') + '<span>Prévu le jour J : ' + prTime(E.traj.mid) + (E.goal ? ' pour un objectif de ' + prTime(E.goal) : '') + (E.traj.verdict ? ' · ' + E.traj.verdict : '') + '</span></p>' : '')
    + '<p class="lvp-n">' + (T.verdict === 'easy' ? 'Tu encaisses bien : le plan monte d\'un cran (paliers, volume).' : T.verdict === 'hard' ? 'Séances récentes dures : le plan ne monte pas tant que ça ne passe pas mieux.' : 'Le plan suit son rythme ; il monte dès que tes séances passent facilement.') + '</p></div>';
  // ── la course d'avant (21 premiers jours d'une prépa : ouvert)
  let K = null; try { K = paCarry(a, today); } catch(e) { diagSilent(e, 'plan-review-ui:paCarry'); }
  if(K) h += '<div id="pe-carry">' + fold('carry', '🧬', 'Ce que ta prépa reprend de ' + esc(K.name), esc(K.time), K.items.map(function(x){ return '<p class="lvp-n pe-ci"><span aria-hidden="true">' + piIc(x.ic) + '</span><span><b>' + esc(x.t) + '</b> · ' + esc(x.v) + '</span></p>'; }).join(''),
    state.plan_start_date && today <= prAddDays(state.plan_start_date, 21)) + '</div>';
  // ── trajectoire, semaines, signaux, niveau, mises à jour (même détail que la mise à jour du plan)
  const DP = _prDetailsParts(a), TH = { prog: [], train: [], learn: [] };
  TH.prog.push(DP.lvl || '', DP.tj || '');
  // ── paliers
  if(E.ladders.length){
    TH.prog.push(fold('lad', '🪜', 'Tes paliers', esc(E.ladders.map(function(L){ const cur = L.next && L.next.rung != null ? L.next.rung : L.last ? L.last.rung : 0; return L.label.split(' ')[0] + ' ' + (cur + 1) + '/' + L.rungs; }).join(' · ')), E.ladders.map(function(L){
      const cur = L.next && L.next.rung != null ? L.next.rung : L.last ? L.last.rung : 0, to = L.next && L.next.prop ? L.next.prop.rung : null;
      const bar = '<div class="pe-lad">' + Array.from({ length: L.rungs }).map(function(_, i){ return '<i class="' + (i <= cur ? 'on' : '') + (to != null && i === to ? ' to' : '') + '"></i>'; }).join('') + '</div>';
      return '<div class="pe-l"><p><b>' + L.ic + ' ' + L.label + '</b>' + (to != null ? '<span class="pe-chip pe-' + (L.next.prop.up ? 'easy' : 'hard') + '">' + (L.next.prop.up ? '↑ palier suivant' : '↓ on souffle') + '</span>' : '') + '</p>' + bar
        + '<small>' + [L.last ? 'Dernière : ' + esc(L.last.title) + (L.last.verdict ? ' (' + PA_VERDICT[L.last.verdict][0].toLowerCase() + ')' : '') : '', L.next ? 'Prochaine : ' + esc(L.next.prop ? L.next.prop.title : L.next.title) + ' · ' + prFmtDate(L.next.date, { weekday: 'short', day: 'numeric' }) : ''].filter(Boolean).join('<br>') + '</small></div>';
    }).join('')));
  }
  // ── séances récentes et leur note
  if(T.list && T.list.length){
    TH.train.push(fold('ses', '✅', 'Tes dernières séances', V ? V[1] + ' ' + V[0].toLowerCase() + ' · ' + T.list.length + ' notées' : T.list.length + ' notées', T.list.slice(0, 8).map(function(x){
      const v = PA_VERDICT[x.verdict];
      return '<div class="pe-row"><span class="pe-chip pe-' + x.verdict + '">' + v[1] + ' ' + v[0] + '</span><span class="pe-tx"><b>' + esc(x.title) + '</b><small>' + prFmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + esc(x.parts.slice(0, 2).map(function(p){ return p.t; }).join(' · ')) + '</small></span></div>';
    }).join('') + '<p class="lvp-n">Note faite avec ton allure, ta FC, ton effort ressenti, la dérive cardiaque, une douleur et ta récup WHOOP du lendemain.</p>'));
  }
  // ── classique ou pro
  if(typeof openRunnerProfile === 'function'){
    const PF = a.profile || null, nPro = prSessions(state).filter(function(s){ return !s.done && !s.skip && s.x && s.x.lib; }).length;
    const nA = Object.keys(a.advice || {}).filter(function(k){ return a.advice[k].rec === 'pro' && a.advice[k].cur === 'classic'; }).length;
    let VS = null; try { VS = typeof slVersionStats === 'function' ? slVersionStats(state, a.opt.today) : null; } catch(e) { diagSilent(e, 'plan-review-ui:slVersionStats'); }
    const g = function(x){ return x.gain == null ? '' : ' · ' + (x.gain >= 0 ? '+' : '') + prV(x.gain) + ' de niveau 3 sem. après'; };
    TH.train.push(fold('lib', '✦', 'Séances classiques ou pro', nPro + ' en pro' + (nA ? ' · ' + nA + ' conseillée' + (nA > 1 ? 's' : '') : ''),
      '<p class="lvp-n">' + (nPro ? nPro + ' séance' + (nPro > 1 ? 's' : '') + ' à venir en version pro ; les autres restent classiques.' : 'Toutes tes séances sont classiques. La version pro n\'est conseillée que quand elle sert.') + (PF && PF.focus && PF.focus.length ? ' Priorité : ' + esc(PF.focus.map(function(k){ return ({ vitesse: 'vitesse', specifique: 'endurance spécifique', aerobie: 'base aérobie' })[k] || k; }).join(', ')) + '.' : '') + '</p>'
      + (VS && (VS.pro.n || VS.classic.n) ? '<p class="lvp-n">Pro : ' + VS.pro.n + ' (' + VS.pro.easy + ' faciles' + g(VS.pro) + ') · Classique : ' + VS.classic.n + ' (' + VS.classic.easy + ' faciles' + g(VS.classic) + ')' + (VS.best ? ' → ' + (VS.best === 'pro' ? 'la pro te réussit.' : 'la classique te réussit.') : '') + '</p>' : '')
      + '<div class="pr-actions" style="margin-top:8px;"><button type="button" class="pr-btn pri" onclick="openLibPreview()">Classique ou pro</button><button type="button" class="pr-btn sec" onclick="openRunnerProfile()">Ton profil</button><button type="button" class="pr-btn sec" onclick="openLibCatalog()">Bibliothèque</button></div>'));
  }
  // ── le plan s'évalue
  const CB = E.calib;
  if(CB){
    const M = { bold: ['Franc', 'tu tiens tes hausses : une séance facile suffit pour monter, deux = deux paliers'], careful: ['Prudent', 'plusieurs hausses mal passées : il faut deux séances faciles de suite pour monter'], normal: ['Normal', CB.n < 3 ? 'pas encore assez de hausses pour juger (3 au moins)' : 'une séance facile sans séance dure avant pour monter'] }[CB.mode];
    TH.learn.push(fold('cal', '🧪', 'Le plan s\'évalue', M[0] + (CB.n ? ' · ' + CB.ok + ' hausse' + (CB.ok > 1 ? 's' : '') + ' tenue' + (CB.ok > 1 ? 's' : '') + ' sur ' + CB.n : ''),
      '<div class="pe-row"><span class="pe-chip pe-' + (CB.mode === 'bold' ? 'easy' : CB.mode === 'careful' ? 'hard' : 'ok') + '">' + M[0] + '</span><span class="pe-tx"><b>' + (CB.n ? CB.ok + ' hausse' + (CB.ok > 1 ? 's' : '') + ' tenue' + (CB.ok > 1 ? 's' : '') + ' sur ' + CB.n + (CB.hist ? ' (dont ' + CB.hist + ' dans ton historique)' : '') : 'Aucune hausse encore jouée') + '</b><small>' + esc(M[1]) + '</small></span></div>'
      + Object.keys(CB.fams).map(function(fm){ const x = CB.fams[fm]; return '<div class="pe-row"><span class="pe-tx"><b>' + esc((typeof PA_FAM !== 'undefined' && PA_FAM[fm]) || (fm === 'long' ? 'Sortie longue' : fm)) + '</b><small>' + x.ok + ' / ' + x.n + ' tenue' + (x.ok > 1 ? 's' : '') + '</small></span></div>'; }).join('')
      + (E.longNext ? '<p class="lvp-n">🏃 Sortie longue : ' + esc(E.longNext.title) + '</p>' : '')));
  }
  const HB = E.habits ? Object.keys(E.habits) : [];
  if(HB.length){
    const TL = { tempo: 'Tempo', frac: 'Fractionné', long: 'Sortie longue' };
    TH.learn.push(fold('hab', '📅', 'Ta vraie semaine', esc(HB.map(function(t){ return TL[t] + ' le ' + PA_DAYS[E.habits[t].day]; }).join(' · ')), HB.map(function(t){ const x = E.habits[t]; return '<div class="pe-row"><span class="pe-tx"><b>' + TL[t] + ' le ' + PA_DAYS[x.day] + '</b><small>' + x.n + ' des ' + x.of + ' dernières · le plan les place ce jour-là</small></span></div>'; }).join('')));
  }
  // ── ce que tout ton historique a appris au plan
  const HI = E.hist;
  if(HI && HI.n){
    const P = HI.pred || {}, VV = HI.vol || {}, RP = HI.rpe || {}, TL = { ef: 'Footing', long: 'Sortie longue', tempo: 'Tempo', frac: 'Fractionné' };
    const yr = HI.first ? prFmtDate(HI.first, { month: 'short', year: 'numeric' }) : '';
    TH.learn.push(fold('hist', '📚', 'Ce que ton historique lui apprend', HI.n + ' séances · ' + HI.km.toLocaleString('fr-FR') + ' km',
      '<p class="lvp-n">' + HI.n + ' séances · ' + HI.km.toLocaleString('fr-FR') + ' km depuis ' + esc(yr) + ', toutes rejouées.</p>'
      + (P.n ? P.races.slice(0, 4).map(function(r){ return '<div class="pe-row"><span class="pe-chip pe-' + (Math.abs(r.err) < 0.5 ? 'ok' : r.err > 0 ? 'easy' : 'hard') + '">' + (r.err > 0 ? '+' : '') + prV(r.err) + '</span><span class="pe-tx"><b>' + esc(r.label) + '</b><small>' + prFmtDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' }) + ' · prévu ' + prTime(r.projSec) + ' 6 sem. avant · fait ' + prTime(r.sec) + '</small></span></div>'; }).join('')
        + '<p class="lvp-n">' + (Math.abs(P.bias) >= 0.1 ? (P.bias > 0 ? 'Tu fais mieux que prévu : temps prévus recalés de +' : 'Tu fais moins bien que prévu : temps prévus recalés de ') + prV(P.bias) + ' de niveau.' : 'Les temps prévus tombaient juste : rien à recaler.') + '</p>' : '<p class="lvp-n">Pas encore assez de courses avec de l\'entraînement connu avant pour vérifier les prédictions.</p>')
      + (VV.prog ? '<div class="pe-row"><span class="pe-tx"><b>Hausse de volume que tu tiens : +' + Math.round((VV.prog - 1) * 100) + ' % par semaine</b><small>' + VV.safe + ' hausse' + (VV.safe > 1 ? 's' : '') + ' bien passée' + (VV.safe > 1 ? 's' : '') + (VV.bad ? ', ' + VV.bad + ' suivie' + (VV.bad > 1 ? 's' : '') + ' d\'une douleur ou d\'un arrêt' : '') + '</small></span></div>' : '')
      + (VV.best4 ? '<div class="pe-row"><span class="pe-tx"><b>Meilleur volume tenu : ' + VV.best4 + ' km par semaine</b><small>sur 4 semaines, ces 2 dernières années</small></span></div>' : '')
      + (Object.keys(RP).length ? '<div class="pe-row"><span class="pe-tx"><b>Ton effort habituel</b><small>' + Object.keys(RP).map(function(t){ return TL[t] + ' ' + String(RP[t].med).replace('.', ',') + '/10'; }).join(' · ') + '</small></span></div>' : '')
      + (E.recal && !E.recal.undone && E.recal.n ? '<p class="lvp-n">🧬 Recalé le ' + prFmtDate(E.recal.date) + ' : ' + E.recal.n + ' séance' + (E.recal.n > 1 ? 's' : '') + ' ajustée' + (E.recal.n > 1 ? 's' : '') + '. <button type="button" class="pr-link" onclick="paHistUndo();closePlanEvolution()">Annuler</button></p>' : '')));
  }
  // ── qui a changé quoi (pilote de nuit, Coach, choix…)
  // trois thèmes : ce qui mesure ta progression, ce que tu fais, ce que le plan apprend de toi
  TH.train.unshift(DP.wk || ''); TH.train.push(DP.sig || ''); TH.learn.push(DP.hist || '');
  [['prog', 'Ta progression'], ['train', 'Ton entraînement'], ['learn', 'Ce que le plan apprend']].forEach(function(t){ const L = TH[t[0]].filter(Boolean); if(L.length) h += '<p class="pr-sec pe-th"><span>' + t[1] + '</span></p>' + L.join(''); });
  if(a.proposals && a.proposals.length && !document.getElementById('plan-review')) h += '<button type="button" class="pr-btn pri" style="width:100%;margin-top:12px;" onclick="closePlanEvolution();openPlanReview()">Voir les ' + a.proposals.length + ' changement' + (a.proposals.length > 1 ? 's' : '') + ' proposé' + (a.proposals.length > 1 ? 's' : '') + '</button>';
  const ov = document.createElement('div'); ov.id = 'pe-ov'; ov.className = 'ros pe';
  ov.innerHTML = '<div class="ros-box" role="dialog" aria-modal="true" aria-labelledby="pe-title"><div class="ros-head"><div class="ros-top"><button type="button" class="ros-x" onclick="closePlanEvolution()" aria-label="Fermer">×</button>'
    + '<div style="min-width:0;"><p class="ros-eb">Plan</p><p class="ros-title" id="pe-title">Comprendre ton plan</p><p class="ros-sub">Pourquoi il bouge, et où il te mène</p></div></div></div>'
    + '<div class="ros-body">' + h + '</div></div>';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePlanEvolution(); });
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
}
function closePlanEvolution(){ const ov = document.getElementById('pe-ov'); if(!ov) return; ov.remove(); if(!document.getElementById('plan-review')) document.body.style.overflow = ''; }

// « Rien à changer » : pour chaque séance de qualité des 4 prochaines semaines, pourquoi elle ne bouge pas (prPaceProposals → a.paceTrace)
const PR_TRACE = { ok: ['✓', 'déjà à ton niveau'], coach: ['🔒', 'fixée par le Coach'], held: ['⏸', 'en attente : récup après ta course'], nopace: ['·', 'pas d\'allure lisible dans la consigne'] };
function _prTraceHtml(a){
  const L = (a.paceTrace || []).filter(function(t){ return t.st !== 'change'; }).sort(function(x, y){ return String(x.date).localeCompare(String(y.date)); }).slice(0, 5);
  if(!L.length) return '';
  return '<div class="pr-trace"><p class="pr-trace-h">Tes séances de qualité à venir</p>' + L.map(function(t){
    const T = PR_TRACE[t.st] || ['·', ''];
    const why = t.st === 'ok' ? T[1] + (t.target ? ' (ton niveau vise ' + t.target + ')' : '')
      : t.st === 'coach' ? T[1] + (t.since ? ' le ' + prFmtDate(t.since, { day: 'numeric', month: 'short' }) : '') + ' · recalculée dès que ton niveau bouge d\'1 point'
      : T[1];
    return '<div class="pr-tr"><span class="pr-tr-i">' + T[0] + '</span><span><b>' + prEsc(t.title) + '</b><small>' + prFmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (t.cur ? ' · ' + prEsc(t.cur) : '') + ' · ' + prEsc(why) + '</small></span></div>';
  }).join('') + '</div>';
}

// ─── Calculs propres à ces écrans (sortis du bundle : chargés seulement avec MAJ le plan) ───
// ─── F. Comment ton plan évolue ─────────────────────────────────────────────
function paEvolution(a, today){
  today = today || prTodayIso();
  const st = state, trend = a.absorb || paTrend(st, today);
  // paliers : dernière séance faite et prochaine séance prévue de chaque famille
  const done = (typeof prAllDone === 'function' ? prAllDone(today) : []).filter(function(s){ return s.done && s.date && prDays(s.date, today) <= 56 && !s.ext; }).sort(function(x, y){ return y.date.localeCompare(x.date); });
  const next = prSessions(st).filter(function(s){ return !s.done && !s.skip && s.date && s.date >= today; }).sort(function(x, y){ return x.date.localeCompare(y.date); });
  const ladders = ['T', 'I', 'R', 'race'].map(function(f){
    const last = done.filter(function(s){ return paFam(s) === f && paParseReps(s.title + ' ' + s.detail); })[0];
    const nx = next.filter(function(s){ return paFam(s) === f && paParseReps(s.title + ' ' + s.detail); })[0];
    if(!last && !nx) return null;
    const ref = nx || last, r = paParseReps(ref.title + ' ' + ref.detail), L = PA_LADDERS[paLadderKey(f, r.unit, a.opt.raceCat)];
    const pr = (a.proposals || []).filter(function(p){ return p.kind === 'ladder' && nx && p.key === nx.key; })[0];
    const ab = last ? paAbsorb(last, st, { today: today }) : null;
    return { fam: f, label: PA_FAM[f], ic: PA_FAM_IC[f], rungs: L ? L.length : 0,
      last: last ? { title: last.title, date: last.date, verdict: ab && ab.verdict, rung: L ? paRung(L, paParseReps(last.title + ' ' + last.detail)) : null } : null,
      next: nx ? { title: nx.title, date: nx.date, rung: L ? paRung(L, r) : null, prop: pr ? { title: pr.after.t, rung: pr.rung, up: pr.delta > 0 } : null } : null };
  }).filter(Boolean);
  // niveau : aujourd'hui vs il y a 4 semaines
  let lvl = null;
  try { const H = typeof bsLevelHistory === 'function' ? bsLevelHistory(today) : []; if(H.length){ const now = H[H.length - 1], ago = H.length >= 5 ? H[H.length - 5] : H[0]; lvl = { now: now.v, ago: ago.v, from: ago.date, delta: Math.round((now.v - ago.v) * 10) / 10 }; } } catch(e) { if(typeof diagSilent === 'function') diagSilent(e, 'plan-adapt:paEvolution'); }
  const V = a.volume || null;
  const changes = (st._plan_reviews || []).slice(-6).reverse().map(function(h){
    const kinds = {}; (h.changes || []).forEach(function(c){ if(c.kind !== 'coherence') kinds[c.kind || c.src || 'calcul'] = (kinds[c.kind || c.src || 'calcul'] || 0) + 1; });
    return { date: h.date, n: h.n || 0, undone: !!h.undone, kind: h.kind || (h.coach ? 'coach' : h.auto ? 'autopilot' : 'maj'), kinds: kinds };
  });
  const T = a.trajectory || null;
  const calib = a.ladderCalib || paLadderCalib(state, today), habits = paHabits(state, today);
  const longP = (a.proposals || []).filter(function(p){ return p.fam === 'long'; })[0] || null;
  return { hist: a.hist || null, recal: state._hist_recal || null, calib: calib, habits: habits, longNext: longP ? { title: longP.short, date: longP.date, up: longP.delta > 0 } : null, trend: trend, ladders: ladders, level: lvl, fit: a.fit && a.fit.vdot, planVdot: a.planVdotNow || a.planVdot, volume: V ? { base: V.base, peak: V.peak, goalPeak: V.goalPeak || null, prog: V.prog || null, weeks: V.weeks } : null,
    changes: changes, goal: a.opt.goalSec || null, traj: T && T.race ? { mid: T.race.mid, lo: T.race.lo, hi: T.race.hi, verdict: T.verdict || null } : null };
}


function prTrajectorySvg(T){
  if(!T || !T.race) return '';
  const W = 320, H = 150, L = 30, Rt = 8, Tp = 12, B = 22;
  const today = prTodayIso(), first = T.pts.length && T.pts[0].date < prAddDays(today, -14) ? T.pts[0].date : prAddDays(today, -28), t0 = Date.parse(first + 'T12:00:00Z'), t1 = Date.parse(T.race.date + 'T12:00:00Z'), now = Date.parse(prTodayIso() + 'T12:00:00Z');
  const vs = T.pts.map(function(p){ return p.v; }).concat([T.now, T.race.v + 0.6, T.race.v - 0.6]).concat(T.need ? [T.need] : []);
  const v0 = Math.floor(Math.min.apply(null, vs) - 0.5), v1 = Math.ceil(Math.max.apply(null, vs) + 0.5);
  const X = function(t){ return L + (t - t0) / Math.max(1, t1 - t0) * (W - L - Rt); }, Y = function(v){ return Tp + (v1 - v) / Math.max(0.5, v1 - v0) * (H - Tp - B); };
  const td = function(d){ return Date.parse(d + 'T12:00:00Z'); };
  let g = '';
  for(let v = Math.ceil(v0); v <= v1; v++) if(v1 - v0 <= 8 || v % 2 === 0) g += '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="tj-grid"/><text x="' + (L - 5) + '" y="' + (Y(v) + 3) + '" class="tj-ax" text-anchor="end">' + v + '</text>';
  const months = []; const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  while(d.getTime() <= t1){ months.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
  const step = Math.ceil(months.length / 5);
  months.forEach(function(t, i){ if(i % step) return; g += '<text x="' + X(t) + '" y="' + (H - 6) + '" class="tj-ax" text-anchor="middle">' + new Date(t).toLocaleDateString('fr-FR', { month: 'short' }) + '</text>'; });
  if(T.need) g += '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + Y(T.need) + '" y2="' + Y(T.need) + '" class="tj-goal"/><text x="' + (W - Rt - 2) + '" y="' + (Y(T.need) - 4) + '" class="tj-goal-t" text-anchor="end">objectif ' + prV(T.need) + '</text>';
  const xn = X(now), xr = X(t1), yn = Y(T.now), yr = Y(T.race.v);
  g += '<polygon points="' + xn + ',' + yn + ' ' + xr + ',' + Y(T.race.v + 0.6) + ' ' + xr + ',' + Y(T.race.v - 0.6) + '" class="tj-band"/>';
  g += '<line x1="' + xn + '" y1="' + yn + '" x2="' + xr + '" y2="' + yr + '" class="tj-proj"/>';
  T.pts.forEach(function(p){ g += '<circle cx="' + X(td(p.date)) + '" cy="' + Y(p.v) + '" r="' + (p.kind === 'course' ? 4 : 2.6) + '" class="' + (p.kind === 'course' ? 'tj-race' : 'tj-ses') + '"><title>' + prEsc(p.label) + ' · ' + prV(p.v) + '</title></circle>'; });
  g += '<circle cx="' + xn + '" cy="' + yn + '" r="5" class="tj-now"/><circle cx="' + xr + '" cy="' + yr + '" r="4.5" class="tj-end"/><text x="' + xr + '" y="' + (yr - 9) + '" class="tj-end-t" text-anchor="end">' + prV(T.race.v) + '</text>';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tj-svg" role="img" aria-label="Niveau dans le temps et projection au jour de la course">' + g + '</svg>';
}

// ─── Ce que la prépa reprend de la précédente (course juste avant, leçons, recette, allures) ───
// la dernière course (≤ 28 jours avant le début de la prépa) : résultat → niveau → allures, départ, fin de course, objectif, recette
function paCarry(a, today){
  const st = state, start = st.plan_start_date; if(!start || !a || !a.opt) return null;
  today = today || a.opt.today;
  const RA = st._race_analysis && st._race_analysis.date && st._race_analysis.date <= start && prDays(st._race_analysis.date, start) <= 28 ? st._race_analysis : null;
  const races = (typeof prKnownRaces === 'function' ? prKnownRaces() : []).filter(function(r){ return r.date && r.date <= start && prDays(r.date, start) <= 28; }).sort(function(x, y){ return y.date.localeCompare(x.date); });
  const L = races[0] || null; if(!RA && !L) return null;
  const name = (RA && RA.name) || (L && (L.label || L.cat)) || 'ta dernière course', time = RA ? RA.time : L.time, items = [];
  const v = L && PR_RACE_M[L.cat] && typeof vdotFromRace === 'function' ? vdotFromRace(PR_RACE_M[L.cat], prTimeSec(L.time)) : null;
  items.push({ ic: '🏁', t: 'Ton résultat', v: time + (v ? ' · niveau ' + prV(v) : '') + (a.fit && a.fit.vdot ? ' · niveau du moment ' + prV(a.fit.vdot) : '') });
  // allures : le plan suit ce niveau ?
  const paceN = (a.proposals || []).filter(function(p){ return p.field === 'detail' && !p.kind; }).length + (a.held || []).length;
  if(a.opt.noFasterUntil && a.opt.noFasterUntil >= today) items.push({ ic: '⏸️', t: 'Allures', v: 'Gardées jusqu\'au ' + prFmtDate(a.opt.noFasterUntil) + ' le temps de récupérer, puis recalées sur ce niveau' });
  else if(paceN) items.push({ ic: '🔄', t: 'Allures', v: paceN + ' séance' + (paceN > 1 ? 's' : '') + ' à recaler sur ce niveau dans « MAJ le plan »', act: 'review' });
  else items.push({ ic: '✓', t: 'Allures', v: 'Ton plan est déjà à ce niveau' + (a.planVdotNow ? ' (' + prV(a.planVdotNow) + ')' : '') });
  // départ
  if(RA && RA.start){
    const fast = RA.start.pct <= -2, rec = st._recette && st._recette.pacing && st._recette.pacing.start;
    items.push(fast ? { ic: '🐢', t: 'Le départ', v: 'Trop rapide (' + Math.round(-RA.start.diff) + ' s/km de trop sur ' + RA.start.n + ' km)' + (rec ? ' → ton plan de course démarre plus prudemment' : ' → départ prudent à prévoir') }
      : { ic: '✓', t: 'Le départ', v: 'Bien géré : on garde la même prudence' });
  }
  // fin de course
  if(RA && (RA.pacing || RA.fade)){
    const hard = RA.pacing === 'fade' || RA.pacing === 'positive' || RA.fade, foc = a.profile && a.profile.focus && a.profile.focus.indexOf('specifique') >= 0;
    items.push(hard ? { ic: '🧱', t: 'La fin de course', v: (RA.fade ? 'Coup de mou au km ' + RA.fade.km : '2e moitié plus lente') + (foc ? ' → priorité de ta prépa : endurance à allure course' : ' → plus de km à allure course en fin de sortie longue') }
      : { ic: '✓', t: 'La fin de course', v: RA.pacing === 'negative' ? '2e moitié plus rapide : belle gestion' : 'Régulière jusqu\'au bout' });
  }
  // objectif de la nouvelle prépa
  const R = typeof prepRace === 'function' ? (prepRace() || {}) : {}, cat = typeof predRaceCat === 'function' ? predRaceCat(R) : null, P = cat && typeof predRace === 'function' ? predRace(cat, today) : null;
  const goal = prTimeSec(st.target_time || (st.onboarding || {}).target_time);
  if(P && P.race) items.push({ ic: '🎯', t: 'L\'objectif', v: 'Prévu le ' + prFmtDate(P.race.date || R.date) + ' : ' + prTime(P.sec) + (goal ? ' pour ' + prTime(goal) : '') + (a.goalCheck ? ' · objectif à revoir dans « MAJ le plan »' : ''), act: a.goalCheck ? 'review' : null });
  // recette et historique
  const RC = st._recette;
  if(RC) items.push({ ic: '🧬', t: 'Ta recette', v: 'Progression ≤ +' + Math.round((RC.progression - 1) * 100) + ' %/sem.' + (RC.taper ? ' · affûtage perso' : '') + (RC.pacing && RC.pacing.start ? ' · départ prudent' : '') });
  const H = a.hist; if(H && H.pred && H.pred.n) items.push({ ic: '📚', t: 'Ton historique', v: H.pred.n + ' course' + (H.pred.n > 1 ? 's' : '') + ' rejouée' + (H.pred.n > 1 ? 's' : '') + ' pour caler les temps prévus' });
  return { name: name, date: RA ? RA.date : L.date, time: time, lessons: RA ? (RA.lessons || []).slice(0, 3) : [], items: items };
}
