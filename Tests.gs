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
  { nombre: 'enviarComunicacionAmbos exige al menos un medio',                fn: test_enviarComunicacionAmbos_exigeAlMenosUnMedio }
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
  var alertas = obtenerAlertas();
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
  var propio = lista.filter(function (e) { return String(e.id) === String(ctx.empleadoId); })[0];
  _assert(!!propio, 'listarEmpleadosSelect debería seguir listando id/nombre sin sesión (necesario para poblar selects antes del login)');
  _assert(!('salario' in propio), 'listarEmpleadosSelect no debería incluir el salario sin un token de sesión RRHH/Admin válido');
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

function test_enviarComunicacionAmbos_exigeAlMenosUnMedio(ctx) {
  var res = enviarComunicacionAmbos({ empleado_id: ctx.empleadoId, email: false, whatsapp: false }, ctx.token);
  _assertFalla(res, 'enviarComunicacionAmbos debería exigir al menos un medio (correo o WhatsApp)');
}
