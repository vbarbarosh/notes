const child_process = require('child_process');
const format_seconds = require('@vbarbarosh/node-helpers/src/format_seconds');
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');
const stream = require('stream');
const stream_each = require('@vbarbarosh/node-helpers/src/stream_each');
const stream_ytdlp_progress = require('@vbarbarosh/node-helpers/src/stream_ytdlp_progress');
const tor = require('./tor');

function check_dependencies()
{
    const commands = [['yt-dlp', ['--ignore-config', '--version']], ['ffmpeg', ['-version']]];
    if (tor.enabled()) {
        commands.push(['tor', ['--version']]);
    }
    for (const [command, args] of commands) {
        const result = child_process.spawnSync(command, args, {encoding: 'utf8', timeout: 15000});
        if (result.error || result.status !== 0) {
            throw new Error(`${command} is missing or cannot start. Rebuild the Docker image or install the dependencies in docs/youtube.md.`);
        }
        console.log((result.stdout || '').split('\n')[0]);
    }
    console.log(`YouTube JavaScript runtime: Node ${process.version}`);
}

async function download({url, output_template, format, proxy, user_friendly_status})
{
    const env = process.env;
    // Jobs have a different working directory from the app and should not pick
    // up incidental per-user configuration. Operators can opt in explicitly.
    const args = ['--ignore-config'];
    let cookies_dir;
    try {
        if (env.YT_DLP_CONFIG_FILE) {
            await require_readable_file(env.YT_DLP_CONFIG_FILE, 'YT_DLP_CONFIG_FILE');
            args.push('--config-locations', env.YT_DLP_CONFIG_FILE);
        }
        if (env.YT_DLP_COOKIES_FILE) {
            await require_readable_file(env.YT_DLP_COOKIES_FILE, 'YT_DLP_COOKIES_FILE');
            // yt-dlp writes its cookie jar on exit. Give each invocation a private
            // writable copy so read-only mounts and concurrent jobs both work.
            const tmp_root = path.resolve(process.cwd(), 'tmp');
            await fs.mkdir(tmp_root, {recursive: true});
            cookies_dir = await fs.mkdtemp(path.join(tmp_root, 'cookies-'));
            await fs.chmod(cookies_dir, 0o700);
            const cookies_file = path.join(cookies_dir, 'cookies.txt');
            await fs.writeFile(cookies_file, await fs.readFile(env.YT_DLP_COOKIES_FILE), {mode: 0o600});
            args.push('--cookies', cookies_file);
        }
        // A per-job Tor client, when enabled, supplies the proxy instead of
        // the operator's fixed YT_DLP_PROXY.
        if (proxy || env.YT_DLP_PROXY) {
            args.push('--proxy', proxy || env.YT_DLP_PROXY);
        }
        if (['true', '1'].includes(env.YT_DLP_FORCE_IPV4)) {
            args.push('--force-ipv4');
        }
        args.push(
            '--js-runtimes', `node:${process.execPath}`,
            '--no-playlist', '--no-simulate',
            '--newline', '--no-colors', '--no-cache-dir', '--progress',
            '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3',
            '--abort-on-unavailable-fragments',
        );
        if (format === 'mp3') {
            args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
        }
        else if (format === 'mp4') {
            // Prefer H.264/AAC for playback in the app, without CPU-heavy encoding.
            args.push('--format', 'bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
                '--merge-output-format', 'mp4', '--remux-video', 'mp4');
        }
        else if (format === 'mkv') {
            // Highest quality streams whatever their codec. Matroska can carry
            // any combination, including the AV1/Opus that mp4 handles poorly.
            args.push('--format', 'bv*+ba/b',
                '--merge-output-format', 'mkv', '--remux-video', 'mkv');
        }
        else {
            throw new Error(`Unsupported YouTube output format: ${format}`);
        }
        args.push('--output', output_template, '--', url);
        await run(args, user_friendly_status);
    }
    finally {
        if (cookies_dir) {
            await fs.rm(cookies_dir, {recursive: true, force: true});
        }
    }
}

async function require_readable_file(file, name)
{
    if (!path.isAbsolute(file)) {
        throw new Error(`${name} must be an absolute path inside the running app/container.`);
    }
    try {
        await fs.access(file, require('fs').constants.R_OK);
        if (!(await fs.stat(file)).isFile()) {
            throw new Error('Not a file');
        }
    }
    catch {
        throw new Error(`${name} is not a readable file. Check its mount and permissions for the app user.`);
    }
}

function redact(value)
{
    let text = String(value);
    if (process.env.YT_DLP_PROXY) {
        text = text.split(process.env.YT_DLP_PROXY).join('[configured proxy]');
    }
    return text.replace(/\b((?:https?|socks5h?):\/\/)[^\s/@]+@/gi, '$1[redacted]@');
}

function failure_hint(text)
{
    if (/sign in to confirm.*not a bot|HTTP Error 429|Too Many Requests/i.test(text)) {
        if (tor.enabled()) {
            // Each job gets fresh circuits, and only some exits are challenged.
            return 'YouTube challenged this Tor exit. Run the job again to draw new circuits; the job does not rotate exits by itself. See docs/youtube.md.';
        }
        return 'YouTube blocked or challenged this IP/session. A VPS may need a working outbound proxy (YT_DLP_PROXY) or YT_DLP_TOR; cookies alone may not resolve an IP block. See docs/youtube.md.';
    }
    if (/JavaScript runtime|challenge solving|n challenge|nsig|yt-dlp-ejs|no such option: --js-runtimes/i.test(text)) {
        return 'Update yt-dlp together with its default dependencies and enable Node. Rebuild the Docker image; see docs/youtube.md.';
    }
    if (/HTTP Error 403|PO Token|po_token/i.test(text)) {
        return 'YouTube denied the media request. Check the outbound IP/session and current PO Token requirements in docs/youtube.md.';
    }
    if (/sign in|login required|cookies.*expired|age.restricted/i.test(text)) {
        return 'This video requires a valid YouTube session. Configure a fresh YT_DLP_COOKIES_FILE; see docs/youtube.md.';
    }
    return '';
}

function run(args, user_friendly_status)
{
    return new Promise(function (resolve, reject) {
        const proc = child_process.spawn('yt-dlp', args, {stdio: ['ignore', 'pipe', 'pipe']});
        const time0 = Date.now();
        let tail = '';

        // Reuse the shared yt-dlp progress parser, but feed it the redacted
        // lines rather than the raw stream so credentials can not slip through.
        const progress = new stream.PassThrough();
        stream.promises.pipeline(progress, stream_ytdlp_progress(), stream_each(report)).catch(() => {});

        function report(v)
        {
            if (!user_friendly_status) {
                return;
            }
            const duration = format_seconds((Date.now() - time0) / 1000);
            if (v.merging) {
                user_friendly_status(`Merging... duration=${duration}`);
            }
            else {
                user_friendly_status(`${v.perc} | [${v.current_part}/${v.total_parts}] ${v.done} of ${v.total} at ${v.speed} ETA ${v.eta} duration=${duration}`);
            }
        }

        // Forward output to the existing job logs; retain only a bounded tail in
        // memory. Line buffering also keeps split proxy credentials redacted.
        for (const [source, target] of [[proc.stdout, process.stdout], [proc.stderr, process.stderr]]) {
            const lines = readline.createInterface({input: source, crlfDelay: Infinity});
            lines.on('line', function (line) {
                const safe_line = redact(line);
                target.write(safe_line + '\n');
                tail = (tail + safe_line + '\n').slice(-16384);
                progress.write(safe_line + '\n');
            });
        }

        proc.once('error', function (error) {
            progress.end();
            reject(new Error(`Cannot start yt-dlp: ${error.code || 'unknown error'}. Check the app/container installation.`));
        });
        proc.once('close', function (code, signal) {
            progress.end();
            if (code === 0) {
                resolve();
                return;
            }
            const detail = tail.trim() || `yt-dlp exited with code ${code}${signal ? ` and signal ${signal}` : ''}`;
            reject(new Error([failure_hint(detail), detail].filter(Boolean).join('\n')));
        });
    });
}

module.exports = {check_dependencies, download};
