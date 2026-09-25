#!/usr/bin/env python3
import json,os,sys,time
os.environ['CUDA_VISIBLE_DEVICES']='';os.environ['TOKENIZERS_PARALLELISM']='false'
request=json.loads(sys.stdin.read());import torch
from transformers import AutoModelForCausalLM,AutoTokenizer
torch.set_num_threads(max(1,min(6,os.cpu_count() or 1)));started=time.time();tokenizer=AutoTokenizer.from_pretrained(request['basePath'],local_files_only=True);tokenizer.pad_token=tokenizer.eos_token;base=AutoModelForCausalLM.from_pretrained(request['basePath'],local_files_only=True,torch_dtype=torch.float32);base.eval();prompt='Classify the request for Agent Control. Return JSON only with exactly one lane: LANE_REVIEW, LANE_OPERATE, LANE_VERIFY, or LANE_RESEARCH.\nRequest: '+request['input']+'\nJSON:';encoded=tokenizer(prompt,return_tensors='pt')
with torch.no_grad():generated=base.generate(**encoded,max_new_tokens=14,do_sample=False,pad_token_id=tokenizer.eos_token_id)
text=tokenizer.decode(generated[0][encoded['input_ids'].shape[1]:],skip_special_tokens=True).strip()
try:output=json.loads(text[text.index('{'):text.rindex('}')+1])
except Exception:output={'invalidOutput':text[:160]}
print(json.dumps({'output':output,'inputTokens':int(encoded['input_ids'].numel()),'outputTokens':int(generated.shape[1]-encoded['input_ids'].shape[1]),'totalTokens':int(generated.shape[1]),'elapsedMs':round((time.time()-started)*1000)}))
