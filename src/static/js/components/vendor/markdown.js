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
        margin-top: 1.5em;
        margin-bottom: 1.5em;
        font-size: 14px;
        line-height: 1.5em;
    }

    .markdown img {
        max-width: 400px;
        max-height: 400px;
    }
`;
