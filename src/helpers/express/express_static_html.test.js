const assert = require('assert');
const express = require('express');
const express_static_html = require('./express_static_html');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

describe('express_static_html', function () {
    let base_url;
    let root;
    let server;
    let version;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'express-static-html-'));
        await fs.mkdir(path.join(root, 'js'));
        await fs.writeFile(path.join(root, 'js', 'app.js'), 'window.x = 1;');
        await fs.writeFile(path.join(root, 'index.html'), '<script src="js/app.js"></script>');
        await fs.writeFile(path.join(root, 'note.html'), '<script src="/js/app.js"></script>');
        version = String(Math.floor((await fs.stat(path.join(root, 'js', 'app.js'))).mtimeMs));

        const app = express();
        app.use(express_static_html(root));
        app.use(express.static(root));
        await new Promise(resolve => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        base_url = `http://127.0.0.1:${server.address().port}`;
    });

    afterEach(async function () {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(root, {recursive: true, force: true});
    });

    it('serves the directory index with versioned references and no caching', async function () {
        const response = await fetch(`${base_url}/`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^text\/html/);
        assert.equal(response.headers.get('cache-control'), 'no-cache');
        assert.equal(await response.text(), `<script src="js/app.js?v=${version}"></script>`);
    });

    it('serves a named page, query string included', async function () {
        const response = await fetch(`${base_url}/note.html?uid=1`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), `<script src="/js/app.js?v=${version}"></script>`);
    });

    it('falls through for assets and missing pages', async function () {
        const asset = await fetch(`${base_url}/js/app.js?v=${version}`);
        assert.equal(asset.status, 200);
        assert.equal(await asset.text(), 'window.x = 1;');
        assert.equal((await fetch(`${base_url}/missing.html`)).status, 404);
        assert.equal((await fetch(`${base_url}/..%2F..%2Fetc%2Fpasswd.html`)).status, 404);
    });
});
