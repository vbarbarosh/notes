const tor = require('./tor');
const yt_dlp = require('./yt_dlp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;
// How often the job may rewrite status.json while a download runs. Progress
// arrives many times per second; the status file is fsynced on every write.
const PROGRESS_INTERVAL = 1000;
// Containers yt-dlp may save each kind of download under. The thumbnails and
// mp3 jobs share files/youtube, so a lookup by id alone would take a
// <id>.jpg or <id>.mp3 for an already downloaded video.
const EXTENSIONS = {
    mp3: ['mp3'],
    video: ['webm', 'mkv', 'mp4'],
};

let last_status_at = 0;
let status_queue = Promise.resolve();

function youtube_download_job(format)
{
    return main(format).catch(async function (error) {
        await write_status({
            status: 'failed',
            user_friendly_status: error.message || 'Failed',
            finished_at: new Date().toJSON(),
        }).catch(() => {});
        await fs.promises.writeFile(path.resolve(process.cwd(), 'error.txt'), error.stack || String(error));
        process.exitCode = 1;
    });
}

async function main(format)
{
    const note_arg = process.argv[2];
    if (!note_arg) {
        throw new Error('Usage: run <note_path>');
    }

    yt_dlp.check_dependencies();

    const app_root = path.resolve(__dirname, '../..');
    const note_root = path.isAbsolute(note_arg) ? note_arg : path.resolve(app_root, note_arg);
    const tmp_root = path.resolve(process.cwd(), 'tmp');
    const files_root = path.resolve(note_root, 'files', 'youtube');

    await fs.promises.mkdir(tmp_root, {recursive: true});
    await fs.promises.mkdir(files_root, {recursive: true});

    await write_status({
        status: 'running',
        user_friendly_status: 'Reading note',
    });

    const body = await fs.promises.readFile(path.resolve(note_root, 'README.md'), 'utf8');
    const ids = extract_youtube_ids(body);
    const created = [];
    const skipped = [];
    const errors = [];

    // Tor, when enabled, is started here and stopped right after the last
    // download. It never outlives the job.
    let tor_session = null;
    if (ids.length && tor.enabled()) {
        await write_status({
            status: 'running',
            user_friendly_status: 'Starting Tor',
        });
        tor_session = await tor.start({
            user_friendly_status: v => user_friendly_status(`Starting Tor: ${v}`),
        });
    }

    try {
        for (let i = 0; i < ids.length; ++i) {
            const id = ids[i];
            const url = `https://www.youtube.com/watch?v=${id}`;

            const prefix = `Downloading ${i + 1}/${ids.length}`;

            await write_status({
                status: 'running',
                user_friendly_status: prefix,
            });

            // The container is yt-dlp's choice, so a download for this id counts
            // whatever extension it was saved under.
            const existing = await find_download(files_root, id, format);
            if (existing) {
                skipped.push(`files/youtube/${existing}`);
                continue;
            }

            try {
                await yt_dlp.download({url, output_template: path.resolve(tmp_root, `${id}.%(ext)s`), format,
                    proxy: tor_session && tor_session.proxy,
                    user_friendly_status: v => user_friendly_status(`${prefix}: ${v}`)});
                const name = await find_download(tmp_root, id, format);
                if (!name) {
                    throw new Error(`yt-dlp wrote no output file for ${id}`);
                }
                const tmp_file = path.resolve(tmp_root, name);
                await assert_nonempty_file(tmp_file);
                await fs.promises.copyFile(tmp_file, path.resolve(files_root, name), fs.constants.COPYFILE_EXCL);
                created.push(`files/youtube/${name}`);
            }
            catch (error) {
                errors.push({
                    id,
                    message: error.message,
                });
            }
        }
    }
    finally {
        if (tor_session) {
            await tor_session.stop();
        }
    }

    await fs.promises.writeFile(path.resolve(process.cwd(), 'output.json'), JSON.stringify({
        created,
        skipped,
        errors,
    }, null, 4));

    if (errors.length) {
        throw new Error(`Created ${created.length}, skipped ${skipped.length}, errors ${errors.length}\n`
            + errors.map(error => `${error.id}: ${error.message}`).join('\n'));
    }

    await write_status({
        status: 'finished',
        user_friendly_status: `Created ${created.length}, skipped ${skipped.length}, errors ${errors.length}`,
        finished_at: new Date().toJSON(),
    });
}

async function assert_nonempty_file(file)
{
    const stat = await fs.promises.stat(file);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error(`Output file is empty: ${file}`);
    }
}

function extract_youtube_ids(body)
{
    const urls = String(body || '').match(URL_PATTERN) || [];
    const seen = new Set();
    const out = [];

    urls.forEach(function (raw_url) {
        const url = raw_url.replace(/[)\].,!?;:]+$/g, '');
        const id = parse_youtube_id(url);
        if (!id || seen.has(id)) {
            return;
        }
        seen.add(id);
        out.push(id);
    });

    return out;
}

function parse_youtube_id(url)
{
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') {
            return clean_youtube_id(parsed.pathname.split('/').filter(Boolean)[0]);
        }

        const is_youtube = host === 'youtube.com' || host.endsWith('.youtube.com');
        const is_youtube_nocookie = host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
        if (!is_youtube && !is_youtube_nocookie) {
            return null;
        }

        if (parsed.pathname === '/watch') {
            return clean_youtube_id(parsed.searchParams.get('v'));
        }

        const parts = parsed.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live'].includes(parts[0])) {
            return clean_youtube_id(parts[1]);
        }
    }
    catch (error) {
    }

    return null;
}

function clean_youtube_id(value)
{
    const id = String(value || '').trim();
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
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
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    await write_file_atomic(file, JSON.stringify({...current, ...patch}, null, 4));
}

// yt-dlp names the file after the container it chose, so look the download up
// by video id and the containers this format can land in, rather than by an
// extension the caller guessed.
async function find_download(dir, id, format)
{
    const extensions = EXTENSIONS[format];
    if (!extensions) {
        throw new Error(`Unsupported YouTube output format: ${format}`);
    }
    const names = await fs.promises.readdir(dir).catch(() => []);
    return names.find(v => extensions.includes(path.extname(v).slice(1)) && path.basename(v, path.extname(v)) === id) || null;
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
            await handler.close().catch(() => {});
        }

        await fs.promises.unlink(tmp).catch(() => {});
        throw error;
    }
}

module.exports = youtube_download_job;
