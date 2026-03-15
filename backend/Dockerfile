FROM node:24-alpine

WORKDIR /app

# Install dependencies (include dev for prisma CLI)
COPY package.json package-lock.json ./
RUN npm ci

# Prisma config, schema and generate client (DATABASE_URL needed by Prisma 7 config at generate time)
COPY prisma.config.ts ./
COPY prisma ./prisma/
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/mood_journal"
RUN npx prisma generate

# Application source
COPY index.js ./
COPY routes ./routes/
COPY lib ./lib/

EXPOSE 3000

CMD ["npm", "start"]
