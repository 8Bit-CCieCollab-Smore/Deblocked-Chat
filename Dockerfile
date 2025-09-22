# Use official Node.js image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy rest of app files
COPY . .

# Expose the port your app uses
EXPOSE 1988

# Start the server
CMD ["node", "server.js"]
