# Multi-stage build for scryfall-mcp

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (include dev deps for TypeScript build)
COPY package*.json ./
RUN npm ci

# Copy sources and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- Runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Default config
ENV PORT=3000
ENV TAGGER_CACHE_PATH=/data/tagger-tags.json

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app
COPY --from=build /app/dist ./dist

# Persistent cache volume for tagger data
VOLUME ["/data"]

# SSE server default
EXPOSE 3000

# Healthcheck against root endpoint provided by SSE server
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default: run SSE transport server
CMD ["node", "dist/sse.js"]

