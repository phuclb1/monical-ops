FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY agent.mjs ./

ENV NODE_ENV=production
CMD ["node", "agent.mjs"]
