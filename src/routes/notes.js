const Promise = require('bluebird');
const UserFriendlyError = require('@vbarbarosh/node-helpers/src/errors/UserFriendlyError');
const cache_api_notes = require('../helpers/cache_api_notes');
const cache_api_notes_invalidate = require('../helpers/cache_api_notes_invalidate');
const file_meta_cache = require('../helpers/file_meta_cache');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_lstat = require('@vbarbarosh/node-helpers/src/fs_lstat');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_strict_resolve = require('../helpers/fs_path_strict_resolve');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_path_safe_relative = require('../helpers/fs_path_safe_relative');
const fs_prune_empty_dirs = require('../helpers/fs_prune_empty_dirs');
const fs_read_utf8 = require('@vbarbarosh/node-helpers/src/fs_read_utf8');
const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rename = require('@vbarbarosh/node-helpers/src/fs_rename');
const fs_rmf = require('@vbarbarosh/node-helpers/src/fs_rmf');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');
const fs_write_over_file = require('../helpers/fs_write_over_file');
const fs_write_unique_file = require('../helpers/fs_write_unique_file');
const multer = require('multer');
const note_file_item = require('../helpers/note_file_item');

const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, callback) {
            const dir = `${req.user_dir}/temp-uploads`;
            fs_mkdirp(dir).then(() => callback(null, dir), callback);
        },
    }),
    defParamCharset: 'utf8',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
    },
    preservePath: true,
});

const routes = [
    {req: 'GET /api/v1/notes', fn: notes_list},
    {req: 'GET /api/v1/notes/:note_uid/files', fn: notes_files_list},
    {req: 'HEAD /api/v1/notes/:note_uid/files/*', fn: notes_file_fetch},
    {req: 'GET /api/v1/notes/:note_uid/files/*', fn: notes_file_fetch},
    {req: 'GET /api/v1/notes/:note_uid', fn: notes_fetch},
    {req: 'POST /api/v1/notes', fn: notes_create},
    {req: 'POST /api/v1/notes/:note_uid/files', fn: [upload.array('file'), notes_upload_file]},
    {req: 'PATCH /api/v1/notes/:note_uid', fn: notes_update},
    {req: 'PUT /api/v1/notes/:note_uid/files/*', fn: [upload.single('file'), notes_file_put]},
    {req: 'PATCH /api/v1/notes/:note_uid/files/*', fn: notes_file_move},
    {req: 'DELETE /api/v1/notes/:note_uid', fn: notes_remove},
    {req: 'DELETE /api/v1/notes/:note_uid/files/*', fn: notes_remove_file},
];

// GET /api/v1/notes
async function notes_list(req, res)
{
    res.send(await cache_api_notes(req, null, () => read_notes_list(req)));
}

async function read_notes_list(req)
{
    const d = `${req.user_dir}/notes`;
    if (!await fs_exists(d)) {
        await fs_mkdirp(d);
    }
    const names = await fs_readdir(d);
    const items = await Promise.all(names.map(v => cache_api_notes(req, v, () => read_note(req, v))));

    return {items: items.sort((b, a) => fcmp_strings_ascii(a.uid, b.uid))};
}

// GET /api/v1/notes/:note_uid
async function notes_fetch(req, res)
{
    const note_root_name = await resolve_note_root_name(req, req.params.note_uid);
    const note = await cache_api_notes(req, note_root_name, () => read_note(req, note_root_name));
    res.send(note);
}

// GET /api/v1/notes/:note_uid/files
async function notes_files_list(req, res)
{
    const note_root_name = await resolve_note_root_name(req, req.params.note_uid);
    const note = await cache_api_notes(req, note_root_name, () => read_note(req, note_root_name));
    res.send({items: note.files});
}

// GET|HEAD /api/v1/notes/:note_uid/files/*
async function notes_file_fetch(req, res)
{
    const target = await resolve_note_file_target(req);
    if (!await file_exists(target.file_path)) {
        res.status(404).send('File Not Found');
        return;
    }

    res.sendFile(target.file_path);
}

// POST /api/v1/notes
async function notes_create(req, res)
{
    const name = req.body.name;
    const body = req.body.body.toString().trim() + '\n';

    const uid = now_fs();
    const dir_name = uid;
    const dir_path = `${req.user_dir}/notes/${dir_name}`;

    await fs_mkdirp(dir_path);
    await fs_write(`${dir_path}/README.md`, body);
    await cache_api_notes_invalidate(req);

    res.status(201).json({uid, name, prefix: `/r/${dir_name}/`});
}

// POST /api/v1/notes/:note_uid/files | file=@/path/to/file
// POST /api/v1/notes/:note_uid/files?overwrite=1 | file=@/path/to/file
async function notes_upload_file(req, res)
{
    const file = req.files?.[0];

    if (!file) {
        res.status(400).send('No file was provided');
        return;
    }

    const note_uid = await resolve_note_root_name(req, req.params.note_uid);
    const meta_root = `${req.user_dir}/notes.meta`;
    const d = `${req.user_dir}/notes/${note_uid}`;
    const files_root = fs_path_resolve(d, 'files');
    const overwrite = request_overwrite(req);
    const file_path = overwrite
        ? await fs_write_over_file(files_root, file)
        : await fs_write_unique_file(files_root, file);

    const lstat = await fs_lstat(file_path);
    const path = fs_path_safe_relative(files_root, file_path);
    if (overwrite) {
        await file_meta_cache.remove_file_meta_cache(meta_root, `${note_uid}/files/${path}`, `${req.user_dir}/thumbnails`);
    }
    await cache_api_notes_invalidate(req, note_uid);
    res.send(await note_file_item({user_dir: req.user_dir, note_uid, path, lstat}));
}

// PUT /api/v1/notes/:note_uid/files/* | file=@/path/to/file
async function notes_file_put(req, res)
{
    const file = req.file;
    if (!file) {
        res.status(400).send('No file was provided');
        return;
    }

    let target;
    try {
        target = await resolve_note_file_target(req);
    }
    catch (error) {
        await fs_rmf(file.path);
        throw error;
    }

    const exists = await fs_exists(target.file_path);
    if (exists && !await file_exists(target.file_path)) {
        await fs_rmf(file.path);
        res.status(409).send('A directory exists at the requested path');
        return;
    }

    try {
        await fs_mkdirp(fs_path_dirname(target.file_path));
        await fs_rename(file.path, target.file_path);
    }
    catch (error) {
        await fs_rmf(file.path);
        throw error;
    }

    await file_meta_cache.remove_file_meta_cache(
        `${req.user_dir}/notes.meta`,
        `${target.note_uid}/files/${target.path}`,
        `${req.user_dir}/thumbnails`,
    );
    await cache_api_notes_invalidate(req, target.note_uid);

    const item = await note_file_item({user_dir: req.user_dir, note_uid: target.note_uid, path: target.path});
    res.location(item.url).status(exists ? 200 : 201).send(item);
}

// PATCH /api/v1/notes/:note_uid/files/* body={path}
async function notes_file_move(req, res)
{
    const source = await resolve_note_file_target(req);
    if (!await file_exists(source.file_path)) {
        res.status(404).send('File Not Found');
        return;
    }

    const destination_path = make_file_path(req.body?.path);
    const destination_file = fs_path_strict_resolve(source.files_root, destination_path);
    if (destination_file === source.file_path) {
        res.send(await note_file_item({user_dir: req.user_dir, note_uid: source.note_uid, path: source.path}));
        return;
    }
    if (await fs_exists(destination_file)) {
        res.status(409).send('Destination already exists');
        return;
    }

    const meta_root = `${req.user_dir}/notes.meta`;
    const thumbnails_root = `${req.user_dir}/thumbnails`;
    await file_meta_cache.remove_file_meta_cache(meta_root, `${source.note_uid}/files/${source.path}`, thumbnails_root);
    await file_meta_cache.remove_file_meta_cache(meta_root, `${source.note_uid}/files/${destination_path}`, thumbnails_root);

    await fs_mkdirp(fs_path_dirname(destination_file));
    await fs_rename(source.file_path, destination_file);
    await fs_prune_empty_dirs(source.files_root, fs_path_dirname(source.file_path));
    await cache_api_notes_invalidate(req, source.note_uid);

    res.send(await note_file_item({
        user_dir: req.user_dir,
        note_uid: source.note_uid,
        path: destination_path,
    }));
}

// PATCH /api/v1/notes/:note_uid body=xxx
async function notes_update(req, res)
{
    const note_uid = req.params.note_uid;
    const body = req.body.body.toString().trim() + '\n';

    const d = `${req.user_dir}/notes/${note_uid}`;

    if (!await fs_exists(`${d}/README.md`)) {
        res.status(404).send('Note not found');
        return;
    }

    await fs_write(`${d}/README.md`, body);
    await cache_api_notes_invalidate(req, note_uid);
    res.status(204).send();
}

// DELETE /api/v1/notes/:note_uid
async function notes_remove(req, res)
{
    const note_uid = req.params.note_uid;

    const meta_root = `${req.user_dir}/notes.meta`;
    await fs_mkdirp(`${req.user_dir}/trash-bin`);
    await fs_rename(`${req.user_dir}/notes/${note_uid}`, `${req.user_dir}/trash-bin/${now_fs()}-${note_uid}`);
    await file_meta_cache.remove_dir_meta_cache(meta_root, note_uid, `${req.user_dir}/thumbnails`);
    await cache_api_notes_invalidate(req, note_uid);

    res.send();
}

// DELETE /api/v1/notes/:note_uid/files/*
async function notes_remove_file(req, res)
{
    const source = await resolve_note_file_target(req);
    const meta_root = `${req.user_dir}/notes.meta`;
    const target = `${req.user_dir}/trash-bin/${now_fs()}-${source.note_uid}/files/${source.path}`;

    if (!await file_exists(source.file_path)) {
        res.status(404, 'File Not Found').send();
        return;
    }

    await fs_mkdirp(fs_path_dirname(target));
    await fs_rename(source.file_path, target);
    await fs_prune_empty_dirs(source.files_root, fs_path_dirname(source.file_path));
    await file_meta_cache.remove_file_meta_cache(meta_root, `${source.note_uid}/files/${source.path}`, `${req.user_dir}/thumbnails`);
    await cache_api_notes_invalidate(req, source.note_uid);
    res.send();
}

async function resolve_note_file_target(req)
{
    const note_uid = await resolve_note_root_name(req, req.params.note_uid);
    const path = make_file_path(req.params[0]);
    const files_root = fs_path_resolve(req.user_dir, 'notes', note_uid, 'files');
    return {
        note_uid,
        path,
        files_root,
        file_path: fs_path_strict_resolve(files_root, path),
    };
}

function make_file_path(value)
{
    try {
        value = typeof value === 'string' ? value : '';
        fs_path_strict_resolve('/files', value);
        return value;
    }
    catch {
        throw new UserFriendlyError('Invalid file path');
    }
}

async function file_exists(path)
{
    try {
        return (await fs_lstat(path)).isFile();
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function resolve_note_root_name(req, note_uid)
{
    const d = `${req.user_dir}/notes`;
    const names = await fs_readdir(d);
    const out = names.find(name => name.startsWith(note_uid));
    if (out) {
        return out;
    }
    throw new UserFriendlyError(`Not found ${note_uid}`);
}

async function read_note(req, note_root_name)
{
    const d = `${req.user_dir}/notes`;
    const lstat = await fs_lstat(`${d}/${note_root_name}`);

    let i = note_root_name.indexOf('-');
    if (i === -1) {
        i = note_root_name.length;
    }

    const files = [];
    if (await fs_exists(`${d}/${note_root_name}/files`)) {
        await fs_walk(`${d}/${note_root_name}/files`, async function (lstat, path) {
            files.push(await note_file_item({
                user_dir: req.user_dir,
                note_uid: note_root_name,
                path,
                lstat,
            }));
        });
    }
    files.sort(function (a, b) {
        return (str_count(b.path, '/') - str_count(a.path, '/')) || fcmp_strings_ascii(a.path, b.path);
    });

    return {
        uid: note_root_name.slice(0, i),
        name: note_root_name.slice(i + 1),
        body: await fs_read_utf8(`${d}/${note_root_name}/README.md`),
        prefix: `/r/${note_root_name}/`,
        files,
        created_at: lstat.birthtime,
        updated_at: lstat.ctime,
    };
}

async function fs_walk(root, callback)
{
    const lifo = [];
    lifo.push('');
    while (lifo.length > 0) {
        const name1 = lifo.pop();
        const lstat = await fs_lstat(`${root}/${name1}`);
        if (lstat.isDirectory()) {
            const names = await fs_readdir(`${root}/${name1}`);
            names.forEach(name2 => lifo.push(`${name1}/${name2}`));
        }
        else {
            await callback(lstat, name1.slice(1));
        }
    }
}

function request_overwrite(req)
{
    return req.query?.overwrite === '1' || req.body?.overwrite === '1' || req.body?.overwrite === 1;
}

function now_fs()
{
    const now = new Date();
    return [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        'xx',
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
    ].map(n => n.toString().padStart(2, '0')).join('').replace('xx', '_');
}

function fcmp_strings_ascii(a, b)
{
    return a < b ? -1 : a > b ? 1 : 0;
}

function str_count(str, ch)
{
    return str.split(ch).length - 1;
}

module.exports = routes;
