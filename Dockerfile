# Use Node 18 LTS
FROM node:18

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install build tools needed for sqlite3 native bindings
RUN apt-get update && apt-get install -y build-essential python3

# Install all dependencies (not just production ones)
RUN npm install

# Copy the rest of the app
COPY . .

# Expose Fly’s default port
EXPOSE 8080

# Launch the chat backend
CMD ["node", "server.cjs"]
