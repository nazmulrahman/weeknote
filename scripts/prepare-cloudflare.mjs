// Prepares a direct deployment to the owner's Cloudflare account; does not publish.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const databaseId=arg('--database-id'),accountId=arg('--account-id'),name=arg('--name')||'weeknote';
if(!/^[a-f0-9-]{36}$/.test(databaseId||'')||databaseId==='00000000-0000-4000-8000-000000000000')throw Error('Pass the real Cloudflare D1 UUID with --database-id. No deployment was made.');
if(accountId&&!/^[a-f0-9]{32}$/.test(accountId))throw Error('Invalid --account-id.');
if(!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(name))throw Error('Use a lowercase Worker name containing letters, numbers and hyphens.');
const source=path.join(root,'dist/server/wrangler.json'),built=JSON.parse(readFileSync(source,'utf8')),base=path.dirname(source);
const config={name,main:path.resolve(base,built.main),compatibility_date:built.compatibility_date,compatibility_flags:built.compatibility_flags,no_bundle:built.no_bundle,rules:built.rules,assets:{...built.assets,directory:path.resolve(base,built.assets.directory)},workers_dev:true,preview_urls:false,observability:{enabled:true},d1_databases:[{binding:'DB',database_name:'weeknote-db',database_id:databaseId}],...(accountId?{account_id:accountId}:{})};
const directory=path.join(root,'.cloudflare');mkdirSync(directory,{recursive:true,mode:0o700});
const output=path.join(directory,'wrangler.json');writeFileSync(output,JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('Prepared '+output+'. This command did not create resources or publish the app.');
