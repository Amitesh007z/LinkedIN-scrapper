FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
RUN chown -R pwuser:pwuser /app

USER pwuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
