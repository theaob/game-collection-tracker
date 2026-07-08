# Use a lightweight official Node.js Alpine image
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package manifest files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy server logic and public web assets
COPY server.js ./
COPY public/ ./public/

# Ensure the database data directory exists
RUN mkdir -p /app/data

# Define production environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the API server port
EXPOSE 3000

# Mount /app/data as a volume to keep database backups intact across container restarts
VOLUME ["/app/data"]

# Start the application server
CMD ["node", "server.js"]
