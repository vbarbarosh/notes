const assert = require('assert');
const fs = require('fs/promises');
const html_asset_versions = require('./html_asset_versions');
const os = require('os');
const path = require('path');

describe('html_asset_versions', function () {
    let root;
    let css_version;
    let js_version;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'html-asset-versions-'));
        await fs.mkdir(path.join(root, 'css'));
        await fs.mkdir(path.join(root, 'js'));
        await fs.mkdir(path.join(root, 'apps', 'calc'), {recursive: true});
        await fs.writeFile(path.join(root, 'css', 'theme.css'), 'body {}');
        await fs.writeFile(path.join(root, 'js', 'utils.js'), '');
        await fs.writeFile(path.join(root, 'apps', 'calc', 'calc.js'), '');
        await fs.utimes(path.join(root, 'css', 'theme.css'), new Date('2026-09-10T18:00:11Z'), new Date('2026-09-10T18:00:11Z'));
        css_version = String(Math.floor((await fs.stat(path.join(root, 'css', 'theme.css'))).mtimeMs));
        js_version = String(Math.floor((await fs.stat(path.join(root, 'js', 'utils.js'))).mtimeMs));
    });

    afterEach(async function () {
        await fs.rm(root, {recursive: true, force: true});
    });

    it('tags local stylesheets and scripts with their modification time', async function () {
        const html = '<link href="css/theme.css" rel="stylesheet">\n<script src="/js/utils.js"></script>';
        const out = await html_asset_versions(html, root, root);
        assert.equal(out, `<link href="css/theme.css?v=${css_version}" rel="stylesheet">\n<script src="/js/utils.js?v=${js_version}"></script>`);
        assert.equal(css_version, String(new Date('2026-09-10T18:00:11Z').getTime()));
    });

    it('resolves relative references against the page directory', async function () {
        const html = '<script src="calc.js"></script><link rel="stylesheet" href="/css/theme.css">';
        const out = await html_asset_versions(html, root, path.join(root, 'apps', 'calc'));
        const calc_version = String(Math.floor((await fs.stat(path.join(root, 'apps', 'calc', 'calc.js'))).mtimeMs));
        assert.equal(out, `<script src="calc.js?v=${calc_version}"></script><link rel="stylesheet" href="/css/theme.css?v=${css_version}">`);
    });

    it('leaves external, missing, bound and escaping references alone', async function () {
        const html = [
            '<script src="https://unpkg.com/vue@3"></script>',
            '<script src="//cdn.example/x.js"></script>',
            '<link href="data:text/css,body{}" rel="stylesheet">',
            '<script src="js/missing.js"></script>',
            '<link href="../../etc/passwd" rel="stylesheet">',
            '<iframe v-bind:src="url"></iframe>',
            '<img src="js/utils.js">',
        ].join('\n');
        assert.equal(await html_asset_versions(html, root, root), html);
    });

    it('does not double-tag a reference that already carries a query', async function () {
        const html = '<script src="js/utils.js?v=1"></script>';
        assert.equal(await html_asset_versions(html, root, root), html);
    });
});
