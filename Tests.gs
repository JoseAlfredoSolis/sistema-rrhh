/**
 * ===================================================================
 * SISTEMA DE PRUEBAS AUTOMATIZADAS
 * ===================================================================
 * Suite de pruebas de regresión y validaciones críticas del backend.
 * Se ejecuta bajo demanda desde la pantalla "Pruebas" (solo Admin).
 *
 * Crea sus propios datos de prueba (prefijo ZZZPRUEBA_) en las mismas
 * hojas reales, y los elimina siempre al terminar (en un finally), para
 * no dejar basura en la base de datos de producción.
 * ===================================================================
 */

var PRUEBA_PREFIJO = 'ZZZPRUEBA_';
var PRUEBA_CEDULA  = '000000001';

function _assert(cond, mensaje) {
  if (!cond) throw new Error(mensaje || 'Aserción falló.');
}

function _assertOk(resultado, mensaje) {
  _assert(resultado && resultado.ok === true,
    (mensaje || 'Se esperaba ok:true') + ' — recibido: ' + JSON.stringify(resultado));
}

function _assertFalla(resultado, mensaje) {
  _assert(resultado && resultado.ok === false,
    (mensaje || 'Se esperaba ok:false') + ' — recibido: ' + JSON.stringify(resultado));
}

function _assertIgual(actual, esperado, mensaje) {
  _assert(actual === esperado,
    (mensaje || 'Valores distintos') + ' (esperado: ' + esperado + ', actual: ' + actual + ')');
}

// ===================================================================
// REGISTRO DE PRUEBAS
// Cada prueba recibe el contexto (ctx) creado en _pruebasSetup, con el
// empleado/departamento de prueba ya creados y un token de sesión Admin.
// ===================================================================

var PRUEBAS_REGISTRO = [
  { nombre: 'formatearFecha normaliza un objeto Date',                          fn: test_formatearFecha_conDate },
  { nombre: 'formatearFecha respeta un string ISO sin alterarlo',               fn: test_formatearFecha_conString },
  { nombre: 'generarId produce IDs únicos con el prefijo dado',                 fn: test_generarId },
  { nombre: 'crearEmpleado rechaza una cédula duplicada',                       fn: test_crearEmpleado_cedulaDuplicada },
  { nombre: 'crearEmpleado rechaza datos incompletos',                         fn: test_crearEmpleado_datosIncompletos },
  { nombre: 'calcularLiquidacion funciona con la fecha real guardada en la hoja (regresión Date/Sheets)', fn: test_calcularLiquidacion_fechaDesdeSheet },
  { nombre: 'calcularLiquidacion rechaza fecha de salida anterior al ingreso',  fn: test_calcularLiquidacion_fechaInvalida },
  { nombre: 'calcularLiquidacion bloquea sin sesión válida',                   fn: test_calcularLiquidacion_bloqueaSinToken },
  { nombre: 'calcularLiquidacion aplica cesantía solo cuando el motivo es despido con responsabilidad patronal', fn: test_crearLiquidacion_respetaMotivoDespido },
  { nombre: 'crearLiquidacion guarda el monto calculado automáticamente',       fn: test_crearLiquidacion_flujoCompleto },
  { nombre: 'obtenerAlertas nunca produce fechas inválidas (regresión Date/Sheets)', fn: test_obtenerAlertas_noFalla },
  { nombre: '_reemplazarVariablesPlantilla sustituye las variables del empleado', fn: test_reemplazarVariablesPlantilla },
  { nombre: 'guardarPlantilla rechaza un tipo inválido',                        fn: test_guardarPlantilla_tipoInvalido },
  { nombre: 'guardarPlantilla guarda y listarPlantillas la refleja',            fn: test_guardarPlantilla_flujoValido },
  { nombre: 'registrarErrorSistema nunca lanza excepción',                      fn: test_registrarErrorSistema_bestEffort },
  { nombre: 'listarComunicaciones bloquea sin sesión válida',                   fn: test_listarComunicaciones_bloqueaSinToken },
  { nombre: 'listarDocumentos bloquea sin sesión válida',                       fn: test_listarDocumentos_bloqueaSinToken },
  { nombre: 'listarErrores exige rol Admin (rrhh no alcanza)',                  fn: test_listarErrores_soloAdmin },
  { nombre: 'obtenerEmpleadoCompleto bloquea sin sesión válida',                fn: test_obtenerEmpleadoCompleto_bloqueaSinToken },
  { nombre: 'obtenerEmpleadoCompleto funciona con sesión válida',               fn: test_obtenerEmpleadoCompleto_conSesionFunciona },
  { nombre: 'obtenerBalanceVacaciones bloquea sin sesión válida',               fn: test_obtenerBalanceVacaciones_bloqueaSinToken },
  { nombre: 'generarReporteNomina bloquea sin sesión válida',                   fn: test_generarReporteNomina_bloqueaSinToken },
  { nombre: 'buscarGlobal bloquea con un token inventado (no solo vacío)',      fn: test_buscarGlobal_bloqueaTokenInventado },
  { nombre: 'listarEmpleadosSelect oculta el salario sin sesión',               fn: test_listarEmpleadosSelect_ocultaSalarioSinSesion },
  { nombre: 'listarEmpleadosSelect incluye el salario con sesión RRHH/Admin',   fn: test_listarEmpleadosSelect_incluyeSalarioConSesion },
  { nombre: 'calcularCesantiaCompleta suma los días de cada año trabajado (no un único valor de tabla)', fn: test_calcularCesantiaCompleta_esAcumulativaPorAnio },
  { nombre: 'calcularLiquidacion prorratea el aguinaldo desde diciembre, no desde la antigüedad total', fn: test_calcularLiquidacion_aguinaldoProrrateadoDesdeDiciembre },
  { nombre: 'El bloqueo de PIN no usa la clave "anon" compartida cuando hay clienteId', fn: test_pinLockout_noUsaClaveAnonCompartida },
  { nombre: 'El bloqueo de PIN no se comparte entre clientes distintos',              fn: test_pinLockout_clientesDistintosNoComparteBloqueo },
  { nombre: 'pagarCuotaPrestamo bloquea un préstamo ya saldado (regresión)',    fn: test_pagarCuotaPrestamo_yaSaldado },
  { nombre: 'eliminarDepartamento respeta la integridad referencial',           fn: test_eliminarDepartamento_conEmpleados },
  { nombre: 'crearVacaciones rechaza una solicitud que excede el saldo disponible', fn: test_crearVacaciones_saldoInsuficiente },
  { nombre: 'listarNomina bloquea sin sesión válida',                          fn: test_listarNomina_bloqueaSinToken },
  { nombre: 'listarPrestamos bloquea sin sesión válida',                       fn: test_listarPrestamos_bloqueaSinToken },
  { nombre: 'listarLiquidaciones bloquea sin sesión válida',                   fn: test_listarLiquidaciones_bloqueaSinToken },
  { nombre: 'listarHistorialSalario bloquea sin sesión válida',                fn: test_listarHistorialSalario_bloqueaSinToken },
  { nombre: 'listarBitacora bloquea sin sesión válida',                        fn: test_listarBitacora_bloqueaSinToken },
  { nombre: 'paquete de plantillas profesionales tiene datos válidos',        fn: test_paquetePlantillasProfesionales_esValido },
  { nombre: 'enviarComunicacionAmbos exige al menos un medio',                fn: test_enviarComunicacionAmbos_exigeAlMenosUnMedio },
  { nombre: 'hashPin es determinista y distingue PINs distintos',            fn: test_hashPin_esDeterminista },
  { nombre: '_pinCoincide compara contra el hash, nunca contra texto plano', fn: test_pinCoincide_comparaHashes },
  { nombre: 'escaparHtmlEmail neutraliza caracteres peligrosos de HTML',     fn: test_escaparHtmlEmail },
  { nombre: 'sanitizarCeldaSheets neutraliza valores que Sheets interpretaría como fórmula', fn: test_sanitizarCeldaSheets },
  { nombre: 'sanitizarFilaSheets aplica la neutralización a toda la fila',   fn: test_sanitizarFilaSheets },
  { nombre: 'estadoNormalizado recorta espacios y normaliza mayúsculas',    fn: test_estadoNormalizado },
  { nombre: 'mesDeFecha extrae yyyy-MM tanto de Date como de string',       fn: test_mesDeFecha },
  { nombre: 'crearLiquidacion guarda exactamente el monto que calculó calcularLiquidacion', fn: test_crearLiquidacion_montoCoincideConCalculo },
  { nombre: 'paquete de plantillas minimalistas tiene datos válidos',                     fn: test_paquetePlantillasMinimalistas_esValido },
  { nombre: '_enviarOutlook valida campos requeridos antes de llamar a Microsoft Graph', fn: test_enviarOutlook_validaCamposRequeridos },
  { nombre: 'reenviarComunicacion solo permite reintentar registros con estado error', fn: test_reenviarComunicacion_soloPermiteRegistrosFallidos },
  { nombre: '_normalizarTelefonoWhatsApp antepone +506 a números nacionales de 8 dígitos', fn: test_normalizarTelefonoWhatsApp_anteponeCodigoPaisCR },
  { nombre: '_whatsappCredencialesListas distingue CallMeBot de servidor propio', fn: test_whatsappCredencialesListas_porProveedor },
  { nombre: '_enviarWhatsAppServidorPropio valida URL y secreto antes de llamar al servidor', fn: test_enviarWhatsAppServidorPropio_validaCamposRequeridos },
  { nombre: 'obtenerReportes devuelve todas las series y KPIs con la estructura esperada', fn: test_obtenerReportes_estructuraCompleta },
  { nombre: 'crearLiquidacion y actualizarLiquidacion guardan y preservan los 12 salarios mensuales', fn: test_liquidacion_guardaSalariosMensuales },
  { nombre: '_asegurarEncabezadosLiquidaciones deja cada encabezado en su columna exacta', fn: test_asegurarEncabezadosLiquidaciones_posicionCorrecta },
  { nombre: 'cambiarEstadoEmpleado registra historial y actualiza fecha_ingreso/fecha_salida', fn: test_cambiarEstadoEmpleado_historialYFechaIngreso },
  { nombre: 'obtenerPuestosCriticos solo incluye empleados activos con cargo_critico=SI', fn: test_obtenerPuestosCriticos_filtraCargoCriticoActivo },
  { nombre: 'listarEmpleados filtra por estado activo/inactivo/todos según filtroEstado', fn: test_listarEmpleados_filtroEstadoInactivo },
  { nombre: 'actualizarEmpleado marca inactivo automáticamente al agregar fecha de salida', fn: test_actualizarEmpleado_fechaSalidaInactivaAutomaticamente },
  { nombre: 'obtenerPuestosCriticos incluye solo las alertas de empleados críticos', fn: test_obtenerPuestosCriticos_incluyeAlertasFiltradas },
  { nombre: 'obtenerPuestosCriticos alerta ítems de cumplimiento sin marcar y el Dashboard los incluye', fn: test_obtenerPuestosCriticos_alertaChecklistCumplimiento },
  { nombre: 'listarEmpleados formatea las fechas de cumplimiento crítico (regresión input type=date)', fn: test_listarEmpleados_formateaFechasCumplimientoCritico },
  { nombre: 'obtenerExpediente incluye alertas, liquidaciones, incapacidades y el resto de módulos del empleado', fn: test_obtenerExpediente_incluyeTodosLosDatos },
  { nombre: '_overrideWhatsAppEmpleado usa la API Key de CallMeBot propia del empleado cuando existe', fn: test_overrideWhatsAppEmpleado_usaApikeyPropiaSiExiste },
  { nombre: 'crearEmpleado guarda y devuelve la API Key de CallMeBot propia del empleado', fn: test_crearEmpleado_guardaApikeyCallMeBotPropia }
];

// ===================================================================
// ORQUESTADOR
// ===================================================================

/**
 * Ejecuta toda la suite de pruebas. Solo Admin.
 * @param {string} token
 * @return {Object} {ok, resumen:{total,exitosas,fallidas,duracionMs}, detalles:[{nombre,ok,mensaje,ms}]}
 */
function ejecutarSuitePruebas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var ctx = {};
  var inicio = new Date().getTime();

  try {
    _pruebasSetup(ctx);
  } catch (e) {
    _pruebasTeardown(ctx);
    return {
      ok: true,
      resumen: { total: 1, exitosas: 0, fallidas: 1, duracionMs: new Date().getTime() - inicio },
      detalles: [{ nombre: 'Preparación de datos de prueba (setup)', ok: false, mensaje: e.message, ms: 0 }]
    };
  }

  var resultados = [];
  try {
    PRUEBAS_REGISTRO.forEach(function (t) {
      var t0 = new Date().getTime();
      try {
        t.fn(ctx);
        resultados.push({ nombre: t.nombre, ok: true, mensaje: '', ms: new Date().getTime() - t0 });
      } catch (e) {
        resultados.push({ nombre: t.nombre, ok: false, mensaje: e.message, ms: new Date().getTime() - t0 });
      }
    });
  } finally {
    _pruebasTeardown(ctx);
  }

  var exitosas = resultados.filter(function (r) { return r.ok; }).length;
  return {
    ok: true,
    resumen: {
      total: resultados.length,
      exitosas: exitosas,
      fallidas: resultados.length - exitosas,
      duracionMs: new Date().getTime() - inicio
    },
    detalles: resultados
  };
}

/** Limpia cualquier residuo de una corrida anterior que no haya terminado bien. */
function _pruebasLimpiarResiduos() {
  try {
    leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.nombre).indexOf(PRUEBA_PREFIJO) === 0 || String(e.cedula) === PRUEBA_CEDULA;
    }).forEach(function (e) { eliminarFila(HOJAS.EMPLEADOS, e.id, 'Empleado'); });
  } catch (e) {}
  try {
    leerTabla(HOJAS.DEPARTAMENTOS).filter(function (d) {
      return String(d.nombre).indexOf(PRUEBA_PREFIJO) === 0;
    }).forEach(function (d) { eliminarFila(HOJAS.DEPARTAMENTOS, d.id, 'Departamento'); });
  } catch (e) {}
}

function _pruebasSetup(ctx) {
  _pruebasLimpiarResiduos();

  ctx.token = crearSesion('admin');

  var dep = crearDepartamento({ nombre: PRUEBA_PREFIJO + 'Depto', responsable: 'N/A' }, ctx.token);
  _assertOk(dep, 'No se pudo preparar el departamento de prueba');
  ctx.departamentoId = dep.id;
  ctx.departamentoNombre = PRUEBA_PREFIJO + 'Depto';

  var fechaIngreso = new Date();
  fechaIngreso.setFullYear(fechaIngreso.getFullYear() - 2);
  var emp = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'Empleado',
    cedula: PRUEBA_CEDULA,
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba',
    fecha_ingreso: Utilities.formatDate(fechaIngreso, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    salario: 550000,
    tipo_nomina: 'Mensual'
  }, ctx.token);
  _assertOk(emp, 'No se pudo preparar el empleado de prueba');
  ctx.empleadoId = emp.id;
}

function _pruebasTeardown(ctx) {
  if (!ctx) return;
  try {
    if (ctx.liquidacionId) eliminarFila(HOJAS.LIQUIDACIONES, ctx.liquidacionId, 'Liquidacion');
  } catch (e) {}
  try {
    if (ctx.vacacionId) eliminarFila(HOJAS.VACACIONES, ctx.vacacionId, 'Vacaciones');
  } catch (e) {}
  try {
    if (ctx.prestamoId) eliminarPrestamo(ctx.prestamoId, ctx.token);
  } catch (e) {}
  try {
    if (ctx.plantillaId) eliminarPlantilla(ctx.plantillaId, ctx.token);
  } catch (e) {}
  try {
    if (ctx.origenErrorPrueba) {
      var errores = listarErrores(ctx.token);
      if (Array.isArray(errores)) {
        errores.filter(function (e) { return e.origen === ctx.origenErrorPrueba; })
          .forEach(function (e) { eliminarFila(HOJAS.ERRORES, e.id, 'Error'); });
      }
    }
  } catch (e) {}
  try {
    if (ctx.empleadoId) eliminarFila(HOJAS.EMPLEADOS, ctx.empleadoId, 'Empleado');
  } catch (e) {}
  try {
    if (ctx.departamentoId) eliminarFila(HOJAS.DEPARTAMENTOS, ctx.departamentoId, 'Departamento');
  } catch (e) {}
}

// ===================================================================
// PRUEBAS INDIVIDUALES
// ===================================================================

function test_formatearFecha_conDate(ctx) {
  var fecha = new Date(2025, 5, 15); // 15 de junio de 2025
  _assertIgual(formatearFecha(fecha), '2025-06-15',
    'Un objeto Date debería normalizarse a yyyy-MM-dd');
}

function test_formatearFecha_conString(ctx) {
  _assertIgual(formatearFecha('2025-01-31'), '2025-01-31',
    'Un string ISO yyyy-mm-dd debería devolverse sin alterar (evita el corrimiento de un día por zona horaria)');
}

function test_generarId(ctx) {
  var a = generarId('TST');
  var b = generarId('TST');
  _assert(a !== b, 'Dos IDs generados no deberían coincidir');
  _assertIgual(a.indexOf('TST-'), 0, 'El ID debería iniciar con el prefijo dado');
}

function test_crearEmpleado_cedulaDuplicada(ctx) {
  var res = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'Duplicado',
    cedula: PRUEBA_CEDULA, // misma cédula del empleado de prueba del setup
    departamento: ctx.departamentoNombre,
    puesto: 'Otro puesto',
    fecha_ingreso: '2025-01-01',
    salario: 550000
  }, ctx.token);
  _assertFalla(res, 'Debería rechazar una cédula ya registrada en otro empleado');
}

function test_crearEmpleado_datosIncompletos(ctx) {
  var res = crearEmpleado({ nombre: '', cedula: '', salario: 0, fecha_ingreso: '' }, ctx.token);
  _assertFalla(res, 'Debería rechazar datos vacíos/incompletos');
}

function test_calcularLiquidacion_fechaDesdeSheet(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var res = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'renuncia', null, null, null, null, ctx.token);
  _assertOk(res, 'calcularLiquidacion no debería fallar usando la fecha_ingreso tal como la devuelve la hoja');
  _assert(!isNaN(res.totalCalculado), 'totalCalculado no debería ser NaN (regresión: Date de Sheets + concatenación de string)');
  _assert(res.totalCalculado > 0, 'Con casi 2 años de antigüedad el total calculado debería ser mayor a 0');
}

function test_calcularLiquidacion_fechaInvalida(ctx) {
  var res = calcularLiquidacion(ctx.empleadoId, '2000-01-01', 'renuncia', null, null, null, null, ctx.token); // muy anterior al ingreso real
  _assertFalla(res, 'Debería rechazar una fecha de salida anterior a la fecha de ingreso');
}

function test_calcularLiquidacion_bloqueaSinToken(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var res = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'renuncia', null, null, null, null, '');
  _assertFalla(res, 'calcularLiquidacion debería bloquear sin un token de sesión válido');
}

function test_crearLiquidacion_respetaMotivoDespido(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var renuncia = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'renuncia', null, null, null, null, ctx.token);
  _assertOk(renuncia, 'calcularLiquidacion con renuncia debería funcionar');
  _assert(!renuncia.correspondeCesantia, 'Una renuncia no debería generar derecho a cesantía');

  var despido = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'despido_con_resp', null, null, null, null, ctx.token);
  _assertOk(despido, 'calcularLiquidacion con despido_con_resp debería funcionar');
  _assert(despido.correspondeCesantia, 'Un despido con responsabilidad patronal debería generar derecho a cesantía');
  _assert(despido.cesantia > 0, 'La cesantía calculada para un despido con responsabilidad patronal debería ser mayor a 0');
  _assert(despido.totalCalculado > renuncia.totalCalculado,
    'El total de un despido con responsabilidad patronal debería ser mayor que el de una renuncia (regresión: crearLiquidacion no pasaba el motivo real)');
}

function test_crearLiquidacion_flujoCompleto(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var res = crearLiquidacion({
    empleado_id: ctx.empleadoId,
    fecha_salida: fechaSalida,
    motivo: 'renuncia',
    calcular_automatico: true
  }, ctx.token);
  _assertOk(res, 'crearLiquidacion debería guardar correctamente con cálculo automático');
  _assert(!!res.id, 'crearLiquidacion debería devolver un id');
  ctx.liquidacionId = res.id;
}

function test_obtenerAlertas_noFalla(ctx) {
  var alertas = obtenerAlertas(ctx.token);
  _assert(Array.isArray(alertas), 'obtenerAlertas debería devolver un arreglo');
  alertas.forEach(function (a) {
    if (a.fecha) {
      _assert(/^\d{4}-\d{2}-\d{2}$/.test(a.fecha),
        'Cada alerta con fecha debe tener formato yyyy-MM-dd, nunca "Invalid Date" (alerta: ' + JSON.stringify(a) + ')');
    }
  });
}

function test_reemplazarVariablesPlantilla(ctx) {
  var emp = { nombre: 'Juan Pérez', cedula: '1-2345-6789', puesto: 'Analista', departamento: 'TI', salario: 600000, fecha_ingreso: '2024-01-01' };
  var texto = 'Hola {{nombre}}, tu puesto es {{puesto}} en {{departamento}}. Salario: {{salario}}.';
  var resultado = _reemplazarVariablesPlantilla(texto, emp);
  _assert(resultado.indexOf('Juan Pérez') !== -1, 'Debería sustituir {{nombre}}');
  _assert(resultado.indexOf('Analista') !== -1, 'Debería sustituir {{puesto}}');
  _assert(resultado.indexOf('TI') !== -1, 'Debería sustituir {{departamento}}');
  _assert(resultado.indexOf('{{') === -1, 'No deberían quedar variables sin sustituir');
}

function test_guardarPlantilla_tipoInvalido(ctx) {
  var res = guardarPlantilla({ nombre: PRUEBA_PREFIJO + 'PlantillaInvalida', tipo: 'fax', cuerpo: 'Hola {{nombre}}' }, ctx.token);
  _assertFalla(res, 'Debería rechazar un tipo de plantilla que no sea email/whatsapp');
}

function test_guardarPlantilla_flujoValido(ctx) {
  var res = guardarPlantilla({
    nombre: PRUEBA_PREFIJO + 'Plantilla',
    tipo: 'email',
    asunto: 'Asunto de prueba',
    cuerpo: 'Hola {{nombre}}'
  }, ctx.token);
  _assertOk(res, 'guardarPlantilla debería aceptar una plantilla válida');
  _assert(!!res.id, 'guardarPlantilla debería devolver un id');
  ctx.plantillaId = res.id;

  var lista = listarPlantillas('email', ctx.token);
  var encontrada = lista.some(function (p) { return String(p.id) === String(ctx.plantillaId); });
  _assert(encontrada, 'listarPlantillas debería incluir la plantilla recién creada');
}

function test_registrarErrorSistema_bestEffort(ctx) {
  ctx.origenErrorPrueba = PRUEBA_PREFIJO + 'error_test';
  var res = registrarErrorSistema(ctx.origenErrorPrueba, 'Error de prueba (no real, generado por la suite de pruebas)', 'contexto de prueba', ctx.token);
  _assertOk(res, 'registrarErrorSistema debería registrar sin lanzar excepción');
}

function test_listarComunicaciones_bloqueaSinToken(ctx) {
  var res = listarComunicaciones(null, null, '');
  _assertFalla(res, 'listarComunicaciones debería bloquear sin un token de sesión válido');
}

function test_listarDocumentos_bloqueaSinToken(ctx) {
  var res = listarDocumentos(ctx.empleadoId, '');
  _assertFalla(res, 'listarDocumentos debería bloquear sin un token de sesión válido');
}

function test_listarErrores_soloAdmin(ctx) {
  var tokenRrhh = crearSesion('rrhh');
  var res = listarErrores(tokenRrhh);
  _assertFalla(res, 'listarErrores debería exigir rol Admin — un token de rol "rrhh" no debería alcanzar');
}

function test_obtenerEmpleadoCompleto_bloqueaSinToken(ctx) {
  var res = obtenerEmpleadoCompleto(ctx.empleadoId, '');
  _assertIgual(res, null, 'obtenerEmpleadoCompleto no debería devolver datos (incluye salario) sin un token de sesión válido');
}

function test_obtenerEmpleadoCompleto_conSesionFunciona(ctx) {
  var res = obtenerEmpleadoCompleto(ctx.empleadoId, ctx.token);
  _assert(res && res.id === ctx.empleadoId, 'obtenerEmpleadoCompleto debería devolver los datos del empleado con una sesión válida');
}

function test_obtenerBalanceVacaciones_bloqueaSinToken(ctx) {
  var res = obtenerBalanceVacaciones(ctx.empleadoId, '');
  _assertFalla(res, 'obtenerBalanceVacaciones no debería exponer salario/valor de vacaciones sin un token de sesión válido');
}

function test_generarReporteNomina_bloqueaSinToken(ctx) {
  var res = generarReporteNomina('2020-01', '');
  _assertFalla(res, 'generarReporteNomina no debería exponer la nómina sin un token de sesión válido');
}

function test_buscarGlobal_bloqueaTokenInventado(ctx) {
  var res = buscarGlobal(PRUEBA_PREFIJO, 'token-que-no-existe-en-cache');
  _assert(Array.isArray(res) && res.length === 0,
    'buscarGlobal debería devolver vacío con un token que no corresponde a ninguna sesión real (antes solo verificaba que no viniera vacío)');
}

function test_listarEmpleadosSelect_ocultaSalarioSinSesion(ctx) {
  invalidarTodoCache(); // el empleado de prueba se creó recién; forzar lectura fresca
  var lista = listarEmpleadosSelect('');
  _assert(Array.isArray(lista) && lista.length === 0,
    'listarEmpleadosSelect debería devolver vacío sin sesión válida');
}

function test_listarEmpleadosSelect_incluyeSalarioConSesion(ctx) {
  invalidarTodoCache();
  var lista = listarEmpleadosSelect(ctx.token);
  var propio = lista.filter(function (e) { return String(e.id) === String(ctx.empleadoId); })[0];
  _assert(propio && propio.salario === 550000, 'listarEmpleadosSelect debería incluir el salario con una sesión RRHH/Admin válida');
}

function test_pinLockout_noUsaClaveAnonCompartida(ctx) {
  var clienteId = 'ZZZPRUEBAcliente' + Utilities.getUuid().replace(/-/g, '');
  var clave = _claveIntentosPin(clienteId);
  _assert(clave !== (CLAVE_PIN_ATTEMPTS + 'anon'),
    'Con un clienteId válido, el bloqueo de PIN no debería caer en el bucket "anon" compartido por todos los visitantes ' +
    '(regresión: antes, cualquier visitante sin credenciales podía bloquear el acceso de TODOS los demás fallando 5 PINs)');
}

function test_pinLockout_clientesDistintosNoComparteBloqueo(ctx) {
  var clienteA = 'ZZZPRUEBAcliA' + Utilities.getUuid().replace(/-/g, '');
  var clienteB = 'ZZZPRUEBAcliB' + Utilities.getUuid().replace(/-/g, '');
  var claveA = _claveIntentosPin(clienteA);
  var claveB = _claveIntentosPin(clienteB);
  // Si Session.getActiveUser() no devuelve email (caso normal para un visitante
  // anónimo de la webapp con login por PIN — el escenario que corrige este fix),
  // cada clienteId debe generar una clave de bloqueo distinta.
  if (claveA === (CLAVE_PIN_ATTEMPTS + 'anon') || claveB === (CLAVE_PIN_ATTEMPTS + 'anon')) {
    _assert(false, 'No debería quedar ningún clienteId sin resolver a una clave propia (cayó en el bucket "anon" compartido)');
  }
  if (claveA !== claveB) {
    // Caso esperado sin email de sesión: aislamiento por clienteId funcionando.
    try {
      for (var i = 0; i < MAX_INTENTOS_PIN; i++) _registrarIntentoFallido(clienteA);
      _assert(_intentosBloqueados(clienteA), 'El cliente A debería quedar bloqueado tras agotar sus intentos');
      _assert(!_intentosBloqueados(clienteB), 'El cliente B no debería verse afectado por los intentos fallidos del cliente A');
    } finally {
      _limpiarIntentosPin(clienteA);
      _limpiarIntentosPin(clienteB);
    }
  }
  // Si claveA === claveB, es porque Session.getActiveUser() devolvió un email real
  // en este contexto de ejecución (ambos cayeron en la misma clave por email) —
  // ese no es el escenario que este fix corrige, así que no hay nada más que probar aquí.
}

function test_calcularLiquidacion_aguinaldoProrrateadoDesdeDiciembre(ctx) {
  // El empleado de prueba tiene ~2 años de antigüedad (fecha_ingreso en _pruebasSetup).
  // Con fecha de salida el 15 de febrero, ya cobró el aguinaldo de diciembre y solo
  // lleva ~2.5 meses del nuevo período (dic-nov) — el aguinaldo debe ser una fracción
  // pequeña del salario mensual, NO un mes completo (que es lo que daba el bug: usaba
  // la antigüedad total, topada en 12 meses, sin importar cuándo cae la salida).
  var res = calcularLiquidacion(ctx.empleadoId, '2026-02-15', 'renuncia', null, null, null, null, ctx.token);
  _assertOk(res, 'calcularLiquidacion debería funcionar con una fecha de salida en febrero');
  _assert(res.aguinaldo > 0, 'Debería reconocer algún aguinaldo proporcional (empleado activo desde diciembre)');
  _assert(res.aguinaldo < 550000 * 0.5,
    'El aguinaldo por ~2.5 meses del período debería ser una fracción pequeña del salario mensual (550000), no cercano a un mes completo — recibido: ' + res.aguinaldo + ' (regresión del bug crítico: usaba antigüedad total en vez de meses desde diciembre)');
}

function test_calcularCesantiaCompleta_esAcumulativaPorAnio(ctx) {
  // Menos de 3 meses: sin derecho.
  _assertIgual(calcularCesantiaCompleta(1000, 60), 0, 'Menos de 3 meses no debería generar cesantía');
  // Tramos especiales (Ley Protección al Trabajador): 3-6m → 7 días, 6-12m → 14 días (montos fijos).
  _assertIgual(calcularCesantiaCompleta(1000, 120), 7000, '3 a 6 meses debería pagar 7 días fijos');
  _assertIgual(calcularCesantiaCompleta(1000, 240), 14000, '6 a 12 meses debería pagar 14 días fijos');
  // 5 años exactos: suma de años 1-5 = 19.5+20+20.5+21+21.24 = 102.24 días (no un único lookup).
  _assertIgual(calcularCesantiaCompleta(1000, 1800), 102240,
    'A 5 años la cesantía debería sumar los días de cada año (102.24 días), no un único valor de tabla (regresión del bug crítico)');
  // 8 años exactos: tope de la tabla, suma de los 8 años = 167.74 días.
  _assertIgual(calcularCesantiaCompleta(1000, 2880), 167740, 'A 8 años la cesantía debería alcanzar el tope de ~167.74 días');
  // 10 años: topada en 8 años — debe dar el mismo total que exactamente 8 años, no menos.
  _assertIgual(calcularCesantiaCompleta(1000, 3600), 167740,
    'A 10 años la cesantía debe seguir topada en 8 años (167.74 días), nunca menos que a los 8 años exactos');
}

function test_pagarCuotaPrestamo_yaSaldado(ctx) {
  var creado = crearPrestamo({ empleado_id: ctx.empleadoId, monto: 100000, cuotas: 1, fecha: hoy() }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el préstamo de prueba');

  var lista = listarPrestamos(ctx.empleadoId, null, ctx.token);
  var prestamo = lista[lista.length - 1];
  _assert(!!prestamo, 'Debería encontrarse el préstamo recién creado');
  ctx.prestamoId = prestamo.id;

  var primerPago = pagarCuotaPrestamo(ctx.prestamoId, ctx.token);
  _assertOk(primerPago, 'El primer pago de cuota debería completarse (préstamo de 1 sola cuota)');

  var segundoPago = pagarCuotaPrestamo(ctx.prestamoId, ctx.token);
  _assertFalla(segundoPago, 'No debería permitir pagar una cuota de un préstamo ya saldado');
}

function test_eliminarDepartamento_conEmpleados(ctx) {
  var res = eliminarDepartamento(ctx.departamentoId, ctx.token);
  _assertFalla(res, 'No debería permitir eliminar un departamento que aún tiene empleados asignados');
}

function test_crearVacaciones_saldoInsuficiente(ctx) {
  var inicio = hoy();
  var fin = Utilities.formatDate(new Date(new Date().getTime() + 300 * 24 * 60 * 60 * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var res = crearVacaciones({ empleado_id: ctx.empleadoId, fecha_inicio: inicio, fecha_fin: fin }, ctx.token);
  _assertFalla(res, 'Debería rechazar una solicitud de vacaciones que excede el saldo disponible');
}

function test_listarNomina_bloqueaSinToken(ctx) {
  var res = listarNomina(null, '');
  _assertFalla(res, 'listarNomina debería bloquear sin un token de sesión válido (expone salarios)');
}

function test_listarPrestamos_bloqueaSinToken(ctx) {
  var res = listarPrestamos(null, null, '');
  _assertFalla(res, 'listarPrestamos debería bloquear sin un token de sesión válido');
}

function test_listarLiquidaciones_bloqueaSinToken(ctx) {
  var res = listarLiquidaciones(null, null, '');
  _assertFalla(res, 'listarLiquidaciones debería bloquear sin un token de sesión válido');
}

function test_listarHistorialSalario_bloqueaSinToken(ctx) {
  var res = listarHistorialSalario(null, '');
  _assertFalla(res, 'listarHistorialSalario debería bloquear sin un token de sesión válido');
}

function test_listarBitacora_bloqueaSinToken(ctx) {
  var res = listarBitacora(50, '');
  _assertFalla(res, 'listarBitacora debería bloquear sin un token de sesión válido');
}

function test_paquetePlantillasProfesionales_esValido(ctx) {
  var paquete = _paquetePlantillasProfesionales();
  _assert(Array.isArray(paquete) && paquete.length > 0, 'El paquete de plantillas profesionales no debería estar vacío');
  var nombres = {};
  paquete.forEach(function (p) {
    _assert(!!p.nombre, 'Cada plantilla del paquete debe tener nombre');
    _assert(p.tipo === 'email' || p.tipo === 'whatsapp', 'Cada plantilla del paquete debe ser tipo email o whatsapp (' + p.nombre + ')');
    _assert(!!p.cuerpo && p.cuerpo.trim().length > 0, 'Cada plantilla del paquete debe tener cuerpo (' + p.nombre + ')');
    if (p.tipo === 'email') {
      _assert(!!p.asunto, 'Toda plantilla de email del paquete debe tener asunto (' + p.nombre + ')');
    }
    nombres[p.nombre + '|' + p.tipo] = (nombres[p.nombre + '|' + p.tipo] || 0) + 1;
  });
  Object.keys(nombres).forEach(function (clave) {
    _assertIgual(nombres[clave], 1, 'No debería haber nombre+tipo repetido en el paquete (' + clave + ')');
  });
}

function test_paquetePlantillasMinimalistas_esValido(ctx) {
  var paquete = _paquetePlantillasMinimalistas();
  _assert(Array.isArray(paquete) && paquete.length > 0, 'El paquete de plantillas minimalistas no debería estar vacío');
  var nombres = {};
  paquete.forEach(function (p) {
    _assert(!!p.nombre, 'Cada plantilla del paquete debe tener nombre');
    _assert(p.tipo === 'email' || p.tipo === 'whatsapp', 'Cada plantilla del paquete debe ser tipo email o whatsapp (' + p.nombre + ')');
    _assert(!!p.cuerpo && p.cuerpo.trim().length > 0, 'Cada plantilla del paquete debe tener cuerpo (' + p.nombre + ')');
    if (p.tipo === 'email') {
      _assert(!!p.asunto, 'Toda plantilla de email del paquete debe tener asunto (' + p.nombre + ')');
    }
    nombres[p.nombre + '|' + p.tipo] = (nombres[p.nombre + '|' + p.tipo] || 0) + 1;
  });
  Object.keys(nombres).forEach(function (clave) {
    _assertIgual(nombres[clave], 1, 'No debería haber nombre+tipo repetido en el paquete (' + clave + ')');
  });

  // No debería colisionar en nombre+tipo con el paquete "profesional" — son
  // dos paquetes alternativos, deben poder coexistir sin pisarse.
  var otroPaquete = _paquetePlantillasProfesionales();
  var clavesOtro = {};
  otroPaquete.forEach(function (p) { clavesOtro[p.nombre + '|' + p.tipo] = true; });
  paquete.forEach(function (p) {
    _assert(!clavesOtro[p.nombre + '|' + p.tipo],
      'La plantilla minimalista "' + p.nombre + '" (' + p.tipo + ') colisiona en nombre+tipo con el paquete profesional');
  });
}

function test_enviarOutlook_validaCamposRequeridos(ctx) {
  // Ninguna de estas llamadas debería llegar a hacer un UrlFetchApp.fetch
  // real: deben fallar en la validación de campos antes de eso.
  var casos = [
    { cfg: {}, esperado: 'Tenant ID' },
    { cfg: { tenantId: 't' }, esperado: 'Client ID' },
    { cfg: { tenantId: 't', clientId: 'c' }, esperado: 'Client Secret' },
    { cfg: { tenantId: 't', clientId: 'c', clientSecret: 's' }, esperado: 'remitente' }
  ];
  casos.forEach(function (caso) {
    var lanzo = false;
    try {
      _enviarOutlook(['destino@ejemplo.com'], 'Asunto', '<p>Cuerpo</p>', caso.cfg);
    } catch (e) {
      lanzo = true;
      _assert(e.message.toLowerCase().indexOf(caso.esperado.toLowerCase()) !== -1,
        'El mensaje de error debería mencionar "' + caso.esperado + '" — recibido: ' + e.message);
    }
    _assert(lanzo, 'Debería lanzar una excepción cuando falta un campo requerido (config: ' + JSON.stringify(caso.cfg) + ')');
  });
}

function test_reenviarComunicacion_soloPermiteRegistrosFallidos(ctx) {
  var resInexistente = reenviarComunicacion(PRUEBA_PREFIJO + 'ID-QUE-NO-EXISTE', ctx.token);
  _assertFalla(resInexistente, 'Debería fallar si el registro de comunicación no existe');

  var hoja = getHoja(HOJAS.COMUNICACIONES);
  var idExitosa = generarId('COM');
  hoja.appendRow(sanitizarFilaSheets([
    idExitosa, new Date(), 'email', ctx.empleadoId, PRUEBA_PREFIJO + 'destino@ejemplo.com',
    'Asunto de prueba', 'Cuerpo de prueba', 'enviado', '', 'admin'
  ]));
  try {
    var res = reenviarComunicacion(idExitosa, ctx.token);
    _assertFalla(res, 'No debería permitir reenviar una comunicación que ya se envió correctamente (regresión: solo debe reintentar las que fallaron)');
  } finally {
    eliminarFila(HOJAS.COMUNICACIONES, idExitosa, 'Comunicacion');
  }
}

function test_normalizarTelefonoWhatsApp_anteponeCodigoPaisCR(ctx) {
  _assertIgual(_normalizarTelefonoWhatsApp('85979267'), '+50685979267',
    'Un número nacional de 8 dígitos sin código de país debería recibir +506 automáticamente ' +
    '(regresión: antes se enviaba como "+85979267", un país inválido, y CallMeBot lo rechazaba)');
  _assertIgual(_normalizarTelefonoWhatsApp('+50685979267'), '+50685979267',
    'Un número que ya trae código de país no debería alterarse');
  _assertIgual(_normalizarTelefonoWhatsApp('+1 555-123-4567'), '+15551234567',
    'Un número internacional con otro código de país no debería tratarse como nacional de CR');
  _assertIgual(_normalizarTelefonoWhatsApp(''), '', 'Un valor vacío debería devolver string vacío');
}

function test_whatsappCredencialesListas_porProveedor(ctx) {
  _assert(!_whatsappCredencialesListas(null), 'Sin config debería ser false');
  _assert(!_whatsappCredencialesListas({ proveedor: 'callmebot' }), 'CallMeBot sin apikey debería ser false');
  _assert(_whatsappCredencialesListas({ proveedor: 'callmebot', apikey: '123456' }), 'CallMeBot con apikey debería ser true');
  _assert(!_whatsappCredencialesListas({ proveedor: 'servidor_propio', apikey: '123456' }),
    'Servidor propio con solo apikey (sin URL/secreto) debería ser false — son credenciales distintas');
  _assert(!_whatsappCredencialesListas({ proveedor: 'servidor_propio', servidorUrl: 'https://x.com' }),
    'Servidor propio sin secreto debería ser false');
  _assert(_whatsappCredencialesListas({ proveedor: 'servidor_propio', servidorUrl: 'https://x.com', servidorSecreto: 'shh' }),
    'Servidor propio con URL y secreto debería ser true');
}

function test_enviarWhatsAppServidorPropio_validaCamposRequeridos(ctx) {
  var res1 = _enviarWhatsAppServidorPropio('+50688887777', 'hola', {});
  _assertFalla(res1, 'Debería fallar sin servidorUrl ni servidorSecreto');
  _assert(res1.mensaje.toLowerCase().indexOf('url') !== -1 || res1.mensaje.toLowerCase().indexOf('secreto') !== -1,
    'El mensaje debería mencionar qué falta (URL o secreto) — recibido: ' + res1.mensaje);

  var res2 = _enviarWhatsAppServidorPropio('+50688887777', 'hola', { servidorUrl: 'https://x.com' });
  _assertFalla(res2, 'Debería fallar con URL pero sin secreto');
}

function test_obtenerReportes_estructuraCompleta(ctx) {
  var r = obtenerReportes('', '', '', ctx.token);
  _assert(r && r.ok !== false, 'obtenerReportes no debería fallar con una sesión válida');

  ['empleadosPorDepartamento', 'empleadosPorEstado', 'nominaPorMes', 'horasPorEmpleado',
   'vacacionesPorEstado', 'nominaPorDepartamento', 'horasExtraPorMes', 'incapacidadesPorMes']
    .forEach(function (clave) {
      _assert(Array.isArray(r[clave]), 'La serie "' + clave + '" debería ser un arreglo');
    });

  _assert(r.rotacionPorMes && Array.isArray(r.rotacionPorMes.meses) &&
    Array.isArray(r.rotacionPorMes.altas) && Array.isArray(r.rotacionPorMes.bajas),
    'rotacionPorMes debería tener meses/altas/bajas como arreglos');
  _assertIgual(r.rotacionPorMes.altas.length, r.rotacionPorMes.meses.length,
    'altas debería tener un valor por cada mes');
  _assertIgual(r.rotacionPorMes.bajas.length, r.rotacionPorMes.meses.length,
    'bajas debería tener un valor por cada mes');

  _assert(r.kpis, 'Debería incluir el bloque de KPIs');
  ['activos', 'netoPeriodo', 'horasExtraHoras', 'horasExtraMonto', 'diasIncapacidad', 'vacacionesPendientes']
    .forEach(function (clave) {
      _assert(typeof r.kpis[clave] === 'number' && !isNaN(r.kpis[clave]),
        'El KPI "' + clave + '" debería ser un número (recibido: ' + r.kpis[clave] + ')');
    });

  // El empleado de prueba del setup está activo — el snapshot debe reflejarlo.
  _assert(r.kpis.activos >= 1, 'Con el empleado de prueba creado, activos debería ser >= 1');

  var sinSesion = obtenerReportes('', '', '', '');
  _assert(sinSesion && sinSesion.ok === false, 'obtenerReportes debería bloquear sin sesión válida');
}

function test_liquidacion_guardaSalariosMensuales(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var salariosOriginales = JSON.stringify({ Diciembre: 550000, Enero: 550000, Febrero: 550000 });

  var res = crearLiquidacion({
    empleado_id: ctx.empleadoId,
    fecha_salida: fechaSalida,
    motivo: 'renuncia',
    monto: 100000,
    salariosMensuales: salariosOriginales
  }, ctx.token);
  _assertOk(res, 'crearLiquidacion debería aceptar salariosMensuales');

  try {
    var lista1 = listarLiquidaciones(ctx.empleadoId, null, ctx.token);
    var creada = lista1.filter(function (l) { return String(l.id) === String(res.id); })[0];
    _assert(!!creada, 'La liquidación recién creada debería aparecer en listarLiquidaciones');
    _assertIgual(creada.salariosMensuales, salariosOriginales,
      'salariosMensuales debería guardarse tal como se envió al crear');

    // actualizarLiquidacion SIN mandar salariosMensuales debería conservar el valor guardado
    // (regresión: "Guardar cambios sin recalcular" no debe borrar los salarios ya guardados).
    var resUpd = actualizarLiquidacion({
      id: res.id,
      empleado_id: ctx.empleadoId,
      fecha_salida: fechaSalida,
      motivo: 'renuncia',
      monto: 100000,
      estado: 'pagada'
    }, ctx.token);
    _assertOk(resUpd, 'actualizarLiquidacion debería aceptar la actualización sin salariosMensuales');

    var lista2 = listarLiquidaciones(ctx.empleadoId, null, ctx.token);
    var actualizada = lista2.filter(function (l) { return String(l.id) === String(res.id); })[0];
    _assertIgual(actualizada.salariosMensuales, salariosOriginales,
      'salariosMensuales debería conservarse si actualizarLiquidacion no lo manda explícitamente');
    _assertIgual(actualizada.estado, 'pagada', 'El resto de los campos sí debería actualizarse normalmente');
  } finally {
    eliminarFila(HOJAS.LIQUIDACIONES, res.id, 'Liquidacion');
  }
}

function test_asegurarEncabezadosLiquidaciones_posicionCorrecta(ctx) {
  _asegurarEncabezadosLiquidaciones();
  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var esperados = ENCABEZADOS.Liquidaciones;
  var actuales = hoja.getRange(1, 1, 1, esperados.length).getValues()[0];
  esperados.forEach(function (nombre, i) {
    _assertIgual(String(actuales[i]), nombre,
      'La columna ' + (i + 1) + ' de Liquidaciones debería tener el encabezado "' + nombre +
      '" (regresión: un encabezado faltante hace que leerTabla ignore esa columna aunque tenga datos)');
  });
}

function test_cambiarEstadoEmpleado_historialYFechaIngreso(ctx) {
  // Empleado propio (NO ctx.empleadoId): reactivar cambia fecha_ingreso a
  // hoy, y otras pruebas de esta suite dependen de que el empleado del
  // setup mantenga su antigüedad de ~2 años sin tocar.
  var fechaViejaIngreso = '2020-01-15';
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'Reactivacion',
    cedula: '000000099',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba',
    fecha_ingreso: fechaViejaIngreso,
    salario: 500000
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado de prueba para reactivación');
  var empId = creado.id;

  try {
    var baja = cambiarEstadoEmpleado(empId, 'inactivo', ctx.token);
    _assertOk(baja, 'Debería poder dar de baja al empleado de prueba');

    var empTrasBaja = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(empTrasBaja.fecha_salida, hoy(),
      'Al dar de baja, fecha_salida debería actualizarse a la fecha de hoy');

    var reactivacion = cambiarEstadoEmpleado(empId, 'activo', ctx.token);
    _assertOk(reactivacion, 'Debería poder reactivar al empleado de prueba');

    var empActualizado = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(empActualizado.fecha_ingreso, hoy(),
      'Al reactivar, fecha_ingreso debería actualizarse a la fecha de hoy (regresión: antes quedaba con la fecha de ingreso original)');
    _assertIgual(empActualizado.fecha_salida, '',
      'Al reactivar, fecha_salida debería limpiarse (ya no aplica estando activo)');

    var historial = listarHistorialEstados(empId, ctx.token);
    _assertIgual(historial.length, 2, 'Debería haber 2 entradas en el historial (baja + reactivación)');

    var entradaBaja = historial.filter(function (h) { return h.estado_nuevo === 'inactivo'; })[0];
    _assert(!!entradaBaja, 'Debería existir una entrada de baja en el historial');
    _assertIgual(entradaBaja.estado_anterior, 'activo', 'La baja debería registrar el estado anterior "activo"');
    _assertIgual(entradaBaja.fecha_salida_nueva, hoy(), 'El historial de la baja debería registrar la fecha de salida');

    var entradaReactivacion = historial.filter(function (h) { return h.estado_nuevo === 'activo'; })[0];
    _assert(!!entradaReactivacion, 'Debería existir una entrada de reactivación en el historial');
    _assertIgual(entradaReactivacion.fecha_ingreso_anterior, fechaViejaIngreso,
      'El historial debería conservar la fecha de ingreso original de antes de la reactivación');
    _assertIgual(entradaReactivacion.fecha_ingreso_nueva, hoy(),
      'El historial debería registrar la nueva fecha de ingreso');
    _assertIgual(entradaReactivacion.fecha_salida_anterior, hoy(),
      'El historial de la reactivación debería conservar la fecha de salida que tenía antes de limpiarse');

    // Editar fecha_salida a mano (fuera de cambiarEstadoEmpleado) también debería persistir.
    var fechaSalidaManual = '2026-03-10';
    var edicion = actualizarEmpleado({
      id: empId, nombre: PRUEBA_PREFIJO + 'Reactivacion', cedula: '000000099',
      departamento: ctx.departamentoNombre, puesto: 'Puesto de prueba',
      fecha_ingreso: hoy(), salario: 500000, fecha_salida: fechaSalidaManual
    }, ctx.token);
    _assertOk(edicion, 'Debería poder editar fecha_salida manualmente');
    var empEditado = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(empEditado.fecha_salida, fechaSalidaManual,
      'fecha_salida debería poder editarse manualmente desde el formulario de empleado');
  } finally {
    listarHistorialEstados(empId, ctx.token).forEach(function (h) {
      eliminarFila(HOJAS.HISTORIAL_ESTADOS, h.id, 'HistorialEstado');
    });
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_obtenerPuestosCriticos_filtraCargoCriticoActivo(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'PuestoCritico',
    cedula: '000000098',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba crítico',
    fecha_ingreso: '2022-01-15',
    salario: 500000,
    cargo_critico: 'SI'
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado crítico de prueba');
  var empId = creado.id;

  try {
    var res = obtenerPuestosCriticos(ctx.token);
    _assertOk(res, 'obtenerPuestosCriticos no debería fallar con una sesión válida');
    _assert(Array.isArray(res.empleados), 'empleados debería ser un arreglo');
    _assert(Array.isArray(res.porDepartamento), 'porDepartamento debería ser un arreglo');
    _assertIgual(typeof res.total, 'number', 'total debería ser numérico');
    _assertIgual(res.total, res.empleados.length, 'total debería coincidir con la cantidad de empleados devueltos');

    var encontrado = res.empleados.filter(function (e) { return e.id === empId; })[0];
    _assert(!!encontrado, 'El empleado marcado como cargo_critico=SI y activo debería aparecer en el listado');
    _assertIgual(encontrado.departamento, ctx.departamentoNombre, 'Debería incluir el departamento del empleado');

    // Desmarcarlo como crítico debe sacarlo de la lista.
    var edicion = actualizarEmpleado({
      id: empId, nombre: PRUEBA_PREFIJO + 'PuestoCritico', cedula: '000000098',
      departamento: ctx.departamentoNombre, puesto: 'Puesto de prueba crítico',
      fecha_ingreso: '2022-01-15', salario: 500000, cargo_critico: ''
    }, ctx.token);
    _assertOk(edicion, 'Debería poder quitar la marca de cargo_critico');
    var resTrasEditar = obtenerPuestosCriticos(ctx.token);
    _assert(!resTrasEditar.empleados.some(function (e) { return e.id === empId; }),
      'Al quitar cargo_critico, el empleado ya no debería aparecer en puestos críticos');

    var sinSesion = obtenerPuestosCriticos('');
    _assert(sinSesion && sinSesion.ok === false, 'obtenerPuestosCriticos debería bloquear sin sesión válida');
  } finally {
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_obtenerPuestosCriticos_incluyeAlertasFiltradas(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'PuestoCriticoAlerta',
    cedula: '000000095',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba crítico',
    fecha_ingreso: '2022-01-15',
    salario: 500000,
    cargo_critico: 'SI',
    vencimiento_cedula: '2020-01-01'
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado crítico de prueba');
  var empId = creado.id;

  try {
    var res = obtenerPuestosCriticos(ctx.token);
    _assertOk(res, 'obtenerPuestosCriticos no debería fallar con una sesión válida');
    _assert(Array.isArray(res.alertas), 'alertas debería ser un arreglo');

    var alertaCedula = res.alertas.filter(function (a) {
      return a.empleado_id === empId && a.tipo === 'cedula_vencida';
    })[0];
    _assert(!!alertaCedula, 'Debería incluir la alerta de cédula vencida del empleado crítico');

    // Las alertas de empleados que NO son críticos no deberían colarse aquí.
    _assert(res.alertas.every(function (a) {
      return res.empleados.some(function (e) { return e.id === a.empleado_id; });
    }), 'Todas las alertas devueltas deberían pertenecer a empleados de la lista de puestos críticos');
  } finally {
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_obtenerPuestosCriticos_alertaChecklistCumplimiento(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'PuestoCriticoChecklist',
    cedula: '000000094',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba crítico',
    fecha_ingreso: '2022-01-15',
    salario: 500000,
    cargo_critico: 'SI',
    datos_personal: '2025-01-10',
    antecedentes_personal: '2025-01-10',
    archivo_fotografico: '2025-01-10',
    prueba_doping: '2025-01-10',
    prueba_confiabilidad: '2025-01-10'
    // prueba_alcoholimetro queda sin fecha a propósito.
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado crítico de prueba');
  var empId = creado.id;

  try {
    var res = obtenerPuestosCriticos(ctx.token);
    _assertOk(res, 'obtenerPuestosCriticos no debería fallar con una sesión válida');

    var encontrado = res.empleados.filter(function (e) { return e.id === empId; })[0];
    _assert(!!encontrado, 'El empleado crítico debería aparecer en el listado');
    _assertIgual(encontrado.datos_personal, '2025-01-10', 'Debería conservar la fecha de datos_personal');
    _assertIgual(encontrado.prueba_alcoholimetro, '', 'prueba_alcoholimetro debería quedar vacía');

    var alertaFaltante = res.alertas.filter(function (a) {
      return a.empleado_id === empId && a.tipo === 'cumplimiento_prueba_alcoholimetro';
    })[0];
    _assert(!!alertaFaltante, 'Debería alertar el ítem de cumplimiento sin fecha (prueba de alcoholímetro)');

    ['cumplimiento_datos_personal', 'cumplimiento_antecedentes_personal', 'cumplimiento_archivo_fotografico',
     'cumplimiento_prueba_doping', 'cumplimiento_prueba_confiabilidad'].forEach(function (tipo) {
      _assert(!res.alertas.some(function (a) { return a.empleado_id === empId && a.tipo === tipo; }),
        'No debería alertar "' + tipo + '" porque ya tiene fecha registrada');
    });

    var dash = obtenerDashboard(ctx.token);
    _assertIgual(typeof dash.totalPuestosCriticos, 'number', 'obtenerDashboard debería incluir totalPuestosCriticos');
    _assert(dash.totalPuestosCriticos >= 1, 'totalPuestosCriticos debería contar al menos el empleado de prueba');
    _assert(Array.isArray(dash.alertasPuestosCriticos), 'obtenerDashboard debería incluir alertasPuestosCriticos como arreglo');
    _assert(dash.alertasPuestosCriticos.some(function (a) { return a.empleado_id === empId; }),
      'El dashboard debería incluir las alertas del puesto crítico de prueba');
  } finally {
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_listarEmpleados_formateaFechasCumplimientoCritico(ctx) {
  // Regresión: listarEmpleados devolvía estos campos como objeto Date crudo
  // (Sheets convierte automáticamente los strings 'yyyy-mm-dd' guardados),
  // lo que hacía que <input type="date"> los mostrara vacíos al reabrir el
  // formulario — parecía que "no guardaba" aunque el dato sí estaba en la hoja.
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'FechaCumplimiento',
    cedula: '000000093',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba crítico',
    fecha_ingreso: '2022-01-15',
    salario: 500000,
    cargo_critico: 'SI',
    datos_personal: '2025-01-10'
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado de prueba');
  var empId = creado.id;

  try {
    var lista = listarEmpleados('', ctx.token);
    var encontrado = lista.filter(function (e) { return e.id === empId; })[0];
    _assert(!!encontrado, 'El empleado de prueba debería aparecer en listarEmpleados');
    _assertIgual(encontrado.datos_personal, '2025-01-10',
      'listarEmpleados debería devolver datos_personal formateado como yyyy-mm-dd, no un objeto Date crudo');
    _assertIgual(encontrado.antecedentes_personal, '', 'Un campo de cumplimiento sin fecha debería quedar como texto vacío');
  } finally {
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_listarEmpleados_filtroEstadoInactivo(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'Inactivo',
    cedula: '000000097',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba',
    fecha_ingreso: '2021-06-01',
    salario: 500000
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado inactivo de prueba');
  var empId = creado.id;

  try {
    var baja = cambiarEstadoEmpleado(empId, 'inactivo', ctx.token);
    _assertOk(baja, 'Debería poder dar de baja al empleado de prueba');

    var soloActivos = listarEmpleados('activo', ctx.token);
    _assert(!soloActivos.some(function (e) { return e.id === empId; }),
      'listarEmpleados("activo") no debería incluir al empleado dado de baja');
    _assert(soloActivos.some(function (e) { return e.id === ctx.empleadoId; }),
      'listarEmpleados("activo") debería incluir al empleado activo del setup');

    var soloInactivos = listarEmpleados('inactivo', ctx.token);
    _assert(soloInactivos.some(function (e) { return e.id === empId; }),
      'listarEmpleados("inactivo") debería incluir al empleado dado de baja');
    _assert(!soloInactivos.some(function (e) { return e.id === ctx.empleadoId; }),
      'listarEmpleados("inactivo") no debería incluir al empleado activo del setup');

    var todos = listarEmpleados('', ctx.token);
    _assert(todos.some(function (e) { return e.id === empId; }) && todos.some(function (e) { return e.id === ctx.empleadoId; }),
      'listarEmpleados("") debería incluir tanto activos como inactivos');
  } finally {
    listarHistorialEstados(empId, ctx.token).forEach(function (h) {
      eliminarFila(HOJAS.HISTORIAL_ESTADOS, h.id, 'HistorialEstado');
    });
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_overrideWhatsAppEmpleado_usaApikeyPropiaSiExiste(ctx) {
  var sinKey = _overrideWhatsAppEmpleado('+50688887777', { id: 'EMP-X', nombre: 'Prueba' });
  _assertIgual(sinKey.telefono, '+50688887777', 'Debería incluir el teléfono destino');
  _assert(!('apikey' in sinKey), 'Sin API Key propia no debería incluir apikey (para caer al global)');

  var conKey = _overrideWhatsAppEmpleado('+50688887777', { id: 'EMP-X', nombre: 'Prueba', callmebot_apikey: '123456' });
  _assertIgual(conKey.apikey, '123456', 'Con API Key propia debería incluirla en el override');

  var sinEmp = _overrideWhatsAppEmpleado('+50688887777', null);
  _assertIgual(sinEmp.telefono, '+50688887777', 'Sin empleado (ej. registro histórico) no debería fallar');
  _assert(!('apikey' in sinEmp), 'Sin empleado no debería incluir apikey');
}

function test_crearEmpleado_guardaApikeyCallMeBotPropia(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'ApikeyPropia',
    cedula: '000000090',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba',
    fecha_ingreso: '2022-01-15',
    salario: 550000,
    callmebot_apikey: '987654'
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado de prueba');
  var empId = creado.id;

  try {
    var lista = listarEmpleados('', ctx.token);
    var encontrado = lista.filter(function (e) { return e.id === empId; })[0];
    _assert(!!encontrado, 'El empleado de prueba debería aparecer en listarEmpleados');
    _assertIgual(encontrado.callmebot_apikey, '987654', 'Debería guardar y devolver la API Key de CallMeBot propia del empleado');
  } finally {
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_obtenerExpediente_incluyeTodosLosDatos(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'ExpedienteCompleto',
    cedula: '000000091',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba crítico',
    fecha_ingreso: '2022-01-15',
    salario: 550000,
    cargo_critico: 'SI',
    vencimiento_cedula: '2020-01-01'
    // Ningún ítem del checklist de cumplimiento tiene fecha: deben salir como alertas.
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado de prueba');
  var empId = creado.id;
  var incapacidadId = null;
  var liquidacionId = null;

  try {
    var incap = crearIncapacidad({
      empleado_id: empId, fecha_desde: '2026-01-10', fecha_hasta: '2026-01-12', entidad: 'CCSS'
    }, ctx.token);
    _assertOk(incap, 'No se pudo preparar la incapacidad de prueba');
    incapacidadId = incap.id;

    var liq = crearLiquidacion({
      empleado_id: empId, fecha_salida: hoy(), motivo: 'renuncia', calcular_automatico: true
    }, ctx.token);
    _assertOk(liq, 'No se pudo preparar la liquidación de prueba');
    liquidacionId = liq.id;

    var exp = obtenerExpediente(empId, ctx.token);
    _assertOk(exp, 'obtenerExpediente no debería fallar con una sesión válida');

    ['alertas', 'liquidaciones', 'incapacidades', 'permisos', 'comunicaciones', 'turnos', 'nomina', 'horasExtra']
      .forEach(function (clave) {
        _assert(Array.isArray(exp[clave]), 'El expediente debería incluir "' + clave + '" como arreglo');
      });

    _assert(exp.alertas.some(function (a) { return a.tipo === 'cedula_vencida'; }),
      'Debería incluir la alerta de cédula vencida en el expediente');
    _assert(exp.alertas.some(function (a) { return a.tipo === 'cumplimiento_prueba_alcoholimetro'; }),
      'Debería incluir alertas de cumplimiento de puesto crítico en el expediente');

    _assert(exp.incapacidades.some(function (i) { return i.id === incapacidadId; }),
      'Debería incluir la incapacidad recién creada');
    _assert(exp.liquidaciones.some(function (l) { return l.id === liquidacionId; }),
      'Debería incluir la liquidación recién creada');

    var sinSesion = obtenerExpediente(empId, '');
    _assert(sinSesion && sinSesion.ok === false, 'obtenerExpediente debería bloquear sin sesión válida');
  } finally {
    if (incapacidadId) eliminarFila(HOJAS.INCAPACIDADES, incapacidadId, 'Incapacidad');
    if (liquidacionId) eliminarFila(HOJAS.LIQUIDACIONES, liquidacionId, 'Liquidacion');
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_actualizarEmpleado_fechaSalidaInactivaAutomaticamente(ctx) {
  var creado = crearEmpleado({
    nombre: PRUEBA_PREFIJO + 'FechaSalidaAuto',
    cedula: '000000096',
    departamento: ctx.departamentoNombre,
    puesto: 'Puesto de prueba',
    fecha_ingreso: '2023-02-01',
    salario: 500000
  }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el empleado de prueba');
  var empId = creado.id;

  try {
    var previo = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(previo.estado, 'activo', 'El empleado de prueba debería iniciar activo');

    var fechaSalida = '2026-05-15';
    var edicion = actualizarEmpleado({
      id: empId, nombre: PRUEBA_PREFIJO + 'FechaSalidaAuto', cedula: '000000096',
      departamento: ctx.departamentoNombre, puesto: 'Puesto de prueba',
      fecha_ingreso: '2023-02-01', salario: 500000, fecha_salida: fechaSalida
    }, ctx.token);
    _assertOk(edicion, 'Debería poder editar la fecha de salida');
    _assert(edicion.mensaje.indexOf('inactivo') !== -1,
      'El mensaje debería indicar que el empleado quedó inactivo');

    var actualizado = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(actualizado.estado, 'inactivo',
      'Agregar una fecha de salida a un empleado activo debería marcarlo inactivo automáticamente');
    _assertIgual(actualizado.fecha_salida, fechaSalida, 'Debería conservar la fecha de salida ingresada');

    var historial = listarHistorialEstados(empId, ctx.token);
    _assertIgual(historial.length, 1, 'Debería registrar una entrada en el historial de estados');
    _assertIgual(historial[0].estado_anterior, 'activo', 'El historial debería registrar el estado anterior');
    _assertIgual(historial[0].estado_nuevo, 'inactivo', 'El historial debería registrar el nuevo estado');
    _assertIgual(historial[0].fecha_salida_nueva, fechaSalida, 'El historial debería registrar la fecha de salida ingresada');

    // Editar de nuevo sin tocar fecha_salida no debería reactivarlo ni duplicar el historial.
    var segundaEdicion = actualizarEmpleado({
      id: empId, nombre: PRUEBA_PREFIJO + 'FechaSalidaAuto', cedula: '000000096',
      departamento: ctx.departamentoNombre, puesto: 'Puesto reasignado', fecha_ingreso: '2023-02-01',
      salario: 500000, fecha_salida: fechaSalida
    }, ctx.token);
    _assertOk(segundaEdicion, 'Debería poder volver a editar sin problemas');
    var trasSegundaEdicion = obtenerEmpleadoCompleto(empId, ctx.token);
    _assertIgual(trasSegundaEdicion.estado, 'inactivo', 'Debería seguir inactivo (ya no estaba activo)');
    _assertIgual(listarHistorialEstados(empId, ctx.token).length, 1,
      'No debería agregar una nueva entrada de historial si el empleado ya estaba inactivo');
  } finally {
    listarHistorialEstados(empId, ctx.token).forEach(function (h) {
      eliminarFila(HOJAS.HISTORIAL_ESTADOS, h.id, 'HistorialEstado');
    });
    eliminarFila(HOJAS.EMPLEADOS, empId, 'Empleado');
  }
}

function test_enviarComunicacionAmbos_exigeAlMenosUnMedio(ctx) {
  var res = enviarComunicacionAmbos({ empleado_id: ctx.empleadoId, email: false, whatsapp: false }, ctx.token);
  _assertFalla(res, 'enviarComunicacionAmbos debería exigir al menos un medio (correo o WhatsApp)');
}

function test_hashPin_esDeterminista(ctx) {
  var h1 = hashPin('1234');
  var h2 = hashPin('1234');
  _assertIgual(h1, h2, 'El mismo PIN debería producir siempre el mismo hash (mismo salt de script)');
  _assert(hashPin('9999') !== h1, 'PINs distintos deberían producir hashes distintos');
  _assert(!!h1 && h1.length > 0, 'hashPin no debería devolver un valor vacío');
}

function test_pinCoincide_comparaHashes(ctx) {
  var hashAlmacenado = hashPin('4321');
  _assert(_pinCoincide('4321', hashAlmacenado), 'Debería coincidir cuando el PIN corresponde al hash almacenado');
  _assert(!_pinCoincide('0000', hashAlmacenado), 'No debería coincidir con un PIN distinto');
  _assert(!_pinCoincide('4321', ''), 'Sin nada almacenado, nunca debería coincidir (evita comparar contra vacío)');
}

function test_escaparHtmlEmail(ctx) {
  var resultado = escaparHtmlEmail('<img src=x onerror="robar()"> & "comillas"');
  _assert(resultado.indexOf('<img') === -1, 'No debería quedar una etiqueta <img> sin escapar');
  _assert(resultado.indexOf('&lt;img') !== -1, 'El "<" debería escaparse a &lt;');
  _assert(resultado.indexOf('&amp;') !== -1, 'El "&" debería escaparse a &amp;');
  _assert(resultado.indexOf('&quot;') !== -1, 'Las comillas dobles deberían escaparse a &quot;');
  _assertIgual(escaparHtmlEmail(null), '', 'null debería devolver string vacío, no "null"');
}

function test_sanitizarCeldaSheets(ctx) {
  _assertIgual(sanitizarCeldaSheets('=IMPORTXML("http://x")'), "'=IMPORTXML(\"http://x\")",
    'Un valor que empieza con "=" debería prefijarse con apóstrofe para no ejecutarse como fórmula');
  _assertIgual(sanitizarCeldaSheets('+1234'), "'+1234", 'Un valor que empieza con "+" también debe neutralizarse');
  _assertIgual(sanitizarCeldaSheets('@SUM(1,2)'), "'@SUM(1,2)", 'Un valor que empieza con "@" también debe neutralizarse');
  _assertIgual(sanitizarCeldaSheets('Juan Pérez'), 'Juan Pérez', 'Un texto normal no debería alterarse');
  _assertIgual(sanitizarCeldaSheets(123), 123, 'Un número no debería convertirse a string ni alterarse');
  _assertIgual(sanitizarCeldaSheets(null), '', 'null debería normalizarse a string vacío');
}

function test_sanitizarFilaSheets(ctx) {
  var fila = sanitizarFilaSheets(['id1', '=HACKED()', 'texto normal', 42]);
  _assertIgual(fila[0], 'id1', 'El primer valor no debería alterarse');
  _assertIgual(fila[1], "'=HACKED()", 'El valor con fórmula debería neutralizarse');
  _assertIgual(fila[2], 'texto normal', 'El texto normal no debería alterarse');
  _assertIgual(fila[3], 42, 'El número no debería alterarse');
}

function test_estadoNormalizado(ctx) {
  _assertIgual(estadoNormalizado('  Aprobada  '), 'aprobada', 'Debería recortar espacios y pasar a minúsculas');
  _assertIgual(estadoNormalizado(null), '', 'null debería normalizarse a string vacío');
  _assertIgual(estadoNormalizado(undefined), '', 'undefined debería normalizarse a string vacío');
}

function test_mesDeFecha(ctx) {
  _assertIgual(mesDeFecha(new Date(2026, 2, 15)), '2026-03', 'Debería extraer yyyy-MM de un objeto Date');
  _assertIgual(mesDeFecha('2026-07-01'), '2026-07', 'Debería extraer yyyy-MM de un string ISO');
  _assertIgual(mesDeFecha(''), '', 'Un valor vacío debería devolver string vacío en vez de fallar');
}

function test_crearLiquidacion_montoCoincideConCalculo(ctx) {
  var fechaSalida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var calculo = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'despido_con_resp', null, null, null, null, ctx.token);
  _assertOk(calculo, 'calcularLiquidacion debería completarse para preparar el valor esperado');

  var res = crearLiquidacion({
    empleado_id: ctx.empleadoId,
    fecha_salida: fechaSalida,
    motivo: 'despido_con_resp',
    calcular_automatico: true
  }, ctx.token);
  _assertOk(res, 'crearLiquidacion debería guardar correctamente con cálculo automático');

  // No usa ctx.liquidacionId (ya lo ocupa test_crearLiquidacion_flujoCompleto) para
  // no pisarlo y dejar esa otra liquidación de prueba huérfana — se limpia aquí mismo.
  try {
    var guardadas = listarLiquidaciones(ctx.empleadoId, null, ctx.token);
    var guardada = guardadas.filter(function (l) { return String(l.id) === String(res.id); })[0];
    _assert(!!guardada, 'La liquidación recién creada debería aparecer en listarLiquidaciones');
    _assertIgual(Number(guardada.monto), Number(calculo.totalCalculado),
      'El monto guardado debería coincidir exactamente con lo que calculó calcularLiquidacion ' +
      '(regresión: antes solo se verificaba ok:true y !!id, sin comprobar el monto real)');
  } finally {
    eliminarFila(HOJAS.LIQUIDACIONES, res.id, 'Liquidacion');
  }
}
