# Deploying the API

The API is one Node process with no database. It keeps keys (hashed) and daily counters in a JSON file in its state folder.

## Endpoints

| Method | Path | Key | What it does |
| --- | --- | --- | --- |
| GET | `/` | no | the landing page, with a live checker |
| GET | `/v1` | no | this list as JSON |
| POST | `/v1/lint` | no | `{"text": "...", "register": "casual"}` returns tells, human signals and a score |
| POST | `/v1/keys` | no | returns a free key, shown once |
| POST | `/v1/rewrite` | optional | `{"text": "..."}` returns the rewritten text, the changes and any placeholders to fill |
| GET | `/v1/usage` | yes | rewrites left today for this key |
| GET | `/v1/rules` | no | the rule set as JSON |
| GET | `/health` | no | liveness, and whether rewrite is on |

Send the key as `Authorization: Bearer <key>`.

## Limits

Lint has no daily limit. Each address gets 120 lint calls a minute so one script can't crowd everyone else out.

Without a key, each address gets `TELLS_ANON_REWRITES_PER_IP` rewrites a day (default 3). Rewrite stops at whichever comes first:

- `TELLS_KEY_DAILY_REWRITES` per key per UTC day (default 25).
- `TELLS_DAILY_CALLS` model calls for the whole server per UTC day (default 300).
- `TELLS_DAILY_SPEND_USD` for the whole server per UTC day (default 2). Before each call the server reserves a worst-case estimate, so parallel requests can't push it over. A text with no findings never calls the model and doesn't count.

With `TELLS_MODEL_BACKEND=cli`, rewrite runs `claude -p` with tools, MCP servers, slash commands and saved sessions all off, a clean environment and the login in `TELLS_CLI_CONFIG_DIR`. If `TELLS_USAGE_FILE` is set and reads `TELLS_USAGE_MAX_PCT` or more (or can't be read), rewrite answers 503 and lint keeps working.

Keys are capped at 3 per address per day. `TELLS_REWRITE_OFF=1` switches rewrite off and leaves lint running.

## Installing

`deploy/install.sh` shows every step it would take. Run it with `--yes` to do them: build, test, copy to `/opt/tells`, install the systemd unit `tells-api`, add an nginx site for `tells.nexugen.app` on the existing wildcard certificate, then check `/health`.

The nginx block uses an exact `server_name`, which nginx picks over a `*.nexugen.app` wildcard. No other host changes, but it reloads nginx, so the script runs `nginx -t` first and takes the site back out if the test fails.

Before `--yes`:

1. Make sure nothing else already serves the `tells` hostname.
2. Set a model backend in `/etc/tells-api.env`, or keep `TELLS_REWRITE_OFF=1` and ship lint only.
3. The unit runs as the `nexugen` user and may write to the Claude Code config folder. Change `User=` and `ReadWritePaths=` to match your server.

To remove it: `systemctl disable --now tells-api`, delete `/etc/systemd/system/tells-api.service` and `/etc/nginx/sites-enabled/tells`, then `nginx -t && systemctl reload nginx`.
