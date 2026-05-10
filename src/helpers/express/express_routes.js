const amx = require('@vbarbarosh/express-helpers/src/amx');

function express_routes(app, routes, prepend = [])
{
    for (let i = 0, ii = routes.length; i < ii; ++i) {
        const route = routes[i];
        if (route.routes) {
            express_routes(app, route.routes, prepend.concat(route.prepend || []));
            continue;
        }
        const [method, path] = route.req.split(' ');
        const handlers = prepend.concat(route.prepend || []).concat(Array.isArray(route.fn) ? route.fn : [route.fn]);
        app[method.toLowerCase()](path, ...handlers.map(function (handler) {
            const fn = handler.default || handler; // allow require('./api/api_articles_get')
            // middleware (multer etc.)
            if (fn.length >= 3) {
                return fn;
            }
            // normal handler
            return amx((req, res) => fn(req, res));
        }));
    }
    return app;
}

module.exports = express_routes;
