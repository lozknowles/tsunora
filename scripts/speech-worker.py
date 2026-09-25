"""Optional private OmniVoice/Whisper implementation, isolated from Agent Control.
No URL fetching or arbitrary file paths are accepted in HTTP requests.
"""
import argparse, base64, hashlib, io, json, os, socket, time
from speech_chunks import sentence_parts
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from hmac import compare_digest

started = time.perf_counter()
parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--device', default='cuda:0')
parser.add_argument('--port', type=int, default=19194)
parser.add_argument('--state', required=True)
parser.add_argument('--qualify', action='store_true')
parser.add_argument('--voice-config', help='Explicit original designed voice JSON; no HTTP-selected voice changes')
parser.add_argument('--sentence-chunks', action='store_true', help='Synthesize sentences separately with the same voice seed, then join with a short pause')
args = parser.parse_args()
state = Path(args.state); state.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('HF_HOME', str(state/'hf-cache'))
import numpy as np
import psutil
import soundfile as sf
import torch
from omnivoice import OmniVoice

torch.set_num_threads(4)
if args.device.startswith('cuda'):
    assert torch.cuda.is_available()
    # Leave room for protected workloads and for inference peaks.
    torch.cuda.set_per_process_memory_fraction(0.44, 0)
elif args.device.startswith('xpu'):
    assert torch.xpu.is_available()
import threading, subprocess
monitor_stop=threading.Event()
def monitor():
    process=psutil.Process();process.cpu_percent();samples=[]
    while not monitor_stop.wait(1):
        sample={'at':time.time(),'rssBytes':process.memory_info().rss,'processCpuPercent':process.cpu_percent()}
        if args.device.startswith('cuda'):
            try:sample['gpu']=subprocess.check_output(['nvidia-smi','--query-gpu=memory.used,utilization.gpu,power.draw','--format=csv,noheader,nounits'],text=True,timeout=3).strip()
            except Exception:sample['gpu']=None
        samples.append(sample)
        if len(samples)>3600: samples.pop(0)
        (state/'resource-samples.json').write_text(json.dumps(samples))
threading.Thread(target=monitor,daemon=True).start()
# Integrated Arc cannot report free device memory to the Transformers allocator warmup.
load_device = 'cpu' if args.device.startswith('xpu') else args.device
model = OmniVoice.from_pretrained(args.model, device_map=load_device, dtype=torch.float32, attn_implementation='sdpa')
if args.device.startswith('xpu'):
    model.to(args.device)
    model.audio_tokenizer.to(args.device)
startup_ms = (time.perf_counter()-started)*1000
voice = {'id':'agent-control-designed-v1','kind':'designed','provider':'omnivoice','modelRevision':'c5fdb5ccb189668d56333f77ba2629f4cd7535f4','instruction':'female, low pitch, british accent','seed':3901}
if args.voice_config:
    candidate=json.loads(Path(args.voice_config).read_text())
    if candidate.get('kind')!='designed' or candidate.get('provider')!='omnivoice' or candidate.get('modelRevision')!=voice['modelRevision'] or not candidate.get('id') or not candidate.get('instruction') or not isinstance(candidate.get('seed'),int):
        raise ValueError('invalid_original_voice_configuration')
    voice=candidate
recognizer = None

def synchronize():
    if args.device.startswith('cuda'): torch.cuda.synchronize()
    if args.device.startswith('xpu'): torch.xpu.synchronize()

def synthesize(text):
    if not isinstance(text,str) or not text.strip() or len(text)>1200: raise ValueError('invalid_text')
    synchronize(); begin=time.perf_counter()
    parts=sentence_parts(text) if args.sentence_chunks else [text]
    chunks=[]
    for index,part in enumerate(parts):
        torch.manual_seed(voice['seed'])
        if index: chunks.append(np.zeros(3600,dtype=np.float32))
        chunks.append(model.generate(text=part,instruct=voice['instruction'],num_step=16)[0])
    audio=np.concatenate(chunks)
    synchronize(); elapsed=(time.perf_counter()-begin)*1000
    if not np.isfinite(audio).all() or len(audio)>24000*90: raise ValueError('invalid_audio')
    buffer=io.BytesIO();sf.write(buffer,audio,24000,format='WAV',subtype='PCM_16')
    seconds=len(audio)/24000
    metrics={'provider':'omnivoice','host':socket.gethostname(),'model':voice['modelRevision'],'elapsedMs':elapsed,'audioSeconds':seconds,'rtf':elapsed/1000/seconds,'firstAudioMs':elapsed,'memoryBytes':psutil.Process().memory_info().rss,'device':args.device,'streaming':False,'sentenceChunks':len(parts),'peakAllocatedBytes':torch.cuda.max_memory_allocated() if args.device.startswith('cuda') else None}
    return buffer.getvalue(),metrics

def transcribe(data):
    global recognizer
    import tempfile, subprocess
    if len(data)>8*1024*1024: raise ValueError('audio_too_large')
    begin=time.perf_counter()
    # Fixed decoder argv; no shell, network protocols, playlists or user paths.
    with tempfile.TemporaryDirectory(dir=state) as folder:
        source=Path(folder)/'input.audio';target=Path(folder)/'decoded.wav';source.write_bytes(data)
        subprocess.run(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file,pipe','-format_whitelist','wav,ogg,mp3,mov,matroska,webm','-i',str(source),'-t','61','-ac','1','-ar','16000',str(target)],check=True,timeout=20,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        samples,rate=sf.read(target)
    if len(samples)>rate*60 or len(samples)<rate/4:raise ValueError('audio_duration_rejected')
    if recognizer is None:
        from transformers import pipeline
        recognizer=pipeline('automatic-speech-recognition',model='openai/whisper-tiny.en', revision='87c7102498dcde7456f24cfd30239ca606ed9063',device='cpu',dtype=torch.float32)
    result=recognizer({'raw':samples.astype(np.float32),'sampling_rate':rate},generate_kwargs={'do_sample':False})
    elapsed=(time.perf_counter()-begin)*1000;seconds=len(samples)/rate
    return {'text':result['text'].strip(),'confidence':None,'metrics':{'provider':'whisper','host':socket.gethostname(),'model':'openai/whisper-tiny.en','elapsedMs':elapsed,'audioSeconds':seconds,'rtf':elapsed/1000/seconds,'firstAudioMs':0,'memoryBytes':psutil.Process().memory_info().rss}}

if args.qualify:
    phrases=['Agent Control job completed successfully.','The LocalWalks staging deployment has passed all health checks.','The primary model was unable to complete the task. Agent Control has escalated the Work Parcel to another model.','Collingham, Nottinghamshire, the River Trent, Mons Pool, South Scarle and Newark on Trent.']
    results=[]
    for repeat in range(2):
        for index,text in enumerate(phrases):
            data,metrics=synthesize(text);name=f'phrase-{index+1}-repeat-{repeat+1}.wav';(state/name).write_bytes(data)
            results.append({'text':text,'repeat':repeat+1,'file':name,'sha256':hashlib.sha256(data).hexdigest(),**metrics})
            (state/'qualification.json').write_text(json.dumps({'startupMs':startup_ms,'voice':voice,'torch':torch.__version__,'results':results},indent=2))
    # Use our own designed synthetic voice as the cloning reference, never a person.
    reference,sr=sf.read(state/'phrase-1-repeat-1.wav')
    prompt=model.create_voice_clone_prompt(ref_audio=(reference,sr),ref_text=phrases[0]);prompt.save(str(state/'synthetic-voice-prompt.pt'))
    from omnivoice import VoiceClonePrompt
    loaded=VoiceClonePrompt.load(str(state/'synthetic-voice-prompt.pt'))
    begin=time.perf_counter();cloned=model.generate(text=phrases[0],voice_clone_prompt=loaded,num_step=16)[0];synchronize()
    sf.write(state/'synthetic-clone.wav',cloned,24000)
    (state/'clone-provenance.json').write_text(json.dumps({'kind':'cloned','referenceKind':'designed-synthetic','consentBasis':'synthetic-reference','referenceSeconds':len(reference)/sr,'referenceText':phrases[0],'promptBytes':(state/'synthetic-voice-prompt.pt').stat().st_size,'elapsedMs':(time.perf_counter()-begin)*1000,'referenceSha256':hashlib.sha256((state/'phrase-1-repeat-1.wav').read_bytes()).hexdigest()},indent=2))
    print(json.dumps({'state':'qualified_generation','count':len(results),'startupMs':startup_ms}));raise SystemExit()

token=os.environ.get('AGENT_CONTROL_SPEECH_TOKEN','')
if len(token)<32:raise RuntimeError('speech_token_required')
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*unused):pass
    def respond(self,status,value):
        payload=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
    def authorized(self):return compare_digest(self.headers.get('Authorization',''),'Bearer '+token)
    def do_GET(self):
        if not self.authorized():return self.respond(401,{'error':'unauthorized'})
        if self.path!='/health':return self.respond(404,{'error':'not_found'})
        self.respond(200,{'state':'ready','startupMs':startup_ms,'voice':voice,'device':args.device})
    def do_POST(self):
        if not self.authorized():return self.respond(401,{'error':'unauthorized'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>12*1024*1024:raise ValueError()
            value=json.loads(self.rfile.read(size))
            if self.path=='/synthesize':
                if value.get('voice')!=voice:raise ValueError()
                data,metrics=synthesize(value['text'])
                if value.get('format')=='wav':return self.respond(200,{'audio':base64.b64encode(data).decode(),'mime':'audio/wav','metrics':metrics})
                encoding_started=time.perf_counter()
                data=subprocess.run(['ffmpeg','-nostdin','-v','error','-f','wav','-i','pipe:0','-af','atempo=0.9','-c:a','libopus','-b:a','32k','-f','ogg','pipe:1'],input=data,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=20).stdout
                metrics['encodingMs']=(time.perf_counter()-encoding_started)*1000
                metrics['sourceAudioSeconds']=metrics['audioSeconds']
                metrics['audioSeconds']/=0.9
                metrics['rtf']=metrics['elapsedMs']/1000/metrics['audioSeconds']
                metrics['playbackRate']=0.9
                return self.respond(200,{'audio':base64.b64encode(data).decode(),'mime':'audio/ogg; codecs=opus','metrics':metrics})
            if self.path=='/transcribe':return self.respond(200,transcribe(base64.b64decode(value['audio'],validate=True)))
            self.respond(404,{'error':'not_found'})
        except Exception as error:
            import traceback
            print(json.dumps({'event':'speech_request_failed','errorClass':type(error).__name__,'frames':[{'file':Path(frame.filename).name,'line':frame.lineno} for frame in traceback.extract_tb(error.__traceback__)[-3:]]}),flush=True)
            self.respond(422,{'error':'speech_request_failed'})
HTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
