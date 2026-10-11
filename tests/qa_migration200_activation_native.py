"""Native TEST ONLY: full official Migration200 fails atomically on a clean DB."""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import time
from qa_local_section_fixture import MIGRATIONS, LocalMigrationManifest, digest, extract_official_section

HOST='127.0.0.1'
PORT=51771
BASE='qa_isolation_durable_fence_20261009'
DATA='/home/faisal/ceo-msajed-qa-checkpoints/2026-10-09-durable-fence-blocked/run-wsl-20261009/pgdata'
PSQL='/usr/lib/postgresql/16/bin/psql'
ENV={'PATH':'/usr/bin:/bin','HOME':'/home/faisal','PGAPPNAME':'qa-migration200-negative','PGCONNECT_TIMEOUT':'5'}

def command(database, sql=None, file=None):
    args=[PSQL,'-X','-q','-w','-h',HOST,'-p',str(PORT),'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At']
    if file is not None:
        args.extend(['-f',str(file)])
    return subprocess.run(args,input=sql,env=ENV,capture_output=True,text=True,timeout=20)

def query(database, sql):
    p=command(database,sql=sql)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout.strip()

def identity(database):
    r=json.loads(query(database,"SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'user',current_user,'data_directory',current_setting('data_directory'),'foreign_servers',(SELECT count(*) FROM pg_foreign_server),'other_clients',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()),'nonloopback',(SELECT count(*) FROM pg_stat_activity WHERE client_addr IS NOT NULL AND client_addr NOT IN ('127.0.0.1'::inet,'::1'::inet)));"))
    assert r=={'database':database,'host':HOST,'port':PORT,'user':'postgres','data_directory':DATA,'foreign_servers':0,'other_clients':0,'nonloopback':0},r
    return r

CATALOG="""SELECT json_build_object(
 'schemas',(SELECT json_agg(to_jsonb(n) ORDER BY oid) FROM pg_namespace n WHERE nspname IN ('auth','public','app_private')),
 'relations',(SELECT json_agg(to_jsonb(c) ORDER BY oid) FROM pg_class c WHERE relnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('auth','public','app_private'))),
 'functions',(SELECT json_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE pronamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('auth','public','app_private'))),
 'triggers',(SELECT json_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('auth','public','app_private')))),
 'policies',(SELECT json_agg(to_jsonb(p) ORDER BY oid) FROM pg_policy p WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('auth','public','app_private')))));
"""

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--full-sha',required=True);args=ap.parse_args()
    repo=pathlib.Path(__file__).resolve().parents[1];out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
    source=repo/'supabase/migrations'/MIGRATIONS[6];raw=source.read_bytes();extracted=extract_official_section(raw,args.full_sha)
    pins={name:digest((repo/'supabase/migrations'/name).read_bytes()) for name in MIGRATIONS}
    before_base=identity(BASE);name='qa_local_200_guard_'+str(int(time.time()))+'_'+str(os.getpid());assert len(name)<63
    assert query(BASE,"SELECT count(*) FROM pg_database WHERE datname='"+name+"';")=='0'
    query(BASE,'CREATE DATABASE "'+name+'" TEMPLATE template0;')
    oid=int(query(BASE,"SELECT oid FROM pg_database WHERE datname='"+name+"' AND datdba='postgres'::regrole;"))
    receipt={'database':name,'oid':oid,'owner':'postgres','created_by':'this exact native negative test'}
    (out/'CLEAN_DATABASE_CUSTODY.json').write_text(json.dumps(receipt,indent=2))
    report={}
    try:
        target=identity(name);manifest=LocalMigrationManifest(out/'FULL200_NEGATIVE_MANIFEST.json',target,pins)
        before=json.loads(query(name,CATALOG));assert not before['relations'] and not before['functions']
        result=command(name,file=source);(out/'FULL200_NATIVE_NEGATIVE.stderr.txt').write_text(result.stderr)
        assert result.returncode!=0 and '55000' in result.stderr and 'qa_enforcement_not_ready:' in result.stderr,result.stderr
        after=json.loads(query(name,CATALOG));assert before==after,'full migration changed fresh catalog/data'
        assert source.read_bytes()==raw,'full file drift during test'
        extract_official_section(source.read_bytes(),args.full_sha)
        manifest.record(MIGRATIONS[6],'full',extracted.full_sha256,'blocked_by_activation_guard',extracted.section_sha256)
        report={'status':'PASS','full_apply_status':'blocked_by_activation_guard','local_verifiable_section_status':'not_applied','sqlstate':'55000','full_sha256':extracted.full_sha256,'section_sha256':extracted.section_sha256,'barrier_sha256':extracted.barrier_sha256,'barrier_bytes_unchanged':True,'catalog_before_after_equal':True,'data_before_after_equal':True,'effect_after_barrier':False,'target_identity':target}
    finally:
        identity(BASE)
        assert int(query(BASE,"SELECT oid FROM pg_database WHERE datname='"+name+"' AND datdba='postgres'::regrole;"))==oid
        assert query(BASE,"SELECT count(*) FROM pg_stat_activity WHERE datname='"+name+"';")=='0'
        query(BASE,'DROP DATABASE "'+name+'";')
        assert query(BASE,"SELECT count(*) FROM pg_database WHERE datname='"+name+"';")=='0'
        report['owned_clean_database_removed']=True
        (out/'FULL200_NATIVE_NEGATIVE_RESULT.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))

if __name__=='__main__':
    main()
