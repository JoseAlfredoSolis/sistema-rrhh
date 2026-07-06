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
  { nombre: 'crearLiquidacion guarda el monto calculado automáticamente',       fn: test_crearLiquidacion_flujoCompleto },
  { nombre: 'obtenerAlertas nunca produce fechas inválidas (regresión Date/Sheets)', fn: test_obtenerAlertas_noFalla },
  { nombre: '_reemplazarVariablesPlantilla sustituye las variables del empleado', fn: test_reemplazarVariablesPlantilla },
  { nombre: 'guardarPlantilla rechaza un tipo inválido',                        fn: test_guardarPlantilla_tipoInvalido },
  { nombre: 'guardarPlantilla guarda y listarPlantillas la refleja',            fn: test_guardarPlantilla_flujoValido },
  { nombre: 'registrarErrorSistema nunca lanza excepción',                      fn: test_registrarErrorSistema_bestEffort },
  { nombre: 'listarComunicaciones bloquea sin sesión válida',                   fn: test_listarComunicaciones_bloqueaSinToken },
  { nombre: 'listarDocumentos bloquea sin sesión válida',                       fn: test_listarDocumentos_bloqueaSinToken },
  { nombre: 'listarErrores exige rol Admin (rrhh no alcanza)',                  fn: test_listarErrores_soloAdmin },
  { nombre: 'pagarCuotaPrestamo bloquea un préstamo ya saldado (regresión)',    fn: test_pagarCuotaPrestamo_yaSaldado },
  { nombre: 'eliminarDepartamento respeta la integridad referencial',           fn: test_eliminarDepartamento_conEmpleados },
  { nombre: 'crearVacaciones rechaza una solicitud que excede el saldo disponible', fn: test_crearVacaciones_saldoInsuficiente }
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
  var res = calcularLiquidacion(ctx.empleadoId, fechaSalida, 'renuncia');
  _assertOk(res, 'calcularLiquidacion no debería fallar usando la fecha_ingreso tal como la devuelve la hoja');
  _assert(!isNaN(res.totalCalculado), 'totalCalculado no debería ser NaN (regresión: Date de Sheets + concatenación de string)');
  _assert(res.totalCalculado > 0, 'Con casi 2 años de antigüedad el total calculado debería ser mayor a 0');
}

function test_calcularLiquidacion_fechaInvalida(ctx) {
  var res = calcularLiquidacion(ctx.empleadoId, '2000-01-01', 'renuncia'); // muy anterior al ingreso real
  _assertFalla(res, 'Debería rechazar una fecha de salida anterior a la fecha de ingreso');
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

  var lista = listarPlantillas('email');
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

function test_pagarCuotaPrestamo_yaSaldado(ctx) {
  var creado = crearPrestamo({ empleado_id: ctx.empleadoId, monto: 100000, cuotas: 1, fecha: hoy() }, ctx.token);
  _assertOk(creado, 'No se pudo preparar el préstamo de prueba');

  var lista = listarPrestamos(ctx.empleadoId, null);
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
