# Visor Operativo FME

Aplicación municipal para la gestión de alumbrado público, medidores municipales, cruces e inconsistencias, y reportes operativos.

## Stack

- Nuxt 3
- Vue 3
- TypeScript
- Nuxt UI
- Tailwind CSS
- Leaflet
- ExcelJS
- PHP 8+
- MySQL

## Estructura funcional

- `Dashboard`
- `Alumbrado`
- `Medidores`
- `Cruces`
- `Calidad`
- `Reportes`
- `Admin`

## Datos

La app toma como base inicial los archivos Excel ubicados en:

- `data/alumbrado.xlsx`
- `data/medidores.xlsx`

Para edición online real, la información se persiste en MySQL y luego se exporta a Excel cuando haga falta.

## Arranque local

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run typecheck
npm run build
```

## Generación del frontend estático

Este proyecto está preparado para publicarse como frontend estático y consumir un backend PHP/MySQL:

```bash
npm run generate
```

El resultado queda en `.output/public`.

## Backend PHP/MySQL

Los endpoints PHP viven en `public/api/` y exponen:

- lectura del dashboard
- lectura de alumbrado
- lectura de medidores
- alta de puntos nuevos
- edición de luminarias
- edición masiva

La configuración de base se lee desde `public/api/config.php` o desde variables de entorno:

- `ALUMBRADO_DB_HOST`
- `ALUMBRADO_DB_PORT`
- `ALUMBRADO_DB_NAME`
- `ALUMBRADO_DB_USER`
- `ALUMBRADO_DB_PASS`

## Esquema y carga inicial

1. Crear la base MySQL.
2. Ejecutar el esquema de `database/schema.sql`.
3. Importar los datos iniciales:

```bash
php scripts/import_seed_data.php
```

## Despliegue en Hostinger

Para `Premium Web Hosting`, la ruta recomendada es:

1. Crear el esquema en MySQL.
2. Cargar el seed inicial.
3. Generar el frontend con `npm run generate`.
4. Subir el contenido de `.output/public` al directorio del subdominio.
5. Copiar la carpeta `public/api` al mismo nivel del sitio publicado.
6. Configurar la conexión MySQL en `public/api/config.php`.

## Despliegue automático con GitHub Actions

El repo ya incluye un workflow que despliega automáticamente cada `push` a `main`.

### Secrets necesarios en GitHub

- `HOSTINGER_HOST`
- `HOSTINGER_PORT`
- `HOSTINGER_USER`
- `HOSTINGER_PATH`
- `HOSTINGER_SSH_KEY`

### Comportamiento del workflow

- instala dependencias con `npm ci`
- genera el frontend con `npm run generate`
- sincroniza `.output/public` al destino
- sincroniza `public/api`
- sincroniza `database`
- sincroniza `scripts/import_seed_data.php`

### Llave SSH

Usá la clave privada asociada a la pública ya generada para Hostinger. La pública que ya tenés es:

`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKayiio8B1WXG7vUSKKwZAoolMMiYUm9D6QRWIP8sH3l u741310678@195.35.41.55`

La privada la tenés que cargar como secreto `HOSTINGER_SSH_KEY` en GitHub.

## Ruta de publicación sugerida

En Hostinger, el subdominio puede apuntar a algo como:

`/home/u741310678/domains/digitalapp.fun/public_html/visor`

Ahí deberían convivir:

- el frontend estático generado
- la carpeta `api/` con los endpoints PHP
- los archivos de la app que sirvan de soporte al frontend

## Generación de Excel actualizado

El visor puede exportar la base actualizada a Excel desde el navegador, con hojas de datos e historial de cambios.

## Qué hace el sistema

- Lee la base inicial desde Excel.
- Normaliza coordenadas.
- Calcula cobertura LED por puntos, luminarias y potencia.
- Muestra un mapa operativo con filtros.
- Permite crear y editar luminarias online con PHP/MySQL.
- Exporta la vista y también la base actualizada en Excel.

## Próximos pasos

- Publicar el backend PHP en Hostinger.
- Cargar credenciales reales de MySQL.
- Validar altas y ediciones desde el entorno online.
