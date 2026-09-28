const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yt_dlp = require('./yt_dlp');

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;
// How often the job may rewrite status.json while a download runs. Progress
// arrives many times per second; the status file is fsynced on every write.
const PROGRESS_INTERVAL = 1000;
// Facebook serves VP9 video and AAC audio as separate streams. Given a list of
// containers, yt-dlp merges this pair into MKV; MP4 carries it and plays in browsers.
const MERGE_OUTPUT_FORMAT = 'mp4';
const EXTENSIONS = ['mp4', 'webm', 'mkv'];
// "9.8K views · 342 reactions | " at the start of a reel title
const COUNTERS_PATTERN = /^(?:[\d.,]+[KMB]?\s+(?:views?|plays?|reactions?|comments?|shares?)\s*·?\s*)+\|\s*/i;

let last_status_at = 0;
let status_queue = Promise.resolve();

function facebook_reel_job()
{
    return main().catch(async function (error) {
        await write_status({
            status: 'failed',
            user_friendly_status: error.message || 'Failed',
            finished_at: new Date().toJSON(),
        }).catch(function () {
        });
        await fs.promises.writeFile(path.resolve(process.cwd(), 'error.txt'), error.stack || String(error));
        process.exitCode = 1;
    });
}

async function main()
{
    const note_arg = process.argv[2];
    if (!note_arg) {
        throw new Error('Usage: run <note_path>');
    }

    yt_dlp.check_dependencies();

    const app_root = path.resolve(__dirname, '../..');
    const note_root = path.isAbsolute(note_arg) ? note_arg : path.resolve(app_root, note_arg);
    const readme_file = path.resolve(note_root, 'README.md');
    const tmp_root = path.resolve(process.cwd(), 'tmp');
    const files_root = path.resolve(note_root, 'files', 'facebook');

    await fs.promises.mkdir(tmp_root, {recursive: true});
    await fs.promises.mkdir(files_root, {recursive: true});

    await write_status({
        status: 'running',
        user_friendly_status: 'Reading note',
    });

    const reels = extract_facebook_reels(await fs.promises.readFile(readme_file, 'utf8'));
    const created = [];
    const skipped = [];
    const texts = [];
    const errors = [];

    for (let i = 0; i < reels.length; ++i) {
        const reel = reels[i];
        const prefix = `Downloading ${i + 1}/${reels.length}`;

        await write_status({
            status: 'running',
            user_friendly_status: prefix,
        });

        // A share link names its reel only once yt-dlp follows it.
        const existing = reel.id && await find_download(files_root, reel.id);
        if (existing) {
            skipped.push(`files/facebook/${existing}`);
            continue;
        }

        try {
            const reel_tmp = path.resolve(tmp_root, String(i + 1));
            await fs.promises.mkdir(reel_tmp, {recursive: true});
            await yt_dlp.download({url: reel.url, output_template: path.resolve(reel_tmp, '%(id)s.%(ext)s'), format: 'video',
                merge_output_format: MERGE_OUTPUT_FORMAT, write_info_json: true, write_thumbnail: true,
                user_friendly_status: v => user_friendly_status(`${prefix}: ${v}`)});
            const info = await read_info_json(reel_tmp);
            const name = await find_download(reel_tmp, info.id);
            if (!name) {
                throw new Error(`yt-dlp wrote no output file for ${info.id}`);
            }
            const already = await find_download(files_root, info.id);
            if (already) {
                skipped.push(`files/facebook/${already}`);
                continue;
            }
            const tmp_file = path.resolve(reel_tmp, name);
            await assert_nonempty_file(tmp_file);
            await fs.promises.copyFile(tmp_file, path.resolve(files_root, name), fs.constants.COPYFILE_EXCL);
            created.push(`files/facebook/${name}`);
            if (await copy_if_missing(path.resolve(reel_tmp, `${info.id}.jpg`), path.resolve(files_root, `${info.id}.jpg`))) {
                created.push(`files/facebook/${info.id}.jpg`);
            }
            const text = reel_text(info);
            if (text && await append_to_note(readme_file, text)) {
                texts.push(text);
            }
        }
        catch (error) {
            errors.push({
                url: reel.url,
                message: error.message,
            });
        }
    }

    await fs.promises.writeFile(path.resolve(process.cwd(), 'output.json'), JSON.stringify({
        created,
        skipped,
        texts,
        errors,
    }, null, 4));

    if (errors.length) {
        throw new Error(`Created ${created.length}, skipped ${skipped.length}, errors ${errors.length}\n`
            + errors.map(v => `${v.url}: ${v.message}`).join('\n'));
    }

    await write_status({
        status: 'finished',
        user_friendly_status: `Created ${created.length}, skipped ${skipped.length}, errors ${errors.length}`,
        finished_at: new Date().toJSON(),
    });
}

function extract_facebook_reels(body)
{
    const urls = String(body || '').match(URL_PATTERN) || [];
    const seen = new Set();
    const out = [];

    for (const raw_url of urls) {
        const reel = parse_facebook_reel(raw_url.replace(/[)\].,!?;:]+$/g, ''));
        if (!reel || seen.has(reel.id || reel.url)) {
            continue;
        }
        seen.add(reel.id || reel.url);
        out.push(reel);
    }

    return out;
}

// facebook.com/reel/<id>, or a share link that redirects to one:
// facebook.com/share/r/<code> and fb.watch/<code>
function parse_facebook_reel(url)
{
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        const parts = parsed.pathname.split('/').filter(Boolean);

        if (host === 'fb.watch') {
            return parts[0] ? {id: null, url: `https://fb.watch/${parts[0]}/`} : null;
        }

        if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) {
            return null;
        }

        if (parts[0] === 'reel' && /^\d+$/.test(parts[1] || '')) {
            return {id: parts[1], url: `https://www.facebook.com/reel/${parts[1]}`};
        }

        if (parts[0] === 'share' && parts[1] === 'r' && parts[2]) {
            return {id: null, url: `https://www.facebook.com/share/r/${parts[2]}/`};
        }
    }
    catch (error) {
    }

    return null;
}

// The reel's caption. Without one, its title, which opens with view and
// reaction counters that change daily.
function reel_text(info)
{
    const description = String(info.description || '').trim();
    if (description) {
        return description;
    }
    return String(info.title || '').replace(/\s+/g, ' ').trim().replace(COUNTERS_PATTERN, '');
}

// Adds `line` as its own paragraph at the end of the note, unless the note
// already has it. Returns whether the note changed.
async function append_to_note(file, line)
{
    const body = await fs.promises.readFile(file, 'utf8');
    if (body.includes(line)) {
        return false;
    }
    await write_file_atomic(file, `${body.trimEnd()}\n\n${line}\n`);
    return true;
}

// yt-dlp may find no thumbnail; the reel is saved without one then.
async function copy_if_missing(src, dst)
{
    try {
        await fs.promises.copyFile(src, dst, fs.constants.COPYFILE_EXCL);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EEXIST') {
            return false;
        }
        throw error;
    }
}

async function read_info_json(dir)
{
    const names = await fs.promises.readdir(dir);
    const name = names.find(v => v.endsWith('.info.json'));
    if (!name) {
        throw new Error('yt-dlp wrote no info JSON');
    }
    return JSON.parse(await fs.promises.readFile(path.resolve(dir, name), 'utf8'));
}

async function find_download(dir, id)
{
    const names = await fs.promises.readdir(dir).catch(() => []);
    return names.find(v => EXTENSIONS.includes(path.extname(v).slice(1)) && path.basename(v, path.extname(v)) === id) || null;
}

async function assert_nonempty_file(file)
{
    const stat = await fs.promises.stat(file);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error(`Output file is empty: ${file}`);
    }
}

// Show the end user what the job is doing right now. Every write is an fsync,
// so progress, which arrives many times per second, is rate-limited here.
function user_friendly_status(s)
{
    const now = Date.now();
    if (now - last_status_at < PROGRESS_INTERVAL) {
        return;
    }
    last_status_at = now;
    write_status({status: 'running', user_friendly_status: s});
}

// Writes are queued so that a progress line reported just before the job ends
// can not land after the final status.
function write_status(patch)
{
    status_queue = status_queue.then(() => write_status_now(patch), () => write_status_now(patch));
    return status_queue;
}

async function write_status_now(patch)
{
    const file = path.resolve(process.cwd(), 'status.json');
    let current = {};
    for (let i = 0; i < 5; ++i) {
        let buf;
        try {
            buf = await fs.promises.readFile(file, 'utf8');
            current = JSON.parse(buf);
            break;
        }
        catch (error) {
            await new Promise(v => setTimeout(v, 20));
        }
    }
    await write_file_atomic(file, JSON.stringify({...current, ...patch}, null, 4));
}

async function write_file_atomic(filename, data, options = {})
{
    const dir = path.dirname(filename);
    const base = path.basename(filename);
    const tmp = path.join(dir, `.${base}.${process.pid}.${crypto.randomUUID()}.tmp`);

    let handler;

    try {
        handler = await fs.promises.open(tmp, 'w', options.mode ?? 0o666);
        await handler.writeFile(data, options);
        await handler.sync();
        await handler.close();
        handler = null;

        await fs.promises.rename(tmp, filename);

        // Best effort: persist directory entry too.
        try {
            const handler = await fs.promises.open(dir, 'r');
            try {
                await handler.sync();
            }
            finally {
                await handler.close();
            }
        }
        catch {
            // Some platforms/filesystems do not allow fsync on directories.
        }
    }
    catch (error) {
        if (handler) {
            await handler.close().catch(function () {
            });
        }

        await fs.promises.unlink(tmp).catch(function () {
        });
        throw error;
    }
}

module.exports = facebook_reel_job;
