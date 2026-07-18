const file_meta_cache = require('./file_meta_cache');
const file_meta_public = require('./file_meta_public');
const fs_mime = require('./fs_mime');
const fs_path_strict_resolve = require('./fs_path_strict_resolve');

async function file_meta_read_public({notes_root, notes_meta_root, relative})
{
    const source_file = fs_path_strict_resolve(notes_root, relative);
    const mime = await fs_mime(source_file);

    // Deep inspection also computes a content hash. Limit it to formats for
    // which the app currently exposes specialized details and thumbnails so a
    // file listing does not read an entire large archive or disk image.
    if (!/^(?:audio|image|video)\//.test(mime)) {
        return {mime, details: null};
    }

    try {
        const meta = await file_meta_cache({notes_root, notes_meta_root, relative});
        return file_meta_public(meta);
    }
    catch {
        return {mime, details: null};
    }
}

module.exports = file_meta_read_public;
