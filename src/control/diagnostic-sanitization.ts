import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {redactSensitiveText} from './security-redaction.js';
import {DEFAULT_DIAGNOSTIC_PRIVACY,type DiagnosticPrivacy,type IdentifierPolicy} from './diagnostic-types.js';

export const DIAGNOSTIC_SANITIZER_VERSION='diagnostic-sanitizer/1.0.0';
const secretKey=/(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|oauth[_-]?token|id[_-]?token|authorization|cookie|session(?:[_-]?(?:id|token))?|client[_-]?secret|connection[_-]?string|private[_-]?key|credential|secret)/i;
/** Pure bounded text transform. Log instructions stay inert text; no model or tool is called. */
export class DiagnosticSanitizer {
 constructor(private readonly key:string,readonly policy:DiagnosticPrivacy=DEFAULT_DIAGNOSTIC_PRIVACY,private readonly known:{hostnames?:string[];usernames?:string[];identifiers?:string[]}={}){}
 pseudonym(kind:string,value:string){return`${kind}-${createHmac('sha256',this.key).update(kind+'\0'+value).digest('hex').slice(0,12)}`;}
 identifier(kind:keyof DiagnosticPrivacy,value:string|null|undefined){if(!value)return null;return this.replaceIdentifier(kind,value,this.policy[kind]);}
 private replaceIdentifier(kind:string,value:string,policy:IdentifierPolicy){return policy==='KEEP'?value:policy==='REDACT'?`[${kind.toUpperCase()}]`:`[${this.pseudonym(kind,value)}]`;}
 text(input:string){
  let redactions=0;
  const replace=(pattern:RegExp,replacement:string|((...args:string[])=>string))=>{value=value.replace(pattern,(...args)=>{redactions++;return typeof replacement==='string'?replacement:replacement(...args as string[]);});};
  // Limit work before applying regular expressions. Callers split bounded input into lines.
  let value=String(input).slice(0,16384);if(input.length>16384){value+=' [LINE_TRUNCATED]';redactions++;}
  replace(/-----BEGIN (?:[A-Z0-9]+ )*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*(?:-----END [^-]+-----)?/g,'[REDACTED_PRIVATE_KEY]');
  replace(/\b(?:ssh-rsa|ssh-ed25519|ecdsa-sha2-\S+)\s+[A-Za-z0-9+/=]+(?:\s+\S+)?/g,'[REDACTED_SSH_MATERIAL]');
  replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,'[REDACTED_AUTHORIZATION]');
  replace(/\b(?:set-cookie|cookie)\s*:\s*[^\r\n]*/gi,'[REDACTED_COOKIE_HEADER]');
  replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g,'[REDACTED_JWT]');
  replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/]+@[^\s"'<>]+/g,'[REDACTED_CREDENTIAL_URL]');
  replace(/(?:["']?)(?:password|passwd|pwd|api[_-]?key|access[_-]?token|refresh[_-]?token|oauth[_-]?token|id[_-]?token|authorization|cookie|set-cookie|session(?:[_-]?(?:id|token))?|client[_-]?secret|connection[_-]?string|private[_-]?key|credential|secret)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gi,'[REDACTED_SECRET_FIELD]');
  replace(/\b(?:Server|Data Source|Host)\s*=[^\n]*(?:Password|Pwd)\s*=[^\n]*/gi,'[REDACTED_CONNECTION_STRING]');
  const existing=redactSensitiveText(value);if(existing!==value){value=existing;redactions++;}
  // Fragmented keys, unlabelled credentials and high-entropy values are withheld
  // conservatively. Digests supplied by trusted code are stored separately.
  replace(/\b[A-Za-z0-9_+/=-]{40,}\b/g,'[REDACTED_LONG_VALUE]');
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,(v)=>this.replaceIdentifier('emails',v,this.policy.emails));
  replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi,(v)=>this.replaceIdentifier('macAddresses',v,this.policy.macAddresses));
  replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,(v)=>this.replaceIdentifier('ipAddresses',v,this.policy.ipAddresses));
  value=value.replace(/(?<![\w])(?:[0-9a-f]{0,4}:){2,}[0-9a-f:.%]{0,40}/gi,v=>{if(isIP(v)!==6)return v;redactions++;return this.replaceIdentifier('ipAddresses',v,this.policy.ipAddresses);});
  replace(/(?:[A-Za-z]:\\|\/)[^\s"'<>;,]{1,2048}/g,(v)=>this.replaceIdentifier('paths',v,this.policy.paths));
  replace(/\b(?:user(?:name)?|uid|host(?:name)?)\s*[:=]\s*["']?([\w.@-]+)/gi,(v,name)=>this.replaceIdentifier(/^user|^uid/i.test(v)?'usernames':'hostnames',name,/^user|^uid/i.test(v)?this.policy.usernames:this.policy.hostnames));
  replace(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:local|internal|lan|com|net|org|io|co\.uk)\b/gi,(v)=>this.replaceIdentifier('hostnames',v,this.policy.hostnames));
  for(const kind of ['hostnames','usernames','identifiers'] as const)for(const item of this.known[kind]??[])if(item.length>1&&value.includes(item)){value=value.split(item).join(this.replaceIdentifier(kind,item,this.policy[kind]));redactions++;}
  return{text:value,redactions,truncated:input.length>16384,version:DIAGNOSTIC_SANITIZER_VERSION};
 }
 value(input:unknown,depth=0):unknown {
  if(depth>8)return'[NESTING_LIMIT]';if(typeof input==='string')return this.text(input).text;
  if(Array.isArray(input))return input.slice(0,200).map(v=>this.value(v,depth+1));
  if(input&&typeof input==='object')return Object.fromEntries(Object.entries(input).slice(0,200).map(([k,v])=>[this.text(k).text,secretKey.test(k)?'[REDACTED_SECRET_FIELD]':this.value(v,depth+1)]));
  return input;
 }
}
