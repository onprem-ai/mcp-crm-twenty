FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist/ ./dist/
ENV MCP_TRANSPORT=http
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["node", "dist/index.js"]
