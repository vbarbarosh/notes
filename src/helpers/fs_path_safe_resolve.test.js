const assert = require('assert');
const fs_path_safe_resolve = require('./fs_path_safe_resolve');

const tests = [
    // Basic usage
    {root: '/foo', path: '', expected: '/foo'},
    {root: '/foo', path: 'bar', expected: '/foo/bar'},
    {root: '/foo', path: '/bar', expected: '/foo/bar'},
    {root: '/foo', path: '/bar/baz', expected: '/foo/bar/baz'},
    {root: '/foo/', path: '', expected: '/foo/'},
    {root: '/foo/', path: 'bar', expected: '/foo/bar'},
    {root: '/foo/', path: '/bar', expected: '/foo/bar'},
    {root: '/foo/', path: '/bar/baz', expected: '/foo/bar/baz'},

    // Leading dots are removed, multiple dots
    {root: '/foo', path: './bar', expected: '/foo/bar'},
    {root: '/foo', path: '../bar', expected: '/foo/bar'},
    {root: '/foo', path: '../../bar', expected: '/foo/bar'},
    {root: '/foo', path: '.../bar', expected: '/foo/bar'},

    // Only dots or empty segments are ignored
    {root: '/foo', path: '.', expected: '/foo'},
    {root: '/foo', path: '..', expected: '/foo'},
    {root: '/foo', path: './././', expected: '/foo'},
    {root: '/foo', path: 'bar/./baz', expected: '/foo/bar/baz'},
    {root: '/foo', path: '/./bar//baz/..', expected: '/foo/bar/baz'},

    // Escaping root should never happen
    {root: '/foo', path: '../../etc/passwd', expected: '/foo/etc/passwd'},
    {root: '/foo', path: '/../../etc/passwd', expected: '/foo/etc/passwd'},

    // Multiple slashes, trailing slashes
    {root: '/foo', path: 'bar//baz//', expected: '/foo/bar/baz'},
    {root: '/foo', path: '/bar///baz', expected: '/foo/bar/baz'},
];

describe('fs_sanitize_relative_resolve', function () {
    tests.forEach(function (test) {
        it(`${test.root} + ${test.path} → ${test.expected}`, function () {
            const actual = fs_path_safe_resolve(test.root, test.path);
            assert.equal(actual, test.expected);
        });
    });
});
