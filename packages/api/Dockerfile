# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for native modules (sharp, bcrypt)
RUN apk add --no-cache python3 make g++ vips-dev

# Copy package files
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/shared/package*.json ./packages/shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api

# Generate Prisma client
RUN npm run db:generate --workspace=@ground-truth/api

# Build shared package
RUN npm run build --workspace=@ground-truth/shared

# Build API
RUN npm run build --workspace=@ground-truth/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache vips

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Copy built files
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/package*.json ./
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Create uploads directory
RUN mkdir -p uploads && chown -R api:nodejs uploads

USER api

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# Run database migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
