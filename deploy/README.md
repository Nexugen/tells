# Deploying the API

The API is one Node process with no database. It keeps keys (hashed) and daily counters in a JSON file in its state folder.

## Endpoints

| Method | Path | Key | What it does |
| --- | --- | --- | --- |
| POST | `/v1/lint` | no | `{"text": "...", "register": "casual"}` returns findings and a score |
| POST | `/v1/keys` | no | returns a free key, shown once |
| POST | `/v1/rewrite` | yes | `{"text": "..."}` returns the rewritten text and the changes |
| GET | `/v1/usage` | yes | rewrites left today for this key |
| GET | `/v1/rules` | no | the rule set as JSON |
| GET | `/health` | no | liveness, and whether rewrite is on |

Send the key as `Authorization: Bearer <key>`.

## Limits

Lint has no daily limit. Each address gets 120 lint calls a minute so one script can't take the box down.

Rewrite stops at whichever comes first:

- `TELLS_KEY_DAILY_REWRITES` per key per UTC day (default 25).
- `TELLS_DAILY_SPEND_USD` for the whole server per UTC day (default 2). Before each call the server reserves a worst-case estimate, so parallel requests can't push it over. A text with no findings never calls the model and doesn't count.

Keys are capped at 3 per address per day. `TELLS_REWRITE_OFF=1` switches rewrite off and leaves lint running.

## On this box

`deploy/install.sh` shows every step it would take. Run it with `--yes` to do them: build, test, copy to `/opt/tells`, install the systemd unit `tells-api`, add an nginx site for `tells.nexugen.app` on the existing wildcard certificate, then check `/health`.

The nginx block uses an exact `server_name`, which nginx picks over the platform's `*.nexugen.app` wildcard. No other host changes, but it still reloads the shared nginx, so run `nginx -t` first (the script does).

Before `--yes`:

1. Make sure nothing else already serves the `tells` hostname.
2. Put an API key with credit in `/etc/tells-api.env`, or keep `TELLS_REWRITE_OFF=1` and ship lint only.

To remove it: `systemctl disable --now tells-api`, delete `/etc/systemd/system/tells-api.service` and `/etc/nginx/sites-enabled/tells`, then `nginx -t && systemctl reload nginx`.
