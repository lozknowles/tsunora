import fs from 'node:fs';
if(process.env.LABOUR_QUALIFICATION_HOLD==='1')await new Promise(resolve=>setTimeout(resolve,6000));
const {jobType,input}=JSON.parse(fs.readFileSync(0,'utf8'));
let answer;
if(jobType==='sum')answer={sum:input.values.reduce((a,b)=>a+BigInt(b),0n).toString()};
else if(jobType==='classification')answer={labels:input.values.map(n=>BigInt(n)<0n?'negative':BigInt(n)>0n?'positive':'zero')};
else if(jobType==='extraction')answer={values:input.records.filter(r=>r.kind===input.kind).map(r=>({id:r.id,value:r.value}))};
else throw Error('unsupported');
process.stdout.write(JSON.stringify(answer));
