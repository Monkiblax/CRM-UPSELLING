# CRM UPSELLING

Pipeline de Upsell: tablero Kanban (arrastrable) y vista de lista para dar seguimiento a la cartera de clientes, con login y base de datos en Supabase.

**Etapas:** Lead → Lead asignados → Appointment → Preparación → Propuesta → Negociación → Invoice → Pagado → Suscripción

**Incluye:** vista Lista y Kanban, ficha de cliente (contacto, clasificación, pago/suscripción, programas, oportunidades múltiples, notas, historial automático, botón de Calendly), filtros por programa y clasificación, búsqueda, orden por importe, y modo solo lectura para usuarios "viewer".

El repo **no contiene datos de clientes**: viven en tu base de Supabase, detrás de login.

## Montar tu propia copia

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta `supabase/schema.sql`. Crea la tabla `clients`, las reglas de seguridad (RLS) y la lista de correos autorizados.
3. Autoriza tu correo (último bloque comentado de `schema.sql`):
   ```sql
   insert into public.allowed_emails (email, role) values ('tu@correo.com', 'editor');
   ```
   `editor` puede mover y editar; `viewer` solo ve.
4. Edita `config.js` con la **Project URL** y la clave **anon** de tu proyecto (Settings → API). Opcional: cambia `SUBTITLE` y `CALENDLY_URL`.
5. Despliégalo como sitio estático (Vercel: Framework Preset **Other**, sin build command) o abre `index.html` con cualquier servidor estático.
6. Abre la página, pulsa **Crear cuenta** con el correo autorizado y confírmalo desde el email que te llega. Después entra con **Entrar**.

> Si el correo de confirmación te lleva a una página que no carga, no pasa nada: ya quedó confirmado. Para evitarlo, pon la URL de tu sitio en Supabase → Authentication → URL Configuration → Site URL.

## Cargar clientes

En Supabase → Table Editor → `clients` → **Import data from CSV**, o con SQL. Columnas principales: `nombre`, `telefono`, `correo`, `importe`, `stage` (`lead`, `lead_asignados`, `appointment`, `cx_followup`, `followup`, `pitch`, `invoice`, `pagado`, `suscripcion`), `ord`.

## Notas técnicas

- Un solo `index.html` sin build. Usa `@supabase/supabase-js` desde CDN.
- La clave `anon` es pública por diseño; el acceso real lo controlan el login y las políticas RLS.
- Acceso: solo correos en `allowed_emails` con email confirmado pueden leer; solo `editor` puede escribir.
- Cambios en vivo entre usuarios vía Supabase Realtime.
