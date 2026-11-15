// calcpad-rs: interactive panels from a Python block (`import ui`, public/py/lib/ui.py, docs/interactive-panels-design.md).
//
// The block runs once and its panels arrive in the page as <div class="cprs-panel"> (python-blocks.ts, panelMarkup): an empty
// container for the widgets, the first output as plain markup, and a note. Three things happen here:
//
//  - panelPage adds the script that draws the widgets in the (sandboxed) results frame. A widget change is posted to the host
//    (`panelEvent`); the answer comes back as `cpPanelUpdate` and the output is redrawn in place. The sheet is not recalculated.
//  - handlePanelEvent is the host side: it checks the message, asks the Python session that made the page to run the panel's
//    function again (python-runner.ts, panelEvent), and replies to the frame that asked. Python checks the values again.
//  - panelSeed / panelForExport: the values a panel was last moved to are kept per tab and handed to the next run as its starting
//    point, so a recalculation, Word, Excel and print show the panel as it was left; the widgets themselves are dropped from them.

import type { PythonRunner } from './python-runner';
import { resolvePanelItems, type PanelItem } from './python-blocks';

const PANEL_RE = /<div class="cprs-panel" data-panel="/;

/** True when the page holds a panel from a Python block. */
export function hasPanel(html: string): boolean {
    return PANEL_RE.test(html);
}

/** The page without the (empty) widget containers, for Word and Excel: the first output and the note under it stay. */
export function panelForExport(html: string): string {
    return html.replace(/<div class="cprs-panel-ui"><\/div>/g, '');
}

// ---- what the host app provides (main.ts) ------------------------------------------------------------------------------------

/**
 * The few things a panel needs from the rest of the app, all keyed by the tab (`scope`) the run belongs to:
 *  - `stored`: the values saved with the sheet (`panel:NAME:WIDGET` entries of its uiOverrides), a reopened file starts from them;
 *  - `persist`: a panel was moved, remember its values with the sheet's other entered values (in memory until saved, like them);
 *  - `sheetInputs`: the numbers of the sheet's own `?` inputs, for `ui.input(name)`;
 *  - `sheetSet`: a slider made with `sheet=True` was released, write the value into the sheet input of that name and recalculate.
 */
export interface PanelHooks {
    prepare?: (scope: string) => Promise<void>;
    stored?: (scope: string) => Record<string, string> | undefined;
    persist?: (scope: string, panel: string, values: Record<string, unknown>) => void;
    sheetInputs?: (scope: string) => Record<string, number>;
    sheetSet?: (scope: string, name: string, value: number) => void;
}
let hooks: PanelHooks = {};
export function setPanelHooks(h: PanelHooks): void { hooks = h; }

/** Called before the starting values are read, for what the app has to work out first (the sheet's input lines). */
export async function panelPrepare(scope: string): Promise<void> {
    try { await hooks.prepare?.(scope); } catch { /* a panel starts without the sheet's inputs */ }
}

// ---- the values the panels were left at ---------------------------------------------------------------------------------

type Values = Record<string, Record<string, unknown>>;
const values = new Map<string, Values>();
const runScope = new Map<string, string>();

/** `panel:beam:L` entries (strings) read back as the numbers and booleans they were written from. */
function fromStored(rec: Record<string, string> | undefined): Values {
    const out: Values = {};
    for (const [k, raw] of Object.entries(rec ?? {})) {
        const m = /^panel:(\w{1,64}):(\w{1,64})$/.exec(k);
        if (!m) continue;
        const v = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
        if (typeof v === 'number' && !Number.isFinite(v)) continue;
        (out[m[1]] ??= {})[m[2]] = v;
    }
    return out;
}

/**
 * The starting values for a run in `scope` (a tab), as JSON text: `{"panel": {"widget": value}, "@inputs": {"name": number}}`.
 * Values moved in this tab win over the ones saved with the file; `@inputs` are the sheet's own inputs (`ui.input`).
 */
export function panelSeed(scope: string): string {
    const saved = fromStored(hooks.stored?.(scope));
    const now = values.get(scope) ?? {};
    const merged: Record<string, unknown> = {};
    for (const id of new Set([...Object.keys(saved), ...Object.keys(now)])) merged[id] = { ...saved[id], ...now[id] };
    const inputs = hooks.sheetInputs?.(scope);
    if (inputs && Object.keys(inputs).length) merged['@inputs'] = inputs;
    return JSON.stringify(merged);
}

/** Remembers which tab a run belongs to, so a panel's later events are stored under it. */
export function rememberRun(runKey: string | undefined, scope: string): void {
    if (!runKey) return;
    runScope.set(runKey, scope);
    if (runScope.size > 32) runScope.delete(runScope.keys().next().value as string);
}

/** Forgets the values of a tab (a new file, or the user's reset). */
export function resetPanels(scope: string): void {
    values.delete(scope);
}

// ---- the host side of a widget change -------------------------------------------------------------------------------------

const ID = /^\w{1,64}$/;
/** A function that takes longer than this for one update is "slow": a player is stopped (the frame says so). */
export const SLOW_MS = 1500;

interface PanelEvent { type: 'panelEvent'; panel: string; run: string; seq: number; base?: number; values: Record<string, unknown> }

/** True for a message shaped like a panel event; the frame is untrusted, so the shape is checked before anything runs. */
export function isPanelEvent(d: unknown): d is PanelEvent {
    const e = d as PanelEvent | null;
    if (!e || e.type !== 'panelEvent' || typeof e.panel !== 'string' || !ID.test(e.panel)) return false;
    if (typeof e.run !== 'string' || e.run.length > 16 || !Number.isInteger(e.seq)) return false;
    if (e.base !== undefined && (!Number.isInteger(e.base) || e.base < 0 || e.base > 1e9)) return false;
    if (!e.values || typeof e.values !== 'object' || Array.isArray(e.values)) return false;
    const keys = Object.keys(e.values);
    if (keys.length > 32) return false;
    return keys.every((k) => ID.test(k) && ['number', 'boolean'].includes(typeof e.values[k]) && (typeof e.values[k] !== 'number' || Number.isFinite(e.values[k] as number)));
}

/**
 * Runs the panel's function for a widget change from `source` (a results frame the caller has already checked is one of ours) and
 * posts the answer back to it. Never throws.
 */
export async function handlePanelEvent(source: MessageEventSource | null, data: unknown): Promise<void> {
    if (!source || !isPanelEvent(data)) return;
    const reply = (m: Record<string, unknown>) => { try { (source as Window).postMessage({ type: 'cpPanelUpdate', panel: data.panel, seq: data.seq, ...m }, '*'); } catch { /* the frame is gone */ } };
    const runner = (window as unknown as { calcpadPython?: PythonRunner }).calcpadPython;
    if (!runner) return reply({ stale: true });
    const t0 = performance.now();
    const res = await runner.panelEvent(data.run, JSON.stringify({ panel: data.panel, values: data.values, base: data.base }));
    const ms = Math.round(performance.now() - t0);
    if (res.stale) return reply({ stale: true });
    if (res.error || !res.json) return reply({ error: res.error ?? 'the panel gave no answer', ms });
    let out: { error?: string; n?: number; values?: Record<string, unknown>; out?: PanelItem[] };
    try { out = JSON.parse(res.json); } catch { return reply({ error: 'the panel answer could not be read', ms }); }
    if (out.error) return reply({ error: out.error, ms });
    const scope = runScope.get(data.run);
    if (scope !== undefined && out.values) {
        const v = values.get(scope) ?? {};
        v[data.panel] = out.values;
        values.set(scope, v);
        try { hooks.persist?.(scope, data.panel, out.values); } catch { /* saving a value must never stop the panel */ }
    }
    reply({ out: resolvePanelItems(out.out ?? []), n: out.n, ms, slow: ms > SLOW_MS });
}

interface PanelSheet { type: 'panelSheet'; panel: string; run: string; name: string; value: number }

/** True for a message from a slider released after `sheet=True`: a plain name, a finite number and the run it came from. */
export function isPanelSheet(d: unknown): d is PanelSheet {
    const e = d as PanelSheet | null;
    return !!e && e.type === 'panelSheet' && typeof e.panel === 'string' && ID.test(e.panel) && typeof e.name === 'string' && ID.test(e.name)
        && typeof e.run === 'string' && e.run.length <= 16 && typeof e.value === 'number' && Number.isFinite(e.value);
}

/** A panel control tied to a sheet input was released: write the value into that input and let the sheet recalculate. */
export function handlePanelSheet(data: unknown): void {
    if (!isPanelSheet(data)) return;
    const scope = runScope.get(data.run);
    if (scope === undefined) return;
    try { hooks.sheetSet?.(scope, data.name, data.value); } catch { /* the sheet reports its own failure */ }
}

// ---- the page ------------------------------------------------------------------------------------------------------------

const STYLE = `<style>
.cprs-panel{margin:8pt 0;border:1px solid rgba(128,128,128,.45);border-radius:6px;padding:8px 10px;font:13px/1.35 system-ui,sans-serif}
.cprs-panel-ui{display:flex;flex-wrap:wrap;gap:8px 22px;align-items:center;margin:0 0 6px}
.cprs-w{display:flex;align-items:center;gap:8px;min-width:230px}
.cprs-w label{white-space:nowrap}
.cprs-w input[type=range]{flex:1;min-width:110px;height:28px;accent-color:#0a6bcf}
.dark-theme .cprs-w input[type=range]{accent-color:#4da3ff}
.cprs-w output{min-width:5.5em;font-variant-numeric:tabular-nums;opacity:.85}
.cprs-w select,.cprs-w input[type=number]{font:inherit;padding:3px 6px;border:1px solid #8a93a0;border-radius:4px;background:#fff;color:#1c2129}
.cprs-w input[type=number]{width:7.5em;font-variant-numeric:tabular-nums}
.cprs-unit{opacity:.8}
.cprs-w button,.cprs-reset{font:inherit;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;padding:4px 14px;min-height:30px;cursor:pointer}
.cprs-w button[aria-pressed=true]{background:#0a6bcf;border-color:#0a6bcf;color:#fff}
.cprs-reset{margin-left:auto;font-size:12px;padding:2px 12px;min-height:26px;opacity:.85}
.cprs-reset[disabled]{opacity:.35;cursor:default}
.cprs-w :focus-visible,.cprs-reset:focus-visible,.cprs-tab:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
.cprs-busy .cprs-panel-out{opacity:.72}
.cprs-panel-err{margin:4px 0;padding:4px 8px;border-left:3px solid #c00;background:rgba(200,0,0,.1)}
.cprs-panel-slow{margin:4px 0;padding:4px 8px;border-left:3px solid #c80;background:rgba(200,130,0,.12)}
.cprs-panel-text{margin:4px 0}
.cprs-panel-md{margin:4px 0}.cprs-panel-md h3,.cprs-panel-md h4,.cprs-panel-md h5{margin:8px 0 4px}.cprs-panel-md h3{font-size:1.2em}.cprs-panel-md h4{font-size:1.08em}.cprs-panel-md h5{font-size:1em}
.cprs-panel-md p{margin:4px 0}.cprs-panel-md ul,.cprs-panel-md ol{margin:4px 0;padding-left:1.4em}.cprs-panel-md code{font-family:ui-monospace,Menlo,monospace;background:rgba(128,128,128,.2);padding:0 3px;border-radius:3px}
.cprs-panel-table{border-collapse:collapse;margin:4px 0}
.cprs-panel-table th,.cprs-panel-table td{border:1px solid rgba(128,128,128,.55);padding:3px 10px}
.cprs-panel-table th{background:rgba(128,128,128,.18)}
.cprs-row{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-start}.cprs-row>*{flex:1 1 320px;min-width:0}
.cprs-tablist{display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid rgba(128,128,128,.5);margin:0 0 6px}
.cprs-tab{font:inherit;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;background:transparent;color:inherit;padding:4px 14px;cursor:pointer;opacity:.75}
.cprs-tab[aria-selected=true]{border-color:rgba(128,128,128,.5);background:rgba(128,128,128,.14);opacity:1;font-weight:600}
@media (max-width:760px){.cprs-panel-ui{flex-direction:column;align-items:stretch;gap:10px}.cprs-w{min-width:0;flex-wrap:wrap}.cprs-slider label,.cprs-player label,.cprs-number label{order:-1;flex:1 0 100%;white-space:normal}.cprs-w input[type=range]{height:20px;padding:7px 0;box-sizing:content-box;min-width:0;flex:1 1 120px}.cprs-w button{min-height:40px}.cprs-w select,.cprs-w input[type=number]{min-height:36px}.cprs-panel .cprs-w select{-webkit-appearance:none!important;appearance:none!important;box-sizing:border-box!important;min-height:36px!important;padding:6px 28px 6px 8px!important;background-image:linear-gradient(45deg,transparent 50%,#1c2129 50%),linear-gradient(135deg,#1c2129 50%,transparent 50%);background-position:calc(100% - 15px) 50%,calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat}.cprs-reset{margin-left:0;min-height:36px;align-self:flex-start}}
@media print{.cprs-panel-ui,.cprs-tablist{display:none}.cprs-panel-note{display:block!important}.cprs-tabpanel,.cprs-tabpanel[hidden]{display:block!important}.cprs-tabhead{display:block!important}}
</style>`.replace(/\n/g, '');

// ES5, no backtick, no "${", no "</script". Runs in the sandboxed results frame (allow-scripts only): its only way out is
// window.parent.postMessage, which the host checks. Nothing the frame is given is inserted as markup except the "html" items, which
// the HOST wrote (python-markdown.ts escapes every character of the Python text before it adds a tag).
const SCRIPT = String.raw`(function(){
var panels=[],shared={},tabN=0;
function utf8(b){var s=atob(b),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a);}
function b64(s){return btoa(unescape(encodeURIComponent(s)));}
function hash(s){var h=5381;for(var i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))|0;}return (h>>>0).toString(16);}
function mk(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function num(v){return String(parseFloat(Number(v).toPrecision(6)));}
function fmt(w,v){return num(v)+(w.unit?" "+w.unit:"");}
function Panel(root){
var spec=JSON.parse(utf8(root.getAttribute("data-spec")));
var me=this;me.id=spec.id;me.run=root.getAttribute("data-run");me.root=root;me.spec=spec;
me.ui=root.querySelector(".cprs-panel-ui");me.out=root.querySelector(".cprs-panel-out");me.note=root.querySelector(".cprs-panel-note");
me.values={};me.defaults={};me.ctl={};me.busy=false;me.dirty=false;me.seq=0;me.applied=0;me.players=[];me.sentAt=0;me.busyTimer=0;
me.ui.setAttribute("role","group");me.ui.setAttribute("aria-label","Controls of panel "+me.id);
spec.widgets.forEach(function(w){me.widget(w);});
me.resetBtn=mk("button","cprs-reset","Reset");me.resetBtn.type="button";me.resetBtn.setAttribute("aria-label","Reset the controls of panel "+me.id+" to their starting values");
me.resetBtn.addEventListener("click",function(){me.reset();});me.ui.appendChild(me.resetBtn);me.syncReset();
if(me.note)me.note.style.display="none";
var ts=root.querySelectorAll(".cprs-tabs");for(var i=0;i<ts.length;i++)me.tabify(ts[i]);
}
Panel.prototype.syncReset=function(){var me=this,same=true;for(var k in me.defaults)if(me.values[k]!==me.defaults[k])same=false;me.resetBtn.disabled=same;};
Panel.prototype.change=function(w,v,release){
var me=this;me.values[w.name]=v;
if(w.sheet&&release){
var l0=w.wid!=null?shared[w.wid]:null;
if(l0&&l0.length>1)for(var j=0;j<l0.length;j++){var e0=l0[j];if(e0.panel!==me){e0.set(v);e0.panel.values[e0.name]=v;e0.panel.syncReset();}}
me.syncReset();
try{window.parent.postMessage({type:"panelSheet",panel:me.id,run:me.run,name:w.name,value:Number(v)},"*");}catch(e3){}
return;
}
var l=w.wid!=null?shared[w.wid]:null;
if(l&&l.length>1)for(var i=0;i<l.length;i++){var e=l[i];if(e.panel!==me){e.set(v);e.panel.values[e.name]=v;e.panel.syncReset();e.panel.schedule();}}
me.syncReset();
me.schedule();
};
Panel.prototype.reset=function(){
var me=this;me.players.forEach(function(p){p.stop();});
me.spec.widgets.forEach(function(w){var c=me.ctl[w.name];if(!c)return;c.set(w.default);me.values[w.name]=w.default;
var l=w.wid!=null?shared[w.wid]:null;if(l&&l.length>1)for(var i=0;i<l.length;i++){var e=l[i];if(e.panel!==me){e.set(w.default);e.panel.values[e.name]=w.default;e.panel.syncReset();e.panel.schedule();}}
if(w.sheet)try{window.parent.postMessage({type:"panelSheet",panel:me.id,run:me.run,name:w.name,value:Number(w.default)},"*");}catch(e2){}});
me.syncReset();me.schedule();
};
Panel.prototype.widget=function(w){
var me=this,box=mk("div","cprs-w cprs-"+w.kind),id="cprs-w-"+me.id+"-"+w.name;me.values[w.name]=w.value;me.defaults[w.name]=w.default!=null?w.default:w.value;
function reg(set){me.ctl[w.name]={w:w,set:set};if(w.wid!=null){(shared[w.wid]=shared[w.wid]||[]).push({panel:me,name:w.name,set:set});}}
if(w.kind==="checkbox"){
var c=mk("input");c.type="checkbox";c.id=id;c.checked=!!w.value;var l=mk("label",null,w.label);l.setAttribute("for",id);
c.addEventListener("change",function(){me.change(w,c.checked,true);});box.appendChild(c);box.appendChild(l);
reg(function(v){c.checked=!!v;});
}else if(w.kind==="select"){
var l2=mk("label",null,w.label);l2.setAttribute("for",id);var s=mk("select");s.id=id;
w.options.forEach(function(o,i){var op=mk("option",null,o);op.value=String(i);s.appendChild(op);});s.value=String(w.value);
s.addEventListener("change",function(){me.change(w,parseInt(s.value,10),true);});box.appendChild(l2);box.appendChild(s);
reg(function(v){s.value=String(v);});
}else if(w.kind==="number"){
var ln=mk("label",null,w.label);ln.setAttribute("for",id);var ni=mk("input");ni.type="number";ni.id=id;ni.value=w.value;
if(w.min!=null)ni.min=w.min;if(w.max!=null)ni.max=w.max;ni.step=w.step!=null?w.step:"any";
ni.addEventListener("change",function(){var v=parseFloat(ni.value);if(!isFinite(v)){ni.value=me.values[w.name];return;}
if(w.min!=null&&v<w.min)v=w.min;if(w.max!=null&&v>w.max)v=w.max;ni.value=v;me.change(w,v,true);});
box.appendChild(ln);box.appendChild(ni);if(w.unit)box.appendChild(mk("span","cprs-unit",w.unit));
reg(function(v){ni.value=v;});
}else if(w.kind==="button"){
var clicks=Number(w.value)||0,bn=mk("button",null,w.label);bn.type="button";bn.id=id;
bn.addEventListener("click",function(){clicks++;me.change(w,clicks,true);});box.appendChild(bn);
reg(function(v){clicks=Number(v)||0;});
}else{
var l3=mk("label",null,w.label);l3.setAttribute("for",id);var r=mk("input");r.type="range";r.id=id;r.min=w.min;r.max=w.max;r.step=w.step;r.value=w.value;
var o2=mk("output",null,w.kind==="player"?num(w.value)+" / "+num(w.max):fmt(w,w.value));o2.setAttribute("for",id);
function show(){o2.textContent=w.kind==="player"?num(r.value)+" / "+num(w.max):fmt(w,r.value);r.setAttribute("aria-valuetext",o2.textContent);}
show();
r.addEventListener("input",function(){show();me.change(w,Number(r.value),false);});
r.addEventListener("change",function(){if(w.sheet)me.change(w,Number(r.value),true);});
if(w.kind==="player"){
var p={playing:false,t:0},b=mk("button",null,"Play");b.type="button";b.setAttribute("aria-pressed","false");b.setAttribute("aria-label","Play "+w.label);
p.stop=function(){p.playing=false;clearTimeout(p.t);b.textContent="Play";b.setAttribute("aria-pressed","false");};
p.step=function(){var v=Number(r.value)+Number(w.step||1);if(v>Number(w.max)){if(w.loop)v=Number(w.min);else{p.stop();return;}}r.value=v;show();me.change(w,Number(r.value),false);};
p.next=function(){if(!p.playing)return;clearTimeout(p.t);p.t=setTimeout(function(){if(p.playing)p.step();},Math.max(0,1000/w.fps-(Date.now()-me.sentAt)));};
b.addEventListener("click",function(){if(p.playing){p.stop();return;}p.playing=true;b.textContent="Pause";b.setAttribute("aria-pressed","true");p.step();});
me.players.push(p);box.appendChild(b);
}
box.appendChild(l3);box.appendChild(r);box.appendChild(o2);
reg(function(v){r.value=v;show();});
}
me.ui.appendChild(box);
};
Panel.prototype.schedule=function(){if(this.busy){this.dirty=true;return;}this.send();};
Panel.prototype.send=function(){
var me=this;me.busy=true;me.seq++;me.sentAt=Date.now();
clearTimeout(me.busyTimer);me.busyTimer=setTimeout(function(){if(me.busy){me.root.classList.add("cprs-busy");me.root.setAttribute("aria-busy","true");}},250);
try{window.parent.postMessage({type:"panelEvent",panel:me.id,run:me.run,seq:me.seq,base:me.applied,values:me.values},"*");}catch(e){me.busy=false;}
};
Panel.prototype.fail=function(text){
var e=this.root.querySelector(".cprs-panel-err");if(!e){e=mk("p","cprs-panel-err");e.setAttribute("role","alert");this.root.appendChild(e);}e.textContent=text;
this.players.forEach(function(p){p.stop();});
};
Panel.prototype.slow=function(on,ms){
var e=this.root.querySelector(".cprs-panel-slow");
if(!on){if(e)e.remove();return;}
if(!e){e=mk("p","cprs-panel-slow");e.setAttribute("role","status");this.root.appendChild(e);}
e.textContent="This update took "+Math.round(ms/100)/10+" s, so a player was stopped. Make the function lighter, or do its heavy work once in the block.";
this.players.forEach(function(p){p.stop();});
};
Panel.prototype.update=function(d){
var me=this;if(d.seq!==me.seq)return;
me.busy=false;clearTimeout(me.busyTimer);me.root.classList.remove("cprs-busy");me.root.removeAttribute("aria-busy");
if(d.stale){clearTimeout(me.staleTimer);me.staleTimer=setTimeout(function(){me.fail("This panel is out of date. Calculate the worksheet again to refresh it.");},1500);return;}
clearTimeout(me.staleTimer);
if(d.error){me.fail(d.error);return;}
var e=me.root.querySelector(".cprs-panel-err");if(e)e.remove();
if(typeof d.n==="number")me.applied=d.n;
me.render(d.out||[]);
me.slow(!!d.slow,d.ms||0);
if(me.dirty){me.dirty=false;me.send();return;}
me.players.forEach(function(p){p.next();});
};
Panel.prototype.snap=function(gd,fig){
if(typeof Plotly==="undefined"||!Plotly.toImage||!window.cprsThemeFor)return;
clearTimeout(gd.cprsSnap);
gd.cprsSnap=setTimeout(function(){
var key=gd.getAttribute("data-key");if(!key)return;
var w=gd.offsetWidth||700,h=gd.offsetHeight||450,tmp=mk("div");
tmp.style.cssText="position:fixed;left:-10000px;top:0;width:"+w+"px;height:"+h+"px";document.body.appendChild(tmp);
var lay=JSON.parse(JSON.stringify(fig.layout||{})),t=window.cprsThemeFor(false);
lay.template=lay.template&&typeof lay.template==="object"?window.cprsMerge(t,lay.template):t;
lay.width=w;lay.height=h;delete lay.updatemenus;delete lay.sliders;
Plotly.newPlot(tmp,{data:fig.data||[],layout:lay,frames:[],config:{staticPlot:true}}).then(function(){return Plotly.toImage(tmp,{format:"png",width:w,height:h,scale:2});}).then(function(u){window.parent.postMessage({type:"plotlyImage",key:key,img:u},"*");}).catch(function(){}).then(function(){try{Plotly.purge(tmp);}catch(e){}if(tmp.parentNode)tmp.parentNode.removeChild(tmp);});
},600);
};
Panel.prototype.draw=function(gd,fig){
if(typeof Plotly==="undefined"){gd.textContent="This chart needs Plotly, which was not loaded for this panel (it loads when the first result of a panel is a chart, or when the panel is made with plotly=True).";return;}
var key=hash(b64(JSON.stringify(fig)));
var lay=fig.layout||{};var t=window.cprsTheme?window.cprsTheme():null;
if(t)lay.template=lay.template&&typeof lay.template==="object"?window.cprsMerge(t,lay.template):t;
if(lay.uirevision==null)lay.uirevision="cprs";
var cfg=window.cprsMerge?window.cprsMerge({responsive:true,displaylogo:false},fig.config||{}):{responsive:true,displaylogo:false};
gd.setAttribute("data-key",key);
Plotly.react(gd,fig.data||[],lay,cfg);
this.snap(gd,{data:fig.data,layout:fig.layout});
};
Panel.prototype.tabify=function(tb){
if(tb.cprsTabs)return;tb.cprsTabs=true;
var panes=[].filter.call(tb.children,function(c){return c.classList.contains("cprs-tabpanel");}),list=mk("div","cprs-tablist"),btns=[];
list.setAttribute("role","tablist");
function pick(k,focus){panes.forEach(function(p,j){p.hidden=j!==k;btns[j].setAttribute("aria-selected",j===k?"true":"false");btns[j].tabIndex=j===k?0:-1;});
var gds=panes[k].querySelectorAll(".cprs-plotly");for(var i=0;i<gds.length;i++){try{if(window.Plotly&&Plotly.Plots)Plotly.Plots.resize(gds[i]);}catch(e){}}
if(focus)btns[k].focus();}
panes.forEach(function(p,k){
var b=mk("button","cprs-tab",p.getAttribute("data-label")),id="cprs-tab-"+(++tabN);b.type="button";b.id=id;b.setAttribute("role","tab");p.setAttribute("role","tabpanel");p.setAttribute("aria-labelledby",id);
b.addEventListener("click",function(){pick(k,false);});
b.addEventListener("keydown",function(e){var n=e.key==="ArrowRight"?(k+1)%panes.length:e.key==="ArrowLeft"?(k+panes.length-1)%panes.length:e.key==="Home"?0:e.key==="End"?panes.length-1:-1;if(n>=0){e.preventDefault();pick(n,true);}});
btns.push(b);list.appendChild(b);
var hd=p.querySelector(".cprs-tabhead");if(hd)hd.style.display="none";});
tb.insertBefore(list,tb.firstChild);pick(0,false);
};
Panel.prototype.item=function(it,slot){
var me=this;
if(it.t==="same")return null;
if(it.t==="plotly"){
var gd=slot&&slot.classList.contains("cprs-plotly-wrap")?slot.querySelector(".cprs-plotly"):null,fresh=null;
if(!gd){fresh=mk("div","cprs-plotly-wrap");gd=mk("div","cprs-plotly");fresh.appendChild(gd);}
me.draw(gd,it.fig);return fresh;
}
if(it.t==="text"){if(slot&&slot.classList.contains("cprs-panel-text")){slot.textContent=it.s;return null;}return mk("p","cprs-panel-text",it.s);}
if(it.t==="html"){var m=slot&&slot.classList.contains("cprs-panel-md")?slot:mk("div","cprs-panel-md");m.innerHTML=it.h;return m===slot?null:m;}
if(it.t==="row"||it.t==="col"){var cls="cprs-"+it.t,box=slot&&slot.classList.contains(cls)?slot:null,f2=null;if(!box){f2=mk("div",cls);box=f2;}me.list(box,it.items);return f2;}
if(it.t==="tabs"){
var labels=it.tabs.map(function(x){return x.label;}).join("|"),tb=slot&&slot.classList.contains("cprs-tabs")&&slot.getAttribute("data-labels")===labels?slot:null,f3=null;
if(!tb){f3=mk("div","cprs-tabs");f3.setAttribute("data-labels",labels);
it.tabs.forEach(function(x){var p=mk("div","cprs-tabpanel"),hd=mk("p","cprs-tabhead");p.setAttribute("data-label",x.label);hd.appendChild(mk("b",null,x.label));p.appendChild(hd);p.appendChild(mk("div","cprs-tabbody"));f3.appendChild(p);});
tb=f3;me.tabify(tb);}
var panes=[].filter.call(tb.children,function(c){return c.classList.contains("cprs-tabpanel");});
for(var i=0;i<it.tabs.length&&i<panes.length;i++){me.list(panes[i].querySelector(".cprs-tabbody"),it.tabs[i].items);}
return f3;
}
if(it.t==="table"){
var tbl=mk("table","cprs-panel-table");
if(it.head){var th=mk("thead"),tr=mk("tr");it.head.forEach(function(h){tr.appendChild(mk("th",null,h));});th.appendChild(tr);tbl.appendChild(th);}
var tbd=mk("tbody");it.rows.forEach(function(r){var tr2=mk("tr");r.forEach(function(c){tr2.appendChild(mk("td",null,c));});tbd.appendChild(tr2);});tbl.appendChild(tbd);
return tbl;
}
return null;
};
Panel.prototype.list=function(out,items){
for(var i=0;i<items.length;i++){
var slot=out.children[i],fresh=this.item(items[i],slot);
if(fresh){if(slot)out.replaceChild(fresh,slot);else out.appendChild(fresh);}
}
while(out.children.length>items.length)out.removeChild(out.lastChild);
};
Panel.prototype.render=function(items){this.list(this.out,items);};
window.addEventListener("message",function(e){
if(e.source!==window.parent||!e.data||e.data.type!=="cpPanelUpdate")return;
for(var i=0;i<panels.length;i++)if(panels[i].id===e.data.panel)panels[i].update(e.data);
});
document.addEventListener("visibilitychange",function(){if(document.hidden)panels.forEach(function(p){p.players.forEach(function(q){q.stop();});});});
function init(){var els=document.querySelectorAll(".cprs-panel");for(var i=0;i<els.length;i++){try{panels.push(new Panel(els[i]));}catch(err){}}window.cprsPanels=panels;}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();`.replace(/\n/g, '');

/** The page with the panel styles and script added, when it holds a panel. Call after plotlyPage: the script uses its theme. */
export function panelPage(html: string): string {
    if (!hasPanel(html)) return html;
    const add = `${STYLE}<script>${SCRIPT}</script>`;
    const i = html.toLowerCase().lastIndexOf('</body>');
    return i < 0 ? html + add : html.slice(0, i) + add + html.slice(i);
}
