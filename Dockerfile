FROM node:16.15.1-bullseye-slim

RUN apt-get update -y
RUN apt-get install -y python3
RUN apt-get install -y python3-pip
RUN apt-get install -y --no-install-recommends dumb-init

# NOTE: env vars should be pulled from .env file at run time

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm ci --omit=dev

COPY . .

EXPOSE 6969

CMD ["dumb-init", "node", "./index.js"]
