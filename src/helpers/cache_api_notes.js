const cache_api = require('./cache_api');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');

function cache_api_notes(req, note_uid, build)
{
    return cache_api(cache_api_notes_path(req, note_uid), build);
}

function cache_api_notes_path(req, note_uid)
{
    if (!note_uid) {
        return `${req.user_dir}/cache/api/notes.json`;
    }
    return fs_path_safe_resolve(`${req.user_dir}/cache/api/notes`, `${note_uid}.json`);
}

module.exports = cache_api_notes;
