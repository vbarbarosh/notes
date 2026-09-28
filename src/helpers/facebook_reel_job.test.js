const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {promisify} = require('util');

const exec_file = promisify(child_process.execFile);
const app_root = path.resolve(__dirname, '../..');
const reel_id = '1195289147628387';
const title = '9.8K views · 342 reactions | Let the “Slapathon” commence!! 👊👋 | Beast Camp Training';
const description = 'Let the “Slapathon” commence!! 👊👋';

describe('Facebook reel job', function () {
    this.timeout(10000);
    let root;
    let note;
    let job;
    let bin;
    let env;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-facebook-'));
        note = path.join(root, 'note');
        job = path.join(root, 'job');
        bin = path.join(root, 'bin');
        await Promise.all([fs.mkdir(note), fs.mkdir(job), fs.mkdir(bin)]);
        await fs.writeFile(path.join(note, 'README.md'), `reels\nhttps://www.facebook.com/reel/${reel_id}/?mibextid=abc\nhttps://m.facebook.com/reel/${reel_id}\nhttps://www.facebook.com/somepage/about\nhttps://youtu.be/jNQXAC9IVRw\n`);
        await fs.writeFile(path.join(job, 'status.json'), JSON.stringify({uid: 'test-job', note_uid: 'test-note'}));
        env = {...process.env, PATH: `${bin}:${process.env.PATH}`, YT_DLP_PROXY: '', YT_DLP_COOKIES_FILE: '',
            YT_DLP_CONFIG_FILE: '', YT_DLP_FORCE_IPV4: '', YT_DLP_TOR: '', FAKE_DESCRIPTION: description, FAKE_FAIL: ''};
        await fs.writeFile(path.join(bin, 'ffmpeg'), `#!${process.execPath}\nprocess.exit(process.argv[2] === '-version' ? 0 : 1);\n`, {mode: 0o755});
        await fs.writeFile(path.join(bin, 'yt-dlp'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
    console.log('test-yt-dlp');
    process.exit(0);
}
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
if (process.env.FAKE_FAIL) {
    console.error('ERROR: [facebook] ${reel_id}: This video is only available for registered users. login required');
    process.exit(1);
}
// A share link resolves to the reel it points at.
const id = (args.at(-1).match(/reel\\/(\\d+)/) || [])[1] || '${reel_id}';
const template = args[args.indexOf('--output') + 1].replace('%(id)s', id);
fs.writeFileSync(template.replace('%(ext)s', 'info.json'), JSON.stringify({id, title: ${JSON.stringify(title)}, description: process.env.FAKE_DESCRIPTION}));
fs.writeFileSync(template.replace('%(ext)s', 'jpg'), 'thumbnail fixture');
fs.writeFileSync(template.replace('%(ext)s', 'mp4'), 'media fixture');
console.log('[download] 100%');
`, {mode: 0o755});
    });

    afterEach(async function () {
        await fs.rm(root, {recursive: true, force: true});
    });

    async function run() {
        try {
            return {code: 0, ...await exec_file(process.execPath, [path.join(app_root, 'src/jobs/facebook-reel/bin/run'), note], {cwd: job, env})};
        }
        catch (error) {
            return error;
        }
    }

    async function json(name) {
        return JSON.parse(await fs.readFile(path.join(job, name), 'utf8'));
    }

    async function calls() {
        return (await fs.readFile(path.join(job, 'calls.jsonl'), 'utf8')).trim().split('\n').map(v => JSON.parse(v));
    }

    it('downloads a reel with its thumbnail, adds its caption to the note once, and skips it next time', async function () {
        const result = await run();
        assert.equal(result.code, 0, result.stderr);
        assert.equal(await fs.readFile(path.join(note, 'files/facebook', `${reel_id}.mp4`), 'utf8'), 'media fixture');
        assert.equal(await fs.readFile(path.join(note, 'files/facebook', `${reel_id}.jpg`), 'utf8'), 'thumbnail fixture');
        assert.deepEqual(await json('output.json'), {
            created: [`files/facebook/${reel_id}.mp4`, `files/facebook/${reel_id}.jpg`],
            skipped: [],
            texts: [description],
            errors: [],
        });
        const [args] = await calls();
        assert.equal(args.at(-1), `https://www.facebook.com/reel/${reel_id}`);
        assert.equal(args[args.indexOf('--merge-output-format') + 1], 'mp4');
        assert.ok(args.includes('--write-info-json'));
        assert.ok(args.includes('--write-thumbnail'));
        const body = await fs.readFile(path.join(note, 'README.md'), 'utf8');
        assert.ok(body.endsWith(`https://youtu.be/jNQXAC9IVRw\n\n${description}\n`), body);

        assert.equal((await run()).code, 0);
        assert.deepEqual((await json('output.json')).skipped, [`files/facebook/${reel_id}.mp4`]);
        assert.equal((await calls()).length, 1);
        assert.equal(await fs.readFile(path.join(note, 'README.md'), 'utf8'), body);
    });

    it('adds the title without its counters when the reel has no caption', async function () {
        env.FAKE_DESCRIPTION = '';
        assert.equal((await run()).code, 0);
        const body = await fs.readFile(path.join(note, 'README.md'), 'utf8');
        assert.ok(body.endsWith('\n\nLet the “Slapathon” commence!! 👊👋 | Beast Camp Training\n'), body);
    });

    it('follows a share link and skips the reel it points at when already downloaded', async function () {
        await fs.writeFile(path.join(note, 'README.md'), 'https://www.facebook.com/share/r/1AbCdEf/?mibextid=abc and https://fb.watch/xYz12/.');
        assert.equal((await run()).code, 0);
        assert.deepEqual((await calls()).map(v => v.at(-1)), ['https://www.facebook.com/share/r/1AbCdEf/', 'https://fb.watch/xYz12/']);
        const output = await json('output.json');
        assert.deepEqual(output.created, [`files/facebook/${reel_id}.mp4`, `files/facebook/${reel_id}.jpg`]);
        assert.deepEqual(output.skipped, [`files/facebook/${reel_id}.mp4`]);
        assert.equal(await fs.readFile(path.join(note, 'README.md'), 'utf8'), `https://www.facebook.com/share/r/1AbCdEf/?mibextid=abc and https://fb.watch/xYz12/.\n\n${description}\n`);
    });

    it('reports a failed reel without YouTube advice and leaves the note as it was', async function () {
        env.FAKE_FAIL = '1';
        const before = await fs.readFile(path.join(note, 'README.md'), 'utf8');
        const result = await run();
        assert.notEqual(result.code, 0);
        const status = await json('status.json');
        assert.equal(status.status, 'failed');
        assert.match(status.user_friendly_status, /login required/);
        assert.doesNotMatch(status.user_friendly_status, /YouTube/);
        assert.equal(await fs.readFile(path.join(note, 'README.md'), 'utf8'), before);
    });
});
