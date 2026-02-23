# Auth Service

Servicio de autenticación del sistema. Gestiona registro/login, ciclo de vida de JWT (`access` + `refresh`) y verificación interna de tokens para comunicación servicio-a-servicio.

## Endpoints

Base path: `/api/auth`

- `POST /api/auth/register` (público)
- `POST /api/auth/login` (público)
- `POST /api/auth/refresh` (público)
- `POST /api/auth/verify` (**interno**)

> `POST /api/auth/verify` está **bloqueado externamente por Nginx** y sólo debe invocarse desde la red interna (por ejemplo, desde otros contenedores/servicios).

La especificación OpenAPI está en [`openapi.yaml`](./openapi.yaml).

### Contrato de errores real del servicio

Los errores HTTP del servicio se devuelven como:

```json
{
  "error": "invalid_input | bad_credentials | invalid_refresh_token | user_already_exists | unexpected_error",
  "message": "...",
  "details": []
}
```

Excepción: `POST /api/auth/verify` devuelve `401` con `{ "valid": false }`.

## Variables de entorno

- `JWT_SECRET` (obligatoria): clave para firmar/verificar JWT. El servicio debe fallar en arranque si falta.
- `AUTH_DB_PATH` (opcional): ruta al SQLite de auth. Por defecto en compose: `/app/data/auth.db`.

## Ejecución local

```bash
npm install
npm run start
```

## Tests y cobertura

```bash
npm test
npm run test:coverage
```

## Verificar creación de `auth.db`

Con docker-compose, el volumen `./data:/app/data` permite comprobar el archivo desde la raíz del monorepo:

```bash
test -f ./data/auth.db && echo "auth.db exists"
```

## Consumo interno de `/verify` por otros servicios

Para validación interna de access tokens, usar:

- `AUTH_INTERNAL_VERIFY_URL=http://auth:3001/api/auth/verify`
- Timeout recomendado por llamada: **500ms–1s**

Ejemplo de request interno:

```http
POST /api/auth/verify
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```
