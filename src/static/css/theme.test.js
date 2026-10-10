const assert = require('assert');
const fs = require('fs');
const path = require('path');

const static_root = path.resolve(__dirname, '..');

describe('theme.css', function () {
    const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8');
    const light = tokens_of_block(css, ':root {');
    const dark = tokens_of_block(css, ':root[data-theme="dark"] {');

    it('defines the same tokens for the light and the dark theme', function () {
        assert.deepEqual([...dark].sort(), [...light].sort());
    });

    it('defines every token the main app uses, in both themes', function () {
        const files = [
            path.join(__dirname, 'theme.css'),
            ...scripts_of_dir(path.join(static_root, 'js/components')),
            ...scripts_of_dir(path.join(static_root, 'js/components/vendor')),
        ];
        const missing = [];
        for (const file of files) {
            const text = fs.readFileSync(file, 'utf8');
            for (const match of text.matchAll(/var\((--color-[a-z0-9-]+)\)/g)) {
                if (!light.has(match[1]) || !dark.has(match[1])) {
                    missing.push(`${path.relative(static_root, file)}: ${match[1]}`);
                }
            }
        }
        assert.deepEqual(missing, []);
    });
});

function tokens_of_block(css, head)
{
    const begin = css.indexOf(head);
    assert.notEqual(begin, -1, `no "${head}" block`);
    const block = css.slice(begin, css.indexOf('}', begin));
    return new Set([...block.matchAll(/^\s*(--color-[a-z0-9-]+):/gm)].map(v => v[1]));
}

function scripts_of_dir(dir)
{
    return fs.readdirSync(dir).filter(v => v.endsWith('.js')).map(v => path.join(dir, v));
}
