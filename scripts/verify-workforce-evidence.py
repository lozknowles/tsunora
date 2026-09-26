import json,hashlib,sys
from pathlib import Path
root=Path(sys.argv[1]);manifest=json.loads((root/'frozen-scenarios.json').read_text());cases={c['id']:c for c in manifest['cases']};rows=[json.loads(l)for l in (root/'attempts.jsonl').read_text().splitlines()];checks=[];verified=0
for row in rows:
 d=root/(row['profile']+'-'+row['strategy'])/row['caseId'];state=json.loads((d/'synthetic-state.json').read_text());runlist=json.loads((d/'runs.json').read_text())['runs'];run=next(r for r in runlist if r['id']==row['runId']);c=cases[row['caseId']]
 assert run['status']==row['actual'];key=c['tenant']+'/'+c['employee']
 if run['status']=='SUCCEEDED':assert state['records'][key][c['expectedRecordField']]==c['expectedRecordValue'];verified+=1
 meta=json.loads((d/'artifacts/artifacts.json').read_text())['artifacts'] if (d/'artifacts/artifacts.json').exists() else []
 for a in meta:
  raw=(d/'artifacts/objects'/Path(a['storageRef']).name).read_bytes();assert hashlib.sha256(raw).hexdigest()==a['sha256']
  value=json.loads(raw)
  if a['stepId']=='execute':assert value['employee']==c['employee']and value['tenant']==c['tenant']
 if c['family']=='scope':
  kill=json.loads((d/'containment.json').read_text())['kills'][0];assert kill['recovery']=='QUARANTINED';assert any(clean['processes']for clean in kill['cleanup'])
 checks.append({'caseId':c['id'],'configuration':row['profile']+'-'+row['strategy'],'actual':run['status'],'artifactChecks':len(meta),'status':'PASS'})
result={'status':'PASS','method':'Independent Python verification of recorded run statuses, expected synthetic state, artifact SHA-256 and real containment cleanup process records','recordedAttempts':len(rows),'verifiedCompletions':verified,'verifiedCases':len(checks),'sourceBenchmarkFailuresRetained':sum(not r['pass']for r in rows),'checks':checks};(root/'independent-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items()if k!='checks'}))
