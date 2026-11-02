# Weeknote

A shared weekly team workbook with a paper-and-ink interface. Built with React, Vinext and a local Cloudflare D1 database. Kept local as requested.

## Included

- Team dashboard with active tasks, session durations, shared progress, and explicit availability. Syncs every 10 seconds.
- My Work with unfinished work carried forward without resetting its progress or time.
- Weekly task planning, shared assignments, admin editing, deadlines, estimates and blockers.
- One persistent focus timer per member. Completing a shared task closes all its active timers.
- Session budget check-ins with Complete, Pause, and Continue options. Browser notifications are optional and require the app to remain open.
- Individual contribution totals, manual time entries, overlap checks, timer corrections and task history.
- Weekly reports and CSV export. Calendar lateness and effort overruns are separate measurements.
- Optional, removable example tasks and members. Samples never pretend to have live timers.

## Access

Open the app on localhost and create the first admin account with your own name, username and password. There is no default password. Existing task assignments and history are preserved when the previous local administrator profile is claimed during setup.

Sign-in uses Weeknote usernames and passwords. No ChatGPT account is needed. Admins create member accounts, update names and usernames, set or reset passwords, change roles, and deactivate/reactivate accounts in the Admin dashboard. Passwords are salted and hashed; neither admins nor members can view an existing password. Resetting a password revokes all of that member's login sessions and pauses their task timer. Disabling an account preserves its work history. Admins cannot disable themselves or remove their own admin role; database guards preserve the last active admin.

| Action | Admin | Member |
| --- | --- | --- |
| View team dashboard and tasks | Yes | Yes |
| Create, assign, edit or delete tasks | Yes | No |
| Update progress and blockers | Any task | Assigned tasks |
| Track and correct time | Own time | Own time |
| Manage member accounts and passwords | Yes | No |

Owning a shared task does not grant edit or delete permission. These rules are enforced by the API, not only the interface. Login sessions use HTTP-only, same-site cookies, expire after seven days, and are stored hashed in the database. Login attempts are throttled, and account/task mutations check request origin.

## Local development

Use Node 22.13+ (the development environment uses the bundled Node 24 runtime).

1. Install via the Sites `install-dependencies.mjs` helper.
2. Build via Sites `build-site.mjs` to generate the local database configuration.
3. Apply SQL migrations in order with the local Wrangler command in the starter documentation. Migrations `0000` through `0005` are already applied to the current local database. Do not replay applied migrations.
4. Run `bash start-local.sh` (selects the available bundled Node runtime). A local preview may already be running on port 5173.
5. Create your first admin account on the setup screen, then use **Admin → Add member** to provide teammates with their login details. Each member gets their own account and task timer.

Account and workflow tests run against a separate Worker on port 5174 with its own `.wrangler/auth-tests` database. Apply all six migrations there, start Wrangler with `--persist-to .wrangler/auth-tests --port 5174`, run `node scripts/check-accounts.mjs`, then `node scripts/check-workflow.mjs`. The fixture credentials in those scripts belong only to that disposable test database. These tests deliberately never use your normal app/database on port 5173.

The development server binds to localhost. Separate accounts can be tried with different browser profiles on this machine. Access from other team members' computers needs a separately configured network/server deployment; nothing has been published or exposed to the network.

## Conventions and current limits

Weeks start Sunday in Asia/Dhaka. Task progress is manually entered; team progress is the unweighted average of selected-week task progress. Estimated effort is combined person-hours. The Reports time total clips all sessions to the selected week, while task effort comparisons use lifetime task time. Carryovers appear in My Work; historical planned weeks retain the task’s original assignment.

This version does not import historical Excel data, send reminders while closed, offer recurring tasks, or send email invitations. CSV exports open in spreadsheet applications. Polling is used instead of WebSockets. A future version can add pagination for long time histories.

Deployment identity is tracked in `.openai/hosting.json`; use the Sites source and publication workflow to publish changes.

## Changing or recovering an admin login

While signed in, open **Admin**, find your own account, and use **Edit** to change the username or **Reset password** to choose a new password. Both changes sign you out so you can sign back in with the updated details. Passwords may be any non-empty length, including one character; no complexity rules are imposed. Existing passwords are unchanged.

If you forget the only admin password, open a terminal on the computer running Weeknote:

```bash
cd /home/arnab/workspace/projects/apps/weeknote
bash recover-admin.sh
```

The command lists the admin usernames, then asks you to enter and confirm a new password privately. It resets only the selected admin account, clears its login lockout, signs out its sessions, and pauses its running timer. Tasks and work history are preserved. It does not display your old password or change it automatically. No email service or other admin is required.

The app uses the regular, upright Oregano font throughout. The font and its OFL license are bundled in `public/fonts`, so the app does not need Google Fonts access. Previous font comparisons remain at `/font-options.html`.


## Backups, Trash and carryovers

Open **Admin → Backups & restore** for automatic snapshots, **Back up now**, downloads, and full workspace restore. An automatic snapshot is taken on the first authenticated workspace activity each Dhaka calendar day, before task/account changes. It retains the latest 14 daily and 5 manual/recovery snapshots. There is no background schedule while the local app is stopped. Snapshots live in the same database; download copies to a separate device/location for protection against losing the computer/database. Daily backups are recovery points, not a continuous record of every edit. A first-day snapshot can be empty of work entered later that day.

Backup JSON includes account password hashes, members, tasks (including Trash), time records, task history and admin history. It excludes login tokens, login attempt limits and older backups. Keep downloaded files private. Restore validates the format, references and presence of an active admin before writing. It saves a recovery snapshot first, then restores all workspace tables in one D1 transaction. Everyone is signed out; credentials revert to the backup version. Any running session is closed at the backup timestamp and presence is reset. If restoring fails, the transaction leaves existing workspace data intact. The current JSON snapshot limit is 1.8 MB; failed automatic backups are reported to admins, and writes are blocked if the required daily snapshot cannot be saved. Larger datasets need a streaming/provider export before rollout at that size.

**Admin → Trash** restores tasks with their sessions and history. Moving a task to Trash closes all its timers, hides its sessions from active reports and prevents changes until restored. Restoring preserves progress and planned week and leaves all timers stopped. There is no automatic purge or permanent-delete button. Removing the explicitly labelled example workbook remains a permanent cleanup operation and its confirmation explains this.

All four weekly views and CSV exports include tasks planned in that week plus earlier tasks that remained open in that week. A completed carryover stays in its finishing week and disappears from later weeks. The original planned week, deadline, progress, task ID and person-hour records are retained; no duplicate task is made. Progress reflects the latest saved value, not a frozen historical snapshot. Weekly time is clipped to the selected week; estimate comparisons use lifetime person-hours.

Forgotten timer checks appear after four hours without a check-in or at the first Dhaka date change since the start/last check-in. They appear when returning to the app too. Members can complete, pause, confirm they are still working, extend the reminder, or correct the actual end time with a recorded reason. This does not stop a timer automatically or send notifications when the app/browser is closed. Existing planned-time reminders remain independent of the four-hour check.

For older local copies, `node scripts/migrate-safety.mjs` applies the additive `0002` migration once and first saves a consistent SQLite copy in ignored `.local-backups/`. It does not change credentials. Online Cloudflare deployments must apply `drizzle/0002_workspace_safety.sql` after the preceding migrations.

Safety checks: `node scripts/check-safety.mjs` uses in-memory SQLite; `node scripts/check-safety-api.mjs` uses only the disposable test server on port 5174, including an actual full restore. Never change its target to your normal app database.


## Shared note board and private Messages

**Note board** is the shared office wall: everyone can add colorful notes, edit/archive their own notes and restore their own archived notes. Admins can manage all board notes. The board shows up to 200 notes, prioritizing active notes. The adjacent **Board discussion** is visible to the whole signed-in team; everyone can send/edit/remove their own messages, and admins can remove inappropriate shared messages.

**Messages** opens one-to-one conversations. Choose a real teammate (sample members are excluded). All message reads, changes and history cursors are checked server-side against the signed-in participant pair. Admins have no private inbox override in the app. Unread counts appear in navigation and beside senders; opening a visible conversation marks received messages as read. Read status appears to the sender. Disabled accounts cannot sign in or receive new messages; their past conversations stay available. Messages are plain text, with a 3,000-character maximum. Earlier messages load in pages of 50. Updates poll every five seconds while either communication view is open; navigation unread counts refresh with the workspace every ten seconds. No typing indicators, attachments, delivery push notifications, or end-to-end encryption are provided.

Removed messages show a tombstone; the stored original is retained for backups. Private in this context means participant-only access through the app, not secrecy from the database owner: full admin workspace backups include all notes and private message content and must be treated as confidential. The backup screen explicitly states this. Backup format 2 includes the board and all messages. Format 1 files remain restorable, with empty communication tables; restoring one replaces current notes/messages too. Restores are all-or-nothing and revoke login sessions, as before.

`node scripts/migrate-social.mjs` applies the additive `0003` local migration and saves a SQLite recovery copy first. The current normal and isolated QA databases have this migration applied. Apply `drizzle/0003_board_messages.sql` in order when deploying to Cloudflare.

`node scripts/check-social-api.mjs` exercises three-account privacy, server-side moderation/ownership, note archiving, stale edits, unread/read state, duplicate-send protection, conversation pagination, incremental updates of removed older messages, and backup inclusion on the disposable port-5174 database only. The in-memory safety test covers both communication table restores and older backup compatibility.


## Interactive canvas and compact messaging

The board is a 6,000 × 4,000 canvas. Drag empty space to pan; pinch or Ctrl/Command + wheel to zoom, or use the zoom buttons. **Fit notes** brings the visible notes into view. Each person controls their own view. New notes default to 190 × 180 units. Move a note by its grip and resize it using the lower-right handle. Owners/admins can change layout; other members can pan, zoom and read. Handles also support arrow keys (Shift for larger movements); focus the canvas for arrow-key panning, +/− zoom, and 0 to fit. Long note content scrolls inside the paper. Positions and dimensions are saved server-side with revision checks, shared on refresh and included in backups. Note text, authors and existing archive behavior remain intact.

On phones, Messages shows a conversation list; opening one replaces the list with the conversation. The header back arrow returns to the list. The feed scrolls separately from the bottom composer. Message bubbles fit their content, with date separators and compact time/read indicators. A three-dot control beside a message opens its edit/delete menu. Existing author/moderator permissions are unchanged. The active task timer continues while chatting; its floating dock is hidden in the phone chat view to keep the composer reachable.

`node scripts/migrate-canvas.mjs` applies additive migration `0004` after saving a local SQLite recovery copy. It has been applied to the normal and disposable QA databases. Cloudflare deployments need this migration after `0003`. Backup format 3 preserves note geometry; formats 1 and 2 remain supported and receive default note positions and sizes on restore.


## Inline notes, task timing and productivity

Use the floating **+** inside the board to create a draft at the current view center. Type directly into its paper, choose a color and Save. Cancel discards the unsaved draft. Editing an existing note uses the same inline editor, with existing ownership/revision checks. Desktop board space is wider and the adjacent discussion is 270px; smaller screens stack the discussion below the board.

**Start** immediately begins a timed interval. **Pause** closes that interval without changing task progress and leaves a resumable paused state. **Resume** starts the next interval; paused gaps are never counted. **Stop** ends your work immediately and saves time, then offers a progress update. Dismissing that progress prompt leaves the already-saved time intact. A task becomes Done only at 100%. A partial stop does not stop other collaborators; completion stops all task timers. The Stop API saves progress/time atomically when a progress value is supplied and rejects stale revisions without changing time. Paused/stopped end states survive refresh. Time remains the sum of stored session intervals, never a separate manually incremented counter.

Task lists show today's person-hours plus lifetime effort/estimate. **Daily history** opens a task's date-by-date totals and member breakdown, splitting sessions at midnight in Asia/Dhaka. Previous days remain available. Manual additions/corrections use the same records and update these totals. Today is the current Dhaka calendar date, independent of the selected planned week.

The spreadsheet's `week4, Oct, 2026!R5` uses `7*(Q17/Q5)` with `Q17=worked hours + manual adjustment points` and `Q5=total estimated hours`. Reference-sheet examples were independently checked, including 19 worked hours, -3 points and 22 estimated hours = 5.090909091. The app preserves the 7× formula and allows results above 7 or below 0. It shows unavailable (—) when no estimate is present, instead of representing missing estimates as a genuine zero score. Scores are shown next to each live member name and in **Reports → Member productivity**, which also exports scores.

The selected week's score uses that member's person-hours clipped to Sunday–Saturday in Dhaka. The denominator is the sum of estimated shares of tasks in that week's workload, including carryovers. Shared total person-hour estimates are divided equally among assigned members; missing estimates are identified in Reports. Source-sheet adjustments are admin-entered via **Adjust** with a required reason: deadline points in ±5 increments (+5 after two feedbacks and approval, −5 for a missed priority deadline), unfinished low-priority count × −1, unfinished high-priority count × −2, uneven-load day count × −1, and unapproved hours × −0.5. These are not inferred from elapsed time or completion. Reports show the formula and recorded reason; admin activity records changes. Progress remains a separate measure. Historical score inputs reflect current task estimates/assignment, following the existing live-report behavior; reports are not frozen weekly reviews.

`node scripts/migrate-time-scores.mjs` applies additive migration `0005`, first taking a SQLite recovery copy. It has been applied to the normal and disposable QA databases. Cloudflare needs `0005_time_scores.sql` after `0004`. Backup format 4 includes timer end states and score adjustments; earlier formats still restore, defaulting those fields to empty/unset. `check-productivity.mjs` tests workbook examples and date boundaries; `check-time-score-api.mjs` tests shared Pause/Resume/Stop, permissions, stale edits, inline placement and backup inclusion on port 5174 only.
