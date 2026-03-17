FROM node:18

WORKDIR /app/frontend

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy  the code
COPY . .


# Expose backend port
EXPOSE 3000


# Start the server
CMD ["npm", "start"]











