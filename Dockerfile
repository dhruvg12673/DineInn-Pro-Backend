# dineinnpro/backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
# Copy everything, including server.js and your route files
COPY . . 
EXPOSE 5000
CMD ["node", "server.js"]