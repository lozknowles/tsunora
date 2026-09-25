/** Counts emitted runner results; an undiscovered total is never guessed. */
export function ingestRegressionLine(record, raw, cursor) {
  const text=raw.replace(/\u001b\[[0-9;]*m/g,''),phase=text.match(/^> agent-control@\S+ (\S+)$/);
  if(phase){record.phases.push({phase:record.phase,passed:record.passed,failed:record.failed,skipped:record.skipped});record.phase=phase[1];record.passed=record.failed=record.skipped=0;record.total=null;cursor.summary=false;}
  const final=text.match(/^ℹ (tests|pass|fail|skipped) (\d+)$/);
  if(final){cursor.summary=true;record[{tests:'total',pass:'passed',fail:'failed',skipped:'skipped'}[final[1]]]=Number(final[2]);}
  else if(!cursor.summary){if(/^\s*✔ /.test(text))record.passed++;if(/^\s*✖ /.test(text)&&!text.includes('failing tests:'))record.failed++;if(/^\s*﹣ /.test(text))record.skipped++;}
  record.remaining=record.total===null?null:Math.max(0,record.total-record.passed-record.failed-record.skipped);
}
