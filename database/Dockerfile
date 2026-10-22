FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY migrations ./migrations
COPY scripts ./scripts

# Applies any unapplied migrations, then exits. Compose runs it once before
# the api-gateway starts.
CMD ["npm", "run", "migrate"]
