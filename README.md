# Juntos por Mamita - Campaña de Recaudación

Aplicación web para gestionar donaciones de la campaña "Operación de Mamita".
Ahora con **sincronización en la nube vía Supabase**: todos los usuarios que
abran el link ven los mismos donantes y los cambios que hagas se reflejan
automáticamente en las demás pestañas en segundos.

## Cómo funciona la sincronización

- Los donantes y la meta se guardan en una base de datos en **Supabase**
  (no en LocalStorage de cada navegador).
- Cuando agregas/editas/eliminas un donante, la app escribe en Supabase.
- Cada pestaña abierta está suscrita a cambios via **Realtime**, así que
  cualquier modificación dispara automáticamente una recarga parcial de los
  datos y se ve reflejada en los demás usuarios sin recargar la página.

## Puesta en marcha (solo la primera vez)

1. **Crea un proyecto en https://supabase.com** (plan gratuito vale).

2. **Ejecuta el script SQL**:
   - Entra al Dashboard → **SQL Editor** → *New query*.
   - Pega todo el contenido de `supabase-schema.sql` (incluido en este repo).
   - Pulsa **Run**. Esto crea las tablas `mamita_donors` y `mamita_settings`,
     las políticas de seguridad (RLS) y habilita Realtime.

3. **Configura las credenciales**:
   - Dashboard → **Project Settings** → **API**.
   - Copia la **Project URL** y la **Publishable key** (`anon` public, NO la
     secret).
   - Pega ambas en `supabase-config.js`:
   ```js
   const SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```

4. **Sube los archivos** (`index.html`, `app.js`, `style.css`,
   `supabase-config.js`) a tu hosting estático favorito:
   - GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc. (todos gratuitos).

5. **Comparte el link**. Cuando otros lo abran, verán los mismos datos.

## PIN de administrador

Por defecto es `Mamita8080`. Se guarda en la tabla `mamita_settings` y
se puede cambiar desde la app (botón *Cambiar PIN*) cuando entras como admin.
Cualquiera con el link puede *ver*; solo quien tenga el PIN puede *editar*.

> Nota de seguridad: las políticas RLS del esquema permiten escritura pública
> al cliente `anon`. Es suficiente para una campaña familiar. Si en el futuro
> necesitas restringir más, usa **Auth de Supabase** o un endpoint serverless
> que valide el PIN antes de escribir.

## Archivos del proyecto

| Archivo               | Descripción                                            |
|-----------------------|--------------------------------------------------------|
| `index.html`          | Estructura visual y modales                            |
| `style.css`           | Estilos (glassmorphism, termómetro líquido, etc.)      |
| `app.js`              | Lógica, sincronización Supabase y renderizado          |
| `supabase-config.js`  | URL y publishable key del proyecto Supabase            |
| `supabase-schema.sql` | Script SQL para crear tablas, RLS y Realtime           |

## Recuperación / fallback

Si `supabase-config.js` no tiene credenciales válidas, la app cae
automáticamente a LocalStorage (modo anterior) para que siga siendo usable
de forma individual, **pero los cambios no se compartirán** entre usuarios.
