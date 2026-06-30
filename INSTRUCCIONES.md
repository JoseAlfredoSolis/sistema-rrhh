# Sistema RRHH en Google Apps Script

Sistema interno de RRHH construido **100% en Google Apps Script**. El frontend
(HTML+JS+CSS) se sirve con `HtmlService` y una hoja de Google Sheets es la base
de datos. Sin servidor externo, sin CORS.

**Módulos incluidos:** Dashboard (con guía de uso) · Empleados · Departamentos ·
Asistencia · Vacaciones/permisos · Nómina básica · Configuración.

## Estructura de archivos del proyecto Apps Script

| Archivo en tu carpeta   | Nombre en Apps Script | Tipo   | Qué contiene |
|-------------------------|-----------------------|--------|--------------|
| `Code.gs`               | `Code`                | Script | doGet, utilidades de BD y todo el backend (CRUD de los 6 módulos) |
| `Index.html`            | `Index`               | HTML   | Interfaz: navegación + vistas + modales |
| `Stylesheet.html`       | `Stylesheet`          | HTML   | Estilos CSS |
| `Js_Comun.html`         | `Js_Comun`            | HTML   | Navegación, mensajes, carga y helpers compartidos |
| `Js_Empleados.html`     | `Js_Empleados`        | HTML   | Lógica del módulo Empleados |
| `Js_Departamentos.html` | `Js_Departamentos`    | HTML   | Lógica del módulo Departamentos |
| `Js_Asistencia.html`    | `Js_Asistencia`       | HTML   | Lógica del módulo Asistencia |
| `Js_Vacaciones.html`    | `Js_Vacaciones`       | HTML   | Lógica del módulo Vacaciones |
| `Js_Nomina.html`        | `Js_Nomina`           | HTML   | Lógica del módulo Nómina |
| `Js_Dashboard.html`     | `Js_Dashboard`        | HTML   | Lógica del Dashboard + guía de uso |
| `Js_Reportes.html`      | `Js_Reportes`         | HTML   | Gráficos con Google Charts |
| `Js_Configuracion.html` | `Js_Configuracion`    | HTML   | Lógica del módulo Configuración |
| `appsscript.json`       | `appsscript`          | JSON   | Manifiesto: zona horaria, web app y scopes de OAuth |

> En Apps Script los archivos de frontend deben ser de tipo **HTML**, aunque
> contengan solo CSS o JS. Por eso todos los `Js_*` y `Stylesheet` son `.html`.
> El orden de los `Js_*` no importa: se cargan todos antes de ejecutarse.

---

## Paso 1 — Crear la hoja de cálculo (base de datos)

1. Ve a <https://sheets.google.com> y crea una hoja nueva.
2. Nómbrala, por ejemplo, **"Base RRHH"**.
3. Renombra la primera pestaña a **`Empleados`** (clic derecho en la pestaña →
   *Cambiar nombre*).
4. En la **fila 1** escribe estos encabezados, **uno por columna (A a H)**,
   exactamente así (en minúsculas):

   | A  | B      | C      | D            | E      | F             | G       | H      |
   |----|--------|--------|--------------|--------|---------------|---------|--------|
   | id | nombre | cedula | departamento | puesto | fecha_ingreso | salario | estado |

> No necesitas crear las demás pestañas a mano: el backend las crea solas con
> sus encabezados cuando hagan falta (función `getHoja`). Pero la de `Empleados`
> conviene tenerla lista desde el inicio.

---

## Paso 2 — Crear el proyecto Apps Script y pegar el código

1. En la misma hoja, ve a menú **Extensiones → Apps Script**.
   (Esto crea un proyecto *ligado* a la hoja, que es lo que queremos.)
2. Borra el contenido del archivo `Code.gs` que viene por defecto y pega
   **todo** el contenido de tu `Code.gs`.
3. Crea los archivos HTML. Para cada uno: botón **+** (junto a "Archivos") →
   **HTML**, ponle el nombre indicado (sin extensión) y pega el contenido del
   archivo correspondiente de tu carpeta:
   - `Index` · `Stylesheet`
   - `Js_Comun` · `Js_Empleados` · `Js_Departamentos` · `Js_Asistencia`
     · `Js_Vacaciones` · `Js_Nomina` · `Js_Dashboard` · `Js_Reportes`
     · `Js_Configuracion`
4. Guarda todo con **Ctrl+S** (o el icono del disquete).

> Los nombres deben coincidir **exactamente** (distinguen mayúsculas y el guion
> bajo). Si uno no coincide, `include()` no lo encontrará y la página dará error.

---

## Paso 2.5 — Aplicar el manifiesto (`appsscript.json`)

El manifiesto declara la zona horaria, la configuración del web app y los
**permisos (scopes) de OAuth** explícitamente. Así la autorización es limpia y
predecible (Google pide exactamente lo necesario, ni más ni menos).

1. En el editor de Apps Script: **⚙ Configuración del proyecto** (icono de
   engranaje en la barra izquierda).
2. Marca la casilla **“Mostrar el archivo de manifiesto «appsscript.json» en el
   editor”**.
3. Vuelve a **Editor** (`< >`): ahora verás el archivo **`appsscript.json`**.
   Ábrelo, borra su contenido y pega el de tu `appsscript.json`.
4. **Ajusta `timeZone`** a tu país si hace falta (ej: `America/Santo_Domingo`,
   `America/Mexico_City`, `America/Bogota`, `Europe/Madrid`). Esto afecta cómo se
   guardan/leen las fechas y horas.
5. *(Opcional)* `webapp.access` controla quién puede abrir la app:
   - `"MYSELF"` = solo tú · `"DOMAIN"` = tu organización · `"ANYONE"` = cualquiera
     con el enlace. `executeAs: "USER_DEPLOYING"` = se ejecuta con tu cuenta.
6. Guarda (**Ctrl+S**).

> **Scope declarado:** `.../auth/spreadsheets` — leer, escribir, abrir por ID y
> **crear** hojas de cálculo. Cubre todo el sistema, incluido el botón
> *“Crear hoja nueva”* de Configuración. No se piden permisos de Drive completos.

---

## Paso 3 — Publicar como aplicación web

1. En el editor de Apps Script, arriba a la derecha: **Implementar → Nueva
   implementación**.
2. Engranaje ⚙ junto a "Selecciona el tipo" → **Aplicación web**.
3. Configura:
   - **Descripción**: `RRHH v1`
   - **Ejecutar como**: *Yo* (tu cuenta).
   - **Quién tiene acceso**: *Solo yo* (o *Cualquier persona de tu organización*).
4. Clic en **Implementar**.
5. La primera vez Google pedirá **autorizar permisos**: acepta
   (*Permitir acceso a tus hojas de cálculo*). Si aparece "App no verificada",
   entra en *Configuración avanzada → Ir a (nombre del proyecto)*.
6. Copia la **URL de la aplicación web**. Esa es tu sistema; ábrela en el navegador.

> Cada vez que cambies el código y quieras ver los cambios en la URL publicada:
> **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva →
> Implementar**. (Para pruebas rápidas puedes usar *Implementar → Probar
> implementaciones*, que siempre usa la última versión guardada.)

---

## Paso 4 — Probar el sistema

Abre la URL del web app. En **Dashboard** verás una **guía de uso** con el orden
recomendado. La barra superior tiene los módulos. Orden de prueba:
**Configuración → Departamentos → Empleados → (Asistencia, Vacaciones, Nómina) →
Dashboard**.

**Configuración** ⚙️
1. Entra a **Configuración**. Verás el estado de la conexión (nombre, ID y enlace
   a la hoja) y la tabla con las 5 pestañas y su estado.
2. Pulsa **Crear / verificar pestañas** → crea las que falten con sus encabezados.
   Vuelve a pulsarlo y dirá que ya existían (no borra datos).
3. *(Opcional)* Para usar **otra** hoja distinta a la ligada: pega su **ID o URL**
   en *Conectar una hoja por ID* y pulsa **Conectar**. Para volver atrás, usa
   **Usar la hoja ligada al proyecto**.
   - El ID es la parte larga de la URL entre `/d/` y `/edit`.
   - Tu cuenta debe tener acceso a esa hoja.
4. *(Opcional)* **Crear hoja nueva**: si aún no tienes ninguna hoja, escribe un
   nombre y pulsa **Crear hoja nueva** → el sistema crea un Google Sheet en tu
   Drive con todas las pestañas listas y lo conecta automáticamente. El enlace
   para abrirlo aparece en *Hoja conectada*.

**Departamentos**
1. **+ Nuevo departamento**, nombre + responsable → se lista. La pestaña
   `Departamentos` se crea sola en la hoja.
2. Crea un segundo con el mismo nombre → se rechaza por duplicado.
3. **Eliminar** un departamento sin empleados → se borra. Si tiene empleados
   asignados, se bloquea con un aviso.

**Empleados**
1. **+ Nuevo empleado**: el `<select>` de departamento muestra los que creaste.
   Guarda → mensaje verde, fila con `id` y `estado = activo`.
2. **Validaciones**: cédula vacía/con letras o salario negativo → errores en rojo.
3. **Cédula duplicada** → el segundo se rechaza.
4. **Editar**, **Dar de baja / Reactivar** (baja lógica: la fila no se borra),
   filtro **Solo activos** y **Buscador** en vivo.

**Asistencia**
1. **+ Registrar asistencia**: elige empleado (solo activos), fecha y horas
   entrada/salida → las **horas se calculan solas** (incluye turnos que cruzan
   medianoche). Verifica el total en la columna *Horas*.
2. **Eliminar** un registro.

**Vacaciones**
1. **+ Nueva solicitud**: empleado + rango de fechas → los **días se calculan**
   (inclusive) y nace como *pendiente* (badge amarillo).
2. Fecha fin anterior a inicio → se rechaza.
3. **Aprobar / Rechazar** → cambia el badge; los botones desaparecen al decidir.

**Nómina**
1. **+ Generar nómina**: empleado + mes → toma el **salario base del empleado**,
   resta deducciones y guarda el **neto**. Deducciones > salario → se rechaza.
2. Repetir el mismo empleado+mes → se rechaza por duplicado.
3. Usa el filtro **Mes** y revisa el **Total neto del mes** en el pie de la tabla.

**Reportes** 📈
1. Entra a **Reportes** → verás gráficos generados con Google Charts:
   empleados por departamento, por estado, neto de nómina por mes, horas por
   empleado y vacaciones por estado.
2. Crea algunos datos en los otros módulos y pulsa **🔄 Actualizar**: los
   gráficos se redibujan. Los que no tengan datos muestran un aviso *"Sin datos"*.
3. Los gráficos son responsive: se reajustan al cambiar el tamaño de la ventana.

> Los gráficos usan la librería pública de Google
> (`https://www.gstatic.com/charts/loader.js`), ya enlazada en `Index.html`. No
> requiere instalar nada; solo necesitas conexión a internet al abrir la app.

**Dashboard**
- Entra a la pestaña Dashboard → tarjetas con totales (activos, inactivos,
  departamentos, vacaciones pendientes, nóminas y neto del mes, masa salarial).
  Vuelve a entrar tras crear datos y verás los números actualizados.

### Depurar si algo falla
- Errores del backend: en el editor, menú **Ver → Registros de ejecución**.
- Errores del frontend: abre la **consola del navegador** (F12 → *Console*).
- Si la página sale en blanco o un módulo no responde, revisa que **todos** los
  archivos HTML existan con su nombre exacto (incluido el guion bajo de `Js_*`).

---

## Notas de diseño

- **IDs únicos**: `generarId(prefijo)` combina marca de tiempo + número aleatorio
  (`EMP-`, `DEP-`, `ASI-`, `VAC-`, `NOM-`).
- **Pestaña por nombre**: `getHoja(nombre)` crea la pestaña con sus encabezados si
  no existe. Solo necesitas crear `Empleados` a mano; las demás nacen al usarlas
  (o todas a la vez desde **Configuración → Crear/verificar pestañas**).
- **Hoja configurable**: `getLibro()` usa la hoja ligada al proyecto, salvo que en
  Configuración se guarde un ID (en `PropertiesService`), en cuyo caso abre esa.
  Así el sistema funciona también como proyecto **independiente** (no ligado).
- **Baja lógica** (empleados): nunca se borra la fila; se cambia `estado`.
- **Relaciones**: Asistencia, Vacaciones y Nómina guardan `empleado_id`; el
  backend resuelve el nombre con `mapaEmpleados()` al listar.
- **Cálculos en backend**: horas (asistencia), días (vacaciones) y neto (nómina)
  se calculan en el servidor para garantizar consistencia.
- **Validación doble**: el frontend valida para UX y el backend revalida para
  proteger la integridad de los datos.
- **Sin CORS**: toda la comunicación usa `google.script.run`, no `fetch`.

## Estructura de las pestañas (base de datos)

| Pestaña       | Columnas |
|---------------|----------|
| Empleados     | id · nombre · cedula · departamento · puesto · fecha_ingreso · salario · estado |
| Departamentos | id · nombre · responsable |
| Asistencia    | id · empleado_id · fecha · hora_entrada · hora_salida · horas |
| Vacaciones    | id · empleado_id · fecha_inicio · fecha_fin · dias · estado |
| Nomina        | id · empleado_id · mes · salario_base · deducciones · neto |

## Ideas de mejora (opcionales)
- Reportes exportables (PDF / nuevas hojas) de nómina por mes.
- Control de acceso por usuario con `Session.getActiveUser()`.
- Historial de cambios o auditoría.
- Resta de vacaciones aprobadas a un saldo anual por empleado.
