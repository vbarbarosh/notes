const Promise = require('bluebird');
const UserFriendlyError = require('@vbarbarosh/node-helpers/src/errors/UserFriendlyError');
const cache_api_notes = require('../helpers/cache_api_notes');
const cache_api_notes_invalidate = require('../helpers/cache_api_notes_invalidate');
const file_meta_cache = require('../helpers/file_meta_cache');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_lstat = require('@vbarbarosh/node-helpers/src/fs_lstat');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_path_safe_relative = require('../helpers/fs_path_safe_relative');
const fs_path_safe_resolve = require('../helpers/fs_path_safe_resolve');
const fs_read_utf8 = require('@vbarbarosh/node-helpers/src/fs_read_utf8');
const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rename = require('@vbarbarosh/node-helpers/src/fs_rename');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');
const fs_write_over_file = require('../helpers/fs_write_over_file');
const fs_write_unique_file = require('../helpers/fs_write_unique_file');
const multer = require('multer');
const sharp = require('sharp');

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
    {req: 'GET /api/v1/notes.json', fn: notes_list},
    {req: 'GET /api/v1/notes/:note_uid', fn: notes_fetch},
    {req: 'POST /api/v1/notes', fn: notes_create},
    {req: 'POST /api/v1/notes/:note_uid/files', fn: [upload.array('file'), notes_upload_file]},
    {req: 'PATCH /api/v1/notes/:note_uid', fn: notes_update},
    {req: 'DELETE /api/v1/notes/:note_uid', fn: notes_remove},
    {req: 'DELETE /api/v1/notes/:note_uid/files/*', fn: notes_remove_file},
];

// GET /api/v1/notes.json
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
    const items = await Promise.all(names.map(v => read_note(req, v)));

    return {items: items.sort((b, a) => fcmp_strings_ascii(a.uid, b.uid))};
}

// GET /api/v1/notes/:note_uid
async function notes_fetch(req, res)
{
    const note_root_name = await resolve_note_root_name(req, req.params.note_uid);
    const note = await cache_api_notes(req, note_root_name, () => read_note(req, note_root_name));
    res.send(note);
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
    const note_uid = req.params.note_uid;
    const file = req.files?.[0];

    if (!file) {
        res.status(400).send('No file was provided');
        return;
    }

    const meta_root = `${req.user_dir}/notes.meta`;
    const d = `${req.user_dir}/notes/${note_uid}`;
    if (!await fs_exists(d)) {
        res.status(404).send('Note Not Found');
        return;
    }

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
    const url = `/r/${note_uid}/files/${path}`;
    const thumbnail_url = await is_image(file.buffer) ? `/t/1024/${note_uid}/files/${path}` : null ;
    res.send({
        path,
        url,
        thumbnail_url,
        size: lstat.size,
        created_at: lstat.birthtime,
        updated_at: lstat.mtime,
    });
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
    const note_uid = req.params.note_uid;

    const meta_root = `${req.user_dir}/notes.meta`;
    const files_root = `${req.user_dir}/notes/${note_uid}/files`;
    const path = fs_path_safe_resolve(files_root, req.params[0]);
    const relative = fs_path_safe_relative(files_root, path);
    const source = `${files_root}/${relative}`;
    const target = `${req.user_dir}/trash-bin/${now_fs()}-${note_uid}/files/${relative}`;

    if (!await fs_exists(source)) {
        res.status(404, 'File Not Found').send();
        return;
    }

    await fs_mkdirp(fs_path_dirname(target));
    await fs_rename(source, target);
    await file_meta_cache.remove_file_meta_cache(meta_root, `${note_uid}/files/${relative}`, `${req.user_dir}/thumbnails`);
    await cache_api_notes_invalidate(req, note_uid);
    res.send();
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
            const url = `/r/${note_root_name}/files/${path}`;
            const relative = `${note_root_name}/files/${path}`;
            const media = await read_file_media_meta(req, relative);
            const thumbnail_url = media.image ? `/t/1024/${note_root_name}/files/${path}` : null;
            files.push({
                path,
                url,
                thumbnail_url,
                image: media.image,
                audio: media.audio,
                video: media.video,
                size: lstat.size,
                created_at: lstat.birthtime,
                updated_at: lstat.mtime,
            });
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

async function is_image(path_or_buffer)
{
    try {
        await sharp(path_or_buffer).metadata();
        return true;
    }
    catch (error) {
        return false;
    }
}

async function read_file_media_meta(req, relative)
{
    if (!is_media_file(relative)) {
        return {};
    }

    try {
        const meta = await file_meta_cache({
            notes_root: `${req.user_dir}/notes`,
            notes_meta_root: `${req.user_dir}/notes.meta`,
            relative,
        });
        return {
            image: image_meta_summary(meta),
            audio: audio_meta_summary(meta),
            video: video_meta_summary(meta),
        };
    }
    catch {
        return {};
    }
}

function is_media_file(relative)
{
    return /\.(?:avif|gif|jpe?g|m4a|m4v|mkv|mov|mp3|mp4|oga|ogg|ogv|png|svg|webm)$/i.test(relative);
}

function image_meta_summary(meta)
{
    if (meta?.type !== 'image') {
        return null;
    }

    return {
        width: number_or_null(meta.image?.width),
        height: number_or_null(meta.image?.height),
        format: meta.image?.format || null,
        pages: number_or_null(meta.image?.pages),
    };
}

function audio_meta_summary(meta)
{
    if (meta?.type !== 'audio') {
        return null;
    }

    const stream = (meta.audio?.streams || []).find(v => v.codec_type === 'audio') || {};
    const format = meta.audio?.format || {};
    return {
        duration_seconds: number_or_null(format.duration ?? stream.duration),
        bit_rate: number_or_null(format.bit_rate ?? stream.bit_rate),
        sample_rate: number_or_null(stream.sample_rate),
        channels: number_or_null(stream.channels),
        channel_layout: stream.channel_layout || null,
        codec_name: stream.codec_name || format.format_name || null,
    };
}

function video_meta_summary(meta)
{
    if (meta?.type !== 'video') {
        return null;
    }

    const video_stream = (meta.video?.streams || []).find(v => v.codec_type === 'video') || {};
    const audio_stream = (meta.video?.streams || []).find(v => v.codec_type === 'audio') || {};
    const format = meta.video?.format || {};
    return {
        duration_seconds: number_or_null(format.duration ?? video_stream.duration),
        bit_rate: number_or_null(format.bit_rate ?? video_stream.bit_rate),
        width: number_or_null(video_stream.width),
        height: number_or_null(video_stream.height),
        frame_rate: frame_rate_number(video_stream.avg_frame_rate || video_stream.r_frame_rate),
        codec_name: video_stream.codec_name || format.format_name || null,
        audio_codec_name: audio_stream.codec_name || null,
    };
}

function number_or_null(value)
{
    const out = Number(value);
    return Number.isFinite(out) ? out : null;
}

function frame_rate_number(value)
{
    const match = String(value || '').match(/^(\d+)\/(\d+)$/);
    if (!match) {
        return number_or_null(value);
    }
    const denom = Number(match[2]);
    return denom ? Number(match[1]) / denom : null;
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
