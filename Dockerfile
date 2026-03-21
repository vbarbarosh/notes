FROM node:24.14.0

# https://github.com/Yelp/dumb-init
ADD --chmod=755 https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64 /usr/bin/dumb-init

# Leverage Docker's cache system.
# package.json will be changed less often than other files, so copy it first
# and install all dependencies.
USER node
WORKDIR /app

ENV LISTEN=0.0.0.0
ENV LOG_FILE=/dev/stdout
ENV NODE_ENV=production

COPY --chown=node:node package*.json .
RUN npm ci --omit=dev

COPY --chown=node:node . .

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]
