FROM node:18-bullseye-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install runtime dependencies required by native modules (sharp, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "server.js"]
