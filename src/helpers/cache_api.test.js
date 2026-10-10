const assert = require('assert');
const cache_api = require('./cache_api');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

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
        const result = await cache_api(file, async () => ({items: [{uid: 'a'}]}));

        assert.deepEqual(result, {items: [{uid: 'a'}]});
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), result);
    });

    it('returns cached data without rebuilding', async function () {
        const file = path.join(root, 'cache', 'api', 'notes.json');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, JSON.stringify({items: [{uid: 'cached'}]}));

        const result = await cache_api(file, async function () {
            throw new Error('should not rebuild');
        });

        assert.deepEqual(result, {items: [{uid: 'cached'}]});
    });

    it('recreates broken json cache files', async function () {
        const file = path.join(root, 'cache', 'api', 'notes.json');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, '{');

        const result = await cache_api(file, async () => ({items: []}));

        assert.deepEqual(result, {items: []});
        assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), result);
    });
});
