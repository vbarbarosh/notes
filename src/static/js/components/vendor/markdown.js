// https://github.com/Markdown-it/Markdown-it
app.component('markdown', {
    emits: [],
    props: ['value', 'prefix'],
    template: `
        <div class="markdown"><component ref="component" v-bind:is="spec" v-bind:key="html" /></div>
    `,
    data: function () {
        const md = Vue.markRaw(markdownit({html: true, linkify: true}));

        md.use(function (md) {
            const defaultImage = md.renderer.rules.image || function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
            md.renderer.rules.image = function(tokens, idx, options, env, self) {
                const token = tokens[idx];
                let src = token.attrGet('src');
                if (src && typeof env.prefix === 'string' && !src.startsWith('http')) {
                    src = env.prefix + src;
                    token.attrSet('src', src);
                }
                return defaultImage(tokens, idx, options, env, self);
            };

            const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
            md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
                const token = tokens[idx];
                // Add target="_blank"
                token.attrSet('target', '_blank');
                // Add rel="noopener noreferrer" for security
                token.attrSet('rel', 'noopener noreferrer');
                return defaultLinkOpen(tokens, idx, options, env, self);
            };
        });

        return {
            md,
            spec: null,
        };
    },
    computed: {
        html: function () {
            return this.md.render(this.value, {prefix: this.prefix || ''});
        },
    },
    watch: {
        html: {
            immediate: true,
            handler: function () {
                this.spec = Vue.markRaw({template: this.html || '<span></span>', data: () => this.data ?? {}});
                if (this.$refs.component) {
                    this.$refs.component.$forceUpdate();
                }
            },
        },
    },
    methods: {
    },
    mounted: function () {
    },
    unmounted: function () {
    },
});

html`
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
`;

css`
    .markdown {
        margin: 14px 0 18px;
        font-size: 15px;
        line-height: 1.62;
        color: #2f3342;
        overflow-wrap: anywhere;
    }

    .markdown > :first-child {
        margin-top: 0;
    }

    .markdown > :last-child {
        margin-bottom: 0;
    }

    .markdown p,
    .markdown ul,
    .markdown ol,
    .markdown blockquote,
    .markdown pre,
    .markdown table {
        margin: 0 0 12px;
    }

    .markdown h1,
    .markdown h2,
    .markdown h3,
    .markdown h4,
    .markdown h5,
    .markdown h6 {
        color: #262b3d;
        font-weight: 700;
        line-height: 1.25;
        margin: 20px 0 8px;
    }

    .markdown h1 {
        font-size: 1.55em;
        padding-bottom: 7px;
        border-bottom: 1px solid #d9deed;
    }

    .markdown h2 {
        font-size: 1.32em;
        padding-bottom: 5px;
        border-bottom: 1px solid #e3e7f2;
    }

    .markdown h3 {
        font-size: 1.15em;
    }

    .markdown h4,
    .markdown h5,
    .markdown h6 {
        font-size: 1em;
    }

    .markdown a {
        color: #245fd4;
        text-decoration-color: #9bb7f0;
        text-underline-offset: 2px;
    }

    .markdown a:hover {
        color: #173f96;
        text-decoration-color: #173f96;
    }

    .markdown ul,
    .markdown ol {
        padding-left: 24px;
    }

    .markdown li {
        margin: 4px 0;
    }

    .markdown li > ul,
    .markdown li > ol {
        margin-top: 4px;
        margin-bottom: 4px;
    }

    .markdown blockquote {
        padding: 8px 12px;
        color: #50576f;
        background: #edf1f8;
        border-left: 4px solid #9da9db;
        border-radius: 0 6px 6px 0;
    }

    .markdown code {
        background: #e9edf7;
        color: #202842;
        border: 1px solid #d7ddeb;
        border-radius: 4px;
        padding: 1px 5px;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
    }

    .markdown pre {
        background: #202638;
        color: #edf2ff;
        border-radius: 7px;
        padding: 12px 14px;
        overflow-x: auto;
        box-shadow: inset 0 0 0 1px #111827;
    }

    .markdown pre code {
        display: block;
        background: transparent;
        color: inherit;
        border: 0;
        padding: 0;
        font-size: 0.9em;
        line-height: 1.55;
    }

    .markdown table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95em;
        background: #f8f9fd;
        border: 1px solid #d8deee;
        border-radius: 6px;
        overflow: hidden;
        display: block;
    }

    .markdown thead {
        background: #e7ebf6;
    }

    .markdown th,
    .markdown td {
        padding: 6px 9px;
        border: 1px solid #d8deee;
        text-align: left;
        vertical-align: top;
    }

    .markdown hr {
        border: 0;
        border-top: 1px solid #d9deed;
        margin: 18px 0;
    }

    .markdown img {
        max-width: min(100%, 520px);
        max-height: 520px;
        border-radius: 7px;
        border: 1px solid #c7cde2;
        box-shadow: 0 1px 7px #bfc2db60;
        object-fit: contain;
    }
`;
