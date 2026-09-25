#!/usr/bin/env python3
import argparse, hashlib, json, os, platform, random, sys, time
from pathlib import Path

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as handle:
        for block in iter(lambda:handle.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def stable_hash(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def read_jsonl(path): return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
def prompt(text): return 'Classify the request for Agent Control. Return JSON only with exactly one lane: LANE_REVIEW, LANE_OPERATE, LANE_VERIFY, or LANE_RESEARCH.\nRequest: '+text+'\nJSON:'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',required=True); parser.add_argument('--model-identity'); parser.add_argument('--revision',required=True)
    parser.add_argument('--train',required=True); parser.add_argument('--eval',required=True); parser.add_argument('--output',required=True)
    parser.add_argument('--epochs',type=int,default=4); parser.add_argument('--seed',type=int,default=45); parser.add_argument('--mode',choices=['baseline','train','evaluate'],required=True)
    parser.add_argument('--adapter'); args=parser.parse_args()
    os.environ['CUDA_VISIBLE_DEVICES']=''; os.environ['TOKENIZERS_PARALLELISM']='false'; random.seed(args.seed)
    import torch
    from torch.utils.data import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
    from peft import LoraConfig, PeftModel, get_peft_model
    torch.manual_seed(args.seed); torch.set_num_threads(max(1,min(6,os.cpu_count() or 1)))
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    tokenizer=AutoTokenizer.from_pretrained(args.model,revision=args.revision); tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(args.model,revision=args.revision,torch_dtype=torch.float32)
    if args.adapter: model=PeftModel.from_pretrained(model,args.adapter)
    def evaluate(label):
        model.eval(); rows=[]; correct=0; valid=0; started=time.time()
        for item in read_jsonl(args.eval):
            rendered=prompt(item['input']); encoded=tokenizer(rendered,return_tensors='pt')
            with torch.no_grad(): generated=model.generate(**encoded,max_new_tokens=14,do_sample=False,pad_token_id=tokenizer.eos_token_id)
            text=tokenizer.decode(generated[0][encoded['input_ids'].shape[1]:],skip_special_tokens=True).strip(); parsed=None
            try: parsed=json.loads(text[text.index('{'):text.rindex('}')+1])
            except Exception: pass
            schema_valid=isinstance(parsed,dict) and set(parsed)=={'lane'} and parsed.get('lane') in {'LANE_REVIEW','LANE_OPERATE','LANE_VERIFY','LANE_RESEARCH'}
            valid+=int(schema_valid); correct+=int(schema_valid and parsed==item['output']); rows.append({'id':item['id'],'expected':item['output'],'raw':text[:160],'schemaValid':schema_valid,'correct':schema_valid and parsed==item['output']})
        report={'schema':'agent-control.skill-evaluation/v1','kind':label,'model':args.model,'revision':args.revision,'adapter':bool(args.adapter),'examples':len(rows),'accuracy':correct/len(rows),'schemaValidity':valid/len(rows),'elapsedSeconds':time.time()-started,'rows':rows}
        target=out/f'{label}.json';target.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'report':str(target),'sha256':sha256_file(target),'accuracy':report['accuracy'],'schemaValidity':report['schemaValidity']}));return
    if args.mode in ('baseline','evaluate'): evaluate(args.mode); return
    class RouteDataset(Dataset):
        def __init__(self,items):
            self.rows=[]
            for item in items:
                before=tokenizer(prompt(item['input']),add_special_tokens=False)['input_ids']; answer=tokenizer(json.dumps(item['output'],separators=(',',':'))+tokenizer.eos_token,add_special_tokens=False)['input_ids']; ids=(before+answer)[:192]; self.rows.append({'input_ids':ids,'attention_mask':[1]*len(ids),'labels':[-100]*len(before)+answer[:max(0,192-len(before))]})
        def __len__(self): return len(self.rows)
        def __getitem__(self,index): return self.rows[index]
    class Collator:
        def __call__(self,features):
            maximum=max(len(x['input_ids']) for x in features); result={}
            for key,pad in [('input_ids',tokenizer.pad_token_id),('attention_mask',0),('labels',-100)]: result[key]=torch.tensor([x[key]+[pad]*(maximum-len(x[key])) for x in features])
            return result
    model=get_peft_model(model,LoraConfig(r=8,lora_alpha=16,lora_dropout=.05,bias='none',task_type='CAUSAL_LM',target_modules=['q_proj','k_proj','v_proj','o_proj']))
    model_identity=args.model_identity or args.model
    config={'model':model_identity,'revision':args.revision,'epochs':args.epochs,'seed':args.seed,'rank':8,'alpha':16,'precision':'fp32','device':'cpu','gradientAccumulationSteps':4,'gradientCheckpointing':False,'trainSha256':sha256_file(args.train),'evalSha256':sha256_file(args.eval)}
    environment={'python':platform.python_version(),'platform':platform.platform(),'torch':torch.__version__,'transformers':__import__('transformers').__version__,'peft':__import__('peft').__version__}
    (out/'training-config.json').write_text(json.dumps(config,indent=2)+'\n');(out/'environment.json').write_text(json.dumps(environment,indent=2)+'\n')
    started=time.time(); trainer=Trainer(model=model,args=TrainingArguments(output_dir=str(out/'checkpoints'),num_train_epochs=args.epochs,per_device_train_batch_size=4,gradient_accumulation_steps=4,learning_rate=5e-4,warmup_ratio=.1,logging_steps=2,save_strategy='epoch',save_total_limit=2,report_to=[],use_cpu=True,seed=args.seed,data_seed=args.seed),train_dataset=RouteDataset(read_jsonl(args.train)),data_collator=Collator());result=trainer.train();adapter=out/'adapter';model.save_pretrained(adapter,safe_serialization=True);tokenizer.save_pretrained(adapter)
    files=sorted(p for p in adapter.rglob('*') if p.is_file());artefact_hash=hashlib.sha256(''.join(f'{p.relative_to(adapter)}:{sha256_file(p)}\n' for p in files).encode()).hexdigest();report={'schema':'agent-control.skill-training-result/v1','status':'COMPLETE','adapter':str(adapter),'artefactSha256':artefact_hash,'sizeBytes':sum(p.stat().st_size for p in files),'configSha256':stable_hash(config),'environmentSha256':stable_hash(environment),'elapsedSeconds':time.time()-started,'trainMetrics':result.metrics,'base':{'model':model_identity,'revision':args.revision}}
    target=out/'training-result.json';target.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__': main()
