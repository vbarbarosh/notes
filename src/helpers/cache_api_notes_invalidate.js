const fs_rmf = require('@vbarbarosh/node-helpers/src/fs_rmf');
const path = require('path');

async function cache_api_notes_invalidate(req, note_uid = null)
{
    await fs_rmf(path.resolve(req.user_dir, 'cache', 'api', 'notes.json'));
    if (note_uid) {
        await fs_rmf(path.resolve(req.user_dir, 'cache', 'api', 'notes', `${note_uid}.json`));
    }
}

module.exports = cache_api_notes_invalidate;
