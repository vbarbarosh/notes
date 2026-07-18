const assert = require('assert');
const fs_path_strict_resolve = require('./fs_path_strict_resolve');

describe('fs_path_strict_resolve', function () {
    it('resolves nested file paths', function () {
        assert.equal(fs_path_strict_resolve('/notes/files', 'images/photo.jpg'), '/notes/files/images/photo.jpg');
    });

    it('allows dotfiles', function () {
        assert.equal(fs_path_strict_resolve('/notes/files', '.config/settings.json'), '/notes/files/.config/settings.json');
    });

    for (const relative of ['', '.', '..', '../secret', 'images/../secret', '/absolute', 'two//slashes', 'back\\slash']) {
        it(`rejects ${JSON.stringify(relative)}`, function () {
            assert.throws(() => fs_path_strict_resolve('/notes/files', relative));
        });
    }
});
