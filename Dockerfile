FROM node:20-slim

# Install Chromium dependencies (for camofox headless browser)
# RUN sed -i 's|^URIs: http://deb.debian.org/debian$|URIs: http://mirror.kku.ac.th/debian|g' /etc/apt/sources.list.d/debian.sources || true
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's bundled Chromium download — use system chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies (including devDependencies for building TypeScript)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies to keep image size small
RUN npm prune --omit=dev
ENV NODE_ENV=production

# Create required directories
RUN mkdir -p /app/output /app/logs /app/errors /app/tmp

# Health check: verify node process is running
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

CMD ["node", "dist/main.js"]
