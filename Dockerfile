FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server
ENV NODE_ENV=production
RUN mkdir -p storage/uploads
EXPOSE 3000 4000
CMD ["sh","-c","npm run start:server & npm run start"]
