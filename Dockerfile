FROM node:24.14.0

# https://github.com/Yelp/dumb-init
ADD --chmod=755 https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64 /usr/bin/dumb-init

ARG YT_DLP_VERSION=2026.08.19

# Install upstream yt-dlp and its matching YouTube challenge solver together.
# Debian's yt-dlp can lag behind YouTube changes. Node is enabled by the job.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-venv ffmpeg ca-certificates \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]==${YT_DLP_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/yt-dlp/bin:${PATH}"

# Leverage Docker's cache system.
# package.json will be changed less often than other files, so copy it first
# and install all dependencies.
USER node
WORKDIR /app

ENV LISTEN=0.0.0.0
ENV LOG_FILE=/dev/stdout
ENV NODE_ENV=production

COPY --chown=node:node package*.json .
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npm", "start"]
