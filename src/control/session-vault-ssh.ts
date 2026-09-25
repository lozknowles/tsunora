import path from "node:path";
import type { ResourceConfig } from "./config.js";
import {
  executeSsh,
  sshResourceArgs,
  type SshExecutor,
} from "./managed-node-ssh.js";
import type {
  SessionReplicationBackend,
  SessionVaultRecord,
} from "./session-vault.js";

const REMOTE = `const fs=require('fs'),path=require('path'),[op,root,name]=process.argv.slice(2);if(!path.isAbsolute(root)||!/^[A-Za-z0-9._-]{1,240}$/.test(name||''))process.exit(64);const objects=path.join(root,'objects'),sessions=path.join(root,'sessions');fs.mkdirSync(objects,{recursive:true,mode:0o700});fs.mkdirSync(sessions,{recursive:true,mode:0o700});const input=()=>Buffer.from(fs.readFileSync(0,'utf8').trim(),'base64');if(op==='has'){process.stdout.write(fs.existsSync(path.join(objects,name))?'yes':'no');process.exit(0)}if(op==='put-object'){const file=path.join(objects,name),bytes=input();try{fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}process.stdout.write('ok');process.exit(0)}if(op==='put-record'){const bytes=input(),record=JSON.parse(bytes.toString('utf8')),file=path.join(sessions,name);if(record.sha256!==name.slice(name.lastIndexOf('-')+1,-5))process.exit(65);try{fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}const indexFile=path.join(root,'index.json'),index=fs.existsSync(indexFile)?JSON.parse(fs.readFileSync(indexFile,'utf8')):[];if(!index.some(x=>x.id===record.id&&x.sha256===record.sha256)){index.push({id:record.id,sha256:record.sha256,capturedAt:record.capturedAt});const tmp=indexFile+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(index,null,2)+'\\n',{mode:0o600});fs.renameSync(tmp,indexFile)}process.stdout.write('ok');process.exit(0)}process.exit(64);`;
const PROGRAM = Buffer.from(REMOTE).toString("base64");
const BOOTSTRAP = `set -eu\numask 077\nroot=$1\ncase "$root" in /*) ;; *) exit 64 ;; esac\ncase "$root" in *[!A-Za-z0-9_./-]*) exit 64 ;; esac\nmkdir -p "$root"\nprogram="$root/.agent-control-session-vault-backend.cjs"\nprintf '%s' '${PROGRAM}' | base64 -d > "$program.tmp"\nmv "$program.tmp" "$program"\n`;

export class SshFilesystemSessionReplicationBackend
  implements SessionReplicationBackend
{
  constructor(
    readonly id: string,
    private readonly resource: ResourceConfig,
    private readonly remoteRoot: string,
    private readonly executor: SshExecutor = executeSsh,
  ) {
    if (
      resource.transport.type !== "ssh" ||
      resource.platform === "windows" ||
      !path.posix.isAbsolute(remoteRoot) ||
      !/^[A-Za-z0-9_./-]+$/.test(remoteRoot)
    )
      throw new Error("session_replication_ssh_configuration_invalid");
  }
  async hasObject(sha256: string, encrypted: boolean) {
    const result = await this.run(
      "has",
      `${sha256}.${encrypted ? "enc" : "object"}`,
    );
    return result.stdout.trim() === "yes";
  }
  async putObject(sha256: string, encrypted: boolean, bytes: Buffer) {
    await this.run(
      "put-object",
      `${sha256}.${encrypted ? "enc" : "object"}`,
      bytes,
    );
  }
  async putRecord(record: SessionVaultRecord) {
    const safe = record.id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 240),
      name = `${safe}-${record.sha256}.json`;
    await this.run(
      "put-record",
      name,
      Buffer.from(`${JSON.stringify(record)}\n`),
    );
  }
  private async run(
    operation: string,
    name: string,
    bytes: Uint8Array = Buffer.alloc(0),
  ) {
    const installed = await this.executor(
      "ssh",
      sshResourceArgs(this.resource, ["sh", "-s", "--", this.remoteRoot]),
      BOOTSTRAP,
      { timeoutMs: 120_000, maxBytes: 1024 * 1024 },
    );
    if (installed.timedOut) throw new Error("session_replication_timeout");
    if (installed.aborted) throw new Error("session_replication_aborted");
    if (installed.status !== 0)
      throw new Error("session_replication_transport_failed");
    const program = `${this.remoteRoot}/.agent-control-session-vault-backend.cjs`,
      result = await this.executor(
        "ssh",
        sshResourceArgs(this.resource, [
          "node",
          program,
          operation,
          this.remoteRoot,
          name,
        ]),
        `${Buffer.from(bytes).toString("base64")}\n`,
        { timeoutMs: 120_000, maxBytes: 1024 * 1024 },
      );
    if (result.timedOut) throw new Error("session_replication_timeout");
    if (result.aborted) throw new Error("session_replication_aborted");
    if (result.status !== 0)
      throw new Error("session_replication_transport_failed");
    return result;
  }
}
