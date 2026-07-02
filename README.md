# Sistema RRHH — Google Apps Script

Sistema interno de Recursos Humanos construido **100% en Google Apps Script**:
el frontend se sirve con `HtmlService` y una hoja de Google Sheets es la base de
datos. Sin servidor externo, sin CORS.

**Módulos:** Dashboard (con guía de uso) · Empleados · Departamentos · Asistencia
· Vacaciones/permisos · Nómina básica · Incapacidades CCSS/INS · Feriados
· Liquidaciones laborales · Reportes (gráficos) · Configuración.

> 📄 Para la guía detallada de instalación manual (copiar/pegar) y de pruebas,
> mira **[INSTRUCCIONES.md](INSTRUCCIONES.md)**.
> Este README explica cómo subir el proyecto con **clasp** (línea de comandos).

---

## Subir el proyecto con clasp

`clasp` es la herramienta oficial de Google para gestionar proyectos de Apps
Script desde tu PC. Permite subir todos los archivos con un solo comando en lugar
de copiarlos uno por uno.

### Requisitos
- **Node.js** instalado (incluye `npm`). Descárgalo de <https://nodejs.org>.

### Paso 1 — Instalar clasp (una sola vez)
```bash
npm install -g @google/clasp
```

### Paso 2 — Iniciar sesión con tu cuenta de Google
```bash
clasp login
```
Se abre el navegador; autoriza con la cuenta donde estará la hoja.

### Paso 3 — Habilitar la API de Apps Script (una sola vez)
Entra a <https://script.google.com/home/usersettings> y activa
**"API de Apps Script"**.

### Paso 4 — Obtener el Script ID y ponerlo en `.clasp.json`

Tienes dos caminos según prefieras que el proyecto esté **ligado a una hoja** o
sea **independiente**:

**Opción A — Proyecto ligado a una hoja (recomendado para Sheets):**
1. Crea/abre tu Google Sheet → **Extensiones → Apps Script**.
2. En el editor: **⚙ Configuración del proyecto** → copia el **ID de secuencia
   de comandos** (Script ID).
3. Pega ese ID en `.clasp.json`, reemplazando `PEGA_AQUI_TU_SCRIPT_ID`.

**Opción B — Proyecto independiente (clasp lo crea):**
```bash
clasp create --type webapp --title "Sistema RRHH"
```
Esto genera el `.clasp.json` automáticamente. (Luego, dentro de la app, usa el
módulo **Configuración → Crear hoja nueva** o conecta tu hoja por ID.)

### Paso 5 — Subir todos los archivos
Desde la carpeta del proyecto:
```bash
clasp push
```
Sube `Code.gs`, todos los `*.html` y `appsscript.json`. (El `.claspignore` evita
subir este README y demás archivos que no son código.)

### Paso 6 — Publicar como aplicación web
La primera vez, hazlo desde el editor (**Implementar → Nueva implementación →
Aplicación web**) para autorizar permisos. Ver detalles en
[INSTRUCCIONES.md](INSTRUCCIONES.md), Paso 3.

Para versiones siguientes puedes usar:
```bash
clasp deploy --description "RRHH v2"
```

---

## Desplegar desde GitHub Actions (nube de GitHub)

**GitHub solo guarda el código.** La app **corre en Google Apps Script**, no en GitHub.
El agente en la nube puede hacer `git push` a GitHub, pero **no** puede entrar a tu
cuenta de Google sin credenciales.

Para que un push a `main` suba automáticamente a Apps Script:

### 1. Obtener credenciales clasp (una vez, en tu PC)

```bash
npm install -g @google/clasp
clasp login
```

En Linux/Mac, el archivo queda en `~/.clasprc.json`. Copia **todo** su contenido.

### 2. Secretos en GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secreto | Valor |
|---------|--------|
| `APPS_SCRIPT_ID` | ID del proyecto (⚙ Configuración en script.google.com) |
| `CLASPRC_JSON` | Contenido completo de `~/.clasprc.json` |

### 3. Ejecutar el deploy

- Haz **merge a `main`**, o
- **Actions → Deploy Apps Script → Run workflow**

En el resumen del workflow aparece la URL **`/exec`**.

---

## Comandos útiles
| Comando | Qué hace |
|---------|----------|
| `clasp push` | Sube tus cambios locales a Apps Script |
| `clasp push --watch` | Sube automáticamente al guardar |
| `clasp pull` | Descarga los cambios hechos en el editor web |
| `clasp open` | Abre el proyecto en el navegador |
| `clasp deployments` | Lista las implementaciones |

---

## Estructura de archivos
| Archivo | Tipo | Contenido |
|---------|------|-----------|
| `Code.gs` | Script | Backend: `doGet`, utilidades de BD y CRUD de los módulos |
| `Index.html` | HTML | Interfaz: navegación + vistas + modales |
| `Stylesheet.html` | HTML | Estilos CSS |
| `Js_Comun.html` | HTML | Navegación, mensajes, helpers compartidos |
| `Js_Empleados.html` … `Js_Configuracion.html` | HTML | Lógica por módulo (incluye `Js_Reportes` con Google Charts) |
| `appsscript.json` | JSON | Manifiesto: zona horaria, web app y scopes de OAuth |

> Recuerda ajustar `timeZone` en `appsscript.json` a tu país.
> El acceso por defecto del web app es `DOMAIN` (usuarios de tu organización).
> Si necesitas otro nivel, edita `webapp.access` en el manifiesto.
