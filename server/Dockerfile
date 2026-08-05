FROM node:20-alpine

WORKDIR /app

# Copiar definiciones de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --omit=dev

# Copiar el código fuente y el esquema SQL
COPY . .

# Exponer puerto predeterminado
EXPOSE 4100

ENV PORT=4100
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
