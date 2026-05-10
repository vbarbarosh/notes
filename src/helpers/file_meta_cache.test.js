const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const file_meta_cache = require('./file_meta_cache');

describe('file_meta_cache', function () {
    let root;
    let notes_root;
    let notes_meta_root;

    beforeEach(async function () {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-file-meta-'));
        notes_root = path.join(root, 'notes');
        notes_meta_root = path.join(root, 'notes.meta');
        await fs.mkdir(path.join(notes_root, '20260509_121542', 'files'), {recursive: true});
    });

    afterEach(async function () {
        await fs.rm(root, {force: true, recursive: true});
    });

    it('creates and returns sha256 metadata', async function () {
        const file = path.join(notes_root, '20260509_121542', 'files', 'a.txt');
        await fs.writeFile(file, 'abc');

        const meta = await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/a.txt',
        });

        assert.equal(meta.sha256, sha256('abc'));
        assert.equal(meta.source.size, 3);
        assert.deepEqual(
            JSON.parse(await fs.readFile(path.join(notes_meta_root, '20260509_121542', 'files', 'a.txt.json'), 'utf8')),
            meta
        );
    });

    it('recreates stale metadata', async function () {
        const file = path.join(notes_root, '20260509_121542', 'files', 'a.txt');
        await fs.writeFile(file, 'abc');
        await fs.utimes(file, new Date(1000), new Date(1000));

        await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/a.txt',
        });

        await fs.writeFile(file, 'xyz');
        await fs.utimes(file, new Date(2000), new Date(2000));

        const meta = await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/a.txt',
        });

        assert.equal(meta.sha256, sha256('xyz'));
    });

    it('removes empty cache directories up to notes.meta', async function () {
        const file = path.join(notes_root, '20260509_121542', 'files', 'nested', 'a.txt');
        await fs.mkdir(path.dirname(file), {recursive: true});
        await fs.writeFile(file, 'abc');

        await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/nested/a.txt',
        });

        await file_meta_cache.remove_file_meta_cache(notes_meta_root, '20260509_121542/files/nested/a.txt');

        assert.equal(await exists(path.join(notes_meta_root, '20260509_121542')), false);
        assert.equal(await exists(notes_meta_root), true);
    });

    it('keeps non-empty cache directories while pruning', async function () {
        const file_a = path.join(notes_root, '20260509_121542', 'files', 'nested', 'a.txt');
        const file_b = path.join(notes_root, '20260509_121542', 'files', 'b.txt');
        await fs.mkdir(path.dirname(file_a), {recursive: true});
        await fs.writeFile(file_a, 'abc');
        await fs.writeFile(file_b, 'xyz');

        await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/nested/a.txt',
        });
        await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/b.txt',
        });

        await file_meta_cache.remove_file_meta_cache(notes_meta_root, '20260509_121542/files/nested/a.txt');

        assert.equal(await exists(path.join(notes_meta_root, '20260509_121542', 'files', 'nested')), false);
        assert.equal(await exists(path.join(notes_meta_root, '20260509_121542', 'files')), true);
        assert.equal(await exists(path.join(notes_meta_root, '20260509_121542', 'files', 'b.txt.json')), true);
    });

    it('removes a note cache directory and prunes empty parents', async function () {
        const file = path.join(notes_root, '20260509_121542', 'files', 'a.txt');
        await fs.writeFile(file, 'abc');

        await file_meta_cache({
            notes_root,
            notes_meta_root,
            relative: '20260509_121542/files/a.txt',
        });

        await file_meta_cache.remove_dir_meta_cache(notes_meta_root, '20260509_121542');

        assert.equal(await exists(path.join(notes_meta_root, '20260509_121542')), false);
        assert.equal(await exists(notes_meta_root), true);
    });
});

function sha256(value)
{
    return crypto.createHash('sha256').update(value).digest('hex');
}

async function exists(file)
{
    try {
        await fs.access(file);
        return true;
    }
    catch {
        return false;
    }
}
