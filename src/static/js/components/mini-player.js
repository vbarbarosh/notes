const MINI_PLAYER_STORAGE_KEY = 'notes.mini_player';
const MINI_PLAYER_DEFAULT_WIDTH = 360;
const MINI_PLAYER_DEFAULT_LIST_HEIGHT = 172;
const MINI_PLAYER_MIN_WIDTH = 280;
const MINI_PLAYER_MAX_WIDTH = 720;
const MINI_PLAYER_MIN_LIST_HEIGHT = 80;
const MINI_PLAYER_MAX_LIST_HEIGHT = 480;
const MINI_PLAYER_DEFAULT_COVER_HEIGHT = 132;
const MINI_PLAYER_MIN_COVER_HEIGHT = 56;
const MINI_PLAYER_MAX_COVER_HEIGHT = 360;
const MINI_PLAYER_SNAP_THRESHOLD = 24;
const MINI_PLAYER_EDGE_MARGIN = 18;

app.component('mini-player', {
    props: {
        tracks: { type: Array, required: true },
        hoveredNoteUid: { type: String, default: null },
        hoveredFilePath: { type: String, default: null },
    },
    emits: ['select-note', 'heart', 'hover-track'],
    template: `
        <div
            v-if="snap_preview"
            v-bind:class="snap_hint_class"
            v-bind:style="snap_hint_style"
            aria-hidden="true">
            <span class="mini-player-snap-hint-label">
                <i class="ti ti-layout-sidebar" aria-hidden="true"></i>
                Snap to {{ snap_preview }}
            </span>
        </div>
        <div
            v-show="(tracks.length && !state.hidden)"
            v-bind:class="root_class"
            v-bind:style="player_style"
            ref="root">
            <div
                v-on:pointerdown="drag_start"
                v-bind:style="cover_style"
                class="mini-player-cover">
                <video
                    v-if="(current_track?.kind === 'video')"
                    v-on:ended="next"
                    v-on:play="on_play"
                    v-on:pause="on_pause"
                    v-on:timeupdate="on_timeupdate"
                    v-on:durationchange="on_durationchange"
                    v-on:loadedmetadata="on_loadedmetadata"
                    v-bind:key="current_track.url"
                    v-bind:src="current_track.url"
                    v-bind:poster="(current_track.cover_url || null)"
                    ref="media"
                    playsinline
                    preload="metadata"
                    class="mini-player-video"></video>
                <template v-else>
                    <img v-if="current_track?.cover_url" v-bind:src="current_track.cover_url" alt="">
                    <div v-else class="mini-player-cover-empty">
                        <i v-bind:class="empty_cover_icon_class" aria-hidden="true"></i>
                    </div>
                </template>
                <div class="mini-player-cover-shade">
                    <div class="mini-player-title">{{ current_track?.title }}</div>
                    <div class="mini-player-subtitle">{{ current_track?.note_label }}</div>
                </div>
                <button
                    v-on:pointerdown.stop
                    v-on:click="hide"
                    type="button"
                    class="mini-player-hide"
                    title="Minimize player">
                    <i class="ti ti-minus" aria-hidden="true"></i>
                </button>
            </div>
            <div v-on:pointerdown="resize_start($event, 'cover')" class="mini-player-divider"></div>
            <audio
                v-if="(current_track && current_track.kind !== 'video')"
                v-on:ended="next"
                v-on:play="on_play"
                v-on:pause="on_pause"
                v-on:timeupdate="on_timeupdate"
                v-on:durationchange="on_durationchange"
                v-on:loadedmetadata="on_loadedmetadata"
                v-bind:key="current_track.url"
                v-bind:src="current_track.url"
                ref="media"
                preload="metadata"></audio>
            <div class="mini-player-seek-row">
                <span class="mini-player-time">{{ format_time(current_time) }}</span>
                <input
                    v-on:input="seek($event.target.value)"
                    v-bind:max="(duration || 0)"
                    v-bind:value="current_time"
                    v-bind:disabled="!duration"
                    v-bind:style="seek_style"
                    type="range"
                    class="mini-player-seek"
                    min="0"
                    step="0.1">
                <span class="mini-player-time">{{ format_time(duration) }}</span>
            </div>
            <div class="mini-player-controls">
                <button
                    v-on:click="prev"
                    type="button"
                    class="mini-player-btn"
                    title="Previous track">
                    <i class="ti ti-player-track-prev" aria-hidden="true"></i>
                </button>
                <button
                    v-on:click="toggle_play"
                    v-bind:title="(playing ? 'Pause' : 'Play')"
                    type="button"
                    class="mini-player-btn mini-player-btn-primary">
                    <i v-bind:class="play_icon_class" aria-hidden="true"></i>
                </button>
                <button
                    v-on:click="next"
                    type="button"
                    class="mini-player-btn"
                    title="Next track">
                    <i class="ti ti-player-track-next" aria-hidden="true"></i>
                </button>
                <div class="mini-player-volume">
                    <button
                        v-on:click="toggle_mute"
                        v-bind:title="(effective_volume === 0 ? 'Unmute' : 'Mute')"
                        type="button"
                        class="mini-player-btn mini-player-btn-small">
                        <i v-bind:class="['ti', volume_icon]" aria-hidden="true"></i>
                    </button>
                    <input
                        v-on:input="set_volume($event.target.value)"
                        v-bind:value="effective_volume"
                        v-bind:style="volume_slider_style"
                        type="range"
                        class="mini-player-volume-slider"
                        min="0"
                        max="1"
                        step="0.01">
                </div>
                <span class="mini-player-spacer"></span>
                <span class="mini-player-count">{{ track_index + 1 }} / {{ tracks.length }}</span>
                <button
                    v-on:click="heart_current"
                    v-bind:disabled="!current_track"
                    v-bind:title="heart_button_title"
                    class="mini-player-btn mini-player-btn-small mini-player-heart"
                    type="button">
                    <svg v-bind:class="heart_icon_class" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 21s-7.2-4.35-9.55-8.85C.25 7.95 2.85 4 6.85 4c2.1 0 3.85 1.15 5.15 3.05C13.3 5.15 15.05 4 17.15 4c4 0 6.6 3.95 4.4 8.15C19.2 16.65 12 21 12 21z"/>
                    </svg>
                    <template v-for="p in particles" v-bind:key="p.id">
                        <span
                            v-if="(p.kind === 'ring')"
                            class="mini-player-particle mini-player-particle-ring"
                            aria-hidden="true"></span>
                        <span
                            v-else-if="(p.kind === 'particle')"
                            v-bind:style="p.style"
                            class="mini-player-particle mini-player-particle-dot"
                            aria-hidden="true"></span>
                        <span
                            v-else-if="(p.kind === 'plus')"
                            v-bind:style="p.style"
                            class="mini-player-particle mini-player-particle-plus"
                            aria-hidden="true">{{ p.text }}</span>
                    </template>
                </button>
            </div>
            <div v-bind:style="list_style" class="mini-player-list">
                <div
                    v-for="track in tracks"
                    v-bind:key="track.key"
                    v-on:mouseenter="hover_row(track)"
                    v-on:mouseleave="unhover_row(track)"
                    v-bind:class="list_row_class(track)">
                    <button
                        v-on:click="play(track.key)"
                        type="button"
                        class="mini-player-list-main">
                        <span class="mini-player-list-title">{{ track.title }}</span>
                        <span v-if="track.meta" class="mini-player-list-note">{{ track.meta }}</span>
                    </button>
                    <span
                        v-if="(track.heart_count > 0)"
                        v-bind:title="(track.heart_count + ' hearts')"
                        class="mini-player-list-heart">
                        <svg class="mini-player-list-heart-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 21s-7.2-4.35-9.55-8.85C.25 7.95 2.85 4 6.85 4c2.1 0 3.85 1.15 5.15 3.05C13.3 5.15 15.05 4 17.15 4c4 0 6.6 3.95 4.4 8.15C19.2 16.65 12 21 12 21z"/>
                        </svg>
                        <span>{{ track.heart_count }}</span>
                    </span>
                    <span v-else class="mini-player-list-heart mini-player-list-heart-empty"></span>
                    <button
                        v-on:click="scroll_to_note(track)"
                        type="button"
                        class="mini-player-list-note-button"
                        title="Scroll to note">
                        <i class="ti ti-notes" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
            <div v-on:pointerdown="resize_start($event, 'n')" class="mini-player-edge mini-player-edge-n"></div>
            <div v-on:pointerdown="resize_start($event, 's')" class="mini-player-edge mini-player-edge-s"></div>
            <div v-on:pointerdown="resize_start($event, 'e')" class="mini-player-edge mini-player-edge-e"></div>
            <div v-on:pointerdown="resize_start($event, 'w')" class="mini-player-edge mini-player-edge-w"></div>
        </div>
        <button
            v-if="(tracks.length && state.hidden)"
            v-on:click="show"
            v-bind:class="['mini-player-restore', {playing}]"
            v-bind:title="(playing ? 'Now playing — show player' : 'Show MP3 player')"
            type="button">
            <span v-if="playing" class="mini-player-vapor" aria-hidden="true">
                <i class="ti ti-music mini-player-vapor-note mini-player-vapor-note-1"></i>
                <i class="ti ti-music mini-player-vapor-note mini-player-vapor-note-2"></i>
                <i class="ti ti-music mini-player-vapor-note mini-player-vapor-note-3"></i>
            </span>
            <i class="ti ti-music mini-player-restore-icon" aria-hidden="true"></i>
            <span>{{ tracks.length }}</span>
        </button>
    `,
    data: function () {
        return {
            state: {
                ...load_mini_player_state(),
                drag: null,
            },
            playing: false,
            current_time: 0,
            duration: 0,
            pre_mute_volume: null,
            snap_preview: null,
            particles: [],
            heart_popping: false,
        };
    },
    computed: {
        track_index: function () {
            const i = this.tracks.findIndex(track => track.key === this.state.key);
            return i === -1 ? 0 : i;
        },
        current_track: function () {
            return this.tracks[this.track_index] || null;
        },
        player_style: function () {
            if (this.state.snap === 'left' || this.state.snap === 'right') {
                return {width: `${this.state.width}px`};
            }
            const style = {width: `${this.state.width}px`};
            if (this.state.x !== null) {
                style.left = `${this.state.x}px`;
                style.right = 'auto';
            }
            if (this.state.y !== null) {
                style.top = `${this.state.y}px`;
                style.bottom = 'auto';
            }
            return style;
        },
        list_style: function () {
            if (this.state.snap) {
                return null;
            }
            return {height: `${this.state.list_height}px`};
        },
        effective_volume: function () {
            return this.state.volume;
        },
        seek_progress_pct: function () {
            if (!this.duration) {
                return 0;
            }
            return Math.min(100, Math.max(0, (this.current_time / this.duration) * 100));
        },
        volume_icon: function () {
            if (this.effective_volume === 0) {
                return 'ti-volume-off';
            }
            if (this.effective_volume < 0.34) {
                return 'ti-volume-3';
            }
            if (this.effective_volume < 0.67) {
                return 'ti-volume-2';
            }
            return 'ti-volume';
        },
        snap_hint_class: function () {
            if (this.snap_preview === 'left') {
                return ['mini-player-snap-hint', 'side-left'];
            }
            if (this.snap_preview === 'right') {
                return ['mini-player-snap-hint', 'side-right'];
            }
            return [];
        },
        snap_hint_style: function () {
            return {width: `${this.state.width}px`};
        },
        root_class: function () {
            if (this.state.snap === 'left') {
                return ['mini-player', 'snapped-left'];
            }
            if (this.state.snap === 'right') {
                return ['mini-player', 'snapped-right'];
            }
            return ['mini-player'];
        },
        cover_style: function () {
            return {height: `${this.state.cover_height}px`};
        },
        empty_cover_icon_class: function () {
            if (this.current_track?.kind === 'video') {
                return ['ti', 'ti-movie'];
            }
            return ['ti', 'ti-music'];
        },
        play_icon_class: function () {
            return ['ti', this.playing ? 'ti-player-pause' : 'ti-player-play'];
        },
        heart_count: function () {
            return this.current_track?.heart_count || 0;
        },
        heart_icon_class: function () {
            const classes = ['mini-player-heart-icon'];
            if (this.heart_count >= 1) {
                classes.push('liked');
            }
            if (this.heart_count >= 5) {
                classes.push('tier-2');
            }
            if (this.heart_count >= 10) {
                classes.push('tier-3');
            }
            if (this.heart_popping) {
                classes.push('popping');
            }
            return classes;
        },
        heart_button_title: function () {
            if (!this.current_track) {
                return 'Heart this moment';
            }
            const count = this.heart_count;
            if (count === 0) {
                return 'Heart this moment';
            }
            if (count === 1) {
                return '1 heart · click to add another';
            }
            return `${count} hearts · click to add another`;
        },
        seek_style: function () {
            return {'--progress': `${this.seek_progress_pct}%`};
        },
        volume_slider_style: function () {
            return {'--progress': `${this.effective_volume * 100}%`};
        },
    },
    watch: {
        tracks: {
            immediate: true,
            handler: function () {
                this.ensure_track();
            },
        },
        state: {
            deep: true,
            handler: function (value) {
                if (value.drag) {
                    return;
                }
                this.persist_state();
            },
        },
        'state.key': function () {
            this.$nextTick(this.scroll_active_into_view);
        },
        hoveredNoteUid: function () {
            this.$nextTick(this.scroll_hovered_into_view);
        },
        hoveredFilePath: function () {
            this.$nextTick(this.scroll_hovered_into_view);
        },
        'state.volume': function (value) {
            if (this.$refs.media) {
                this.$refs.media.volume = value;
            }
        },
    },
    methods: {
        hover_row: function (track) {
            this.$emit('hover-track', track.note_uid, track.file_path);
        },
        unhover_row: function (track) {
            if (this.hoveredNoteUid === track.note_uid && this.hoveredFilePath === track.file_path) {
                this.$emit('hover-track', null, null);
            }
        },
        list_row_class: function (track) {
            return ['mini-player-list-row', {
                active: this.current_track?.key === track.key,
                hovered: (track.note_uid === this.hoveredNoteUid && track.file_path === this.hoveredFilePath),
            }];
        },
        scroll_active_into_view: function () {
            const root = this.$refs.root;
            if (!root) {
                return;
            }
            const row = root.querySelector('.mini-player-list-row.active');
            row?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        },
        scroll_hovered_into_view: function () {
            const root = this.$refs.root;
            if (!root || !this.hoveredNoteUid || !this.hoveredFilePath) {
                return;
            }
            const row = root.querySelector('.mini-player-list-row.hovered');
            row?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        },
        heart_current: function () {
            if (!this.current_track) {
                return;
            }
            this.spawn_celebration();
            this.heart_popping = false;
            this.$nextTick(() => {
                this.heart_popping = true;
            });
            this.$emit(
                'heart',
                this.current_track.note_uid,
                this.current_track.file_path,
                this.current_time,
                this.current_track.sha256,
            );
        },
        next_particle_id: function () {
            this._part_seq = (this._part_seq || 0) + 1;
            return this._part_seq;
        },
        spawn_celebration: function () {
            const spawned_ids = [];
            const palette = ['#f472b6', '#fb7185', '#facc15', '#f9a8d4', '#fde68a', '#ec4899'];
            const base_offsets = [
                {x: -34, y: -22, delay: 0},
                {x: -16, y: -36, delay: 20},
                {x: 14,  y: -38, delay: 40},
                {x: 36,  y: -20, delay: 30},
                {x: 30,  y: 20,  delay: 60},
                {x: -28, y: 22,  delay: 50},
            ];

            const ring_id = this.next_particle_id();
            spawned_ids.push(ring_id);
            this.particles.push({id: ring_id, kind: 'ring'});

            base_offsets.forEach((offset, i) => {
                const jitter_x = Math.round((Math.random() - 0.5) * 10);
                const jitter_y = Math.round((Math.random() - 0.5) * 10);
                const id = this.next_particle_id();
                spawned_ids.push(id);
                this.particles.push({
                    id,
                    kind: 'particle',
                    style: {
                        '--x': `${offset.x + jitter_x}px`,
                        '--y': `${offset.y + jitter_y}px`,
                        '--color': palette[i % palette.length],
                        animationDelay: `${offset.delay}ms`,
                    },
                });
            });

            const plus_x = Math.round((Math.random() - 0.5) * 26);
            const plus_id = this.next_particle_id();
            const next_count = (this.current_track?.heart_count || 0) + 1;
            spawned_ids.push(plus_id);
            this.particles.push({
                id: plus_id,
                kind: 'plus',
                text: `+${next_count}`,
                style: {'--x': `${plus_x}px`},
            });

            setTimeout(() => {
                this.particles = this.particles.filter(p => !spawned_ids.includes(p.id));
            }, 1400);
        },
        persist_state: function () {
            const v = this.state;
            localStorage.setItem(MINI_PLAYER_STORAGE_KEY, JSON.stringify({
                key: v.key,
                x: v.x,
                y: v.y,
                hidden: v.hidden,
                volume: v.volume,
                position: v.position,
                was_playing: v.was_playing,
                width: v.width,
                list_height: v.list_height,
                cover_height: v.cover_height,
                snap: v.snap,
            }));
        },
        ensure_track: function () {
            if (!this.tracks.length) {
                return;
            }
            if (!this.tracks.some(track => track.key === this.state.key)) {
                this.state.key = this.tracks[0].key;
                this.state.position = 0;
            }
        },
        play: function (key) {
            if (key !== this.state.key) {
                this.state.position = 0;
            }
            this.state.key = key;
            this.state.hidden = false;
            this.$nextTick(() => this.$refs.media?.play().catch(() => {}));
        },
        hide: function () {
            this.state.hidden = true;
        },
        show: function () {
            this.state.hidden = false;
            this.ensure_track();
            this.$nextTick(this.clamp_to_viewport);
        },
        toggle_play: function () {
            const audio = this.$refs.media;
            if (!audio) {
                return;
            }
            if (audio.paused) {
                audio.play().catch(() => {});
            }
            else {
                audio.pause();
            }
        },
        seek: function (value) {
            const audio = this.$refs.media;
            const seconds = Number(value);
            if (!audio || !Number.isFinite(seconds)) {
                return;
            }
            audio.currentTime = seconds;
            this.current_time = seconds;
            this.state.position = seconds;
            this._last_position_save = Date.now();
        },
        set_volume: function (value) {
            const v = Math.min(1, Math.max(0, Number(value) || 0));
            this.state.volume = v;
            if (v > 0) {
                this.pre_mute_volume = null;
            }
        },
        toggle_mute: function () {
            if (this.state.volume > 0) {
                this.pre_mute_volume = this.state.volume;
                this.state.volume = 0;
                return;
            }
            this.state.volume = this.pre_mute_volume || 1;
            this.pre_mute_volume = null;
        },
        format_time: function (seconds) {
            return format_mp3_time(seconds);
        },
        on_timeupdate: function (event) {
            const t = event.target.currentTime || 0;
            this.current_time = t;
            const now = Date.now();
            if (!this._last_position_save || now - this._last_position_save > 3000) {
                this._last_position_save = now;
                this.state.position = t;
            }
        },
        on_durationchange: function (event) {
            this.duration = Number.isFinite(event.target.duration) ? event.target.duration : 0;
        },
        on_loadedmetadata: function (event) {
            const audio = event.target;
            audio.volume = this.state.volume;
            this.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
            const target = this.state.position;
            if (target > 0 && Number.isFinite(target)) {
                const pos = audio.duration ? Math.min(target, audio.duration) : target;
                try { audio.currentTime = pos; }
                catch (error) {}
                this.current_time = pos;
            }
            if (this._autoresume_pending) {
                this.try_autoresume();
            }
        },
        try_autoresume: function () {
            const audio = this.$refs.media;
            if (!audio || !this._autoresume_pending) {
                return;
            }
            const promise = audio.play();
            if (!promise || typeof promise.then !== 'function') {
                this._autoresume_pending = false;
                this.teardown_gesture_listener();
                return;
            }
            promise.then(
                () => {
                    this._autoresume_pending = false;
                    this.teardown_gesture_listener();
                },
                () => {
                    this.install_gesture_listener();
                }
            );
        },
        install_gesture_listener: function () {
            if (this._gesture_handler) {
                return;
            }
            this._gesture_handler = () => this.try_autoresume();
            window.addEventListener('click', this._gesture_handler);
            window.addEventListener('keydown', this._gesture_handler);
        },
        teardown_gesture_listener: function () {
            if (!this._gesture_handler) {
                return;
            }
            window.removeEventListener('click', this._gesture_handler);
            window.removeEventListener('keydown', this._gesture_handler);
            this._gesture_handler = null;
        },
        on_play: function () {
            this.playing = true;
            this.state.was_playing = true;
            this._autoresume_pending = false;
            this.teardown_gesture_listener();
        },
        on_pause: function (event) {
            if (event.target !== this.$refs.media) {
                return;
            }
            this.playing = false;
            this.state.was_playing = false;
            if (Number.isFinite(event.target.currentTime)) {
                this.state.position = event.target.currentTime;
            }
        },
        prev: function () {
            this.step(-1);
        },
        next: function () {
            this.step(1);
        },
        step: function (delta) {
            if (!this.tracks.length) {
                return;
            }
            const index = (this.track_index + delta + this.tracks.length) % this.tracks.length;
            const new_key = this.tracks[index].key;
            if (new_key !== this.state.key) {
                this.state.position = 0;
            }
            this.state.key = new_key;
            this.$nextTick(() => this.$refs.media?.play().catch(() => {}));
        },
        scroll_to_note: function (track) {
            if (!track?.note_uid) {
                return;
            }
            this.$emit('select-note', track.note_uid);
        },
        drag_start: function (event) {
            if (event.button !== undefined && event.button !== 0) {
                return;
            }
            const elem = this.$refs.root;
            const rect = elem.getBoundingClientRect();
            this.state.snap = null;
            this.state.x = rect.left;
            this.state.y = rect.top;
            this.state.drag = {
                pointer_id: event.pointerId,
                start_x: event.clientX,
                start_y: event.clientY,
                origin_x: rect.left,
                origin_y: rect.top,
                width: rect.width,
                height: rect.height,
            };
            elem.setPointerCapture?.(event.pointerId);
            document.addEventListener('pointermove', this.drag_move);
            document.addEventListener('pointerup', this.drag_end);
            event.preventDefault();
        },
        drag_move: function (event) {
            const drag = this.state.drag;
            if (!drag || event.pointerId !== drag.pointer_id) {
                return;
            }
            const elem = this.$refs.root;
            const rect = elem ? elem.getBoundingClientRect() : {width: drag.width, height: drag.height};
            const max_x = Math.max(0, window.innerWidth - rect.width);
            const max_y = Math.max(0, window.innerHeight - rect.height);
            this.state.x = Math.min(max_x, Math.max(0, drag.origin_x + event.clientX - drag.start_x));
            this.state.y = Math.min(max_y, Math.max(0, drag.origin_y + event.clientY - drag.start_y));
            this.snap_preview = this.snap_side_for_pointer(event.clientX);
        },
        drag_end: function (event) {
            const drag = this.state.drag;
            if (drag && event.pointerId === drag.pointer_id) {
                this.state.drag = null;
                this.state.snap = this.snap_side_for_pointer(event.clientX);
            }
            this.snap_preview = null;
            document.removeEventListener('pointermove', this.drag_move);
            document.removeEventListener('pointerup', this.drag_end);
        },
        snap_side_for_pointer: function (client_x) {
            if (client_x < MINI_PLAYER_SNAP_THRESHOLD) {
                return 'left';
            }
            if (client_x > window.innerWidth - MINI_PLAYER_SNAP_THRESHOLD) {
                return 'right';
            }
            return null;
        },
        resize_start: function (event, direction) {
            if (event.button !== undefined && event.button !== 0) {
                return;
            }
            const elem = this.$refs.root;
            if (elem && !this.state.snap) {
                const rect = elem.getBoundingClientRect();
                if (this.state.x === null) {
                    this.state.x = rect.left;
                }
                if (this.state.y === null) {
                    this.state.y = rect.top;
                }
            }
            this._resize = {
                pointer_id: event.pointerId,
                direction,
                start_x: event.clientX,
                start_y: event.clientY,
                origin_width: this.state.width,
                origin_list_height: this.state.list_height,
                origin_cover_height: this.state.cover_height,
                origin_x: this.state.x,
                origin_y: this.state.y,
                snap: this.state.snap,
            };
            event.target.setPointerCapture?.(event.pointerId);
            document.addEventListener('pointermove', this.resize_move);
            document.addEventListener('pointerup', this.resize_end);
            event.preventDefault();
            event.stopPropagation();
        },
        resize_move: function (event) {
            const r = this._resize;
            if (!r || event.pointerId !== r.pointer_id) {
                return;
            }
            const dx = event.clientX - r.start_x;
            const dy = event.clientY - r.start_y;
            const max_width_avail = Math.max(MINI_PLAYER_MIN_WIDTH, window.innerWidth - 2 * MINI_PLAYER_EDGE_MARGIN);
            const max_width = Math.min(MINI_PLAYER_MAX_WIDTH, max_width_avail);
            const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
            switch (r.direction) {
            case 'e': {
                this.state.width = clamp(r.origin_width + dx, MINI_PLAYER_MIN_WIDTH, max_width);
                break;
            }
            case 'w': {
                const new_w = clamp(r.origin_width - dx, MINI_PLAYER_MIN_WIDTH, max_width);
                this.state.width = new_w;
                if (!r.snap && r.origin_x !== null) {
                    const origin_right = r.origin_x + r.origin_width;
                    this.state.x = Math.max(0, origin_right - new_w);
                }
                break;
            }
            case 's': {
                if (r.snap) {
                    break;
                }
                this.state.list_height = clamp(r.origin_list_height + dy, MINI_PLAYER_MIN_LIST_HEIGHT, MINI_PLAYER_MAX_LIST_HEIGHT);
                break;
            }
            case 'n': {
                if (r.snap) {
                    break;
                }
                const new_list = clamp(r.origin_list_height - dy, MINI_PLAYER_MIN_LIST_HEIGHT, MINI_PLAYER_MAX_LIST_HEIGHT);
                this.state.list_height = new_list;
                if (r.origin_y !== null) {
                    const delta = new_list - r.origin_list_height;
                    this.state.y = Math.max(0, r.origin_y - delta);
                }
                break;
            }
            case 'cover': {
                this.state.cover_height = clamp(r.origin_cover_height + dy, MINI_PLAYER_MIN_COVER_HEIGHT, MINI_PLAYER_MAX_COVER_HEIGHT);
                break;
            }
            }
        },
        resize_end: function (event) {
            if (this._resize && event.pointerId === this._resize.pointer_id) {
                this._resize = null;
            }
            document.removeEventListener('pointermove', this.resize_move);
            document.removeEventListener('pointerup', this.resize_end);
        },
        clamp_to_viewport: function () {
            const elem = this.$refs.root;
            if (!elem) {
                return;
            }
            const max_width_available = Math.max(MINI_PLAYER_MIN_WIDTH, window.innerWidth - 2 * MINI_PLAYER_EDGE_MARGIN);
            if (this.state.width > max_width_available) {
                this.state.width = Math.min(MINI_PLAYER_MAX_WIDTH, max_width_available);
            }
            const rect = elem.getBoundingClientRect();
            if (this.state.x !== null && !this.state.snap) {
                const max_x = Math.max(0, window.innerWidth - rect.width);
                this.state.x = Math.min(max_x, Math.max(0, this.state.x));
            }
            if (this.state.y !== null) {
                const max_y = Math.max(0, window.innerHeight - rect.height);
                this.state.y = Math.min(max_y, Math.max(0, this.state.y));
            }
        },
    },
    created: function () {
        this._autoresume_pending = this.state.was_playing && !!this.state.key;
        this._last_position_save = 0;
        this.save_progress_now = () => {
            const audio = this.$refs.media;
            if (audio && Number.isFinite(audio.currentTime)) {
                this.state.position = audio.currentTime;
            }
            this.persist_state();
        };
    },
    mounted: function () {
        window.addEventListener('resize', this.clamp_to_viewport);
        window.addEventListener('beforeunload', this.save_progress_now);
        window.addEventListener('pagehide', this.save_progress_now);
        this.$nextTick(this.clamp_to_viewport);
    },
    unmounted: function () {
        window.removeEventListener('resize', this.clamp_to_viewport);
        window.removeEventListener('beforeunload', this.save_progress_now);
        window.removeEventListener('pagehide', this.save_progress_now);
        document.removeEventListener('pointermove', this.drag_move);
        document.removeEventListener('pointerup', this.drag_end);
        document.removeEventListener('pointermove', this.resize_move);
        document.removeEventListener('pointerup', this.resize_end);
        this.teardown_gesture_listener();
    },
});

function load_mini_player_state()
{
    const defaults = {
        key: null, x: null, y: null, hidden: false, volume: 1, position: 0, was_playing: false,
        width: MINI_PLAYER_DEFAULT_WIDTH, list_height: MINI_PLAYER_DEFAULT_LIST_HEIGHT,
        cover_height: MINI_PLAYER_DEFAULT_COVER_HEIGHT, snap: null,
    };
    try {
        const value = JSON.parse(localStorage.getItem(MINI_PLAYER_STORAGE_KEY) || 'null');
        if (!value || typeof value !== 'object') {
            return defaults;
        }
        const snap = value.snap === 'left' || value.snap === 'right' ? value.snap : null;
        return {
            key: typeof value.key === 'string' ? value.key : null,
            x: Number.isFinite(value.x) ? value.x : null,
            y: Number.isFinite(value.y) ? value.y : null,
            hidden: !!value.hidden,
            volume: Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : 1,
            position: Number.isFinite(value.position) && value.position >= 0 ? value.position : 0,
            was_playing: !!value.was_playing,
            width: Number.isFinite(value.width)
                ? Math.min(MINI_PLAYER_MAX_WIDTH, Math.max(MINI_PLAYER_MIN_WIDTH, value.width))
                : MINI_PLAYER_DEFAULT_WIDTH,
            list_height: Number.isFinite(value.list_height)
                ? Math.min(MINI_PLAYER_MAX_LIST_HEIGHT, Math.max(MINI_PLAYER_MIN_LIST_HEIGHT, value.list_height))
                : MINI_PLAYER_DEFAULT_LIST_HEIGHT,
            cover_height: Number.isFinite(value.cover_height)
                ? Math.min(MINI_PLAYER_MAX_COVER_HEIGHT, Math.max(MINI_PLAYER_MIN_COVER_HEIGHT, value.cover_height))
                : MINI_PLAYER_DEFAULT_COVER_HEIGHT,
            snap,
        };
    }
    catch (error) {
        return defaults;
    }
}

function format_mp3_time(seconds)
{
    seconds = Math.floor(Number(seconds));
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    if (h) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

css`
    .mini-player {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 500;
        max-width: calc(100vw - 36px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #c7cde2;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 14px 38px rgba(13, 22, 48, 0.22);
    }

    .mini-player.snapped-left,
    .mini-player.snapped-right {
        top: 0;
        bottom: 0;
        max-width: 70vw;
        border-radius: 0;
        border-top: 0;
        border-bottom: 0;
    }

    .mini-player.snapped-left {
        left: 0;
        right: auto;
        border-left: 0;
        border-right: 0;
        box-shadow: 6px 0 26px rgba(13, 22, 48, 0.18);
    }

    .mini-player.snapped-right {
        right: 0;
        left: auto;
        border-right: 0;
        border-left: 0;
        box-shadow: -6px 0 26px rgba(13, 22, 48, 0.18);
    }

    .mini-player.snapped-left .mini-player-list,
    .mini-player.snapped-right .mini-player-list {
        flex: 1 1 auto;
        max-height: none;
    }

    .mini-player-cover {
        position: relative;
        height: 132px;
        flex-shrink: 0;
        background: linear-gradient(135deg, #1f2640 0%, #2b3358 100%);
        cursor: move;
        user-select: none;
    }

    .mini-player-video {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        background: #000;
    }

    .mini-player-cover img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
    }

    .mini-player-cover-empty {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #d8dced;
    }

    .mini-player-cover-empty i {
        font-size: 42px;
        opacity: 0.85;
    }

    .mini-player-hide {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.28);
        border-radius: 8px;
        background: rgba(0,0,0,0.32);
        color: #fff;
        cursor: pointer;
        transition: background 0.15s, transform 0.15s;
    }

    .mini-player-hide:hover {
        background: rgba(0,0,0,0.55);
    }

    .mini-player-cover-shade {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 36px 14px 12px;
        color: #fff;
        background: linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0));
    }

    .mini-player-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 700;
        font-size: 14px;
    }

    .mini-player-subtitle {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255,255,255,0.78);
        font-size: 12px;
    }

    .mini-player-meta {
        padding: 10px 14px 0;
        color: #6f7485;
        font-size: 12px;
    }

    .mini-player-seek-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px 4px;
    }

    .mini-player-time {
        flex-shrink: 0;
        min-width: 36px;
        color: #6f7485;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
    }

    .mini-player-time:last-child {
        text-align: right;
    }

    .mini-player-seek,
    .mini-player-volume-slider {
        flex: 1;
        min-width: 0;
        height: 18px;
        margin: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }

    .mini-player-seek::-webkit-slider-runnable-track,
    .mini-player-volume-slider::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(to right,
            #2486fd 0%, #2486fd var(--progress, 0%),
            #e1e6f0 var(--progress, 0%), #e1e6f0 100%);
    }

    .mini-player-seek::-moz-range-track,
    .mini-player-volume-slider::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(to right,
            #2486fd 0%, #2486fd var(--progress, 0%),
            #e1e6f0 var(--progress, 0%), #e1e6f0 100%);
    }

    .mini-player-seek::-webkit-slider-thumb,
    .mini-player-volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        margin-top: -5px;
        border: 2px solid #2486fd;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(36, 134, 253, 0.35);
        transition: transform 0.12s ease;
        cursor: pointer;
    }

    .mini-player-seek::-moz-range-thumb,
    .mini-player-volume-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: 2px solid #2486fd;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(36, 134, 253, 0.35);
        cursor: pointer;
    }

    .mini-player-seek:hover::-webkit-slider-thumb,
    .mini-player-volume-slider:hover::-webkit-slider-thumb {
        transform: scale(1.2);
    }

    .mini-player-seek:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .mini-player-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px 12px;
    }

    .mini-player-btn {
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #53627a;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, transform 0.12s;
    }

    .mini-player-btn:hover {
        background: #eef3fb;
        color: #2486fd;
    }

    .mini-player-btn:active {
        transform: scale(0.94);
    }

    .mini-player-btn i {
        font-size: 19px;
    }

    .mini-player-btn-small {
        width: 30px;
        height: 30px;
    }

    .mini-player-btn-small i {
        font-size: 16px;
    }

    .mini-player-btn-primary {
        width: 46px;
        height: 46px;
        background: linear-gradient(135deg, #3a96ff 0%, #1569ce 100%);
        color: #fff;
        box-shadow: 0 6px 14px rgba(36, 134, 253, 0.42);
    }

    .mini-player-btn-primary i {
        font-size: 22px;
    }

    .mini-player-btn-primary:hover {
        background: linear-gradient(135deg, #4ea3ff 0%, #1f74dc 100%);
        color: #fff;
        box-shadow: 0 8px 18px rgba(36, 134, 253, 0.5);
    }

    .mini-player-volume {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: 6px;
        min-width: 90px;
    }

    .mini-player-volume .mini-player-volume-slider {
        width: 60px;
        flex: 0 0 60px;
    }

    .mini-player-spacer {
        flex: 1;
    }

    .mini-player-count {
        margin-left: 4px;
        color: #6f7485;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
    }

    .mini-player-list {
        overflow: auto;
        overscroll-behavior: contain;
        border-top: 1px solid #e4e7f0;
        flex-shrink: 0;
        min-height: 0;
    }

    .mini-player-list-row {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto 34px;
        border-bottom: 1px solid #eef0f7;
        background: #fff;
        transition: background 0.12s;
    }

    .mini-player-list-heart {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 0 8px;
        color: #e0427a;
        font-size: 11px;
        font-weight: 700;
        align-self: center;
    }

    .mini-player-list-heart-icon {
        width: 13px;
        height: 13px;
        fill: #e0427a;
        display: block;
    }

    .mini-player-list-heart-empty {
        width: 0;
        padding: 0;
    }

    .mini-player-heart {
        position: relative;
        overflow: visible;
    }

    .mini-player-heart-icon {
        width: 15px;
        height: 15px;
        display: block;
        overflow: visible;
        transition: transform 0.18s ease-out;
    }

    .mini-player-heart-icon path {
        fill: transparent;
        stroke: #b6bfd5;
        stroke-width: 2.2;
        stroke-linejoin: round;
        transition: fill 0.2s, stroke 0.2s;
    }

    .mini-player-heart:hover .mini-player-heart-icon path {
        stroke: #ec4899;
    }

    .mini-player-heart-icon.liked path {
        fill: #ec4899;
        stroke: #ec4899;
    }

    .mini-player-heart-icon.tier-2 {
        filter: drop-shadow(0 0 4px rgba(236, 72, 153, 0.55));
    }

    .mini-player-heart-icon.tier-3 {
        filter: drop-shadow(0 0 7px rgba(236, 72, 153, 0.85));
        animation: mini-player-heart-glow 2.4s ease-in-out infinite;
    }

    @keyframes mini-player-heart-glow {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.1); }
    }

    .mini-player-heart-icon.popping {
        animation: mini-player-heart-pop 420ms cubic-bezier(0.2, 0.9, 0.35, 1);
    }

    @keyframes mini-player-heart-pop {
        0%   { transform: scale(1); }
        35%  { transform: scale(1.32); }
        100% { transform: scale(1); }
    }

    .mini-player-particle {
        position: absolute;
        left: 50%;
        top: 50%;
        pointer-events: none;
    }

    .mini-player-particle-ring {
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border: 2px solid rgba(236, 72, 153, 0.7);
        border-radius: 999px;
        opacity: 0;
        animation: mini-player-ring 540ms ease-out forwards;
    }

    @keyframes mini-player-ring {
        0%   { opacity: 0.85; transform: scale(0.45); }
        100% { opacity: 0;    transform: scale(2.1); }
    }

    .mini-player-particle-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--color, #f472b6);
        opacity: 0;
        transform: translate(-50%, -50%);
        animation: mini-player-dot 650ms ease-out forwards;
    }

    @keyframes mini-player-dot {
        0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.3);
        }
        70% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--x, 0px)), calc(-50% + var(--y, 0px))) scale(0.9);
        }
    }

    .mini-player-particle-plus {
        font-size: 18px;
        font-weight: 800;
        line-height: 1;
        color: #f9a8d4;
        text-shadow: 0 4px 14px rgba(236, 72, 153, 0.5);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        opacity: 0;
        transform: translate(-50%, -50%);
        animation: mini-player-plus 1200ms cubic-bezier(0.18, 0.9, 0.3, 1) forwards;
    }

    @keyframes mini-player-plus {
        0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.65);
        }
        15% {
            opacity: 1;
            transform: translate(calc(-50% + var(--x, 0px) * 0.2), calc(-50% - 18px)) scale(1.15);
        }
        62% {
            opacity: 1;
            transform: translate(calc(-50% + var(--x, 0px) * 0.72), calc(-50% - 58px)) scale(1);
        }
        100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--x, 0px)), calc(-50% - 82px)) scale(0.92);
        }
    }

    .mini-player-list-row:hover {
        background: #d6e4fb;
    }

    .mini-player-list-row.active {
        position: sticky;
        top: 0;
        bottom: 0;
        z-index: 1;
        background: #eef5ff;
    }

    .mini-player-list-row.active:hover {
        background: #c4dafa;
    }

    .mini-player-list-row.hovered {
        background: #f4f8e8;
        box-shadow: inset 3px 0 0 #5ba84a;
    }

    .mini-player-list-row.hovered.active {
        background: #eef5ff;
        box-shadow: inset 3px 0 0 #5ba84a;
    }

    .mini-player-list-main {
        min-width: 0;
        display: block;
        padding: 8px 12px;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #252837;
        text-align: left;
        cursor: pointer;
    }

    .mini-player-list-main:hover {
        background: transparent;
        color: #252837;
    }

    .mini-player-list-note-button {
        width: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 0;
        border-left: 1px solid #eef0f7;
        background: transparent;
        color: #53627a;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
    }

    .mini-player-list-note-button:hover {
        background: #eaf1ff;
        color: #2486fd;
    }

    .mini-player-list-title,
    .mini-player-list-note {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .mini-player-list-title {
        font-size: 12px;
        font-weight: 650;
    }

    .mini-player-list-note {
        margin-top: 2px;
        color: #6f7485;
        font-size: 11px;
    }

    .mini-player-edge {
        position: absolute;
        z-index: 3;
        background: transparent;
        user-select: none;
        touch-action: none;
    }

    .mini-player-edge-n {
        top: 0;
        left: 8px;
        right: 8px;
        height: 6px;
        cursor: ns-resize;
    }

    .mini-player-edge-s {
        bottom: 0;
        left: 8px;
        right: 8px;
        height: 6px;
        cursor: ns-resize;
    }

    .mini-player-edge-e {
        top: 8px;
        bottom: 8px;
        right: 0;
        width: 6px;
        cursor: ew-resize;
    }

    .mini-player-edge-w {
        top: 8px;
        bottom: 8px;
        left: 0;
        width: 6px;
        cursor: ew-resize;
    }

    .mini-player-divider {
        position: relative;
        height: 6px;
        margin-top: -3px;
        margin-bottom: -3px;
        z-index: 3;
        cursor: ns-resize;
        background: transparent;
        user-select: none;
        touch-action: none;
        flex: 0 0 auto;
    }

    .mini-player.snapped-left .mini-player-edge-n,
    .mini-player.snapped-left .mini-player-edge-s,
    .mini-player.snapped-left .mini-player-edge-w,
    .mini-player.snapped-right .mini-player-edge-n,
    .mini-player.snapped-right .mini-player-edge-s,
    .mini-player.snapped-right .mini-player-edge-e {
        display: none;
    }

    .mini-player-snap-hint {
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 499;
        max-width: 70vw;
        pointer-events: none;
        background: rgba(36, 134, 253, 0.14);
        border: 2px dashed rgba(36, 134, 253, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: mp3-snap-hint-in 0.15s ease-out;
    }

    .mini-player-snap-hint.side-left { left: 0; }
    .mini-player-snap-hint.side-right { right: 0; }

    .mini-player-snap-hint-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: #2486fd;
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        text-transform: capitalize;
        box-shadow: 0 6px 18px rgba(13, 22, 48, 0.22);
    }

    .mini-player-snap-hint-label i {
        font-size: 16px;
    }

    @keyframes mp3-snap-hint-in {
        from { opacity: 0; }
        to   { opacity: 1; }
    }

    .mini-player-restore {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 500;
        min-width: 60px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 14px;
        border: 1px solid #c7cde2;
        border-radius: 999px;
        background: #fff;
        color: #252837;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 26px rgba(13, 22, 48, 0.2);
        transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }

    .mini-player-restore:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 30px rgba(13, 22, 48, 0.26);
    }

    .mini-player-restore.playing {
        border-color: #2486fd;
        color: #1569ce;
    }

    .mini-player-restore-icon {
        font-size: 18px;
        position: relative;
        z-index: 1;
    }

    .mini-player-vapor {
        position: absolute;
        left: 0;
        right: 0;
        top: -36px;
        height: 40px;
        pointer-events: none;
        overflow: visible;
    }

    .mini-player-vapor-note {
        position: absolute;
        bottom: 0;
        color: #2486fd;
        font-size: 13px;
        opacity: 0;
        will-change: transform, opacity;
        animation: mp3-vapor-rise 2.4s ease-out infinite;
    }

    .mini-player-vapor-note-1 {
        left: 30%;
        animation-delay: 0s;
    }

    .mini-player-vapor-note-2 {
        left: 50%;
        font-size: 11px;
        color: #5aa6ff;
        animation-delay: 0.8s;
    }

    .mini-player-vapor-note-3 {
        left: 42%;
        font-size: 15px;
        animation-delay: 1.6s;
    }

    @keyframes mp3-vapor-rise {
        0%   { transform: translate(0, 6px)    rotate(-10deg) scale(0.6); opacity: 0; }
        15%  { opacity: 0.95; }
        50%  { transform: translate(6px, -14px) rotate(12deg)  scale(1);   opacity: 0.85; }
        100% { transform: translate(-6px, -34px) rotate(-18deg) scale(0.55); opacity: 0; }
    }
`;
