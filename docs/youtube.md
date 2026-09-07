# YouTube downloads on a VPS

The `youtube-video` and `youtube-mp3` jobs read YouTube links from a note and
save media in `files/youtube/<video_id>.<ext>`. Use the note's
**⋯** menu or `POST /api/v1/jobs/youtube-video` with `{"note_uid":"<note_uid>"}`.
Downloads run sequentially within each job. Existing files are skipped; a retry
after partial failure downloads only the missing files.

| Job | Output | Picks |
| --- | --- | --- |
| `youtube-mp3` | `<id>.mp3` | Best audio, converted to MP3. |
| `youtube-video` | usually `<id>.webm` | Best available video plus best audio, muxed into one file. |

`youtube-video` applies no codec preference, so it takes whatever YouTube rates
highest — in practice AV1 video with Opus audio, which lands in WebM. The job
does not force a container: it asks yt-dlp to prefer WebM and then saves the
file under whatever extension yt-dlp actually chose, so an unusual video that
cannot be carried in WebM is still saved correctly rather than being mislabelled.

Max quality means large files; a ten-minute 4K video runs to several hundred MB.
A download is matched by video id, not by extension, so a file fetched under an
earlier version of this job is still recognised and skipped.

## Job progress

While a job runs, its status line reports what the download is actually doing:

```text
Downloading 1/2: 42.00% | [1/2] 4.63MB of 11.03MB at 1.20MB/s ETA 00:12 duration=00:00:09
```

The leading `Downloading 1/2` counts videos found in the note. The `[1/2]` counts
the streams of the current video, because yt-dlp fetches video and audio
separately before merging them. Merging reports as `Merging... duration=…`, and
an enabled Tor client reports its bootstrap percentage the same way.

Progress lines are parsed by `stream_ytdlp_progress` from
`@vbarbarosh/node-helpers`, and delivered through a `user_friendly_status`
callback. Because every status write is fsynced, the job rewrites `status.json`
at most once per second no matter how fast yt-dlp reports.

## Installation

The Docker image installs upstream `yt-dlp[default]` in a Python virtual
environment, including its matching EJS challenge solver. The job explicitly
enables the image's Node runtime. The old image used Debian's yt-dlp package,
which can lag behind YouTube changes, and did not enable Node.

Rebuild and recreate the notes service to pick up these changes:

```sh
docker compose build --pull notes
docker compose up -d notes
docker compose exec notes yt-dlp --version
docker compose exec notes node --version
docker compose exec notes ffmpeg -version
```

`YT_DLP_VERSION` is pinned in the Dockerfile. To update it, change that build
argument's default or use `docker compose build --build-arg
YT_DLP_VERSION=<upstream-release> notes`, then recreate the service. Rebuilding
without changing the pin does not upgrade yt-dlp. Update yt-dlp and its default
dependencies together, as described in the [upstream EJS setup guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

For a non-Docker installation, install ffmpeg, Python with venv support, and a
supported Node runtime (the app image uses Node 24), then:

```sh
python3 -m venv "$HOME/.local/share/notes-yt-dlp"
"$HOME/.local/share/notes-yt-dlp/bin/pip" install --upgrade 'yt-dlp[default]'
export PATH="$HOME/.local/share/notes-yt-dlp/bin:$PATH"
npm start
```

Set that PATH in the service manager too if the app runs as a service. Your login
shell, app service, and container may each find a different yt-dlp installation.
Each download job logs its actual yt-dlp, ffmpeg, and Node versions.

## PC works, VPS fails

First compare the exact error and versions on both machines using the same
video. A working PC does not establish that the VPS has the same dependencies,
network access, or YouTube session.

| Error | Next step |
| --- | --- |
| Missing runtime, challenge solving failure, or unknown `--js-runtimes` option | Rebuild with a current upstream yt-dlp plus matching EJS scripts. |
| “Sign in to confirm you're not a bot” or HTTP 429 | YouTube is challenging or blocking the IP/session. Stop repeated retries; test an outbound connection that is known to work using `YT_DLP_PROXY`, or try `YT_DLP_TOR=true` and rerun for new circuits. Cookies can help with a session challenge but do not guarantee access from a blocked server IP. |
| HTTP 403 or PO Token warning | Check current yt-dlp, the outbound IP/session, and [YouTube's PO Token requirements](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). A 403 alone does not identify the cause. |
| Sign-in required, age restriction, or expired cookies | Supply a fresh YouTube cookies file for an account with access. |
| Connection timeout / network unreachable | Check VPS outbound connectivity, DNS, and proxy reachability. Try `YT_DLP_FORCE_IPV4=true` if IPv6 is broken. |

Upstream explains [IP blocks and proxy selection](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#http-error-429-too-many-requests-or-402-payment-required)
and [YouTube sessions and cookies](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).
Changing download flags cannot guarantee that YouTube will accept a particular
datacenter IP. The proxy must route both extraction and media downloads through
a working connection. A reverse proxy in front of this app, such as authwall,
does not change its outbound IP.

## Operator configuration

The bundled Compose file forwards these environment variables to the jobs:

| Variable | Purpose |
| --- | --- |
| `YT_DLP_PROXY` | HTTP/HTTPS/SOCKS proxy URL, e.g. `socks5://proxy-host:1080`. |
| `YT_DLP_TOR` | Set to `true` or `1` to route downloads through a Tor client that the job starts and stops itself. Mutually exclusive with `YT_DLP_PROXY`. Default: off. |
| `YT_DLP_COOKIES_FILE` | Absolute path **inside the container** to a Netscape-format cookies file. |
| `YT_DLP_CONFIG_FILE` | Absolute path inside the container to a trusted yt-dlp config file for advanced extractor/PO Token options. |
| `YT_DLP_FORCE_IPV4` | Set to `true` or `1` to force IPv4. Default: off. |

For a proxy, create a local `.env` (ignored by git):

```dotenv
YT_DLP_PROXY=socks5://proxy-host:1080
```

Use a proxy you control or trust. In Docker, `localhost` is the notes container,
so use an address reachable from that container. The setting applies to all
YouTube jobs in this app instance.

### On-demand Tor

`YT_DLP_TOR=true` routes YouTube downloads through Tor without running a Tor
service. The job starts a Tor client when it has videos to fetch, waits for
bootstrap, downloads through it, and stops it when the last download ends.
Nothing listens between jobs, and an idle container has no Tor process.

```dotenv
YT_DLP_TOR=true
```

The client binds a SOCKS port on loopback only, chosen by the OS, and is given a
fresh data directory that is deleted when the job ends. Two jobs can therefore
run at once without sharing a port or a Tor identity. The job passes yt-dlp a
`socks5h://` URL, so DNS is resolved inside Tor rather than by the container.
`tor` is installed in the image but is never started by the image itself.

Costs and caveats:

* Each job pays one bootstrap, normally a few seconds, before the first
  download. Nothing is cached between jobs.
* YouTube challenges a substantial share of Tor exits. In local testing 4 of 6
  exits served the same video and 2 returned the bot challenge, so a failure
  here does not mean Tor is broken; the job simply used a challenged exit. The
  job does not rotate exits or retry on its own — run it again to get new
  circuits.
* Downloads through Tor are slower and the exit is shared with other users.
* `YT_DLP_TOR` and `YT_DLP_PROXY` cannot both be set; the job fails immediately
  with a configuration error rather than silently picking one.
* Cookies are still sent if `YT_DLP_COOKIES_FILE` is configured. Sending account
  cookies over Tor ties that account to the download and forfeits the anonymity
  Tor provides. Leave cookies unset when using Tor unless you specifically want
  that trade-off.

For cookies, export **YouTube-only** cookies following the [upstream instructions](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).
Store the file at `secrets/youtube-cookies.txt`, outside the app's served data
directory. Cookie files grant access to their session; account use with yt-dlp
also carries an upstream-documented account restriction risk. Only configure an
account whose access you intend to make available to users of this instance.

Create `docker-compose.override.yaml` (also ignored by git):

```yaml
services:
  notes:
    volumes:
      - ./secrets/youtube-cookies.txt:/run/secrets/youtube-cookies.txt:ro
    environment:
      YT_DLP_COOKIES_FILE: /run/secrets/youtube-cookies.txt
```

Ensure the source is a file and the container's `node` user (UID 1000) can read
it. Keep it private to that user. The job makes a private writable temporary
copy because yt-dlp updates its cookie jar, and removes that copy on normal
success or failure. The source remains unchanged. A forcibly killed process can
leave a copy in that job's `tmp/cookies-*` directory; remove it before sharing
job directories or backups.

Advanced configuration uses the same read-only mount pattern with
`YT_DLP_CONFIG_FILE`. Automatic user/system yt-dlp configuration is disabled for
predictable job behavior. This explicit config is administrator-controlled and
supports yt-dlp options, including extractor arguments. Avoid output-changing
options, `--exec`, verbose logging of secrets, or cookie paths in that config;
use `YT_DLP_COOKIES_FILE` for isolated writable cookies. PO Token provider plugins,
if required, must be installed separately in `/opt/yt-dlp`'s environment or through
yt-dlp's plugin directories; a config file alone does not install them.

After configuration changes, run `docker compose up -d notes` to recreate the
container with the new environment/mounts. Restarting alone does not apply new
Compose environment variables.

## Logs and reproduction

The existing job directories contain `stdout.log`, `stderr.log`, `status.json`,
`output.json`, and (on failure) `error.txt`. Authenticated users' jobs live under
their user data directory. `output.json` lists created files, skipped files, and
per-video errors; any failed download makes the overall job fail while retaining
successful attachments. Standard job output redacts the configured proxy URL
and URL credentials; review logs before sharing custom verbose output.

For a direct network/runtime check without downloading media:

```sh
docker compose exec notes yt-dlp --ignore-config --js-runtimes node \
  --simulate --no-playlist --socket-timeout 30 'https://www.youtube.com/watch?v=VIDEO_ID'
```

This direct command tests the default connection; the custom `YT_DLP_*` variables
are interpreted by the app's job wrapper, not by the yt-dlp CLI itself. To test
the exact app configuration, create a note with one link and launch its job.
Successful simulation verifies extraction only: the actual media request may
still be rejected, so verify an MP4/MP3 attachment as well.
