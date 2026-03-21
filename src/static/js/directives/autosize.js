app.directive('autosize', {
    mounted: async function (el) {
        autosize(el);
        await Vue.nextTick();
        autosize.update(el);
    },
    updated: function (el) {
        autosize.update(el);
    },
    unmounted: function (el) {
        autosize.destroy(el);
    }
});

html`
    <script src="https://unpkg.com/autosize@6.0.1/dist/autosize.min.js"></script>
`;
