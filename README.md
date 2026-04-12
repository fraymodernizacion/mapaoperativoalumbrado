# Visor Operativo FME

Aplicación municipal para la gestión de alumbrado público, medidores municipales, cruces e inconsistencias, y reportes operativos.

## Stack

- Nuxt 3
- Vue 3
- TypeScript
- Nuxt UI
- Tailwind CSS
- Leaflet
- Excel local como fuente maestra

## Estructura funcional

- `Dashboard`
- `Alumbrado`
- `Medidores`
- `Cruces`
- `Calidad`
- `Reportes`
- `Admin`

## Datos

La app lee los archivos locales ubicados en:

- `data/alumbrado.xlsx`
- `data/medidores.xlsx`

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

## Producción en Vercel

El proyecto ya compila con el preset `vercel`, así que se puede desplegar con el flujo normal de GitHub + Vercel.

## Qué hace el MVP

- Lee ambas bases desde Excel.
- Normaliza coordenadas.
- Calcula cobertura LED por puntos, luminarias y potencia.
- Muestra un mapa operativo con filtros.
- Permite exportar la vista filtrada como PDF usando impresión del navegador.
- Separa claramente alumbrado y medidores.

## Próximos pasos

- Mejorar exportación PDF con cabecera institucional.
- Agregar edición manual de observaciones.
- Incorporar cruces más finos por cercanía y suministro.
