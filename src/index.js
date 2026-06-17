#!/usr/bin/env node

const UserFriendlyError = require('@vbarbarosh/node-helpers/src/errors/UserFriendlyError');
const body_parser = require('body-parser');
const cli = require('@vbarbarosh/node-helpers/src/cli');
const express = require('express');
const express_log = require('@vbarbarosh/express-helpers/src/express_log');
const express_params = require('@vbarbarosh/express-helpers/src/express_params');
const express_routes = require('./helpers/express/express_routes');
const express_run = require('./helpers/express/express_run');
const file_meta_cache = require('./helpers/file_meta_cache');
const fs_exists = require('@vbarbarosh/node-helpers/src/fs_exists');
const fs_mkdirp = require('@vbarbarosh/node-helpers/src/fs_mkdirp');
const fs_path_dirname = require('@vbarbarosh/node-helpers/src/fs_path_dirname');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const fs_path_safe_resolve = require('./helpers/fs_path_safe_resolve');
const make = require('@vbarbarosh/type-helpers');
const sharp = require('sharp');

const THUMBNAIL_VERSION = 'v3';

cli(main);

async function main()
{
    await fs_mkdirp(`${__dirname}/../data/logs`);

    const app = express();

    app.use(x_perf);
    app.use(express_log({
        file: () => `${__dirname}/../data/logs/http-${new Date().toJSON().substring(0, 10)}.log`,
    }));
    app.use(express.static(fs_path_resolve(__dirname, 'static')));
    app.use(body_parser.json());

    const data_dir = fs_path_resolve(__dirname, '../data');
    app.use(function (req, res, next) {
        req.user_uid = req.headers['x-auth-user'] ?? null;

        if (!req.user_uid) {
            req.user_dir = data_dir;
        }
        else {
            if (req.user_uid.match(/[^0-9a-zA-Z_-]/)) {
                next(new Error(`Invalid user_uid: ${req.user_uid}`));
                return;
            }
            req.user_dir = fs_path_safe_resolve(data_dir, `users/${req.user_uid}`);
        }

        next();
    });

    const jobs_routes = require('./routes/jobs');

    express_routes(app, [
        {req: 'GET /', fn: echo},
        {req: 'GET /r/*.meta', fn: data_meta},
        {req: 'GET /r/*', fn: data_fetch},
        {req: 'GET /t/:size/*', fn: thumbnail},
        ...require('./routes/notes'),
        ...jobs_routes,
        ...require('./routes/files'),
        {req: 'ALL *', fn: page404},
    ]);

    app.use(error_handler);

    await express_run(app, 3000, process.env.LISTEN || 'localhost', jobs_routes.attach_ws);
}

async function echo(req, res)
{
    res.status(200).send(express_params(req));
}

function x_perf(req, res, next)
{
    const started = process.hrtime.bigint();
    const writeHead = res.writeHead;

    res.writeHead = function (...args) {
        const seconds = Number(process.hrtime.bigint() - started) / 1e9;
        res.setHeader('x-perf', `${seconds.toFixed(2)}s`);
        return writeHead.apply(this, args);
    };

    next();
}

async function page404(req, res)
{
    res.status(404).send(`Page not found: ${req.path}`);
}

async function data_fetch(req, res)
{
    const rel = req.params['0'] ?? '';

    const base = `${req.user_dir}/notes`;

    let full;
    try {
        full = fs_path_safe_resolve(base, rel);
    }
    catch {
        res.status(400).send('Invalid path');
        return;
    }

    res.sendFile(full);
}

async function data_meta(req, res)
{
    const rel = req.params['0'] ?? '';

    if (!rel) {
        res.status(404).send('Not Found');
        return;
    }

    try {
        const meta = await file_meta_cache({
            notes_root: `${req.user_dir}/notes`,
            notes_meta_root: `${req.user_dir}/notes.meta`,
            relative: rel,
        });
        res.json(meta);
    }
    catch (error) {
        if (error.code === 'ENOENT' || error.status === 404) {
            res.status(404).send('Not Found');
            return;
        }
        throw error;
    }
}

async function thumbnail(req, res)
{
    const size = make(req.params.size, {type: 'int', min: 32, max: 2048, default: 1024});
    const rel = make(req.params['0'], {type: 'str', default: ''});

    const meta = await file_meta_cache({
        notes_root: `${req.user_dir}/notes`,
        notes_meta_root: `${req.user_dir}/notes.meta`,
        relative: rel,
    });

    if (meta.type !== 'image') {
        res.status(400).send('Not an image');
        return;
    }

    set_thumbnail_cache_headers(res, meta, size);
    if (req.headers['if-none-match'] === res.getHeader('etag')) {
        res.status(304).send();
        return;
    }

    const source_file = `${req.user_dir}/notes/${meta.source.relative}`;
    if (meta.mime === 'image/svg+xml') {
        res.type(meta.mime).sendFile(source_file);
        return;
    }

    const thumbnail_file = `${req.user_dir}/thumbnails/${THUMBNAIL_VERSION}/${size}/notes/${meta.source.relative}`;
    if (await fs_exists(thumbnail_file)) {
        res.type(meta.mime).sendFile(thumbnail_file);
        return;
    }

    await fs_mkdirp(fs_path_dirname(thumbnail_file));
    await sharp(source_file).resize({width: size, fit: 'inside', withoutEnlargement: true}).toFile(thumbnail_file);
    res.type(meta.mime).sendFile(thumbnail_file);
}

function set_thumbnail_cache_headers(res, meta, size)
{
    res.set({
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'ETag': `"thumbnail-${THUMBNAIL_VERSION}-${size}-${meta.sha256}"`,
        'Last-Modified': new Date(meta.source.mtime_ms).toUTCString(),
    });
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
        res.status(400).send({error: error.message});
    }
    else {
        res.status(400).send({error: 'An error occurred'})
    }
}
