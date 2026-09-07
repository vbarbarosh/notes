const child_process = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const readline = require('readline');

// Tor runs only while a download job needs it. Each job starts its own client,
// uses it, and stops it again, so nothing listens between jobs. Every instance
// gets a private data directory and an OS-chosen loopback port, which lets two
// jobs run at the same time without fighting over a port or a lock file.
const READY_PATTERN = /Opened Socks listener connection \(ready\) on 127\.0\.0\.1:(\d+)/;
const BOOTSTRAPPED_PATTERN = /Bootstrapped 100%/;
// Bootstrapped 75% (enough_dirinfo): Loaded enough directory info to build circuits
//               ^^                     ^^ tor's own summary, used as-is
const BOOTSTRAP_PROGRESS_PATTERN = /Bootstrapped (\d+)%(?: \([^)]*\))?(?::\s*(.+))?$/;
const BOOTSTRAP_TIMEOUT = 180000;
const STOP_TIMEOUT = 10000;

function enabled()
{
    return ['true', '1'].includes(String(process.env.YT_DLP_TOR || '').trim().toLowerCase());
}

async function start({user_friendly_status} = {})
{
    if (process.env.YT_DLP_PROXY) {
        throw new Error('YT_DLP_TOR and YT_DLP_PROXY are both set. Choose one outbound path; see docs/youtube.md.');
    }

    // A fresh directory each time keeps no Tor state between jobs. It costs one
    // bootstrap per job rather than reusing a cached consensus.
    const data_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-tor-'));
    await fs.chmod(data_dir, 0o700);

    try {
        return await spawn_tor(data_dir, user_friendly_status);
    }
    catch (error) {
        await fs.rm(data_dir, {recursive: true, force: true}).catch(() => {});
        throw error;
    }
}

function spawn_tor(data_dir, user_friendly_status)
{
    return new Promise(function (resolve, reject) {
        const args = [
            // Ignore any torrc shipped by the distribution package; this client
            // is configured entirely from here.
            '-f', '/nonexistent', '--ignore-missing-torrc',
            '--ClientOnly', '1',
            '--RunAsDaemon', '0',
            '--SocksPort', 'auto',
            '--DataDirectory', data_dir,
            '--Log', 'notice stdout',
            '--AvoidDiskWrites', '1',
        ];
        const proc = child_process.spawn('tor', args, {stdio: ['ignore', 'pipe', 'pipe']});
        let port = null;
        let settled = false;
        let tail = '';

        // A job that dies without unwinding must not leave Tor behind.
        const kill_on_exit = function () {
            proc.kill('SIGKILL');
        };
        process.once('exit', kill_on_exit);

        const timer = setTimeout(function () {
            fail(new Error(`Tor did not bootstrap within ${BOOTSTRAP_TIMEOUT / 1000}s. Check the container's outbound connectivity; see docs/youtube.md.`));
        }, BOOTSTRAP_TIMEOUT);

        function fail(error)
        {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            process.removeListener('exit', kill_on_exit);
            proc.kill('SIGKILL');
            reject(new Error([error.message, tail.trim()].filter(Boolean).join('\n')));
        }

        for (const stream of [proc.stdout, proc.stderr]) {
            const lines = readline.createInterface({input: stream, crlfDelay: Infinity});
            lines.on('line', function (line) {
                // Forward to the job log so a slow bootstrap is visible.
                process.stdout.write(`[tor] ${line}\n`);
                tail = (tail + line + '\n').slice(-4096);
                const ready = READY_PATTERN.exec(line);
                if (ready) {
                    port = ready[1];
                }
                // Bootstrap is the one slow step before anything is downloaded.
                const progress = BOOTSTRAP_PROGRESS_PATTERN.exec(line);
                if (progress && user_friendly_status) {
                    const [, percent, summary] = progress;
                    user_friendly_status(summary ? `${percent}% ${summary}` : `${percent}%`);
                }
                if (!settled && port && BOOTSTRAPPED_PATTERN.test(line)) {
                    settled = true;
                    clearTimeout(timer);
                    resolve({
                        // socks5h keeps name resolution inside Tor whatever
                        // transport yt-dlp picks for the request.
                        proxy: `socks5h://127.0.0.1:${port}`,
                        stop: () => stop(proc, data_dir, kill_on_exit),
                    });
                }
            });
        }

        proc.once('error', function (error) {
            fail(new Error(`Cannot start tor: ${error.code || 'unknown error'}. Rebuild the Docker image; see docs/youtube.md.`));
        });
        proc.once('close', function (code, signal) {
            fail(new Error(`tor exited with code ${code}${signal ? ` and signal ${signal}` : ''} before it was ready.`));
        });
    });
}

function stop(proc, data_dir, kill_on_exit)
{
    process.removeListener('exit', kill_on_exit);

    return new Promise(function (resolve) {
        if (proc.exitCode !== null || proc.signalCode !== null) {
            resolve();
            return;
        }
        const timer = setTimeout(function () {
            proc.kill('SIGKILL');
        }, STOP_TIMEOUT);
        proc.once('close', function () {
            clearTimeout(timer);
            resolve();
        });
        proc.kill('SIGTERM');
    }).then(function () {
        return fs.rm(data_dir, {recursive: true, force: true}).catch(() => {});
    });
}

module.exports = {enabled, start};
