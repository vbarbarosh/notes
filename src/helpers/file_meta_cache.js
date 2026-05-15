const ffprobe = require('@vbarbarosh/ffmpeg-helpers/src/ffprobe');
const fs_mime = require('./fs_mime');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_safe_relative = require('./fs_path_safe_relative');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');
const fs_read_json = require('@vbarbarosh/node-helpers/src/fs_read_json');
const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rmf_and_prune_empty_dirs = require('./fs_rmf_and_prune_empty_dirs');
const fs_rmrf = require('@vbarbarosh/node-helpers/src/fs_rmrf');
const fs_sha256 = require('./fs_sha256');
const fs_stat = require('@vbarbarosh/node-helpers/src/fs_stat');
const fs_write_json = require('@vbarbarosh/node-helpers/src/fs_write_json');
const json_stringify_stable = require('@vbarbarosh/node-helpers/src/json_stringify_stable');
const sharp = require('sharp');
const shell_json = require('@vbarbarosh/node-helpers/src/shell_json');

const CACHE_VERSION = 2;

async function file_meta_cache({notes_root, notes_meta_root, relative})
{
    const source_file = fs_path_safe_resolve(notes_root, relative);
    const meta_file = fs_path_safe_resolve(notes_meta_root, `${relative}.json`);
    const lstat = await fs_stat(source_file);

    if (!lstat.isFile()) {
        throw Object.assign(new Error('Not Found'), {status: 404});
    }

    const source = {
        size: lstat.size,
        mtime_ms: Math.floor(lstat.mtimeMs),
        relative: fs_path_safe_relative(notes_root, source_file),
    };
    const cached = await read_cached(meta_file, source);
    if (cached) {
        return cached;
    }

    const out = {
        cache_version: CACHE_VERSION,
        sha256: await fs_sha256(source_file),
        mime: await fs_mime(source_file),
        source,
    };

    switch (out.mime) {
    case 'video/mkv':
    case 'video/mp4':
    case 'video/ogv':
    case 'video/webm':
        out.type = 'video';
        out.video = await shell_json(ffprobe(source_file));
        out.video.format.filename = source.relative;
        break;
    case 'audio/ogg':
    case 'audio/mpeg':
        out.type = 'audio';
        out.audio = await shell_json(ffprobe(source_file));
        out.audio.format.filename = source.relative;
        break;
    case 'image/svg+xml':
    case 'image/gif':
    case 'image/png':
    case 'image/jpeg':
        out.type = 'image';
        out.image = await sharp(source_file).metadata();
        break;
    }

    await fs_mkdirp(fs_path_dirname(meta_file));
    await fs_write_json(meta_file, out);

    return out;
}

async function remove_file_meta_cache(notes_meta_root, relative, notes_thumbnails_root = null)
{
    const meta_file = fs_path_safe_resolve(notes_meta_root, `${relative}.json`);

    await fs_rmf_and_prune_empty_dirs(notes_meta_root, meta_file);
    await remove_file_thumbnails(notes_thumbnails_root, relative);
}

async function remove_dir_meta_cache(notes_meta_root, note_uid, notes_thumbnails_root = null)
{
    const meta_dir = fs_path_safe_resolve(notes_meta_root, note_uid);

    await fs_rmrf(meta_dir);
    await remove_dir_thumbnails(notes_thumbnails_root, note_uid);
}

async function read_cached(meta_file, source)
{
    try {
        const meta = await fs_read_json(meta_file);
        if (json_stringify_stable(meta.source) !== json_stringify_stable(source)) {
            return null;
        }
        if (meta.cache_version !== CACHE_VERSION) {
            return null;
        }
        if (meta.source?.size !== source.size || meta.source?.mtime_ms !== source.mtime_ms) {
            return null;
        }
        if (typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(meta.sha256)) {
            return null;
        }
        return meta;
    }
    catch {
        return null;
    }
}

async function remove_file_thumbnails(notes_thumbnails_root, relative)
{
    if (!notes_thumbnails_root) {
        return;
    }

    let sizes;
    try {
        sizes = await fs_readdir(notes_thumbnails_root);
    }
    catch {
        return;
    }

    await Promise.all(sizes.map(async function (size) {
        const size_root = fs_path_safe_resolve(notes_thumbnails_root, size);
        const thumbnail_file = fs_path_safe_resolve(size_root, `notes/${relative}`);
        await fs_rmf_and_prune_empty_dirs(size_root, thumbnail_file);
    }));
}

async function remove_dir_thumbnails(notes_thumbnails_root, note_uid)
{
    if (!notes_thumbnails_root) {
        return;
    }

    let sizes;
    try {
        sizes = await fs_readdir(notes_thumbnails_root);
    }
    catch {
        return;
    }

    await Promise.all(sizes.map(async function (size) {
        const note_thumbnail_dir = fs_path_safe_resolve(notes_thumbnails_root, `${size}/notes/${note_uid}`);
        await fs_rmrf(note_thumbnail_dir);
    }));
}

module.exports = file_meta_cache;
module.exports.remove_file_meta_cache = remove_file_meta_cache;
module.exports.remove_dir_meta_cache = remove_dir_meta_cache;
