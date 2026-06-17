function express_run(app, port = 3000, host = 'localhost', on_server = null)
{
    const server = app.listen(port, host, function () {
        const {address, port} = this.address();
        console.log(`[express_run] Listening to ${address}:${port}`);
    });

    if (on_server) {
        on_server(server);
    }

    process.on('SIGTERM', sigterm);
    process.on('SIGINT', sigint);

    server.on('close', function () {
        console.log('[express_run] closed');
        process.off('SIGTERM', sigterm);
        process.off('SIGINT', sigint);
    });

    return new Promise(function (resolve) {
        server.once('close', resolve);
    });

    function sigterm() {
        console.log('[express_run] SIGTERM');
        server.close();
        setTimeout(() => process.exit(1), 10000).unref();
    }

    function sigint() {
        console.log('[express_run] SIGINT');
        server.close();
        setTimeout(() => process.exit(1), 10000).unref();
    }
}

module.exports = express_run;
