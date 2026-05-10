# --- base: install deps once, reused by dev + build ---------------------------
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- dev: Vite dev server, host-bound so it's reachable from outside ----------
FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: produce static assets for Plan 3b's edge image --------------------
FROM base AS build
COPY . .
RUN npm run build
# Output lives at /app/dist — copied out by the deploy plan's edge image.
