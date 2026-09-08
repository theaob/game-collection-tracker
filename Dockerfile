# Use a lightweight official Node.js Alpine image
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package manifest files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy server logic and public web assets
COPY server.js ./
COPY public/ ./public/

# The database directory is owned by the unprivileged runtime user so the
# server can write games.json without running as root
RUN mkdir -p /app/data && chown -R node:node /app

# Define production environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the API server port
EXPOSE 3000

# Mount /app/data as a volume to keep database backups intact across container restarts
VOLUME ["/app/data"]

# Drop root privileges before starting the server
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/cover-status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the application server
CMD ["node", "server.js"]
