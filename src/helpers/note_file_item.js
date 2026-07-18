const file_meta_read_public = require('./file_meta_read_public');
const fs_lstat = require('@vbarbarosh/node-helpers/src/fs_lstat');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');

async function note_file_item({user_dir, note_uid, path, lstat = null})
{
    const notes_root = fs_path_resolve(user_dir, 'notes');
    const source_file = fs_path_resolve(notes_root, note_uid, 'files', path);
    const public_meta = await file_meta_read_public({
        notes_root,
        notes_meta_root: fs_path_resolve(user_dir, 'notes.meta'),
        relative: `${note_uid}/files/${path}`,
    });

    lstat ||= await fs_lstat(source_file);

    return {
        path,
        url: note_file_url(note_uid, path),
        thumbnail_url: public_meta.mime.startsWith('image/') && public_meta.details !== null
            ? `/t/1024/${encodeURIComponent(note_uid)}/files/${encode_path(path)}`
            : null,
        ...public_meta,
        size: lstat.size,
        created_at: lstat.birthtime,
        updated_at: lstat.mtime,
    };
}

function note_file_url(note_uid, path)
{
    return `/api/v1/notes/${encodeURIComponent(note_uid)}/files/${encode_path(path)}`;
}

function encode_path(path)
{
    return path.split('/').map(encodeURIComponent).join('/');
}

module.exports = note_file_item;
module.exports.note_file_url = note_file_url;
