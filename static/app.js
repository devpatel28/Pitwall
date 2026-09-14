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
  bSelect.selectedIndex = Math.min(1, bSelect.options.length - 1);
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
  function node(tag, attrs, text) {const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v)); if(text) n.textContent = text; svg.append(n); return n;}
  for(let i=0;i<=4;i++){const value = lo + (hi-lo)*i/4; node('line',{x1:56,x2:1056,y1:y(value),y2:y(value),stroke:'#2b343c','stroke-dasharray':'3 5'}); node('text',{x:5,y:y(value)+4,fill:'#a1adb7','font-size':11},value.toFixed(1));}
  for(let n=1;n<=last;n+=Math.max(1,Math.floor(last/8))) node('text',{x:x(n),y:274,fill:'#a1adb7','font-size':11,'text-anchor':'middle'},String(n));
  drivers.forEach((driver, index)=>{
    let path='', previous=null;
    driver.laps.forEach(l=>{if(!valid(l)){previous=null;return;} path += `${previous !== null && l.lap === previous + 1 ? 'L' : 'M'}${x(l.lap)},${y(l.seconds)} `; previous=l.lap;});
    node('path',{d:path,fill:'none',stroke:colors[index],'stroke-width':2.5,'stroke-linejoin':'round'});
    driver.laps.filter(valid).forEach(l=>{const dot=node('circle',{cx:x(l.lap),cy:y(l.seconds),r:l.pit?5:3,fill:colors[index],tabindex:0,'aria-label':`${driver.driver}, lap ${l.lap}: ${l.seconds.toFixed(3)} seconds${l.pit?', pit lap':''}`}); const title=document.createElementNS(ns,'title');title.textContent=dot.getAttribute('aria-label');dot.append(title);});
  });
  container.append(svg);
}
function render(data) {
  current = data; document.getElementById('results').hidden = false;
  document.getElementById('race-title').textContent = data.race;
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
  renderChart();
}
async function compare(event) {
  if(event) event.preventDefault();
  const ticket=++requestNumber;
  document.getElementById('results').hidden=true;
  if(aSelect.value===bSelect.value){statusEl.textContent='Choose two different drivers to compare.';return;}
  const params=new URLSearchParams({race:raceSelect.value,a:aSelect.value,b:bSelect.value});
  statusEl.textContent='Loading race comparison…';
  try {const response=await fetch(`/api/comparison/?${params}`);const data=await response.json();if(ticket!==requestNumber)return;if(!response.ok)throw new Error(data.error || 'Unable to load this race.');render(data);history.replaceState(null,'',`/?${params}`);const save=document.getElementById('save-form');if(save)for(const [key,value] of params)save.elements[key].value=value;statusEl.textContent='';}
  catch(error){if(ticket===requestNumber)statusEl.textContent=error.message;}
}
document.getElementById('compare-form').addEventListener('submit',compare);
document.getElementById('clean-only').addEventListener('change',()=>{if(current)renderChart();});
raceSelect.addEventListener('change',()=>{populateDrivers();compare();});
[aSelect,bSelect].forEach(s=>s.addEventListener('change',()=>{requestNumber++;document.getElementById('results').hidden=true;statusEl.textContent='Select Compare drivers to update the analysis.';}));
if(catalog.length){catalog.forEach(r=>raceSelect.add(new Option(r.name,r.id)));const params=new URLSearchParams(location.search);if(catalog.some(r=>String(r.id)===params.get('race')))raceSelect.value=params.get('race');populateDrivers();for(const [key,select] of [['a',aSelect],['b',bSelect]])if([...select.options].some(o=>o.value===params.get(key)))select.value=params.get(key);compare();}
else {statusEl.textContent='No races loaded yet. Import a race or run the demo data command to get started.';document.querySelector('#compare-form button').disabled=true;}
