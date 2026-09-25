function spokenNumber(value:number):string {
  const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  if(value<20)return small[value]!;
  if(value<100)return ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'][Math.floor(value/10)]!+(value%10?' '+small[value%10]:'');
  if(value<1000)return small[Math.floor(value/100)]+' hundred'+(value%100?' and '+spokenNumber(value%100):'');
  return spokenNumber(Math.floor(value/1000))+' thousand'+(value%1000?' '+spokenNumber(value%1000):'');
}
export function spokenJobSummary(number:number,result:{status:string;durationMs?:number}) {
  const outcome:Record<string,string>={SUCCEEDED:'completed successfully',FAILED:'failed',CANCELLED:'was cancelled',DEGRADED:'finished with unresolved issues'};
  const reference=Number.isSafeInteger(number)&&number>0&&number<1000000?'job '+spokenNumber(number):'job';
  return `Agent Control ${reference} ${outcome[result.status]??'has an update'}.`;
}
export function prepareSpokenText(text:string) {
  const spoken=normalizeGroupedNumbers(text).replace(/`([^`]+)`/g,'$1').replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g,'address shown in the transcript').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,(_value,hours,minutes)=>hours==='00'&&minutes==='00'?'midnight':spokenNumber(Number(hours))+(minutes==='00'?" o'clock":(Number(minutes)<10?' oh ':' ')+spokenNumber(Number(minutes)))).replace(/\b[a-f0-9]{32,64}\b/gi,'identifier shown in the transcript').replace(/\b\d+\.\d+\.\d+\b/g,version=>version.split('.').map(part=>spokenNumber(Number(part))).join(' point '));
  const lines=spoken.split('\n').map(line=>line.trim()).filter(line=>line&&!/^https?:|^Work Parcel:/.test(line)).map(line=>line.replace(/\s+\((?:agent control|operator|provider reported|estimated|unavailable)\)\s*$/i,'').replace(/:\s*/g,', ').replace(/[.!?]+$/,'')).filter(Boolean);
  return `${lines.join('. ').replace(/\b\d{1,6}\b/g,value=>spokenNumber(Number(value))).replace(/\s+/g,' ').trim().slice(0,999)}.`;
}
export function speechContentCoverage(expected:string,observed:string) {
  const tokens=(value:string)=>new Set((normalizeGroupedNumbers(value).toLowerCase().match(/[a-z]+|\d+/g)??[]).flatMap(token=>/^\d+$/.test(token)?spokenNumber(Number(token)).split(' '):[token]));
  const target=tokens(expected),actual=tokens(observed),matched=[...target].filter(token=>actual.has(token)).length,coverage=target.size?matched/target.size:0;
  const critical=new Set('no not never cannot zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' '));
  const criticalMatch=[...critical].every(token=>target.has(token)===actual.has(token));
  const precision=actual.size?matched/actual.size:0;
  return {matched:coverage>=0.8&&precision>=0.8&&criticalMatch,coverage};
}
function normalizeGroupedNumbers(value:string){return value.replace(/\b\d{1,3}(?:,\d{3})+\b/g,number=>number.replaceAll(',',''));}
