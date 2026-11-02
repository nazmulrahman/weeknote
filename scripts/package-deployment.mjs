// Small, relocatable deployment artifact. Development dependencies and private data stay outside it.
import {cpSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(root,'../weeknote-deploy');
const built=JSON.parse(readFileSync(path.join(root,'dist/server/wrangler.json'),'utf8'));
mkdirSync(out,{recursive:true});
if(existsSync(path.join(out,'wrangler.json'))&&!existsSync(path.join(out,'.weeknote-deployment')))throw Error('Existing folder is not a Weeknote deployment; refusing to overwrite it.');
const staging=path.join(out,'.app-next');rmSync(staging,{recursive:true,force:true});mkdirSync(staging);
cpSync(path.join(root,'dist/server'),path.join(staging,'server'),{recursive:true,filter:p=>!p.endsWith('/wrangler.json')});
cpSync(path.join(root,'dist/client'),path.join(staging,'client'),{recursive:true});
const old=path.join(out,'.app-old');rmSync(old,{recursive:true,force:true});if(existsSync(path.join(out,'app')))renameSync(path.join(out,'app'),old);renameSync(staging,path.join(out,'app'));rmSync(old,{recursive:true,force:true});
const previous=existsSync(path.join(out,'wrangler.json'))?JSON.parse(readFileSync(path.join(out,'wrangler.json'),'utf8')):{};
const config={name:previous.name||'weeknote',main:'app/server/index.js',compatibility_date:built.compatibility_date,compatibility_flags:built.compatibility_flags,no_bundle:true,rules:built.rules,assets:{directory:'app/client'},workers_dev:true,preview_urls:false,observability:{enabled:true},...(previous.account_id?{account_id:previous.account_id}:{}),d1_databases:previous.d1_databases||[{binding:'DB',database_name:'weeknote-db',database_id:'00000000-0000-4000-8000-000000000000'}]};
writeFileSync(path.join(out,'wrangler.json'),JSON.stringify(config,null,2)+'\n');
writeFileSync(path.join(out,'.weeknote-deployment'),JSON.stringify({source:'../weeknote',builtAt:new Date().toISOString()},null,2)+'\n');
writeFileSync(path.join(out,'.gitignore'),'.wrangler/\n.sites-runtime/\n.env*\n.dev.vars*\n');
writeFileSync(path.join(out,'deploy.sh'),`#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
weeknote_deploy_config="$(pwd)/wrangler.json"
weeknote_source="$(cd ../weeknote && pwd)"
weeknote_node_dir="/home/arnab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
if [ -x "$weeknote_node_dir/node" ]; then export PATH="$weeknote_node_dir:$PATH"; fi
node --input-type=module -e 'import fs from "node:fs";const c=JSON.parse(fs.readFileSync("wrangler.json","utf8"));if(c.d1_databases.some(d=>d.database_id==="00000000-0000-4000-8000-000000000000"))throw Error("Connect the real D1 database before deploying.");'
exec node --import "$weeknote_source/scripts/sites-env.mjs" "$weeknote_source/node_modules/wrangler/bin/wrangler.js" deploy --config "$weeknote_deploy_config" "$@"
`,{mode:0o755});
writeFileSync(path.join(out,'README.md'),`# Weeknote deployment

This folder contains the compiled server, browser assets, Cloudflare configuration and a deploy command. No node_modules, source databases, backups, credentials or private transfer SQL are copied here. The sibling weeknote folder remains the development project.

Publish the prepared build from this folder:

\`\`\`bash
bash deploy.sh
\`\`\`

The command uses Wrangler installed in ../weeknote, so it needs that development folder on this computer. To publish from another computer with Node 22.13+ and Wrangler installed, use \`wrangler deploy --config wrangler.json\`. Sign into the intended Cloudflare account first. This is a prebuilt artifact; no build or large dependency installation is needed in this folder.

After editing the source, rebuild in ../weeknote and run \`node scripts/package-deployment.mjs\` there. Packaging preserves this folder's existing database binding/account. Redeploy the updated artifact with \`bash deploy.sh\`. Do not re-import the initial local database when updating a live app. Online data lives in D1 and survives code deployments.
`);
console.log(out);
