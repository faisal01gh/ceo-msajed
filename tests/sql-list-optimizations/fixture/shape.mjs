// Extract only canonical DDL and the read-function dependency closure. Never replay migration DML.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha=s=>createHash('sha256').update(s).digest('hex');
export function statements(source){
  const out=[];let buf='',quote=null,dollar=null,line=false,block=false;
  for(let i=0;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n'){line=false;buf+='\n';}continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;buf+=' ';}continue;}
    if(dollar){if(source.startsWith(dollar,i)){buf+=dollar;i+=dollar.length-1;dollar=null;}else buf+=c;continue;}
    if(quote){buf+=c;if(c===quote){if(n===quote){buf+=n;i++;}else quote=null;}continue;}
    if(c==='-'&&n==='-'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==="'"||c==='"'){quote=c;buf+=c;continue;}
    if(c==='$'){const m=source.slice(i).match(/^\$\w*\$/);if(m){dollar=m[0];buf+=dollar;i+=dollar.length-1;continue;}}
    buf+=c;if(c===';'){out.push(buf.trim());buf='';}
  }
  if(buf.trim())out.push(buf.trim());return out;
}
const tables=new Set(('roles permissions role_permissions profiles user_roles organizational_units user_memberships user_permissions account_migration_users account_permission_overrides transactions transaction_periods transaction_assignments transaction_assignment_users transaction_assignment_targets transaction_participants transaction_actions transaction_action_versions transaction_action_notes transaction_routes transaction_requests transaction_links transaction_history notifications').split(' ').map(x=>'public.'+x).concat(['app_private.account_credential_state','app_private.account_password_operations','app_private.transaction_read_state']));
export function canonicalShape(root){
  const dir=path.join(root,'supabase/migrations');
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'20261013').sort();
  files.splice(files.indexOf('20261002_transactions_foundation.sql'),1);files.unshift('20261002_transactions_foundation.sql');
  const records=[],functions=new Map(),manifest=[];
  for(const file of files){const raw=fs.readFileSync(path.join(dir,file),'utf8');
    // The two historical dump terminators lack a semicolon: delimiter-only lexical normalization.
    const source=raw.replace(/(\$function\$)\s*(?=revoke)/gi,'$1;\n');
    manifest.push({file,sha256:sha(raw)});
    for(const sql of statements(source)){
      const fn=sql.match(/^create\s+(?:or replace\s+)?function\s+([\w.]+)/i);
      if(fn)functions.set(fn[1].toLowerCase(),{file,sql});
      records.push({file,sql});
    }
  }
  const roots=['public.list_my_transactions','public.transaction_directory_my','public.my_permissions','public.my_profile','app_private.transaction_feedback_flags','public.user_context_internal'];
  const wanted=new Set();function visit(name){if(wanted.has(name)||!functions.has(name))return;wanted.add(name);for(const m of functions.get(name).sql.matchAll(/\b((?:app_private|public)\.\w+)\s*\(/g))visit(m[1]);}roots.forEach(visit);
  for(const {sql} of records)if(/^(create|drop) policy/i.test(sql)&&[...tables].some(t=>sql.includes(t)))for(const m of sql.matchAll(/\b((?:app_private|public)\.\w+)\s*\(/g))visit(m[1]);
  const selected=[];
  for(const record of records){const {sql}=record;
    const create=sql.match(/^create table(?: if not exists)?\s+([\w.]+)/i), alter=sql.match(/^alter table\s+([\w.]+)/i), index=sql.match(/^create (?:unique )?index\s+(?:if not exists\s+)?\w+\s+on\s+([\w.]+)/i);
    if((create&&tables.has(create[1]))||(alter&&tables.has(alter[1]))||(index&&tables.has(index[1])))selected.push(record);
  }
  return {manifest,records,functions,wanted,tables,selected};
}
export async function buildShape(db,shape){
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema app_private;
    create table auth.users(id uuid primary key,email text unique,raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    set check_function_bodies=off;`);
  for(const {file,sql} of shape.selected){try{await db.exec(sql);}catch(e){throw new Error('canonical DDL '+file+': '+e.message);}}
  for(const name of shape.wanted){const {file,sql}=shape.functions.get(name);try{await db.exec(sql);}catch(e){throw new Error('canonical function '+name+' '+file+': '+e.message);}}
  // Apply only policies for selected shape tables, followed by the current restrictive readiness gate.
  for(const {file,sql} of shape.records){
    const policy=sql.match(/^(?:create|drop) policy[\s\S]*?\bon\s+([\w.]+)/i);
    if(policy&&shape.tables.has(policy[1])){try{await db.exec(sql);}catch(e){throw new Error('policy '+file+': '+e.message);}}
    if(file==='20261005200000_password_operations_and_safe_provisioning.sql'&&sql.startsWith('do $rls$'))await db.exec(sql);
  }
  // Auth schema is the synthetic transport adapter. Replay ACLs only for selected
  // objects, preserving canonical privileges without loading unrelated functions.
  await db.exec('grant usage on schema public,app_private,auth to authenticated; grant execute on all functions in schema auth to authenticated;');
  for(const {file,sql} of shape.records){
    const acl=sql.match(/^((?:grant|revoke)\s+[\s\S]*?\s+on\s+(?:function\s+|table\s+)?)([\s\S]+?)(\s+(?:to|from)\s+[\w,\s]+;)$/i);
    if(!acl)continue;
    const functionAcl=/\bon function\s+$/i.test(acl[1]);
    const objects=functionAcl?[...acl[2].matchAll(/((?:public|app_private)\.\w+)\([^)]*\)/g)].filter(m=>shape.wanted.has(m[1])).map(m=>m[0]):acl[2].split(',').map(s=>s.trim()).filter(s=>shape.tables.has(s));
    if(objects.length)try{await db.exec(acl[1]+objects.join(',')+acl[3]);}catch(e){throw new Error('canonical ACL '+file+': '+e.message);}
  }
  await db.exec('set check_function_bodies=on;');
}
