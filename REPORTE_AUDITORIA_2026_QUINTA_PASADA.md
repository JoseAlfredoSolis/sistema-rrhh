# REPORTE DE AUDITORÍA — QUINTA PASADA
**Fecha:** 2026-07-10
**Método:** 8 revisiones independientes en paralelo (Auth/Util/Tests, y Code.gs dividido en 6 secciones por dominio, más frontend completo), cada una con instrucción explícita de no repetir lo ya corregido en `REPORTE_AUDITORIA_2026.md`.

---

## CRÍTICOS

### 1. Control de acceso roto — ~15 funciones exponen datos sensibles sin verificar token/sesión
A diferencia de sus funciones hermanas de escritura (que sí llaman `requiereEscritura`/`requiereAdmin`), estas funciones de lectura no reciben `token` ni validan sesión. En Apps Script, `google.script.run` expone automáticamente TODAS las funciones globales al cliente — no hace falta que el frontend las llame para que sean invocables desde la consola del navegador sin haber ingresado nunca un PIN:

- `obtenerConfigCorreo()` / `obtenerConfigAlertas()` — Code.gs:1604, 1647 (correos internos de RRHH, config de proveedor de correo)
- `obtenerConfiguracion()` — Code.gs:2200 (ID real de la Spreadsheet y su URL)
- `consultarAuditoria(...)` — Code.gs:2449 (bitácora completa con JSON antes/después)
- `listarPlantillas(tipo)` — Code.gs:2618 (contenido de plantillas)
- `obtenerEmpleadoCompleto(empleadoId)` — Code.gs:3023 (**salario exacto de cualquier empleado**)
- `obtenerBalanceVacaciones(empleadoId)` — Code.gs:3048 (salario, salario diario, valor de vacaciones)
- `listarCapacitaciones` / `listarEvaluaciones` — Code.gs:3086, 3161
- `listarEmpleadosSelect()` — Code.gs:1431 (`{id, nombre, salario}` de TODOS los empleados activos en una sola llamada)
- `generarReporteNomina`, `enviarReportePorEmail`, `generarPayloadContabilidad`, `enviarPayloadContabilidad`, `generarReporteAlertas` — Code.gs:4998, 5086, 5417, 5481, 5503 (nómina completa; `enviarReportePorEmail` permite enviar correo arbitrario desde Gmail del dominio corporativo — riesgo de spam/phishing con reputación de la empresa)
- `buscarGlobal(query, token)` — Code.gs:3865: solo verifica que `token` no esté vacío, no que sea una sesión real; además no filtra empleados inactivos.

**Impacto:** cualquiera con la URL de la webapp (o cuenta del dominio, según el modo de acceso) puede extraer salarios, evaluaciones de desempeño, auditoría completa y nómina agregada sin ingresar PIN.

**Fix:** agregar `requiereEscritura(token)` o `requiereAdmin(token)` (según corresponda) a cada una, igual que sus contrapartes de escritura.

---

### 2. `crearLiquidacion` siempre calcula como renuncia, sin importar el motivo real
`Code.gs:4812` llama `calcularLiquidacion(datos.empleado_id, datos.fecha_salida)` — **sin pasar `motivoSalida`**. Dentro de `calcularLiquidacion` (línea 4643): `var motivo = motivoSalida || 'renuncia'`. Resultado: `correspondeCesantia` y `correspondePreaviso` son siempre `false` en el cálculo automático, sin importar si el usuario marcó "despido con responsabilidad patronal".

**Impacto:** un despido con responsabilidad patronal calculado automáticamente omite cesantía y preaviso — el empleado recibe lo mismo que alguien que renunció. `generarReporteLiquidacion` sí pasa el motivo correctamente, así que el reporte impreso puede mostrar un total distinto al que realmente se guardó/pagó.

**Fix:** pasar `datos.motivo` como tercer argumento en la llamada de `crearLiquidacion`.

---

### 3. `calcularCesantiaCompleta` no es acumulativa por año — subpago masivo en antigüedades largas
`Code.gs:4746-4785` hace un único lookup en una tabla de 28 rangos y paga solo esos días para TODA la antigüedad, en vez de sumar el número de días correspondiente a cada año trabajado (Art. 29 CT, tope 8 años).

**Ejemplo concreto:** empleado con 10 años de antigüedad y salario ₡800,000 → el sistema calcula ≈ ₡573,333 de cesantía; lo correcto (acumulado, tope 8 años) sería ≈ ₡4,400,000. **El sistema paga ~13% de lo debido.** Además, para antigüedades > 30 años ningún rango hace match y la cesantía queda en ₡0.

**Fix:** reescribir la función para sumar días por cada año de servicio (topado a 8 años acumulados), no un único lookup. Verificar tabla exacta con asesor legal antes de desplegar.

---

### 4. Aguinaldo proporcional usa antigüedad total en vez de meses desde diciembre
`Code.gs:4673-4677`: `mesesAguinaldo = min(mesesTotales, 12)` usa el tiempo total desde `fecha_ingreso`, no los meses transcurridos en el período Dic-Nov vigente. Como `crearLiquidacion` no pasa `totalSalarios` (ver #2), esta es la ruta que realmente se ejecuta.

**Ejemplo concreto:** empleado con 5 años de antigüedad que renuncia el 15 de febrero (ya cobró aguinaldo de diciembre, solo lleva ~2.5 meses del nuevo período) recibe **un mes completo de salario** (₡800,000) en vez de ≈2.5/12 (₡166,667) — sobrepago de ≈₡633,000 por liquidación.

**Fix:** calcular meses desde el 1° de diciembre más reciente, no desde `fecha_ingreso`.

---

### 5. Bloqueo por fuerza bruta del PIN comparte un único bucket "anon" — DoS sin credenciales
`Auth.gs:126-148`: el contador de intentos fallidos se indexa por email de `Session.getActiveUser()`, pero cae a la clave fija `'anon'` cuando el email no está disponible — el caso normal para visitantes sin sesión de Google en una webapp con login por PIN.

**Impacto:** cualquier visitante sin credenciales que envíe 5 PINs incorrectos bloquea el acceso para **todos** los usuarios anónimos (incluido el admin) por 15 minutos. Repitiendo cada 15 minutos, deja el sistema completo inaccesible indefinidamente.

**Fix:** usar una clave de bloqueo basada en IP/fingerprint de sesión temporal en vez de email, o no compartir el bucket "anon" entre todos los visitantes.

---

## ALTOS

6. **Inyección de fórmulas en Sheets** — `_forzarTextoCamposIdEmpleado` (Code.gs:445) solo protege 5 de ~20 columnas de texto libre. Un valor como `=IMPORTXML(...)` en `direccion`, `notas` de vacaciones, etc. se ejecuta como fórmula viva si un admin abre la hoja directamente.
7. **Falta `conLock()` en la mayoría de escrituras** — `crearEmpleado`, `actualizarEmpleado`, `cambiarEstadoEmpleado`, CRUD de Departamentos, `eliminarAsistencia`, `crearCarpetaEmpleado` mutan sin lock. Riesgo de sobreescribir el registro equivocado con escrituras concurrentes, y de duplicar altas con cédula/nombre repetido.
8. **`calcularSalarioDiario` usa divisores incorrectos** para nómina semanal (÷7 en vez de ÷30) y quincenal (÷15 en vez de ÷26) — Code.gs:3007. Infla el "valor de vacaciones" mostrado hasta 4.28×. `calcularLiquidacion` usa la fórmula correcta en otro lugar del mismo archivo, confirmando la inconsistencia.
9. **`actualizarHoraExtra` no revalida nada** — Code.gs:4213: ni horas>0, ni tipo, ni el tope de 240h/mes que sí valida `crearHoraExtra`. Además, si `datos.horas` llega como texto no numérico, el tope de 240h queda desactivado silenciosamente también para creaciones futuras (`NaN + x > 240` es siempre `false`).
10. **`aprobarSolicitud`/`rechazarSolicitud` usan estados incompatibles con el resto de la app** — Code.gs:5347: escriben `'aprobado_rrhh'` etc., que `obtenerBalanceVacaciones` no reconoce (solo cuenta `'aprobada'` exacto). No usa lock ni verifica saldo disponible antes de aprobar → permite sobregiro de vacaciones.
11. **XSS en reporte de liquidación imprimible** — `Js_Liquidaciones.html:69` hace `document.write(res.html)` con el nombre del empleado sin escapar (`Code.gs:4551`). Un nombre con `<img onerror=...>` puede robar el `SESSION_TOKEN` de `sessionStorage` en la ventana con mismo origen.
12. **Caché casi nunca se invalida** — `invalidarCache`/`invalidarTodoCache` solo se llaman en `crearPermiso` (Code.gs:5313). `crearEmpleado`, `actualizarEmpleado`, CRUD de Departamentos, Vacaciones, etc. no invalidan — el dashboard y los `<select>` de empleados quedan desactualizados hasta 5 minutos (TTL).
13. **Editar un préstamo resetea su historial de pagos** — `actualizarPrestamo` (Code.gs:4086) sobreescribe `cuotas_pagadas` y `estado` a valores por defecto porque el formulario cliente no los envía. 100% reproducible sin concurrencia.
14. **`requiereRol` (Auth.gs) tiene fail-open** — rol no reconocido en `NIVEL_ROL` cae a `0`, por lo que cualquier sesión válida pasaría el chequeo. Hoy es código muerto (no se usa en el proyecto), pero es una trampa si se usa siguiendo el propio docstring de la función.

---

## MEDIOS

15. `cambiarEstadoVacaciones` no revisa solapamiento con otras vacaciones aprobadas al momento de aprobar (solo se valida al crear).
16. `listarSubalternos` empareja jefe↔subalterno por **nombre de texto**, no por ID — se rompe si se renombra al jefe, o colisiona con nombres duplicados (frecuente en Costa Rica).
17. `cargarBaseCompleta` (importación masiva) no valida ningún campo, a diferencia de `importarDatos`.
18. Falta clave de deduplicación para Nómina en importación masiva → nóminas duplicadas al reimportar el mismo Excel.
19. Alertas de cédula/licencia vencida dejan de mostrarse después de 31 días de vencidas (ventana de detección mal cerrada).
20. `crearCapacitacion`/`crearEvaluacion` no validan que el `empleado_id` exista.
21. `_reemplazarVariablesPlantilla` no escapa HTML en variables de plantillas de correo/WhatsApp.
22. Triplicación de la tabla de deducciones CR (CCSS+renta) en `Js_Nomina.html`, `Js_Expediente.html` y `Code.gs` — riesgo de desincronía cuando cambien los tramos legales.
23. `_limpiarBackupAntiguos` escanea la raíz de Drive en vez de la carpeta real donde vive la hoja (si está en subcarpeta), y puede borrar archivos ajenos que coincidan con el patrón de nombre `[BACKUP`.
24. `crearCarpetaEmpleado` sin lock → carpetas duplicadas por carrera, documentos "perdidos" en `listarDocumentos`.
25. Resumen semanal de WhatsApp se envía igual aunque el admin lo desactivó explícitamente (fallback incondicional en `verificarAlertas`).
26. `crearIncapacidad`/`actualizarIncapacidad` no validan solapamiento con vacaciones aprobadas u otras incapacidades.
27. `crearActivo` no valida que el activo (por `serial`) ya esté asignado a otro empleado.
28. `aprobarSolicitud` no valida que quien aprueba tenga autoridad sobre el departamento del empleado — cualquier `jefe_depto` aprueba solicitudes de cualquier equipo.
29. `crearRegistro`/`actualizarRegistro` (helpers CRUD genéricos) son código muerto (0 usos); la duplicación manual ya divergió — `actualizarPrestamo`, `actualizarHoraExtra` y `actualizarActivo` no registran bitácora al editar, aunque crear sí lo hace.
30. `encriptarDatosSensibles`/`desencriptarDatosSensibles` (Auth.gs) son código muerto y además no son encriptación real — solo base64(salt+valor), reversible sin clave.
31. No existe función de logout/invalidar sesión — un token filtrado solo expira por TTL natural (8h).

---

## BAJOS / cobertura de pruebas

32. `Tests.gs` no cubre `verificarPIN`, `hashPin`, bloqueo por fuerza bruta, ni ninguna función de `Util.gs` (incluida `escaparHtmlEmail`, que es de seguridad).
33. `test_crearLiquidacion_flujoCompleto` solo verifica `ok:true` y `!!id`, nunca el monto calculado — pasaría igual si el monto guardado fuera incorrecto.
34. Columna `jsonCambios` de Bitácora es inaccesible por desalineación entre `ENCABEZADOS.Bitacora` (7 columnas) y las 8 que realmente escribe `registrarBitacora`.
35. Credenciales de WhatsApp (API key de CallMeBot) en texto plano en ScriptProperties.
36. `_plantillaCorreo` no escapa `fromNombre` mientras que sí escapa el nombre del empleado en otros cuerpos de correo — inconsistente.
37. `generarReporteLiquidacion` muestra siempre "5,00" días de vacaciones hardcodeado en el HTML imprimible, sin importar el valor real calculado — documento legal internamente inconsistente.
38. Balance de vacaciones = 0 (legítimo) se trata igual que "sin datos" y paga 5 días de más en liquidación.
39. `Js_Configuracion.html`: mensaje de éxito no escapa `res.mensaje` (mensaje de error sí) — no explotable hoy porque el string es fijo, pero es un patrón frágil.
40. `Js_Comun.html:551`: la única llamada a `google.script.run` sin `.withFailureHandler()` (logging de errores, fire-and-forget).

---

## Nota metodológica
Auth.gs, Util.gs, `_normalizarTelefonoWhatsApp`, `pagarCuotaPrestamo`, `crearPrestamo`, `calcularDiasPreaviso`, y el manejo de errores de `_enviarSendGrid`/`_enviarBrevo`/`_enviarWhatsApp` se revisaron a fondo y **no presentan hallazgos nuevos** — están correctamente implementados.
