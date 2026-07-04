// Virtual view over all note cards: renders notes incrementally (render_limit)
// and knows how to scroll a note into view. Everything else — props for the
// cards and listeners for their events — falls through via $attrs.
app.component('notes-list', {
    inheritAttrs: false,
    props: {
        notes: { type: Array, required: true },
    },
    template: `
        <note-card v-for="note in visible_notes"
                   v-bind:key="note.uid"
                   v-bind:ref="card => note_refs[note.uid] = card"
                   v-bind:note="note"
                   v-bind="$attrs" />
    `,
    data: function () {
        return {
            note_refs: {},
            render_limit: 20,
        };
    },
    computed: {
        visible_notes: function () {
            return this.notes.slice(0, this.render_limit);
        },
    },
    methods: {
        note_elem: function (note_uid) {
            return this.note_refs[note_uid]?.$el;
        },
        scroll_to: async function (note_uid) {
            const index = this.notes.findIndex(v => v.uid === note_uid);
            if (index !== -1 && index >= this.render_limit) {
                this.render_limit = index + 1;
                await this.$nextTick();
            }
            this.note_elem(note_uid)?.scrollIntoView({behavior: 'smooth', block: 'center'});
        },
        ramp_up: async function () {
            // Let the first render_limit cards paint before mounting the rest,
            // in idle chunks to keep the page responsive.
            await this.$nextTick();
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
            const idle = window.requestIdleCallback
                ? (fn => window.requestIdleCallback(fn))
                : (fn => setTimeout(fn, 50));
            const step = () => {
                if (this.render_limit >= this.notes.length) {
                    this.render_limit = Infinity;
                    return;
                }
                this.render_limit += 50;
                idle(step);
            };
            idle(step);
        },
    },
});
