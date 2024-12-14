FROM node:alpine

RUN apk add --no-cache git openssh-client

WORKDIR /app

COPY package*.json ./

RUN npm install --platform=linuxmusl

COPY . .

RUN npm run build

EXPOSE 8000

CMD ["npm", "start"]
