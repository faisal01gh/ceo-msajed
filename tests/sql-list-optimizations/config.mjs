import path from 'node:path';import {pathToFileURL} from 'node:url';
export const packageRoot=import.meta.dirname;
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
export const repoRoot=path.resolve(arg('--repo-root')||path.resolve(packageRoot,'../..'));
export const outputDir=path.resolve(arg('--output-dir')||(()=>{throw Error('--output-dir required');})());
if(outputDir===repoRoot||outputDir===packageRoot)throw Error('dedicated output directory required');
export const enginePath=path.resolve(arg('--pglite-module')||(()=>{throw Error('--pglite-module required: approved PGlite 0.5.9 public-fs-constants dist/index.js');})());
export const engineURL=pathToFileURL(enginePath).href;
export const migrationPaths=['20261013190200_list_requester_context.sql','20261018182622_list_feedback_context_fusion.sql','20261020193505_list_statement_plan_reuse.sql','20261021194858_list_set_based_feedback_flags.sql'].map(n=>path.join(repoRoot,'supabase/migrations',n));
