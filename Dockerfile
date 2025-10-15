# Use Node 18
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./

# Make sure build tools are present (needed for sqlite3 native build)
RUN apt-get update && apt-get install -y build-essential python3

# Install all deps (not just prod)
RUN npm install

# Copy rest of the app
COPY . .

# Expose Fly’s default port
EXPOSE 8080

# Start server
CMD ["node", "server.cjs"]
