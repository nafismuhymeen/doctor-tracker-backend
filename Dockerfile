# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN yarn build

# Prune dev dependencies for production
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create unprivileged user
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs appuser

# Copy production node_modules and compiled output from builder
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist

# Switch to non-root user
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/server.js"]

