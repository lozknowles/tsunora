#!/usr/bin/env python3
import json,os,sys,time
os.environ['CUDA_VISIBLE_DEVICES']='';os.environ['TOKENIZERS_PARALLELISM']='false'
request=json.loads(sys.stdin.read());import torch
from transformers import AutoModelForCausalLM,AutoTokenizer
from peft import PeftModel
torch.set_num_threads(max(1,min(int(request.get('threads',6)),os.cpu_count() or 1)));started=time.time();tokenizer=AutoTokenizer.from_pretrained(request['basePath'],local_files_only=True);tokenizer.pad_token=tokenizer.eos_token;tokenizer.padding_side='left';base=AutoModelForCausalLM.from_pretrained(request['basePath'],local_files_only=True,dtype=torch.float32);model=PeftModel.from_pretrained(base,request['adapterPath'],local_files_only=True);model=model.merge_and_unload() if request.get('mergeAdapter') else model;model.eval();loaded=time.time();rows=[]
def prompt(item):return 'Classify the request for Agent Control. Return JSON only with exactly one lane: LANE_REVIEW, LANE_OPERATE, LANE_VERIFY, or LANE_RESEARCH.\nRequest: '+item['input']+'\nJSON:'
def parsed(text):
 try:return json.loads(text[text.index('{'):text.rindex('}')+1])
 except Exception:return {'invalidOutput':text[:160]}
if request.get('mode')=='batch':
 encoded=tokenizer([prompt(item) for item in request['items']],return_tensors='pt',padding=True);before=time.time()
 with torch.no_grad():generated=model.generate(**encoded,max_new_tokens=14,do_sample=False,pad_token_id=tokenizer.eos_token_id)
 batch_ms=round((time.time()-before)*1000);prefix=encoded['input_ids'].shape[1]
 for index,item in enumerate(request['items']):
  text=tokenizer.decode(generated[index][prefix:],skip_special_tokens=True).strip();input_tokens=int(encoded['attention_mask'][index].sum().item())
  rows.append({'id':item['id'],'output':parsed(text),'inputTokens':input_tokens,'outputTokens':int(generated.shape[1]-prefix),'elapsedMs':batch_ms})
else:
 for item in request['items']:
  encoded=tokenizer(prompt(item),return_tensors='pt');before=time.time()
  with torch.no_grad():generated=model.generate(**encoded,max_new_tokens=14,do_sample=False,pad_token_id=tokenizer.eos_token_id)
  text=tokenizer.decode(generated[0][encoded['input_ids'].shape[1]:],skip_special_tokens=True).strip()
  rows.append({'id':item['id'],'output':parsed(text),'inputTokens':int(encoded['input_ids'].numel()),'outputTokens':int(generated.shape[1]-encoded['input_ids'].shape[1]),'elapsedMs':round((time.time()-before)*1000)})
print(json.dumps({'loadMs':round((loaded-started)*1000),'elapsedMs':round((time.time()-started)*1000),'mode':request.get('mode','sequential'),'rows':rows}))
