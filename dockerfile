# Use Node 18
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy rest of the app
COPY . .

# Expose Fly’s default port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
