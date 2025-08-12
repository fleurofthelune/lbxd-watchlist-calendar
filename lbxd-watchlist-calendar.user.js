// ==UserScript==
// @name         LBXD Watchlist Calendar — Posters (click-only)
// @namespace    lbxd-calendar
// @version      2.2.0
// @description  Click a date, then a title. Calendar shows posters. ES5-only; no libraries; no network.
// @match        https://letterboxd.com/*watchlist*
// @run-at       document-idle
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/fleurofthelune/lbxd-watchlist-calendar
// @supportURL   https://github.com/fleurofthelune/lbxd-watchlist-calendar/issues
// @downloadURL  https://raw.githubusercontent.com/fleurofthelune/lbxd-watchlist-calendar/main/lbxd-watchlist-calendar.user.js
// @updateURL    https://raw.githubusercontent.com/fleurofthelune/lbxd-watchlist-calendar/main/lbxd-watchlist-calendar.user.js
// ==/UserScript==

(function () {
  'use strict';

  var LS_ITEMS_KEY = 'lbxd_calendar_items';
  var LS_SCHEDULE_KEY = 'lbxd_calendar_schedule';

  // ----------------- helpers -----------------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $$(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function pad(n){ return n<10 ? '0'+n : ''+n; }
  function fmtDate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function readJSON(k,f){ try{ var r=localStorage.getItem(k); return r?JSON.parse(r):f; }catch(e){ return f; } }
  function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function dedupeById(a){ var s={},o=[],i; for(i=0;i<a.length;i++){ var it=a[i]; if(!it||!it.id) continue; if(!s[it.id]){ s[it.id]=1; o.push(it);} } return o; }
  function titleFromSlug(slug){
    var parts=(slug||'').split('-'), i, w;
    for(i=0;i<parts.length;i++){ w=parts[i]; if(w) parts[i]=w.charAt(0).toUpperCase()+w.slice(1); }
    return parts.join(' ');
  }
  // aggressive cleaner: nukes prompts anywhere, then tidies spaces
  function cleanLinkText(txt){
    var s = (txt==null?'':(''+txt)).replace(/\s+/g,' ').trim();
    s = s.replace(/Watch this film\?/ig,'');
    s = s.replace(/Add to watchlist\?/ig,'');
    s = s.replace(/\s*[·|]\s*$/g,'');
    s = s.replace(/\s{2,}/g,' ').trim();
    return s;
  }
  function sanitizeItem(it){
    if(!it) return null;
    var id = it.id || '';
    var m = (id+'').match(/\/film\/([a-z0-9-]+)\/?/i);
    if(!m){
      var mu = (it.url||'').match(/\/film\/([a-z0-9-]+)\/?/i);
      if(!mu) return null;
      id = '/film/'+mu[1]+'/';
    } else id = '/film/'+m[1]+'/';
    var slug = (id.match(/\/film\/([a-z0-9-]+)\//i)||[])[1] || '';
    var title = cleanLinkText(it.title||'') || titleFromSlug(slug);
    var url = it.url && /^https?:\/\//i.test(it.url) ? it.url : ('https://letterboxd.com'+id);
    return { id:id, title:title, url:url };
  }

  // ----------------- state -----------------
  var items = readJSON(LS_ITEMS_KEY, []);
  var schedule = readJSON(LS_SCHEDULE_KEY, {});
  var armedDate = null;
  var currentMonthDate = (function(){ var d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

  // retro-clean everything once
  function sanitizeAll(){
    var rawItems = readJSON(LS_ITEMS_KEY, []);
    var i, s, newItems=[];
    for(i=0;i<rawItems.length;i++){ s=sanitizeItem(rawItems[i]); if(s) newItems.push(s); }
    newItems = dedupeById(newItems);
    writeJSON(LS_ITEMS_KEY,newItems);
    items = newItems;

    var rawSched = readJSON(LS_SCHEDULE_KEY, {});
    var dateStr, newSched={}, list, j, sj, seen;
    for(dateStr in rawSched){ if(!rawSched.hasOwnProperty(dateStr)) continue;
      list = rawSched[dateStr] || []; seen={}; var cleaned=[];
      for(j=0;j<list.length;j++){ sj=sanitizeItem(list[j]); if(sj && !seen[sj.id]){ seen[sj.id]=1; cleaned.push(sj); } }
      newSched[dateStr]=cleaned;
    }
    writeJSON(LS_SCHEDULE_KEY,newSched);
    schedule = newSched;
    return true;
  }
  sanitizeAll();

  // ----------------- styles (Letterboxd tokens) -----------------
  // Typography: Graphik stack; Base 14px / 1.4285
  // Colors: bg #14181c, border #2c3440, text #d8e0e8, meta #9ab, accent #00e054
  var Z=2147483647;
  var css = ''
  + '.lbxd-cal-btn{position:fixed;right:16px;bottom:16px;z-index:'+Z+';background:#2c3440;border:1px solid #2c3440;color:#d8e0e8;border-radius:20px;padding:8px 14px;font:14px/1.4285 "Graphik","Helvetica Neue",Helvetica,Arial,sans-serif;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.25)}'
  + '.lbxd-cal-btn:hover{background:#3c4854;border-color:#3c4854}'
  + '.lbxd-cal-btn:active{background:#33404c}'

  + '.lbxd-modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(20,24,28,.66);z-index:'+(Z-1)+';display:none;opacity:0;transition:opacity .14s ease}'
  + '.lbxd-modal-backdrop.is-open{opacity:1}'

  + '.lbxd-modal{position:fixed;top:5%;left:3%;right:3%;bottom:5%;z-index:'+Z+';background:#14181c;color:#d8e0e8;border:1px solid #2c3440;border-radius:6px;box-shadow:0 12px 48px rgba(0,0,0,.45);display:none;overflow:hidden;opacity:0;transform:scale(.985);transition:opacity .14s ease, transform .14s ease;font:14px/1.4285 "Graphik","Helvetica Neue",Helvetica,Arial,sans-serif}'
  + '.lbxd-modal.is-open{opacity:1;transform:scale(1)}'

  + '.lbxd-modal-inner{display:flex;height:100%;max-height:90vh}'
  + '.lbxd-left{width:360px;min-width:440px;border-right:1px solid #2c3440;display:flex;flex-direction:column}'
  + '.lbxd-left-head{padding:8px 12px;border-bottom:1px solid #2c3440;display:flex;align-items:center;gap:8px}'
  + '.lbxd-left-head input[type="text"]{flex:1;background:#0f1418;border:1px solid #2c3440;border-radius:3px;padding:8px 10px;color:#d8e0e8;font:15px/1.4285 "Graphik","Helvetica Neue",Helvetica,Arial,sans-serif}'
  + '.lbxd-left-head input[type="text"]::placeholder{color:#9ab}'
  + '.lbxd-left-head input[type="text"]:focus{outline:0;border-color:#00e054;box-shadow:0 0 0 2px rgba(0,224,84,.25)}'
  + '.lbxd-count{font-size:12px;color:#9ab;margin-left:6px}'
  + '.lbxd-footnote{font-size:11px;color:#9ab;margin-left:6px}'

  + '.lbxd-left-actions{padding:8px 12px;border-bottom:1px solid #2c3440;display:flex;flex-wrap:wrap;gap:8px}'
  + '.lbxd-btn{background:#2c3440;border:1px solid #2c3440;color:#d8e0e8;border-radius:3px;padding:7px 12px;font-size:13px;cursor:pointer}'
  + '.lbxd-btn:hover{background:#3c4854;border-color:#3c4854}'
  + '.lbxd-btn:active{background:#33404c}'
  + '.lbxd-btn:focus{outline:0;box-shadow:0 0 0 2px rgba(0,224,84,.25)}'

  + '.lbxd-list{flex:1;overflow:auto;padding:8px 14px}'
  + '.lbxd-item{padding:8px 10px;border-bottom:1px solid #2c3440;cursor:pointer;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.lbxd-item:hover{background:rgba(255,255,255,.06)}'

  + '.lbxd-right{flex:1;display:flex;flex-direction:column;min-width:520px;background:#14181c}'
  + '.lbxd-right-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #2c3440}'
  + '.lbxd-monthlabel{font-weight:600}'
  + '.lbxd-cal-nav{display:flex;gap:8px}'

  + '.lbxd-weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:8px 12px 0 12px;font-size:11px;color:#9ab;text-transform:uppercase;letter-spacing:.02em}'
  + '.lbxd-weekdays span{text-align:center}'

  + '.lbxd-grid{flex:1;display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:120px;gap:6px;padding:8px 12px 12px 12px;overflow:auto}'
  + '.lbxd-cell{background:#14181c;border:1px solid #2c3440;border-radius:6px;padding:6px;position:relative;display:flex;flex-direction:column;overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)}'
  + '.lbxd-cell:hover{background:#161c22}'
  + '.lbxd-cell.disabled{opacity:.35}'
  + '.lbxd-daynum{font-size:12px;color:#9ab;margin-bottom:4px;flex:0 0 auto}'
  + '.lbxd-armed{box-shadow:inset 0 0 0 2px #00e054}'
  + '.lbxd-todaycell{box-shadow:inset 0 0 0 1px #3c4854}'

  + '.lbxd-chip{display:inline-block;border:1px solid #2c3440;border-radius:3px;padding:2px 8px;margin:2px 4px 0 0;font-size:11px;background:#14181c;color:#d8e0e8;cursor:pointer;white-space:normal;word-break:break-word;max-width:100%;overflow:hidden;}'
  + '.lbxd-chip:hover{background:#1c232b;border-color:#3c4854}'

  + '.lbxd-footer{padding:8px 12px;border-top:1px solid #2c3440;display:flex;justify-content:flex-end;gap:8px}'

  + '.lbxd-close{position:absolute;top:8px;left:8px;background:#2c3440;border:1px solid #2c3440;color:#d8e0e8;width:22px;height:22px;border-radius:3px;cursor:pointer;line-height:20px;text-align:center;font-weight:600}'
  + '.lbxd-close:hover{background:#3c4854;border-color:#3c4854}'
  + '.lbxd-close:active{background:#33404c}'
  ;
  var style=document.createElement('style'); style.type='text/css'; style.appendChild(document.createTextNode(css)); document.head.appendChild(style);

  // ----------------- UI -----------------
  var openBtn=document.createElement('button'); openBtn.className='lbxd-cal-btn'; openBtn.textContent='Calendar'; document.body.appendChild(openBtn);
  var backdrop=document.createElement('div'); backdrop.className='lbxd-modal-backdrop'; document.body.appendChild(backdrop);

  var modal=document.createElement('div'); modal.className='lbxd-modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
  modal.innerHTML=''
  + '<button class="lbxd-close" title="Close">×</button>'
  + '<div class="lbxd-modal-inner">'
    + '<div class="lbxd-left">'
      + '<div class="lbxd-left-head">'
        + '<input type="text" class="lbxd-search" placeholder="Search titles...">'
        + '<span class="lbxd-count">0 items</span>'
        + '<span class="lbxd-footnote">v1.2.0</span>'
      + '</div>'
      + '<div class="lbxd-left-actions">'
        + '<button class="lbxd-btn lbxd-scan">Scan Page</button>'
        + '<button class="lbxd-btn lbxd-force">Force Clean</button>'
      + '</div>'
      + '<div class="lbxd-list"></div>'
    + '</div>'
    + '<div class="lbxd-right">'
      + '<div class="lbxd-right-head">'
        + '<div><strong class="lbxd-monthlabel"></strong></div>'
        + '<div class="lbxd-cal-nav">'
          + '<button class="lbxd-btn lbxd-prev">Prev</button>'
          + '<button class="lbxd-btn lbxd-today">Today</button>'
          + '<button class="lbxd-btn lbxd-next">Next</button>'
        + '</div>'
      + '</div>'
      + '<div class="lbxd-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>'
      + '<div class="lbxd-grid"></div>'
      + '<div class="lbxd-footer"><button class="lbxd-btn lbxd-close2">Close</button></div>'
    + '</div>'
  + '</div>';
  document.body.appendChild(modal);

  var closeBtn=$('.lbxd-close',modal), closeBtn2=$('.lbxd-close2',modal), listEl=$('.lbxd-list',modal),
      searchEl=$('.lbxd-search',modal), countEl=$('.lbxd-count',modal), gridEl=$('.lbxd-grid',modal),
      monthLabelEl=$('.lbxd-monthlabel',modal), scanBtn=$('.lbxd-scan',modal), forceBtn=$('.lbxd-force',modal),
      prevBtn=$('.lbxd-prev',modal), nextBtn=$('.lbxd-next',modal), todayBtn=$('.lbxd-today',modal);

  // ----------------- data scan -----------------
  function mergeOrUpdate(arr, incoming){
    var i; for(i=0;i<arr.length;i++){ if(arr[i].id===incoming.id){ arr[i]=incoming; return; } } arr.push(incoming);
  }
  function scanPageForFilms(){
    var anchors=$$('a[href*="/film/"]'), i, a, href, mFull, id, slug, rawTitle, cleanTitle, url, s;
    var found=[];
    for(i=0;i<anchors.length;i++){
      a=anchors[i]; href=a.getAttribute('href')||''; mFull=href.match(/(?:https?:\/\/[^\/]+)?(\/film\/[a-z0-9-]+\/)/i);
      if(!mFull) continue;
      id=mFull[1]; slug=(id.match(/\/film\/([a-z0-9-]+)\//i)||[])[1];
      rawTitle=(a.textContent||'').trim(); cleanTitle=cleanLinkText(rawTitle) || titleFromSlug(slug);
      url=/^https?:\/\//i.test(href) ? href : ('https://letterboxd.com'+id);
      s = sanitizeItem({ id:id, title:cleanTitle, url:url });
      if(s) found.push(s);
    }
    if(found.length){
      for(i=0;i<found.length;i++){ mergeOrUpdate(items, found[i]); }
      items=dedupeById(items); writeJSON(LS_ITEMS_KEY, items);
    }
  }

  // ----------------- render list -----------------
  function renderCount(){ countEl.textContent = items.length+' items'; }
  function renderItemsList(filter){
    listEl.innerHTML=''; var f=(filter||'').toLowerCase(), i, it, title;
    for(i=0;i<items.length;i++){
      it = items[i];
      title = cleanLinkText(it.title);
      if (title !== it.title){
        items[i] = sanitizeItem({ id: it.id, title: title, url: it.url });
        writeJSON(LS_ITEMS_KEY, items);
      }
      if (f && title.toLowerCase().indexOf(f) === -1) continue;
      var div=document.createElement('div'); div.className='lbxd-item'; div.setAttribute('data-id', it.id); div.setAttribute('title', title); div.textContent=title;
      listEl.appendChild(div);
    }
    renderCount();
  }

  // ----------------- calendar helpers -----------------
  function monthLabel(d){ var m=['January','February','March','April','May','June','July','August','September','October','November','December']; return m[d.getMonth()]+' '+d.getFullYear(); }
  function firstDayMondayIdx(d){ var first=new Date(d.getFullYear(),d.getMonth(),1), w=first.getDay(); return (w+6)%7; }
  function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
  function isTodayDate(d){ var t=new Date(); return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate(); }

  // ----------------- calendar render -----------------
  function renderCalendar(){
    monthLabelEl.textContent=monthLabel(currentMonthDate); gridEl.innerHTML='';
    var dim=daysInMonth(currentMonthDate), leading=firstDayMondayIdx(currentMonthDate), cells=[], i, day;
    for(i=0;i<leading;i++) cells.push({date:null,disabled:true});
    for(day=1; day<=dim; day++) cells.push({date:new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), day), disabled:false});
    while (cells.length % 7 !== 0) cells.push({date:null,disabled:true});
    for(i=0;i<cells.length;i++){
      var cell=document.createElement('div'); cell.className='lbxd-cell'; var info=cells[i];
      if(info.disabled){ cell.className+=' disabled'; cell.innerHTML='<div class="lbxd-daynum"></div>'; gridEl.appendChild(cell); continue; }
      var dateStr=fmtDate(info.date); cell.setAttribute('data-date', dateStr);
      if (isTodayDate(info.date)) { cell.className += ' lbxd-todaycell'; }

      var dayNum=document.createElement('div'); dayNum.className='lbxd-daynum'; dayNum.textContent=''+info.date.getDate(); cell.appendChild(dayNum);
      appendChipsToCell(cell, dateStr);
      if(armedDate===dateStr) cell.className+=' lbxd-armed';
      gridEl.appendChild(cell);
    }
  }
  function appendChipsToCell(cell, dateStr){
    var list=schedule[dateStr]||[], i, s;
    for(i=0;i<list.length;i++){
      s = sanitizeItem(list[i]); if(!s) continue;
      list[i]=s;
      var chip=document.createElement('span'); chip.className='lbxd-chip'; chip.setAttribute('data-id', s.id); chip.setAttribute('title', s.title+' (click to remove)'); chip.textContent=s.title;
      cell.appendChild(chip);
    }
    schedule[dateStr]=list; writeJSON(LS_SCHEDULE_KEY, schedule);
  }
  function setArmed(ds){
    armedDate=ds; var cells=$$('.lbxd-cell', gridEl), i, el, d;
    for(i=0;i<cells.length;i++){ el=cells[i]; d=el.getAttribute('data-date'); if(d && d===armedDate) el.classList.add('lbxd-armed'); else el.classList.remove('lbxd-armed'); }
  }

  // ----------------- schedule ops -----------------
  function addToSchedule(ds, item){
    if(!schedule[ds]) schedule[ds]=[];
    var list=schedule[ds], i;
    for(i=0;i<list.length;i++){ if(list[i].id===item.id) return; }
    list.push(sanitizeItem(item)); writeJSON(LS_SCHEDULE_KEY, schedule); repaintCell(ds);
  }
  function removeFromSchedule(ds, id){
    var list=schedule[ds]||[], out=[], i;
    for(i=0;i<list.length;i++){ if(list[i].id!==id) out.push(list[i]); }
    schedule[ds]=out; writeJSON(LS_SCHEDULE_KEY, schedule); repaintCell(ds);
  }
  function repaintCell(ds){
    var cell=$('.lbxd-cell[data-date="'+ds+'"]', gridEl); if(!cell) return;
    var chips=$$('.lbxd-chip', cell), i; for(i=0;i<chips.length;i++){ chips[i].parentNode.removeChild(chips[i]); }
    appendChipsToCell(cell, ds);
    setTimeout(function(){},0);
  }
  function findItemById(id){ var i; for(i=0;i<items.length;i++){ if(items[i].id===id) return items[i]; } return null; }

  // ----------------- open/close & events -----------------
  function openModal(){
    sanitizeAll(); scanPageForFilms(); renderItemsList(searchEl.value||''); renderCalendar();
    backdrop.style.display='block'; modal.style.display='block';
    setTimeout(function(){ backdrop.classList.add('is-open'); modal.classList.add('is-open'); }, 0);
  }
  function closeModal(){
    backdrop.classList.remove('is-open'); modal.classList.remove('is-open'); armedDate=null;
    setTimeout(function(){ backdrop.style.display='none'; modal.style.display='none'; }, 150);
  }

  openBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openModal(); }, true);
  $('.lbxd-close',modal).addEventListener('click', function(e){ e.preventDefault(); closeModal(); }, true);
  $('.lbxd-close2',modal).addEventListener('click', function(e){ e.preventDefault(); closeModal(); }, true);
  backdrop.addEventListener('click', function(){ closeModal(); });

  document.addEventListener('keydown', function(ev){
    var kc=ev.keyCode||ev.which;
    var isOpen = modal.style.display === 'block';
    // Alt/Meta + C toggles
    if(kc===67 && (ev.altKey||ev.metaKey)){ if(isOpen) closeModal(); else openModal(); return; }
    if(!isOpen) return;
    // Esc to close
    if(kc===27){ closeModal(); return; }
    // ← / → to navigate months
    if(kc===37){ currentMonthDate=new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth()-1, 1); renderCalendar(); return; }
    if(kc===39){ currentMonthDate=new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth()+1, 1); renderCalendar(); return; }
  }, false);

  listEl.addEventListener('click', function(ev){
    var t=ev.target; if(!t||!t.classList.contains('lbxd-item')) return; if(!armedDate) return;
    var id=t.getAttribute('data-id'); var item=findItemById(id); if(item) addToSchedule(armedDate, item);
  });
  gridEl.addEventListener('click', function(ev){
    var t=ev.target;
    if(t && t.classList.contains('lbxd-chip')){
      var parent=t.parentNode, ds=parent.getAttribute('data-date'), iid=t.getAttribute('data-id'); if(ds&&iid) removeFromSchedule(ds, iid); return;
    }
    var cell=t; while(cell && cell!==gridEl && !cell.classList.contains('lbxd-cell')) cell=cell.parentNode;
    if(cell && !cell.classList.contains('disabled')){ var ds=cell.getAttribute('data-date'); if(ds){ if(armedDate===ds) setArmed(null); else setArmed(ds); } }
  });
  searchEl.addEventListener('input', function(){ renderItemsList(searchEl.value||''); });

  prevBtn.addEventListener('click', function(){ currentMonthDate=new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth()-1, 1); renderCalendar(); });
  nextBtn.addEventListener('click', function(){ currentMonthDate=new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth()+1, 1); renderCalendar(); });
  todayBtn.addEventListener('click', function(){ var d=new Date(); currentMonthDate=new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); });

  // buttons
  scanBtn.addEventListener('click', function(){ scanPageForFilms(); renderItemsList(searchEl.value||''); });
  forceBtn.addEventListener('click', function(){
    if(!confirm('Force clean cached items and schedule?')) return;
    sanitizeAll(); scanPageForFilms(); renderItemsList(searchEl.value||''); renderCalendar();
  });

  // passive scan once
  setTimeout(function(){ scanPageForFilms(); },1200);
})();
