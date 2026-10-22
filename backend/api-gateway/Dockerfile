FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

USER node

CMD ["npm", "start"]
