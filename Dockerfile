# Use Node 18
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose Fly/Railway port
EXPOSE 8080

# Start the server (CommonJS fix)
CMD ["node", "server.cjs"]
