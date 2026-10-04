# Guía de salones CONTECS 2026 (versión Vercel)

En esta versión el programa vive en una base de datos. Los organizadores entran con usuario y contraseña, que el servidor verifica, y lo que cambian (actividades, cancelaciones, avisos) lo ven todos los asistentes en menos de un minuto, sin subir archivos ni cambiar el QR.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La guía: mapa, agenda y modo organizador |
| `api/datos.js` | Entrega el programa y guarda los cambios de los organizadores |
| `api/login.js` | Verifica usuario y contraseña |
| `api/usuarios.js` | Agrega y quita organizadores, cambia contraseñas |
| `api/_lib.js` | Funciones compartidas (base de datos, cifrado, sesiones) |
| `package.json` | Datos del proyecto para Vercel |

## Publicar en Vercel (se hace una sola vez)

1. **Sube los archivos a tu repositorio de GitHub.** Reemplaza el contenido anterior con esta carpeta completa. La carpeta `api` tiene que quedar en la raíz, junto a `index.html`.
2. **Crea el proyecto en Vercel.** Entra a vercel.com con tu cuenta de GitHub y toca **Add New > Project**. Elige el repositorio `MAPA-INTERACTIVO-CONTECS-2026`, deja **Framework Preset** en **Other** y toca **Deploy**. Si en **Project Name** pones `guiacontecs2026`, la dirección será `https://guiacontecs2026.vercel.app`, siempre que ese nombre esté libre.
3. **Conecta la base de datos.** Dentro del proyecto abre la pestaña **Storage**, toca **Create Database**, elige **Upstash for Redis** con el plan gratuito y conéctala al proyecto. Vercel agrega por su cuenta las variables de conexión.
4. **Agrega tres variables.** En **Settings > Environment Variables** crea:
   - `ADMIN_USUARIO`: tu usuario de administrador, por ejemplo `abdiel`.
   - `ADMIN_CLAVE`: tu contraseña de administrador, de al menos 8 caracteres.
   - `SESION_SECRETO`: un texto largo y al azar, de 32 caracteres o más. Sirve para firmar las sesiones; nadie necesita recordarlo.
5. **Vuelve a desplegar.** En **Deployments**, abre el último despliegue y toca **Redeploy**. Las variables solo se aplican en un despliegue nuevo.
6. **Entra como administrador.** Abre `https://TU-PROYECTO.vercel.app/?organizador` y entra con `ADMIN_USUARIO` y `ADMIN_CLAVE`. La primera vez que entres, el programa inicial se guarda en la base de datos.

Si al entrar aparece un mensaje de que el servidor no está listo, el texto dice qué falta: por lo general es la base de datos o alguna de las tres variables.

## Uso diario

- **Editar actividades:** entra con `?organizador`, toca un salón y edita. Cada cambio se guarda solo; la barra dorada muestra si ya se publicó.
- **Cancelar una actividad:** toca **Marcar cancelada**. Los asistentes la ven tachada con una etiqueta roja, y deja de contar en el mapa. **Reactivar** la devuelve.
- **Aviso para todos:** en **Datos del congreso**, escribe el aviso. Aparece en una franja arriba del mapa; si lo dejas vacío, desaparece.
- **Organizadores:** solo la cuenta administradora puede agregar o quitar organizadores. Cada organizador puede cambiar su propia contraseña. La del administrador se cambia en la variable `ADMIN_CLAVE` y luego hay que hacer **Redeploy**.
- **Traer el programa anterior:** en **Datos del congreso > Importar programa**, elige tu `index.html` anterior o una copia `.json`. Reemplaza el programa publicado.
- **Copia de seguridad:** el botón de la barra descarga el programa en un archivo `.json`. Conviene descargarla antes y durante el congreso.
- **Dos organizadores a la vez:** si dos personas guardan casi al mismo tiempo, la segunda recibe un aviso, ve la versión más reciente y repite su cambio. Así ninguno borra lo del otro sin darse cuenta.

Los asistentes reciben los cambios al recargar la página o al volver a ella; si la tienen abierta, la guía revisa cada minuto.

## Código QR

La dirección de Vercel es nueva, así que el QR se genera de nuevo con `https://TU-PROYECTO.vercel.app/`. Para no tener dos versiones de la guía, desactiva GitHub Pages en **Settings > Pages** del repositorio.

El enlace de organizadores es la misma dirección con `?organizador` al final. Compártelo solo con tu equipo.

## Dominio propio (opcional)

Si compras `guiacontecs2026.com`, agrégalo en Vercel desde **Settings > Domains**. Vercel te muestra los registros DNS que debes poner en el registrador. Hazlo antes de imprimir los QR.

## Seguridad

- Las contraseñas se guardan cifradas (PBKDF2) en la base de datos, nunca en un archivo público.
- Las sesiones las firma el servidor y duran 12 horas. Si quitas a un organizador o cambia su contraseña, su sesión deja de valer de inmediato.
- Tras 8 intentos fallidos desde la misma conexión, el acceso se bloquea 15 minutos.
- No compartas `ADMIN_CLAVE` ni `SESION_SECRETO`. Si crees que se filtraron, cámbialos y haz **Redeploy**: eso cierra todas las sesiones abiertas.

## Costos

El plan gratuito de Vercel (Hobby) y el de Upstash alcanzan para un congreso universitario.
