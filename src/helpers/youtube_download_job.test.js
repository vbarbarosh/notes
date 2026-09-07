const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {promisify} = require('util');

const exec_file = promisify(child_process.execFile);
const app_root = path.resolve(__dirname, '../..');
const first_id = 'jNQXAC9IVRw';
const second_id = 'aqz-KE-bpKQ';

describe('YouTube download jobs', function () {
    this.timeout(10000);
    let root;
    let note;
    let job;
    let bin;
    let env;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-youtube-'));
        note = path.join(root, 'note');
        job = path.join(root, 'job');
        bin = path.join(root, 'bin');
        await Promise.all([fs.mkdir(note), fs.mkdir(job), fs.mkdir(bin)]);
        await fs.writeFile(path.join(note, 'README.md'), `https://youtu.be/${first_id}\nhttps://www.youtube.com/watch?v=${first_id}`);
        await fs.writeFile(path.join(job, 'status.json'), JSON.stringify({uid: 'test-job', note_uid: 'test-note'}));
        env = {...process.env, PATH: `${bin}:${process.env.PATH}`, YT_DLP_PROXY: '', YT_DLP_COOKIES_FILE: '',
            YT_DLP_CONFIG_FILE: '', YT_DLP_FORCE_IPV4: '', YT_DLP_TOR: '', FAKE_FAIL_ID: '', FAKE_NO_OUTPUT: '',
            FAKE_CHECK_COOKIE: '', FAKE_SLOW: ''};
        await fs.writeFile(path.join(bin, 'ffmpeg'), `#!${process.execPath}\nprocess.exit(process.argv[2] === '-version' ? 0 : 1);\n`, {mode: 0o755});
        await fs.writeFile(path.join(bin, 'tor'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
    console.log('Tor version test-tor.');
    process.exit(0);
}
fs.writeFileSync('tor-args.json', JSON.stringify(args));
process.on('SIGTERM', function () {
    fs.writeFileSync('tor-stopped.txt', 'stopped');
    process.exit(0);
});
console.log('[notice] Opened Socks listener connection (ready) on 127.0.0.1:19050');
console.log('[notice] Bootstrapped 100% (done): Done');
setInterval(function () {}, 1000);
`, {mode: 0o755});
        await fs.writeFile(path.join(bin, 'yt-dlp'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
    console.log('test-yt-dlp');
    process.exit(0);
}
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
if (process.env.FAKE_CHECK_COOKIE) {
    const cookie = args[args.indexOf('--cookies') + 1];
    const original = fs.readFileSync(cookie, 'utf8');
    if (original !== 'test cookies' || (fs.statSync(cookie).mode & 0o777) !== 0o600) {
        throw new Error('Cookie copy content or permissions incorrect');
    }
    fs.writeFileSync(cookie, 'updated cookies');
}
if (process.env.FAKE_FAIL_ID && args.at(-1).includes(process.env.FAKE_FAIL_ID)) {
    const message = "ERROR: Sign in to confirm you’re not a bot " + process.env.YT_DLP_PROXY;
    process.stderr.write(message.slice(0, -5));
    setImmediate(function () {
        process.stderr.write(message.slice(-5) + '\\n');
        process.exitCode = 1;
    });
}
else if (!process.env.FAKE_NO_OUTPUT) {
    // Real yt-dlp output, as parsed by @vbarbarosh/node-helpers. The merge is
    // emitted after the download, exactly as yt-dlp orders them.
    console.log('[info] test: Downloading 2 format(s): 401+251');
    console.log('[download] Destination: /tmp/test.f401.webm');
    console.log('[download]  42.0% of   11.03MiB at    1.20MiB/s ETA 00:12');
    const slow = Number(process.env.FAKE_SLOW || 0);
    if (slow) {
        // Hold the job open so the test can observe the live status.
        setTimeout(function () {
            console.log('[Merger] Merging formats into "/tmp/test.mkv"');
            setTimeout(finish, slow);
        }, slow);
    }
    else {
        console.log('[Merger] Merging formats into "/tmp/test.mkv"');
        finish();
    }
}
function finish() {
    const template = args[args.indexOf('--output') + 1];
    const ext = args.includes('--extract-audio') ? 'mp3' : args[args.indexOf('--merge-output-format') + 1];
    fs.writeFileSync(template.replace('%(ext)s', ext), 'media fixture');
    console.log('[download] 100%');
}
`, {mode: 0o755});
    });

    afterEach(async function () {
        await fs.rm(root, {recursive: true, force: true});
    });

    async function run(name = 'youtube-video')
    {
        try {
            return {code: 0, ...await exec_file(process.execPath, [path.join(app_root, 'src/jobs', name, 'bin/run'), note], {cwd: job, env})};
        }
        catch (error) {
            return error;
        }
    }

    async function json(name)
    {
        return JSON.parse(await fs.readFile(path.join(job, name), 'utf8'));
    }

    it('downloads one MP4 per distinct video, keeps job identity, and skips existing outputs', async function () {
        const result = await run();
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /test-yt-dlp/);
        assert.match(result.stdout, /\[download\] 100%/);
        assert.equal(await fs.readFile(path.join(note, 'files/youtube', `${first_id}.mp4`), 'utf8'), 'media fixture');
        assert.deepEqual(await json('output.json'), {created: [`files/youtube/${first_id}.mp4`], skipped: [], errors: []});
        assert.equal((await json('status.json')).uid, 'test-job');
        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.ok(args.includes('--no-playlist'));
        assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
        assert.equal(args[args.indexOf('--remux-video') + 1], 'mp4');
        assert.equal((await run()).code, 0);
        assert.deepEqual((await json('output.json')).skipped, [`files/youtube/${first_id}.mp4`]);
        assert.equal((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim().split('\n').length, 1);
    });

    it('preserves the MP3 job and its output path', async function () {
        const result = await run('youtube-mp3');
        assert.equal(result.code, 0, result.stderr);
        assert.deepEqual((await json('output.json')).created, [`files/youtube/${first_id}.mp3`]);
        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.ok(args.includes('--extract-audio'));
        assert.ok(!args.includes('--remux-video'));
    });

    it('uses a writable private cookie copy, forwards operator settings, and removes the copy', async function () {
        const cookies = path.join(root, 'cookies.txt');
        const config = path.join(root, 'yt-dlp.conf');
        await fs.writeFile(cookies, 'test cookies', {mode: 0o400});
        await fs.writeFile(config, '# operator config');
        Object.assign(env, {YT_DLP_COOKIES_FILE: cookies, YT_DLP_CONFIG_FILE: config,
            YT_DLP_PROXY: 'socks5://user:secret@localhost:1080', YT_DLP_FORCE_IPV4: 'true', FAKE_CHECK_COOKIE: '1'});
        const result = await run();
        assert.equal(result.code, 0, result.stderr);
        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.ok(args.includes('--force-ipv4'));
        assert.equal(args[args.indexOf('--proxy') + 1], env.YT_DLP_PROXY);
        assert.equal(args[args.indexOf('--config-locations') + 1], config);
        const copy = args[args.indexOf('--cookies') + 1];
        assert.notEqual(copy, cookies);
        await assert.rejects(fs.stat(copy), {code: 'ENOENT'});
        assert.equal(await fs.readFile(cookies, 'utf8'), 'test cookies');
    });

    it('reports partial failure, retains successes, redacts credentials, and cleans cookies on failure', async function () {
        await fs.appendFile(path.join(note, 'README.md'), `\nhttps://youtu.be/${second_id}`);
        env.FAKE_FAIL_ID = second_id;
        env.YT_DLP_PROXY = 'http://user:very-secret@proxy.example:8080';
        env.YT_DLP_COOKIES_FILE = path.join(root, 'cookies.txt');
        await fs.writeFile(env.YT_DLP_COOKIES_FILE, 'test cookies');
        const result = await run();
        assert.equal(result.code, 1);
        const output = await json('output.json');
        assert.deepEqual(output.created, [`files/youtube/${first_id}.mp4`]);
        assert.equal(output.errors[0].id, second_id);
        assert.match(output.errors[0].message, /YT_DLP_PROXY/);
        assert.equal((await json('status.json')).status, 'failed');
        const logs = [result.stdout, result.stderr, JSON.stringify(output), JSON.stringify(await json('status.json')),
            await fs.readFile(path.join(job, 'error.txt'), 'utf8')].join('\n');
        assert.ok(!logs.includes('very-secret'));
        assert.ok(!(await fs.readdir(path.join(job, 'tmp'))).some(v => v.startsWith('cookies-')));
    });

    it('rejects a missing configured cookie file before contacting YouTube', async function () {
        env.YT_DLP_COOKIES_FILE = path.join(root, 'missing.txt');
        assert.equal((await run()).code, 1);
        assert.match((await json('status.json')).user_friendly_status, /YT_DLP_COOKIES_FILE is not a readable file/);
        await assert.rejects(fs.stat(path.join(job, 'calls.jsonl')), {code: 'ENOENT'});
    });

    it('does not claim success when yt-dlp produces no file', async function () {
        env.FAKE_NO_OUTPUT = '1';
        assert.equal((await run()).code, 1);
        assert.equal((await json('status.json')).status, 'failed');
        assert.deepEqual((await json('output.json')).created, []);
        await assert.rejects(fs.stat(path.join(note, 'files/youtube', `${first_id}.mp4`)), {code: 'ENOENT'});
    });

    it('reports live download progress into status.json instead of a frozen line', async function () {
        env.FAKE_SLOW = '1500';
        const pending = run();
        let seen = null;
        for (let i = 0; i < 60 && !seen; ++i) {
            await new Promise(resolve => setTimeout(resolve, 50));
            const status = await json('status.json').catch(() => ({}));
            if (/\d%/.test(status.user_friendly_status || '')) {
                seen = status.user_friendly_status;
            }
        }
        assert.equal((await pending).code, 0);
        assert.match(seen, /^Downloading 1\/1: 42\.00% \| \[1\/2\] 4\.63MB of 11\.03MB at 1\.20MB\/s ETA 00:12 duration=\d\d:\d\d:\d\d$/);
    });

    it('reports the merge step and counts the parts of a multi-format download', async function () {
        env.FAKE_SLOW = '1500';
        const pending = run();
        const seen = [];
        for (let i = 0; i < 60 && !seen.some(v => /Merging/.test(v)); ++i) {
            await new Promise(resolve => setTimeout(resolve, 50));
            const status = await json('status.json').catch(() => ({}));
            const text = status.user_friendly_status || '';
            if (text && seen.at(-1) !== text) {
                seen.push(text);
            }
        }
        assert.equal((await pending).code, 0);
        assert.ok(seen.some(v => /\[1\/2\]/.test(v)), seen.join(' | '));
        assert.ok(seen.some(v => /^Downloading 1\/1: Merging\.\.\. duration=\d\d:\d\d:\d\d$/.test(v)), seen.join(' | '));
    });

    it('downloads max quality as a single MKV holding video and audio', async function () {
        const result = await run('youtube-video-max');
        assert.equal(result.code, 0, result.stderr);
        assert.deepEqual((await json('output.json')).created, [`files/youtube/${first_id}.mkv`]);
        assert.equal(await fs.readFile(path.join(note, 'files/youtube', `${first_id}.mkv`), 'utf8'), 'media fixture');
        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.equal(args[args.indexOf('--format') + 1], 'bv*+ba/b');
        assert.equal(args[args.indexOf('--merge-output-format') + 1], 'mkv');
        assert.equal(args[args.indexOf('--remux-video') + 1], 'mkv');
    });

    it('starts Tor for the job, routes yt-dlp through it, then stops it and drops its data directory', async function () {
        env.YT_DLP_TOR = 'true';
        const result = await run();
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /\[tor\] .*Bootstrapped 100%/);
        assert.deepEqual((await json('output.json')).created, [`files/youtube/${first_id}.mp4`]);

        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.equal(args[args.indexOf('--proxy') + 1], 'socks5h://127.0.0.1:19050');

        // The client must not outlive the job, and must leave nothing behind.
        assert.equal(await fs.readFile(path.join(job, 'tor-stopped.txt'), 'utf8'), 'stopped');
        const tor_args = await json('tor-args.json');
        const data_dir = tor_args[tor_args.indexOf('--DataDirectory') + 1];
        assert.ok(data_dir.includes('notes-tor-'), data_dir);
        await assert.rejects(fs.stat(data_dir), {code: 'ENOENT'});
    });

    it('tells the operator to rerun for new circuits when a Tor exit is challenged', async function () {
        env.YT_DLP_TOR = 'true';
        env.FAKE_FAIL_ID = first_id;
        assert.equal((await run()).code, 1);
        const output = await json('output.json');
        assert.match(output.errors[0].message, /YouTube challenged this Tor exit/);
        assert.doesNotMatch(output.errors[0].message, /YT_DLP_PROXY/);
        assert.equal(await fs.readFile(path.join(job, 'tor-stopped.txt'), 'utf8'), 'stopped');
    });

    it('does not start Tor when YT_DLP_TOR is off', async function () {
        assert.equal((await run()).code, 0);
        await assert.rejects(fs.stat(path.join(job, 'tor-args.json')), {code: 'ENOENT'});
        const args = JSON.parse((await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim());
        assert.ok(!args.includes('--proxy'));
    });

    it('refuses to run when YT_DLP_TOR and YT_DLP_PROXY are both set', async function () {
        env.YT_DLP_TOR = 'true';
        env.YT_DLP_PROXY = 'socks5://user:very-secret@localhost:1080';
        assert.equal((await run()).code, 1);
        assert.match((await json('status.json')).user_friendly_status, /YT_DLP_TOR and YT_DLP_PROXY are both set/);
        await assert.rejects(fs.stat(path.join(job, 'calls.jsonl')), {code: 'ENOENT'});
        await assert.rejects(fs.stat(path.join(job, 'tor-args.json')), {code: 'ENOENT'});
    });

    it('fails early when an installed dependency cannot run', async function () {
        await fs.writeFile(path.join(bin, 'ffmpeg'), `#!${process.execPath}\nprocess.exit(1);\n`, {mode: 0o755});
        assert.equal((await run()).code, 1);
        assert.match((await json('status.json')).user_friendly_status, /ffmpeg is missing or cannot start/);
        await assert.rejects(fs.stat(path.join(job, 'calls.jsonl')), {code: 'ENOENT'});
    });
});
