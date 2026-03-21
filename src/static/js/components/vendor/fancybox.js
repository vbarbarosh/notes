// [{thumbnail_url, download_url, basename}]

// https://fancyapps.com/fancybox/
app.component('fancybox', {
    emits: [],
    props: ['value'],
    template: `
        <div>
            <slot>
                <div class="flex-row flex-align-center flex-justify-start flex-wrap gap10">
                    <a v-for="item in (value||[]).filter(v => v.thumbnail_url)" v-bind:href="(item.download_url||item.url||item.thumbnail_url)" target="_blank" class="p5 border-silver">
                        <img v-bind:src="item.thumbnail_url" v-bind:alt="item.basename" class="db max-w200 max-h200 fit-down checkerboard">
                    </a>
                </div>
            </slot>
        </div>
    `,
    data: function () {
        return {};
    },
    computed: {
    },
    watch: {
    },
    methods: {
    },
    mounted: function () {
        Fancybox.bind(this.$el, 'a', {groupAll: true});
    },
    unmounted: function () {
        Fancybox.unbind(this.$el, 'a');
    },
});

html`
    <link href="https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0/dist/fancybox/fancybox.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/@fancyapps/ui@5.0/dist/fancybox/fancybox.umd.js"></script>
`;
