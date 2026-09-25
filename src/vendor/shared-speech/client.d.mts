export class SharedSpeechClient {
 constructor(options:{url:string;token:string;request?:typeof fetch});
 call(path:string,method?:string,body?:unknown,signal?:AbortSignal):Promise<Response>;
 health():Promise<any>;session(correlation?:Record<string,string>):Promise<any>;
 cancel(id:string):Promise<any>;close(id:string):Promise<void>;
 transcribe(id:string,audio:Uint8Array,options?:{mime?:string;signal?:AbortSignal}):Promise<any>;
 speak(id:string,text:string,voice?:string,options?:{fallback:'none'|'standard'}):AsyncGenerator<any>;
}
