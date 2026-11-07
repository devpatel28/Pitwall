const catalog = JSON.parse(document.getElementById('race-catalog').textContent);
const raceSelect = document.getElementById('race');
const aSelect = document.getElementById('driver-a');
const bSelect = document.getElementById('driver-b');
const statusEl = document.getElementById('status');
const colors = ['#d7ff62', '#61beff'];
let current = null;
let requestNumber = 0;
const el = (tag, text, className) => {const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(className) node.className = className; return node;};
function populateDrivers() {
  const race = catalog.find(r => String(r.id) === raceSelect.value);
  [aSelect, bSelect].forEach(select => {select.replaceChildren(); for(const driver of race.drivers) select.add(new Option(driver, driver));});
  // Default to the race winner against the runner-up when the podium is known.
  const [first, second] = race.podium || [];
  if(race.drivers.includes(first) && race.drivers.includes(second)) {aSelect.value = first; bSelect.value = second;} else bSelect.selectedIndex = Math.min(1, bSelect.options.length - 1);
}
function metric(title, value, note) {const card = el('div', undefined, 'metric'); card.append(el('small', title), el('strong', value), el('p', note)); return card;}
function renderChart() {
  const onlyClean = document.getElementById('clean-only').checked;
  const drivers = current.drivers;
  const valid = l => l.seconds !== null && (!onlyClean || (l.clean && !l.pit));
  const values = drivers.flatMap(d => d.laps.filter(valid).map(l => l.seconds));
  const container = document.getElementById('chart'); container.replaceChildren();
  if(!values.length) {container.append(el('p', 'No lap times match this filter.')); return;}
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 1080 290'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Lap times for ' + drivers.map(d => d.driver).join(' and ') + '. Full values are available in the lap data table.');
  const lo = Math.min(...values) - .4, hi = Math.max(...values) + .4;
  const last = Math.max(...drivers.flatMap(d => d.laps.map(l => l.lap)));
  const x = n => 56 + ((n - 1) / Math.max(1, last - 1)) * 1000;
  const y = n => 245 - (n - lo) / (hi - lo) * 220;
  function node(tag, attrs, text, parent = svg) {const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v)); if(text) n.textContent = text; parent.append(n); return n;}
  for(let i=0;i<=4;i++){const value = lo + (hi-lo)*i/4; node('line',{x1:56,x2:1056,y1:y(value),y2:y(value),stroke:'#2b343c','stroke-dasharray':'3 5'}); node('text',{x:5,y:y(value)+4,fill:'#a1adb7','font-size':11},value.toFixed(1));}
  for(let n=1;n<=last;n+=Math.max(1,Math.floor(last/8))) node('text',{x:x(n),y:274,fill:'#a1adb7','font-size':11,'text-anchor':'middle'},String(n));
  drivers.forEach((driver, index)=>{
    let path='', previous=null;
    driver.laps.forEach(l=>{if(!valid(l)){previous=null;return;} path += `${previous !== null && l.lap === previous + 1 ? 'L' : 'M'}${x(l.lap)},${y(l.seconds)} `; previous=l.lap;});
    node('path',{d:path,fill:'none',stroke:colors[index],'stroke-width':2.5,'stroke-linejoin':'round'});
    driver.laps.filter(valid).forEach(l=>{const dot=node('circle',{cx:x(l.lap),cy:y(l.seconds),r:l.pit?5:3,fill:colors[index],tabindex:0,'aria-label':`${driver.driver}, lap ${l.lap}: ${l.seconds.toFixed(3)} seconds${l.pit?', pit lap':''}`}); const title=document.createElementNS(ns,'title');title.textContent=dot.getAttribute('aria-label');dot.append(title); dot.addEventListener('focus',()=>showLap(l.lap)); dot.addEventListener('blur',hideLap);});
  });
  // Lap scrubber: guide line plus a readout of both drivers' times and the gap on the hovered lap.
  const byLap = drivers.map(d => new Map(d.laps.filter(valid).map(l => [l.lap, l.seconds])));
  const scrub = node('g', {class:'scrub'});
  const guide = node('line', {y1:18, y2:250}, null, scrub), box = node('rect', {y:22, width:190, height:100, rx:4}, null, scrub);
  const lapLabel = node('text', {class:'muted'}, null, scrub), rows = drivers.map((d,i) => node('text', {style:`fill:${colors[i]}`}, null, scrub)), gapLabel = node('text', {}, null, scrub);
  function showLap(n) {
    n = Math.min(last, Math.max(1, n)); const px = x(n), bx = px + 202 > 1056 ? px - 202 : px + 12;
    guide.setAttribute('x1', px); guide.setAttribute('x2', px); box.setAttribute('x', bx);
    lapLabel.setAttribute('x', bx + 12); lapLabel.setAttribute('y', 44); lapLabel.textContent = `LAP ${n}`;
    const times = byLap.map(m => m.get(n));
    rows.forEach((row, i) => {row.setAttribute('x', bx + 12); row.setAttribute('y', 66 + i * 20); row.textContent = `${drivers[i].driver}  ${times[i] === undefined ? '—' : times[i].toFixed(3) + ' s'}`;});
    gapLabel.setAttribute('x', bx + 12); gapLabel.setAttribute('y', 110);
    gapLabel.textContent = times.every(t => t !== undefined) ? `GAP ${times[0] === times[1] ? '0.000' : `${Math.abs(times[0] - times[1]).toFixed(3)} ${times[0] < times[1] ? drivers[0].driver : drivers[1].driver}`}` : 'GAP —';
    scrub.classList.add('show');
  }
  function hideLap() {scrub.classList.remove('show');}
  svg.addEventListener('pointermove', e => {const r = svg.getBoundingClientRect(); showLap(Math.round(1 + ((e.clientX - r.left) / r.width * 1080 - 56) / 1000 * Math.max(1, last - 1)));});
  svg.addEventListener('pointerleave', hideLap);
  container.append(svg);
  window.PitwallMotion?.chart(container);
}
function render(data) {
  current = data; document.getElementById('results').hidden = false;
  document.getElementById('race-title').textContent = data.race;
  const mini = document.querySelector('[data-mini-track]'); if(mini) {mini.dataset.raceId = raceSelect.value; window.PitwallMotion?.miniMap(raceSelect.value);}
  document.getElementById('source').textContent = `DATA SOURCE / ${data.source}`;
  const [a,b] = data.drivers;
  const gap = a.median !== null && b.median !== null ? Math.abs(a.median-b.median) : null;
  document.getElementById('metrics').replaceChildren(metric(`${a.driver} / MEDIAN CLEAN PACE`, a.median === null ? 'No clean laps' : `${a.median.toFixed(3)} s`, `${a.clean_count} clean laps · ${a.stops.length} pit stop${a.stops.length === 1 ? '' : 's'}`),metric(`${b.driver} / MEDIAN CLEAN PACE`, b.median === null ? 'No clean laps' : `${b.median.toFixed(3)} s`,`${b.clean_count} clean laps · ${b.stops.length} pit stop${b.stops.length === 1 ? '' : 's'}`),metric('MEDIAN PACE DIFFERENCE', gap === null ? 'Unavailable' : `${gap.toFixed(3)} s`, gap === null ? 'More clean data needed' : gap === 0 ? 'Equal median pace' : `${a.median < b.median ? a.driver : b.driver} faster · not adjusted for traffic or fuel`));
  const legend = document.getElementById('legend');legend.replaceChildren();
  data.drivers.forEach((d,i)=>{const item=el('span'); const dot=el('b',undefined,'dot');dot.style.background=colors[i];item.append(dot,document.createTextNode(d.driver));legend.append(item);});
  const stints=document.getElementById('stints'); stints.replaceChildren();
  const total=Math.max(...data.drivers.flatMap(d=>d.laps.map(l=>l.lap)));
  const compounds={SOFT:'#ff7776',MEDIUM:'#e5c966',HARD:'#dfe6eb',INTERMEDIATE:'#78ca8f',WET:'#6aafff',UNKNOWN:'#97a0a8'};
  data.drivers.forEach((d,i)=>{const row=el('div',undefined,'stint-row');const name=el('strong',d.driver);name.style.color=colors[i];const track=el('div',undefined,'stint-track');track.style.display='grid';track.style.gridTemplateColumns=`repeat(${total}, minmax(0, 1fr))`;d.stints.forEach(s=>{const segment=el('div',`${s.compound} · ${s.end-s.start+1}L`,'stint');segment.style.gridColumn=`${s.start} / ${s.end+1}`;segment.style.background=compounds[s.compound]||compounds.UNKNOWN;segment.title=`${d.driver}: ${s.compound}, laps ${s.start}–${s.end}`;track.append(segment);});row.append(name,track);stints.append(row);});
  const axis=el('div',undefined,'stint-axis');axis.append(el('span','LAP 1'),el('span',`LAP ${total}`));stints.append(axis);
  const rows=document.getElementById('lap-table');rows.replaceChildren();
  data.drivers.forEach(d=>d.laps.forEach(l=>{const row=el('tr');[d.driver,l.lap,l.seconds===null?'Missing':l.seconds.toFixed(3),l.pit?'Pit lap':l.clean?'Clean':'Flagged'].forEach(v=>row.append(el('td',v)));rows.append(row);}));
  window.PitwallMotion?.results(document.getElementById('results'), colors);
  renderChart();
}
async function compare(event) {
  if(event) event.preventDefault();
  const ticket=++requestNumber;
  document.getElementById('results').hidden=true;
  if(aSelect.value===bSelect.value){statusEl.textContent='Choose two different drivers to compare.';return;}
  const params=new URLSearchParams({race:raceSelect.value,a:aSelect.value,b:bSelect.value});
  statusEl.textContent='Loading race comparison…';statusEl.classList.add('loading');
  try {const response=await fetch(`/api/comparison/?${params}`);const data=await response.json();if(ticket!==requestNumber)return;if(!response.ok)throw new Error(data.error || 'Unable to load this race.');render(data);history.replaceState(null,'',`/?${params}`);const save=document.getElementById('save-form');if(save)for(const [key,value] of params)save.elements[key].value=value;statusEl.textContent='';}
  catch(error){if(ticket===requestNumber)statusEl.textContent=error.message;}
  finally{if(ticket===requestNumber)statusEl.classList.remove('loading');}
}
document.getElementById('compare-form').addEventListener('submit',compare);
document.getElementById('clean-only').addEventListener('change',()=>{if(current)renderChart();});
raceSelect.addEventListener('change',()=>{populateDrivers();window.PitwallMotion?.showRace(raceSelect.value);compare();});
[aSelect,bSelect].forEach(s=>s.addEventListener('change',()=>{requestNumber++;document.getElementById('results').hidden=true;statusEl.classList.remove('loading');statusEl.textContent='Select Compare drivers to update the analysis.';}));
if(catalog.length){catalog.forEach(r=>raceSelect.add(new Option(r.name,r.id)));const params=new URLSearchParams(location.search);const monaco=catalog.find(r=>/monaco/i.test(r.name));if(catalog.some(r=>String(r.id)===params.get('race')))raceSelect.value=params.get('race');else if(monaco)raceSelect.value=monaco.id;populateDrivers();window.PitwallMotion?.showRace(raceSelect.value,true);for(const [key,select] of [['a',aSelect],['b',bSelect]])if([...select.options].some(o=>o.value===params.get(key)))select.value=params.get(key);compare();}
else {statusEl.textContent='No races loaded yet. Import a race or run the demo data command to get started.';document.querySelector('#compare-form button').disabled=true;window.PitwallMotion?.showRace(null,true);}
