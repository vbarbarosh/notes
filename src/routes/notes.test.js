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
