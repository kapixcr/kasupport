# Kasupport

Aplicación de comunicación y soporte con Electron, React, Express, Socket.IO y PostgreSQL.

## Desarrollo local

### Requisitos

- Node.js 20 o superior
- PostgreSQL 16
- Una cuenta/proyecto de LiveKit Cloud para reuniones reales
- Un bucket privado compatible con S3 para grabaciones

### Configuración

1. Copia `.env.example` a un archivo de entorno que no se versione y completa los secretos.
2. Crea `app/renderer/.env.local` con, al menos:

   ```env
   VITE_API_URL=http://localhost:4100
   ```

3. Instala las dependencias:

   ```bash
   cd server && npm ci
   cd ../app/renderer && npm ci
   cd ../.. && npm ci
   ```

4. Inicializa PostgreSQL y arranca backend/renderer. También puedes usar `docker compose up --build` para PostgreSQL y backend.

## Reuniones

La función Meet usa LiveKit como SFU y mantiene en Kasupport el control de acceso, sala de espera, chat, reacciones, moderación y metadatos. Los invitados externos acceden desde un enlace HTTPS `/meet/:publicId` y no necesitan una cuenta de staff.

### LiveKit Cloud

- Crea un proyecto en LiveKit Cloud.
- Configura `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET` únicamente en el backend.
- Registra el webhook HTTPS en `LIVEKIT_WEBHOOK_URL` apuntando a `/api/meetings/livekit/webhook`.
- Nunca publiques `LIVEKIT_API_SECRET` en variables `VITE_*` ni en el renderer.

### Grabaciones

Las grabaciones compuestas usan LiveKit Egress y se escriben en el bucket configurado con `S3_*`. El bucket debe ser privado; Kasupport genera URLs prefirmadas de corta duración después de autorizar al agente. Cloudflare R2 suele usar `S3_REGION=auto` y su endpoint S3; MinIO normalmente requiere `S3_FORCE_PATH_STYLE=true`.

### Producción

- Sirve frontend, API y Socket.IO por HTTPS/WSS.
- Define una lista exacta en `ALLOWED_ORIGINS` (separada por comas).
- Usa secretos aleatorios y un usuario PostgreSQL de privilegios mínimos.
- Aplica las migraciones antes de desplegar una versión nueva.
- Configura retención y borrado del bucket según las políticas de privacidad de tu organización.
- Informa a los participantes antes de iniciar una grabación.

## Comprobaciones

```bash
cd server && npm test
cd ../app/renderer && npm run build && npm run lint
cd ../.. && npm run dist:mac   # o dist:win en Windows
```
