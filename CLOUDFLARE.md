# Weeknote on your own Cloudflare account

Status: the account is authenticated, the production database has been initialized from the local workspace, and the Worker is published at https://weeknote.nyza.workers.dev. The account subdomain was changed to nyza and deployment was confirmed; HTTPS activation for the renamed hostname is pending. The prior hostname passed login/API checks. Existing user credentials were preserved; an actual member sign-in still needs to be checked by the account owner. The clean deployment artifact is ../weeknote-deploy (about 2 MB); development dependencies and private transfer files stay in this folder.

## Sign in

Use your own Cloudflare account on the Free plan. From this checkout:

```bash
bash cloudflare-login.sh
```

The command opens Cloudflare's login/authorization page. Complete that authorization yourself. Do not share your password or an API token in chat. If the browser does not open automatically, use the URL printed in your terminal. After successful authorization, the deployment can continue from this chat.

## Deployment sequence

1. Create a fresh `weeknote-db` D1 database in the authenticated account. Use an empty target to preserve any unrelated databases.
2. Build the latest app and run `node scripts/prepare-cloudflare.mjs --database-id <real-D1-UUID>`; specify `--account-id <account-ID>` when the account is ambiguous. The generated config is ignored in `.cloudflare/wrangler.json`. This leaves the starter/Sites identity and local development binding unchanged.
3. Take a consistent local database recovery copy. Import the six migrations (`0000` through `0005`) and the actual local workspace into the new remote database before publishing. Preserve members, account password hashes, tasks, note geometry, messages and score adjustments. Exclude login tokens/attempt limits; pause any copied running timers at the transfer timestamp. Verify an active admin and initialized setup marker exist in the remote data: first-admin setup is intentionally localhost-only, so publishing an empty database would not give a working online login.
4. Dry-run the generated Worker deployment. Deploy using `wrangler deploy --config .cloudflare/wrangler.json` only after the database is initialized and verified. Keep the Workers Free plan; this process does not authorize a paid upgrade or paid domain.
5. Verify the published HTTPS page, username/password login, member/admin permissions, a timer and persistence. Share the verified `workers.dev` address with the team. Once the online database becomes the shared source, use that URL for team work; the old local database is a separate copy.

The initial address uses Cloudflare's `workers.dev` subdomain, so a purchased domain is optional. Hosting and D1 have free quotas; monitor actual usage in Cloudflare. The app keeps its own username/password login; teammates do not need Cloudflare or ChatGPT accounts. The deployment URL is not available until publishing succeeds.

## Updating the clean deployment folder

Rebuild the source, run `node scripts/package-deployment.mjs`, then run `bash deploy.sh` in ../weeknote-deploy. Do not repeat the initial database import for updates. `deployment.json` records the current URL/target. The deploy helper uses Wrangler from the sibling development project; the deployment folder itself does not contain node_modules.
