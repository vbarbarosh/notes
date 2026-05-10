const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const cache_api = require('./cache_api');

describe('cache_api', function () {
    let root;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-api-'));
    });

    afterEach(async function () {
        await fs.rm(root, {force: true, recursive: true});
    });

    it('creates missing cache files', async function () {
        const file = path.join(root, 'cache', 'api', 'notes.json');
        const out = await cache_api(file, async () => ({items: [{uid: 'a'}]}));

        assert.deepEqual(out, {items: [{uid: 'a'}]});
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), out);
    });

    it('returns cached data without rebuilding', async function () {
        const file = path.join(root, 'cache', 'api', 'notes.json');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, JSON.stringify({items: [{uid: 'cached'}]}));

        const out = await cache_api(file, async () => {
            throw new Error('should not rebuild');
        });

        assert.deepEqual(out, {items: [{uid: 'cached'}]});
    });

    it('recreates broken json cache files', async function () {
        const file = path.join(root, 'cache', 'api', 'notes.json');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, '{');

        const out = await cache_api(file, async () => ({items: []}));

        assert.deepEqual(out, {items: []});
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), out);
    });
});
