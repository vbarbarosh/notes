const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');
const fs_prune_empty_dirs = require('./fs_prune_empty_dirs');
const fs_read_json = require('@vbarbarosh/node-helpers/src/fs_read_json');
const fs_rmf_and_prune_empty_dirs = require('./fs_rmf_and_prune_empty_dirs');
const fs_rmrf = require('@vbarbarosh/node-helpers/src/fs_rmrf');
const fs_sha256 = require('./fs_sha256');
const fs_stat = require('@vbarbarosh/node-helpers/src/fs_stat');
const fs_write_json = require('@vbarbarosh/node-helpers/src/fs_write_json');

const CACHE_VERSION = 1;

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
    };
    const cached = await read_cached(meta_file, source);
    if (cached) {
        return cached;
    }

    const meta = {
        cache_version: CACHE_VERSION,
        sha256: await fs_sha256(source_file),
        source,
    };

    await fs_mkdirp(fs_path_dirname(meta_file));
    await fs_write_json(meta_file, meta);

    return meta;
}

async function remove_file_meta_cache(notes_meta_root, relative)
{
    const meta_file = fs_path_safe_resolve(notes_meta_root, `${relative}.json`);

    await fs_rmf_and_prune_empty_dirs(notes_meta_root, meta_file);
}

async function remove_dir_meta_cache(notes_meta_root, note_uid)
{
    const meta_dir = fs_path_safe_resolve(notes_meta_root, note_uid);

    await fs_rmrf(meta_dir);
}

async function read_cached(meta_file, source)
{
    try {
        const meta = await fs_read_json(meta_file);
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

module.exports = file_meta_cache;
module.exports.remove_file_meta_cache = remove_file_meta_cache;
module.exports.remove_dir_meta_cache = remove_dir_meta_cache;
