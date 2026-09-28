// The top panel of the notes page. It sticks to the top of the window, slides
// away while the page scrolls down and comes back on any scroll up.
// The panel's sticky top in the CSS below.
const STICKY_HEAD_TOP = -18;
const STICKY_HEAD_HIDE_AFTER = 24;
const STICKY_HEAD_SHOW_AFTER = 4;

app.component('sticky-head', {
    props: {
        // Keep the panel shown, e.g. while one of its popovers is open.
        hold: { type: Boolean, default: false },
    },
    template: `
        <div ref="sentinel" class="sticky-head-sentinel"></div>
        <div v-bind:class="['sticky-head', {pinned: pinned, hidden: (hidden && !hold)}]">
            <div class="sticky-head-bg"></div>
            <slot />
        </div>
    `,
    data: function () {
        return {
            pinned: false,
            hidden: false,
        };
    },
    methods: {
        schedule_update: function () {
            if (!this.frame) {
                this.frame = requestAnimationFrame(this.update);
            }
        },
        update: function () {
            this.frame = null;
            const y = window.scrollY;
            const dy = y - this.last_y;
            this.last_y = y;
            this.pinned = this.$refs.sentinel.getBoundingClientRect().top < STICKY_HEAD_TOP;
            if (!this.pinned) {
                this.hidden = false;
                this.travel = 0;
                return;
            }
            // Travel counts the distance scrolled in one direction, so a stray
            // pixel of scroll anchoring does not flip the panel.
            this.travel = (Math.sign(dy) === Math.sign(this.travel)) ? this.travel + dy : dy;
            if (this.travel > STICKY_HEAD_HIDE_AFTER) {
                this.hidden = true;
            }
            else if (this.travel < -STICKY_HEAD_SHOW_AFTER) {
                this.hidden = false;
            }
        },
    },
    created: function () {
        this.frame = null;
        this.last_y = window.scrollY;
        this.travel = 0;
    },
    mounted: function () {
        window.addEventListener('scroll', this.schedule_update, {passive: true});
        window.addEventListener('resize', this.schedule_update, {passive: true});
        this.update();
    },
    unmounted: function () {
        window.removeEventListener('scroll', this.schedule_update);
        window.removeEventListener('resize', this.schedule_update);
        cancelAnimationFrame(this.frame);
    },
});

css`
    .sticky-head {
        position: sticky;
        top: -18px;
        z-index: 50;
        display: flow-root;
        /* Outside the panel, the note input's 30px top margin merged with the
           body's 8px; the panel keeps it inside, so it gives those 8px back. */
        margin-top: -8px;
        transition: transform 0.22s ease;
    }

    .sticky-head.hidden:not(:focus-within) {
        transform: translateY(calc(-100% - 12px));
    }

    /* The page background behind the panel, across the whole window, so the
       notes slide under it. A clipped shadow paints it without overflowing. */
    .sticky-head-bg {
        position: absolute;
        inset: 0;
        z-index: -1;
        background: #e3e6ee;
        box-shadow: 0 0 0 100vmax #e3e6ee;
        clip-path: inset(0 -100vmax);
    }

    .sticky-head::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        height: 12px;
        background: linear-gradient(#e3e6ee, #e3e6ee00);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.22s ease;
    }

    .sticky-head.pinned::after {
        opacity: 1;
    }
`;
