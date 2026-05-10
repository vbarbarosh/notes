const assert = require('assert');
const fs_path_resolve = require('@vbarbarosh/node-helpers/src/fs_path_resolve');
const data_root = require('./data_root');

describe('data_root', function () {
    it('uses data/ when there is no user', function () {
        assert.equal(data_root(), fs_path_resolve(__dirname, '..', '..', 'data'));
        assert.equal(data_root('.'), fs_path_resolve(__dirname, '..', '..', 'data'));
    });

    it('uses data/users/<user_uid> for users', function () {
        assert.equal(data_root('alice'), fs_path_resolve(__dirname, '..', '..', 'data', 'users', 'alice'));
    });

    it('keeps user roots inside data/users', function () {
        assert.equal(data_root('../alice'), fs_path_resolve(__dirname, '..', '..', 'data', 'users', 'alice'));
    });
});
