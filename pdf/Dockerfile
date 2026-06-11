# Headless-Chromium PDF renderer. Uses the official Playwright image (browsers preinstalled).
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
EXPOSE 3002
CMD ["node", "server.js"]
