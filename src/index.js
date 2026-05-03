#!/usr/bin/env node

const Promise = require('bluebird');
const UserFriendlyError = require('@vbarbarosh/node-helpers/src/errors/UserFriendlyError');
const amx = require('@vbarbarosh/express-helpers/src/amx');
const body_parser = require('body-parser');
const cli = require('@vbarbarosh/node-helpers/src/cli');
const express = require('express');
const express_log = require('@vbarbarosh/express-helpers/src/express_log');
const express_params = require('@vbarbarosh/express-helpers/src/express_params');
const express_routes = require('@vbarbarosh/express-helpers/src/express_routes');
const express_run = require('@vbarbarosh/express-helpers/src/express_run');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_lstat = require('@vbarbarosh/node-helpers/src/fs_lstat');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_path_safe_relative = require('./helpers/fs_path_safe_relative');
const fs_path_safe_resolve = require('./helpers/fs_path_safe_resolve');
const fs_read_utf8 = require('@vbarbarosh/node-helpers/src/fs_read_utf8');
const fs_readdir = require('@vbarbarosh/node-helpers/src/fs_readdir');
const fs_rename = require('@vbarbarosh/node-helpers/src/fs_rename');
const fs_write = require('@vbarbarosh/node-helpers/src/fs_write');
const fs_write_over_file = require('./helpers/fs_write_over_file');
const fs_write_unique_file = require('./helpers/fs_write_unique_file');
const make = require('@vbarbarosh/type-helpers');
const multer = require('multer');
const sharp = require('sharp');

cli(main);

async function main()
{
    await fs_mkdirp(`${__dirname}/../data/logs`);
    await fs_mkdirp(`${__dirname}/../data/notes`);
    await fs_mkdirp(`${__dirname}/../data/thumbnails`);
    await fs_mkdirp(`${__dirname}/../data/trash-bin`);
    await fs_mkdirp(`${__dirname}/../data/uploads`);

    const app = express();
    const upload = multer({
        preservePath: true,
        storage: multer.diskStorage({
            destination: fs_path_resolve(__dirname, '../data/uploads'),
        }),
        limits: {
            fileSize: 500 * 1024 * 1024, // 500 MB
        },
    });

    app.use(express_log({
        file: () => `${__dirname}/../data/logs/http-${new Date().toJSON().substring(0, 10)}.log`,
    }));

    app.use(express.static(fs_path_resolve(__dirname, 'static')));
    app.use(body_parser.json());

    app.use(function (req, res, next) {
        // req.user_uid = req.headers['x-auth-user'] ?? 'anon';
        req.user_uid = req.headers['x-auth-user'] ?? '.';
        next();
        // next(new Error('No user provided'));
    });

    app.post('/api/v1/notes/:note_uid/files', upload.array('file'), amx(notes_upload_file));

    express_routes(app, [
        {req: 'GET /', fn: echo},
        {req: 'GET /r/*', fn: data_fetch},
        {req: 'GET /t/:size/*', fn: thumbnail},
        ...require('./routes/jobs'),
        {req: 'GET /api/v1/notes.json', fn: notes_list},
        {req: 'GET /api/v1/notes/:note_uid', fn: notes_fetch},
        {req: 'POST /api/v1/notes', fn: notes_create},
        {req: 'DELETE /api/v1/notes/:note_uid', fn: notes_remove},
        {req: 'DELETE /api/v1/notes/:note_uid/files/*', fn: notes_remove_file},
        {req: 'PATCH /api/v1/notes/:note_uid', fn: notes_update},
        {req: 'ALL *', fn: page404},
    ]);

    app.use(error_handler);

    await express_run(app, 3000, process.env.LISTEN || 'localhost');
}

async function echo(req, res)
{
    res.status(200).send(express_params(req));
}

async function page404(req, res)
{
    res.status(404).send(`Page not found: ${req.path}`);
}

async function data_fetch(req, res)
{
    const rel = req.params['0'] ?? '';

    const base = fs_path_resolve(__dirname, '..', 'data', 'notes', req.user_uid);

    let full;
    try {
        full = fs_path_safe_resolve(base, rel);
    }
    catch {
        res.status(400).send('Invalid path');
        return;
    }

    res.sendFile(full);

    // const path = req.params['0'];
    // if (!path || path.includes('..')) {
    //     res.status(400).send('Invalid path');
    //     return;
    // }
    //
    // res.sendFile(fs_path_resolve(`${__dirname}/../data/notes/${req.user_uid}/${path}`));
}

async function thumbnail(req, res)
{
    const size = make(req.params.size, {type: 'int', min: 32, max: 2048, default: 1024});
    const rel = make(req.params['0'], {type: 'str', default: ''});

    const base = fs_path_resolve(__dirname, '..', 'data', 'notes', req.user_uid);

    let image_file;
    try {
        image_file = fs_path_safe_resolve(base, rel);
    }
    catch {
        res.status(400).send('Invalid path');
        return;
    }

    if (!await fs_exists(image_file)) {
        res.status(404).send('Not Found');
        return;
    }

    const meta = await sharp(image_file).metadata();
    if (meta.format === 'svg') {
        res.type('svg').sendFile(image_file);
        return;
    }

    const buf = await sharp(image_file).resize(size).toBuffer();
    res.type(meta.format).send(buf);
}

async function notes_list(req, res)
{
    const d = `${__dirname}/../data/notes/${req.user_uid}`;
    if (!await fs_exists(d)) {
        await fs_mkdirp(d);
    }
    const names = await fs_readdir(d);
    const items = await Promise.all(names.map(v => read_note(req, v)));

    // await Promise.all(names.map(async function (name) {
    //     const lstat = await fs_lstat(`${d}/${name}`);
    //     let i = name.indexOf('-');
    //     if (i === -1) {
    //         i = name.length;
    //     }
    //     const files = [];
    //     if (await fs_exists(`${d}/${name}/files`)) {
    //         await fs_walk(`${d}/${name}/files`, async function (lstat, path) {
    //             const url = `/r/${name}/files/${path}`;
    //             const thumbnail_url = await is_image(`${d}/${name}/files/${path}`)
    //                 ? `/t/1024/${name}/files/${path}` : null;
    //             files.push({
    //                 path,
    //                 url,
    //                 thumbnail_url,
    //                 size: lstat.size,
    //             });
    //         });
    //     }
    //     files.sort(function (a, b) {
    //         return (str_count(b.path, '/') - str_count(a.path, '/')) || fcmp_strings_ascii(a.path, b.path);
    //     });
    //     items.push({
    //         uid: name.slice(0, i),
    //         name: name.slice(i + 1),
    //         body: await fs_read_utf8(`${d}/${name}/README.md`),
    //         prefix: `/r/${name}/`,
    //         files,
    //         created_at: lstat.birthtime,
    //         updated_at: lstat.ctime,
    //     });
    // }));
    res.send({items: items.sort((b, a) => fcmp_strings_ascii(a.uid, b.uid))});
}

// GET /api/v1/notes/:note_uid
async function notes_fetch(req, res)
{
    const note_root_name = await resolve_note_root_name(req, req.params.note_uid);
    const note = await read_note(req, note_root_name);
    res.send(note);
}

async function resolve_note_root_name(req, note_uid)
{
    const d = `${__dirname}/../data/notes/${req.user_uid}`;
    const names = await fs_readdir(d);
    const out = names.find(name => name.startsWith(note_uid));
    if (out) {
        return out;
    }
    throw new Error(`Not found ${note_uid}`);
}

async function read_note(req, note_root_name)
{
    const d = `${__dirname}/../data/notes/${req.user_uid}`;
    const lstat = await fs_lstat(`${d}/${note_root_name}`);

    let i = note_root_name.indexOf('-');
    if (i === -1) {
        i = note_root_name.length;
    }

    const files = [];
    if (await fs_exists(`${d}/${note_root_name}/files`)) {
        await fs_walk(`${d}/${note_root_name}/files`, async function (lstat, path) {
            const url = `/r/${note_root_name}/files/${path}`;
            const thumbnail_url = await is_image(`${d}/${note_root_name}/files/${path}`)
                ? `/t/1024/${note_root_name}/files/${path}` : null;
            files.push({
                path,
                url,
                thumbnail_url,
                size: lstat.size,
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

async function notes_create(req, res)
{
    const name = req.body.name;
    const body = req.body.body.toString().trim() + '\n';

    const uid = now_fs();
    const dir_name = uid;
    const dir_path = fs_path_resolve(__dirname, '..', 'data', 'notes', req.user_uid, dir_name);

    await fs_mkdirp(dir_path);
    await fs_write(`${dir_path}/README.md`, body);

    res.status(201).json({uid, name, prefix: `/r/${dir_name}/`});
}

// PATCH /api/v1/notes/:note_uid body=xxx
async function notes_update(req, res)
{
    const note_uid = req.params.note_uid;
    const body = req.body.body.toString().trim() + '\n';

    const d = fs_path_resolve(__dirname, '..', 'data', 'notes', req.user_uid, note_uid);

    if (!await fs_exists(`${d}/README.md`)) {
        res.status(404).send('Note not found');
        return;
    }

    await fs_write(`${d}/README.md`, body);
    res.status(204).send();
}

// DELETE /api/v1/notes/:note_uid
async function notes_remove(req, res)
{
    const note_uid = req.params.note_uid;

    const d = `${__dirname}/../data`;
    await fs_mkdirp(`${d}/trash-bin/${req.user_uid}`);
    await fs_rename(`${d}/notes/${req.user_uid}/${note_uid}`, `${d}/trash-bin/${req.user_uid}/${now_fs()}-${note_uid}`);

    res.send();
}

// DELETE /api/v1/notes/:note_uid/files/*
async function notes_remove_file(req, res)
{
    const note_uid = req.params.note_uid;

    const d = `${__dirname}/../data`;
    const path = fs_path_safe_resolve(`${d}/notes/${req.user_uid}/${note_uid}/files`, req.params[0]);
    const relative = fs_path_safe_relative(`${d}/notes/${req.user_uid}/${note_uid}/files`, path);
    const source = `${d}/notes/${req.user_uid}/${note_uid}/files/${relative}`;
    const target = `${d}/trash-bin/${req.user_uid}/${now_fs()}-${note_uid}/files/${relative}`;

    if (!await fs_exists(source)) {
        res.status(404, 'File Not Found').send();
        return;
    }

    await fs_mkdirp(fs_path_dirname(target));
    await fs_rename(source, target);
    res.send();
}

// POST /api/v1/notes/:note_uid/files | file=@/path/to/file
// POST /api/v1/notes/:note_uid/files?overwrite=1 | file=@/path/to/file
async function notes_upload_file(req, res)
{
    const note_uid = req.params.note_uid;
    const file = req.files[0];

    if (!file) {
        res.status(400).send('No file was provided');
        return;
    }

    const d = fs_path_resolve(__dirname, '..', 'data', 'notes', req.user_uid, note_uid);
    if (!await fs_exists(d)) {
        res.status(404).send('Note Not Found');
        return;
    }

    const files_root = fs_path_resolve(d, 'files');
    const overwrite = request_overwrite(req);
    const file_path = overwrite
        ? await fs_write_over_file(files_root, file.originalname, file.buffer)
        : await fs_write_unique_file(files_root, file.originalname, file.buffer);

    const lstat = await fs_lstat(file_path);
    const path = fs_path_safe_relative(files_root, file_path);
    const url = `/r/${note_uid}/files/${path}`;
    const thumbnail_url = await is_image(file.buffer) ? `/t/1024/${note_uid}/files/${path}` : null ;
    res.send({
        path,
        url,
        thumbnail_url,
        size: lstat.size,
    });
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

function fcmp_strings_ascii(a, b)
{
    return a < b ? -1 : a > b ? 1 : 0;
}

function str_count(str, ch)
{
    return str.split(ch).length - 1;
}

async function error_handler(error, req, res, next)
{
    try {
        const details = {
            status: error.response?.status,
            body: error.response?.data,
            headers: error.response?.headers,
            stack: error.stack,
            url: req.url,
            originalUrl: req.originalUrl,
        };
        req.log(`[error_handler] ⚠️ ${JSON.stringify(details)}`);
    }
    catch (error2) {
        req.log(`[error_handler] ⚠️ ${JSON.stringify(error.stack).slice(1, -1)} url=${req.url} originalUrl=${req.originalUrl}`);
    }

    if (error instanceof UserFriendlyError) {
        res.send({error: error.message});
    }
    else {
        res.send({error: `An error occurred [${req.uid}]`})
    }
}
