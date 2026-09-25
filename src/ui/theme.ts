import blessed from'blessed';
export const theme={healthy:'green',info:'cyan',warning:'yellow',danger:'red',action:'magenta',muted:'gray',border:'gray',focus:'cyan'} as const;
export const laneAccent=(i:number)=>['green','cyan','magenta','yellow','blue'][i%5];
export function meter(value:number,width=18){const n=Math.max(0,Math.min(width,Math.round(value*width)));return'█'.repeat(n)+'░'.repeat(width-n);}
export function semanticMeter(value:number,color:string,width=18){return`{${color}-fg}${meter(Math.max(0,Math.min(1,value)),width)}{/${color}-fg}`;}
export function colorMeter(value:number,width=18){const v=Math.max(0,Math.min(1,value)),color=v>=.85?'red':v>=.65?'yellow':v>0?'green':'gray';return semanticMeter(v,color,width);}
export function statusColor(status:string){const s=status.toLowerCase();if(/healthy|ready|running|completed|recovered|current/.test(s))return'green';if(/failed|error|offline|stale|unavailable|blocked|degraded/.test(s))return'red';if(/waiting|aging|slow|review|retry|checkpoint/.test(s))return'yellow';if(/recover|route|handoff|substitute|claim/.test(s))return'magenta';return'cyan';}
export function tag(status:string,text=status){const c=statusColor(status);return`{${c}-fg}${text}{/${c}-fg}`;}
export function compactPath(p:string){const home=process.env.HOME;if(home&&p.startsWith(home))return'~'+p.slice(home.length);return p;}
export function terminalSafe(s:string){return s.replace(/[^\x20-\x7E\n\t]/g,'?');}
export function installTerminalSafeBlessedLog(){const factory=blessed.log as typeof blessed.log&{__agentControlSafe?:boolean};if(factory.__agentControlSafe)return;const original=blessed.log.bind(blessed);const wrapped=((options:any)=>{const widget=original(options),raw=widget.log.bind(widget) as(...args:any[])=>unknown;widget.log=((...args:any[])=>raw(...args.map(x=>typeof x==='string'?terminalSafe(x):x))) as typeof widget.log;return widget;})as typeof blessed.log&{__agentControlSafe?:boolean};wrapped.__agentControlSafe=true;blessed.log=wrapped;}
installTerminalSafeBlessedLog();
