const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rmf = require('@vbarbarosh/node-helpers/src/fs_rmf');
const path = require('path');

const CACHE_VERSION = 'v4';

async function cache_api_notes_invalidate(req, note_uid = null)
{
    await fs_rmf(path.resolve(req.user_dir, 'cache', 'api', CACHE_VERSION, 'notes.json'));
    if (!note_uid) {
        return;
    }

    // Per-note caches are keyed by the note root dir name (`<uid>` or
    // `<uid>-<name>`), while callers may pass just the uid prefix — the same
    // semantics as resolve_note_root_name.
    const notes_cache_dir = path.resolve(req.user_dir, 'cache', 'api', CACHE_VERSION, 'notes');
    let names;
    try {
        names = await fs_readdir(notes_cache_dir);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
    const matched = names.filter(name => name.startsWith(note_uid));
    await Promise.all(matched.map(name => fs_rmf(path.resolve(notes_cache_dir, name))));
}

module.exports = cache_api_notes_invalidate;
