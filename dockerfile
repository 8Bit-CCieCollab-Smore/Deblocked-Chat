# Use Node 18
FROM node:18

# Set working dir
WORKDIR /app

# Copy package.json and install deps
COPY package*.json ./
RUN npm install --production

# Copy rest of the app
COPY . .

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
