FROM node:20-alpine AS builder
WORKDIR /app

# Copiar arquivos de dependência
COPY package.json package-lock.json* ./

# Instalar dependências
RUN npm ci || npm install

# Copiar todo o código-fonte
COPY . .

# Gerar o cliente Prisma e compilar a aplicação
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Imagem final de execução
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Copiar artefatos gerados
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db

EXPOSE 3000

CMD ["node", "server.js"]
