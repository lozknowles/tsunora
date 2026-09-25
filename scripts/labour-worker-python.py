import json, sys
import os, time
if os.environ.get('LABOUR_QUALIFICATION_HOLD') == '1':
    time.sleep(6)
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
request = json.load(sys.stdin)
kind, data = request['jobType'], request['input']
if kind == 'sum':
    result = {'sum': str(sum(int(value) for value in data['values']))}
elif kind == 'classification':
    result = {'labels': ['negative' if int(n) < 0 else 'positive' if int(n) > 0 else 'zero' for n in data['values']]}
elif kind == 'extraction':
    result = {'values': [{'id': r['id'], 'value': r['value']} for r in data['records'] if r['kind'] == data['kind']]}
else:
    raise ValueError('unsupported')
json.dump(result, sys.stdout, separators=(',', ':'))
