FROM node:20-alpine AS builder
WORKDIR /app

# Instalar dependências da aplicação principal
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copiar todo o código-fonte
COPY . .

# Gerar o cliente Prisma e compilar a aplicação Next.js
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# --- Estágio do Binance Mini-Service ---
FROM node:20-alpine AS binance-builder
WORKDIR /app/mini-services/binance-service
COPY mini-services/binance-service/package.json ./
RUN npm install

# Imagem final de execução com suporte a Bun + Node
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Instalar bash, curl e nodejs (necessários para a aplicação Next.js standalone)
RUN apk add --no-cache bash curl nodejs

# Copiar artefatos Next.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

# Copiar mini-serviço Binance
COPY --from=builder /app/mini-services/binance-service /app/mini-services/binance-service
COPY --from=binance-builder /app/mini-services/binance-service/node_modules /app/mini-services/binance-service/node_modules

# Script de entrada para rodar ambos os serviços
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000 3001 3002

ENTRYPOINT ["/bin/bash"]
CMD ["/app/start.sh"]
