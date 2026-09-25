import fs from 'node:fs';
if(process.env.LABOUR_QUALIFICATION_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,6000));
// Independent decimal digit arithmetic, no conversion through floating-point numbers.
const trim=s=>s.replace(/^0+(?=\d)/,'');
const magnitude=(a,b)=>a.length-b.length||a.localeCompare(b);
function plus(a,b){let c=0,r='';for(let i=0;i<Math.max(a.length,b.length)||c;i++){const n=+(a.at(-i-1)||0) + +(b.at(-i-1)||0)+c;r=n%10+r;c=Math.floor(n/10);}return trim(r);}
function minus(a,b){let borrow=0,r='';for(let i=0;i<a.length;i++){let n=+a.at(-i-1) - +(b.at(-i-1)||0)-borrow;borrow=n<0?1:0;if(borrow)n+=10;r=n+r;}return trim(r);}
function add(a,b){const an=a.startsWith('-'),bn=b.startsWith('-'),aa=trim(a.replace(/^[-+]/,'')),bb=trim(b.replace(/^[-+]/,''));if(an===bn){const r=plus(aa,bb);return an&&r!=='0'?'-'+r:r;}const cmp=magnitude(aa,bb);if(!cmp)return '0';const r=cmp>0?minus(aa,bb):minus(bb,aa);return (cmp>0?an:bn)?'-'+r:r;}
const {jobType,input}=JSON.parse(fs.readFileSync(0,'utf8'));let answer;
if(jobType==='sum')answer={sum:input.values.reduce(add,'0')};
else if(jobType==='classification')answer={labels:input.values.map(n=>/^[-+]?0+$/.test(n)?'zero':n.startsWith('-')?'negative':'positive')};
else if(jobType==='extraction'){const values=[];for(const r of input.records)if(r.kind===input.kind)values.push({id:r.id,value:r.value});answer={values};}
else throw Error('unsupported');
process.stdout.write(JSON.stringify(answer));
