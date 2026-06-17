// Interactive terminal for a `terminal` job (see JOBS.md).
//
// The job's bash PTY lives on the server; this component renders it with
// xterm.js and pipes keystrokes/output over a WebSocket (/api/v1/jobs/:uid/tty).
// Closing the panel only detaches the socket — the shell keeps running and the
// job stays `active`, so it can be reopened from its job row. Typing `exit`
// (or Ctrl-D) ends the shell, which moves the job to the `finished` bucket.
//
// The window floats free: drag the title bar to move it, drag the bottom-right
// corner to resize it. xterm.js reflows via a ResizeObserver on the screen.

app.component('terminal-panel', {
    props: {
        job: { type: Object, required: true },
    },
    emits: ['close'],
    data: function () {
        return {
            connection_state: 'connecting',
            pos: null,
        };
    },
    computed: {
        state_label: function () {
            switch (this.connection_state) {
            case 'connecting':
                return 'connecting…';
            case 'open':
                return 'connected';
            case 'closed':
                return 'session ended';
            default:
                return '';
            }
        },
        window_style: function () {
            if (!this.pos) {
                return {};
            }
            return { left: `${this.pos.left}px`, top: `${this.pos.top}px` };
        },
    },
    template: `
        <div v-bind:style="window_style" ref="window" class="terminal-window">
            <div v-on:pointerdown="drag_start" ref="titlebar" class="terminal-titlebar">
                <span class="terminal-title">🖥️ {{ job.uid }}</span>
                <span v-bind:class="['terminal-state', connection_state]">{{ state_label }}</span>
                <button v-on:click="request_close" type="button" class="terminal-close" title="Close">×</button>
            </div>
            <div v-on:click="focus_terminal" ref="screen" class="terminal-screen"></div>
        </div>
    `,
    mounted: function () {
        this.term = null;
        this.fit_addon = null;
        this.ws = null;
        this.resize_observer = null;
        this.drag = null;
        this.setup_terminal();
        this.center_window();
        this.connect();
    },
    beforeUnmount: function () {
        this.teardown();
    },
    methods: {
        setup_terminal: function () {
            const term = new Terminal({
                fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
                fontSize: 13,
                cursorBlink: true,
                theme: { background: '#1b1f2a', foreground: '#d8dced' },
            });
            const fit_addon = new FitAddon.FitAddon();
            term.loadAddon(fit_addon);
            term.open(this.$refs.screen);
            term.attachCustomKeyEventHandler(this.handle_key_event);
            term.onData(data => this.send({ type: 'input', data }));

            // Full-screen TUI apps (htop, vim, less, ...) run on the alternate
            // screen buffer, which has no scrollback — the scrollbar there is
            // inert, so hide it while that buffer is active.
            term.buffer.onBufferChange(() => {
                const is_alt = term.buffer.active.type === 'alternate';
                this.$refs.screen.classList.toggle('alt-buffer', is_alt);
            });

            this.term = term;
            this.fit_addon = fit_addon;

            this.resize_observer = new ResizeObserver(() => this.fit());
            this.resize_observer.observe(this.$refs.screen);

            this.$nextTick(() => {
                this.fit();
                term.focus();
            });
        },
        center_window: function () {
            const rect = this.$refs.window.getBoundingClientRect();
            this.pos = {
                left: Math.max(8, Math.round((window.innerWidth - rect.width) / 2)),
                top: Math.max(8, Math.round((window.innerHeight - rect.height) / 2)),
            };
        },
        connect: function () {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws';
            const url = `${proto}://${location.host}/api/v1/jobs/${encodeURIComponent(this.job.uid)}/tty`;
            const ws = new WebSocket(url);
            this.ws = ws;

            ws.onopen = () => {
                this.connection_state = 'open';
                this.fit();
            };
            ws.onmessage = event => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                }
                catch (error) {
                    return;
                }
                if (msg.type === 'output' && this.term) {
                    this.term.write(msg.data);
                }
            };
            ws.onclose = () => {
                this.connection_state = 'closed';
                if (this.term) {
                    this.term.write('\r\n\x1b[33m[ terminal session ended ]\x1b[0m\r\n');
                }
            };
        },
        send: function (msg) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(msg));
            }
        },
        fit: function () {
            if (!this.term || !this.fit_addon) {
                return;
            }
            try {
                this.fit_addon.fit();
            }
            catch (error) {
                return;
            }
            this.send({ type: 'resize', cols: this.term.cols, rows: this.term.rows });
        },
        focus_terminal: function () {
            if (this.term) {
                this.term.focus();
            }
        },
        handle_key_event: function (event) {
            // Reclaim the browser shortcuts a page is *allowed* to override so
            // they reach the shell instead (Ctrl-S/P/O/F — e.g. Ctrl-P is bash
            // history, Ctrl-F is forward-char). Reserved combos the browser
            // keeps for itself (Ctrl-W, Ctrl-T, Ctrl-N, ...) can not be
            // intercepted by any web page and are left alone. Returning true
            // lets xterm process the event and emit the control byte.
            const plain_ctrl = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
            if (event.type === 'keydown' && plain_ctrl && ['s', 'p', 'o', 'f'].includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
            return true;
        },
        drag_start: function (event) {
            if (event.target.closest('button')) {
                return;
            }
            const rect = this.$refs.window.getBoundingClientRect();
            if (!this.pos) {
                this.pos = { left: rect.left, top: rect.top };
            }
            this.drag = {
                pointer_x: event.clientX,
                pointer_y: event.clientY,
                origin_left: this.pos.left,
                origin_top: this.pos.top,
            };

            const bar = this.$refs.titlebar;
            bar.setPointerCapture(event.pointerId);
            bar.addEventListener('pointermove', this.drag_move);
            bar.addEventListener('pointerup', this.drag_end);
            bar.addEventListener('pointercancel', this.drag_end);
        },
        drag_move: function (event) {
            if (!this.drag) {
                return;
            }
            const rect = this.$refs.window.getBoundingClientRect();
            const dx = event.clientX - this.drag.pointer_x;
            const dy = event.clientY - this.drag.pointer_y;
            const min_left = 120 - rect.width;
            const max_left = window.innerWidth - 120;
            const max_top = window.innerHeight - 44;
            this.pos = {
                left: Math.min(max_left, Math.max(min_left, this.drag.origin_left + dx)),
                top: Math.min(max_top, Math.max(0, this.drag.origin_top + dy)),
            };
        },
        drag_end: function (event) {
            this.drag = null;
            const bar = this.$refs.titlebar;
            if (!bar) {
                return;
            }
            bar.removeEventListener('pointermove', this.drag_move);
            bar.removeEventListener('pointerup', this.drag_end);
            bar.removeEventListener('pointercancel', this.drag_end);
            try {
                bar.releasePointerCapture(event.pointerId);
            }
            catch (error) {
            }
        },
        request_close: function () {
            this.$emit('close');
        },
        teardown: function () {
            const bar = this.$refs.titlebar;
            if (bar) {
                bar.removeEventListener('pointermove', this.drag_move);
                bar.removeEventListener('pointerup', this.drag_end);
                bar.removeEventListener('pointercancel', this.drag_end);
            }
            this.drag = null;
            if (this.resize_observer) {
                this.resize_observer.disconnect();
                this.resize_observer = null;
            }
            if (this.ws) {
                this.ws.onopen = null;
                this.ws.onmessage = null;
                this.ws.onclose = null;
                try {
                    this.ws.close();
                }
                catch (error) {
                }
                this.ws = null;
            }
            if (this.term) {
                this.term.dispose();
                this.term = null;
            }
        },
    },
});

css`
    .terminal-window {
        position: fixed;
        top: 8vh;
        left: 8vw;
        z-index: 1100;
        display: flex;
        flex-direction: column;
        width: min(960px, 92vw);
        height: min(620px, 82vh);
        min-width: 360px;
        min-height: 220px;
        max-width: 98vw;
        max-height: 95vh;
        border-radius: 10px;
        overflow: hidden;
        resize: both;
        background: #1b1f2a;
        box-shadow: 0 18px 48px rgba(13, 22, 48, 0.45);
    }

    .terminal-titlebar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: linear-gradient(135deg, #2b3358 0%, #1f2640 100%);
        color: #e7eaf6;
        cursor: move;
        user-select: none;
        touch-action: none;
    }

    .terminal-title {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .terminal-state {
        margin-left: auto;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        color: #c7cde2;
    }

    .terminal-state.open {
        background: rgba(74, 197, 124, 0.22);
        color: #7ee2a3;
    }

    .terminal-state.closed {
        background: rgba(255, 120, 120, 0.18);
        color: #ff9b9b;
    }

    .terminal-close {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        line-height: 1;
        color: #e7eaf6;
        background: rgba(255, 255, 255, 0.08);
        border: none;
        border-radius: 6px;
        cursor: pointer;
    }

    .terminal-close:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .terminal-screen {
        flex: 1;
        min-height: 0;
        padding: 8px 6px 8px 10px;
        background: #1b1f2a;
        overflow: hidden;
    }

    /* On the alternate screen buffer there is nothing to scroll. */
    .terminal-screen.alt-buffer .xterm-viewport {
        scrollbar-width: none;
    }

    .terminal-screen.alt-buffer .xterm-viewport::-webkit-scrollbar {
        display: none;
    }
`;
