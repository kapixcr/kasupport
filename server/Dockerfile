FROM node:20-alpine

WORKDIR /app

# Copiar definiciones de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el código fuente y el esquema SQL
COPY . .

# Exponer puerto predeterminado
EXPOSE 4100

ENV PORT=4100
ENV NODE_ENV=production

CMD ["npm", "start"]
