# FROM node:18

# WORKDIR /app

# COPY . .

# RUN npm install

# EXPOSE 3001

# CMD ["npm", "start"]




# new code for backend

FROM node:18

# Set working directory
WORKDIR /app/backend

# Copy package files first (better caching) , if the dependencies aren't changed
COPY package*.json ./

# Copy application code
COPY . .

# Install only production dependencies
RUN npm install 


# Expose backend port
EXPOSE 3001

# Start the server
CMD ["npm", "start"]