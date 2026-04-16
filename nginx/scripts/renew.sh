#!/bin/bash
# Updated automatically Lets Encrypt CA to ensure HTTPS safety
set -e
COMPOSE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "[$(date)] Iniciando renovación de certificado..."
cd "$COMPOSE_DIR"
docker-compose run --rm certbot renew
docker-compose exec nginx nginx -s reload
echo "[$(date)] Renovación completada."