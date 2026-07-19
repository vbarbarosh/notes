const assert = require('assert');
const body_parser = require('body-parser');
const express = require('express');
const express_routes = require('../helpers/express/express_routes');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

describe('note file routes', function () {
    let base_url;
    let root;
    let server;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-file-routes-'));
        await fs.mkdir(path.join(root, 'notes', '20260718_120000'), {recursive: true});
        await fs.writeFile(path.join(root, 'notes', '20260718_120000', 'README.md'), 'Test note\n');

        const app = express();
        app.use(body_parser.json());
        app.use(function (req, res, next) {
            req.user_dir = root;
            req.user_uid = null;
            next();
        });
        express_routes(app, require('./notes'));
        app.use(function (error, req, res, next) {
            res.status(500).send({error: error.message});
        });

        await new Promise(resolve => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        base_url = `http://127.0.0.1:${server.address().port}`;
    });

    afterEach(async function () {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(root, {recursive: true, force: true});
    });

    it('supports the file resource lifecycle', async function () {
        let response = await put_file('docs/hello.txt', 'hello');
        assert.equal(response.status, 201);
        let item = await response.json();
        assert.equal(item.path, 'docs/hello.txt');
        assert.equal(item.url, '/api/v1/notes/20260718_120000/files/docs/hello.txt');
        assert.equal(item.details, null);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files`);
        assert.equal(response.status, 200);
        let body = await response.json();
        assert.deepEqual(body.items.map(v => v.path), ['docs/hello.txt']);

        response = await fetch(`${base_url}${item.url}`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'hello');

        response = await fetch(`${base_url}${item.url}`, {method: 'HEAD'});
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-length'), '5');

        response = await put_file('docs/hello.txt', 'updated');
        assert.equal(response.status, 200);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files/docs/hello.txt`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: 'renamed.txt'}),
        });
        assert.equal(response.status, 200);
        item = await response.json();
        assert.equal(item.path, 'renamed.txt');

        response = await fetch(`${base_url}${item.url}`, {method: 'DELETE'});
        assert.equal(response.status, 200);

        response = await fetch(`${base_url}${item.url}`);
        assert.equal(response.status, 404);
    });

    it('filters the notes list', async function () {
        await fs.mkdir(path.join(root, 'notes', '20260717_090000-alpha'), {recursive: true});
        await fs.writeFile(path.join(root, 'notes', '20260717_090000-alpha', 'README.md'), 'Alpha body\n');

        let response = await fetch(`${base_url}/api/v1/notes`);
        assert.equal(response.status, 200);
        let body = await response.json();
        assert.deepEqual(body.items.map(v => v.uid), ['20260718_120000', '20260717_090000']);
        assert.equal(body.limit, 0);
        assert.equal(body.offset, 0);
        assert.deepEqual(body.filters, {});

        response = await fetch(`${base_url}/api/v1/notes?q=Alpha`);
        body = await response.json();
        assert.deepEqual(body.items.map(v => v.uid), ['20260717_090000']);
        assert.deepEqual(body.filters, {q: 'alpha'});

        response = await fetch(`${base_url}/api/v1/notes?uid=20260718_120000`);
        body = await response.json();
        assert.deepEqual(body.items.map(v => v.uid), ['20260718_120000']);
        assert.deepEqual(body.filters, {uid: '20260718_120000'});

        response = await fetch(`${base_url}/api/v1/notes?created_after=2000-01-01`);
        body = await response.json();
        assert.equal(body.items.length, 2);
        assert.deepEqual(body.filters, {created_after: '2000-01-01T00:00:00.000Z'});

        response = await fetch(`${base_url}/api/v1/notes?created_after=2999-01-01`);
        assert.deepEqual((await response.json()).items, []);

        response = await fetch(`${base_url}/api/v1/notes?created_before=2000-01-01`);
        assert.deepEqual((await response.json()).items, []);
    });

    it('filters the file list', async function () {
        await put_file('docs/hello.txt', 'hello');
        await put_file('media/world.txt', 'world');

        let response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files?q=hello`);
        assert.equal(response.status, 200);
        let body = await response.json();
        assert.deepEqual(body.items.map(v => v.path), ['docs/hello.txt']);
        assert.deepEqual(body.filters, {q: 'hello'});

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files?mime=application/octet-stream`);
        body = await response.json();
        assert.deepEqual(body.items.map(v => v.path), ['docs/hello.txt', 'media/world.txt']);
        assert.deepEqual(body.filters, {mime: 'application/octet-stream'});

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files?mime=image/`);
        assert.deepEqual((await response.json()).items, []);
    });

    it('paginates the notes and file lists', async function () {
        await fs.mkdir(path.join(root, 'notes', '20260717_090000-alpha'), {recursive: true});
        await fs.writeFile(path.join(root, 'notes', '20260717_090000-alpha', 'README.md'), 'Alpha body\n');
        await put_file('docs/hello.txt', 'hello');
        await put_file('media/world.txt', 'world');

        let response = await fetch(`${base_url}/api/v1/notes?limit=1`);
        assert.equal(response.status, 200);
        let body = await response.json();
        assert.deepEqual(body.items.map(v => v.uid), ['20260718_120000']);
        assert.equal(body.limit, 1);
        assert.equal(body.offset, 0);

        response = await fetch(`${base_url}/api/v1/notes?offset=1`);
        assert.deepEqual((await response.json()).items.map(v => v.uid), ['20260717_090000']);

        response = await fetch(`${base_url}/api/v1/notes?limit=1&offset=1`);
        body = await response.json();
        assert.deepEqual(body.items.map(v => v.uid), ['20260717_090000']);
        assert.equal(body.limit, 1);
        assert.equal(body.offset, 1);

        response = await fetch(`${base_url}/api/v1/notes?offset=5`);
        assert.deepEqual((await response.json()).items, []);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files?limit=1&offset=1`);
        assert.deepEqual((await response.json()).items.map(v => v.path), ['media/world.txt']);
    });

    it('supports dotfiles', async function () {
        const response = await put_file('.config/settings.json', '{}');
        assert.equal(response.status, 201);
        const item = await response.json();
        assert.equal(item.path, '.config/settings.json');
        assert.equal(await fs.readFile(path.join(root, 'notes', '20260718_120000', 'files', '.config', 'settings.json'), 'utf8'), '{}');
    });

    it('renames a file with a thumbnail marker and invalidates the file list cache', async function () {
        await fs.mkdir(path.join(root, 'thumbnails'), {recursive: true});
        await fs.writeFile(path.join(root, 'thumbnails', '.gitkeep'), '');

        let response = await put_file('before.txt', 'hello');
        assert.equal(response.status, 201);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files`);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).items.map(v => v.path), ['before.txt']);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files/before.txt`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: 'after.txt'}),
        });
        assert.equal(response.status, 200);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files`);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).items.map(v => v.path), ['after.txt']);

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files/after.txt`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'hello');

        response = await fetch(`${base_url}/api/v1/notes/20260718_120000/files/before.txt`);
        assert.equal(response.status, 404);
    });

    async function put_file(relative, contents)
    {
        const form = new FormData();
        form.append('file', new Blob([contents]), path.basename(relative));
        return fetch(`${base_url}/api/v1/notes/20260718_120000/files/${relative}`, {
            method: 'PUT',
            body: form,
        });
    }
});
