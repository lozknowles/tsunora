#!/usr/bin/env python3
"""Load the qualified specialist and hold it idle for bounded residency measurement."""
import json
import os
import sys
import time

os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TOKENIZERS_PARALLELISM"] = "false"
request = json.loads(sys.stdin.readline())

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

torch.set_num_threads(max(1, min(6, os.cpu_count() or 1)))
started = time.time()
tokenizer = AutoTokenizer.from_pretrained(request["basePath"], local_files_only=True)
tokenizer.pad_token = tokenizer.eos_token
base = AutoModelForCausalLM.from_pretrained(
    request["basePath"], local_files_only=True, torch_dtype=torch.float32
)
model = PeftModel.from_pretrained(base, request["adapterPath"], local_files_only=True)
model.eval()
print(json.dumps({"state": "READY", "loadMs": round((time.time() - started) * 1000)}), flush=True)
for line in sys.stdin:
    if line.strip() == "STOP":
        break
