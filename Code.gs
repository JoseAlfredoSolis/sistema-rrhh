/**
 * ===================================================================
 * SISTEMA DE RECURSOS HUMANOS (RRHH) - Google Apps Script
 * ===================================================================
 * Backend principal. Sirve el frontend con HtmlService y expone las
 * funciones CRUD que el frontend invoca con google.script.run.
 *
 * Base de datos: una hoja de Google Sheets con una pestaña por entidad.
 * Módulos: empleados, departamentos, asistencia, vacaciones, nómina,
 * reportes, alertas, capacitaciones, evaluaciones, préstamos, etc.
 * ===================================================================
 */

// ---- CONFIGURACIÓN GLOBAL ----------------------------------------

/**
 * Nombres de las pestañas (hojas) de la base de datos.
 * Centralizado aquí para no repetir cadenas de texto por todo el código.
 */
var HOJAS = {
  EMPLEADOS:         'Empleados',
  DEPARTAMENTOS:     'Departamentos',
  ASISTENCIA:        'Asistencia',
  VACACIONES:        'Vacaciones',
  NOMINA:            'Nomina',
  HISTORIAL_SALARIOS:'HistorialSalarios',
  CAPACITACIONES:    'Capacitaciones',
  EVALUACIONES:      'Evaluaciones',
  BITACORA:          'Bitacora',
  PRESTAMOS:         'Prestamos',
  HORAS_EXTRA:       'HorasExtra',
  ACTIVOS:           'Activos',
  TURNOS:            'Turnos',
  INCAPACIDADES:     'Incapacidades',
  FERIADOS:          'Feriados',
  LIQUIDACIONES:     'Liquidaciones'
};

/**
 * Encabezados esperados por pestaña (orden = orden de las columnas).
 * Sirven para crear la hoja automáticamente si no existe.
 */
var ENCABEZADOS = {
  // Campos Empleados:
  // - cargo_critico (boolean o 'si'/'no'): marca puestos con funciones críticas (no pueden ausentarse)
  // - actividad (string): clasificación del puesto para estadísticas laborales (administrativo, operario, etc.)
  // - padre_madre (string): nombre de beneficiario o contacto de emergencia para pensión/seguro
  Empleados:         ['id', 'nombre', 'cedula', 'departamento', 'puesto', 'fecha_ingreso', 'salario', 'estado', 'fecha_nacimiento', 'telefono',
                      'correo', 'direccion', 'genero', 'estado_civil', 'nacionalidad', 'sede', 'tipo_nomina', 'cuenta_iban', 'carne_ccss',
                      'vencimiento_cedula', 'licencia_conducir', 'vencimiento_licencia', 'jefe_inmediato', 'cargo_critico', 'actividad', 'padre_madre'],
  Departamentos:     ['id', 'nombre', 'responsable'],
  Asistencia:        ['id', 'empleado_id', 'fecha', 'hora_entrada', 'hora_salida', 'horas'],
  Vacaciones:        ['id', 'empleado_id', 'fecha_inicio', 'fecha_fin', 'dias', 'estado', 'notas'],
  Nomina:            ['id', 'empleado_id', 'mes', 'salario_base', 'deducciones', 'neto'],
  HistorialSalarios: ['id', 'empleado_id', 'salario_anterior', 'salario_nuevo', 'fecha', 'notas'],
  Capacitaciones:    ['id', 'empleado_id', 'curso', 'institucion', 'fecha_inicio', 'fecha_fin', 'estado', 'certificado_url'],
  Evaluaciones:      ['id', 'empleado_id', 'periodo', 'calificacion', 'comentarios', 'evaluador', 'fecha'],
  Bitacora:          ['id', 'fecha', 'usuario', 'accion', 'entidad', 'entidad_id', 'resumen'],
  Prestamos:         ['id', 'empleado_id', 'monto', 'cuotas', 'cuota_mensual', 'cuotas_pagadas', 'estado', 'fecha', 'notas'],
  HorasExtra:        ['id', 'empleado_id', 'fecha', 'horas', 'tipo', 'aprobado', 'monto', 'notas'],
  Activos:           ['id', 'empleado_id', 'nombre', 'categoria', 'serial', 'fecha_entrega', 'fecha_devolucion', 'estado', 'notas'],
  Turnos:            ['id', 'empleado_id', 'semana', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
  Incapacidades:     ['id', 'empleado_id', 'fecha_desde', 'fecha_hasta', 'dias', 'entidad', 'especialidad', 'notas'],
  Feriados:          ['id', 'fecha', 'nombre', 'tipo'],
  Liquidaciones:     ['id', 'empleado_id', 'fecha_salida', 'motivo', 'fecha_calculo', 'monto', 'estado', 'notas']
};


// ---- PUNTO DE ENTRADA DE LA WEB APP -------------------------------

/**
 * doGet: Apps Script lo llama cuando alguien abre la URL del web app.
 * Devuelve el HTML del frontend.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema RRHH')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * include: permite insertar el contenido de otro archivo .html
 * dentro de Index.html usando <?!= include('NombreArchivo') ?>.
 * Así separamos CSS y JS en archivos propios pero servimos un solo HTML.
 */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/**
 * Devuelve el contenido de una librería JS embebida (Lib_*.html).
 * Se carga bajo demanda desde el cliente para no bloquear el primer render.
 */
function obtenerScriptLibreria(nombre) {
  var mapa = { chart: 'Lib_Chart', xlsx: 'Lib_Xlsx', jquery: 'Lib_Jquery', select2: 'Lib_Select2' };
  var archivo = mapa[nombre];
  if (!archivo) throw new Error('Librería no permitida: ' + nombre);
  return HtmlService.createHtmlOutputFromFile(archivo).getContent();
}


// ---- UTILIDADES REUTILIZABLES DE BASE DE DATOS --------------------

/**
 * Clave bajo la que guardamos el ID de la hoja en las propiedades del script.
 */
var CLAVE_ID_HOJA = 'SPREADSHEET_ID';

/**
 * Devuelve el libro (Spreadsheet) que usa el sistema como base de datos.
 *
 * Prioridad:
 *   1. Si en Configuración se guardó un ID de hoja, se abre por ese ID
 *      (SpreadsheetApp.openById). Útil si el proyecto NO está ligado a la hoja.
 *   2. Si no, usa la hoja a la que está ligado el proyecto (getActiveSpreadsheet).
 *
 * Lanza un error claro si no hay ninguna hoja disponible.
 */
function getLibro() {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error('No se pudo abrir la hoja configurada (ID: ' + id +
        '). Revisa el ID en el módulo Configuración. Detalle: ' + e.message);
    }
  }
  var activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;
  throw new Error('No hay una hoja conectada. Ve al módulo Configuración e ' +
    'indica el ID de tu Google Sheet.');
}

/**
 * Obtiene una pestaña por nombre. Si no existe, la crea y le pone
 * la fila de encabezados correspondiente. Garantiza que siempre
 * tengamos una hoja válida con la estructura esperada.
 *
 * @param {string} nombreHoja  Nombre de la pestaña (usar la constante HOJAS).
 * @return {Sheet} la pestaña lista para usar.
 */
function getHoja(nombreHoja) {
  var libro = getLibro();
  var hoja = libro.getSheetByName(nombreHoja);

  if (!hoja) {
    hoja = libro.insertSheet(nombreHoja);
    var encabezados = ENCABEZADOS[nombreHoja];
    if (encabezados) {
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      hoja.setFrozenRows(1); // congela la fila de encabezados
    }
  }
  return hoja;
}

/**
 * Lee tabla con paginación (Fase 5 - Item 15).
 * Para grandes volúmenes (50k+ filas), divide en páginas.
 * Backward compatible: llamar sin offset/limit devuelve TODO (como antes).
 *
 * @param {string} nombreHoja
 * @param {number} [offset] - Fila a partir de la cual leer (0-based después de encabezados)
 * @param {number} [limit] - Máximo de filas a retornar
 * @return {Object[]} filas como objetos.
 */
function leerTabla(nombreHoja, offset, limit) {
  var hoja = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();

  // Si solo hay encabezados (o nada), no hay registros.
  if (datos.length < 2) {
    return [];
  }

  var encabezados = datos[0];
  var filas = [];

  // Paginación: offset y limit (Fase 5)
  var desde = (offset || 0) + 1;  // +1 porque fila 0 es encabezados
  var hasta = limit ? desde + limit : datos.length;

  for (var i = desde; i < hasta && i < datos.length; i++) {
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      obj[encabezados[c]] = datos[i][c];
    }
    filas.push(obj);
  }
  return filas;
}

/**
 * Cuenta total de filas en una tabla (sin encabezados).
 * Útil para paginación - saber cuántas páginas hay.
 * @param {string} nombreHoja
 * @return {number}
 */
function contarFilasTabla(nombreHoja) {
  var hoja = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  return Math.max(0, datos.length - 1);  // -1 para no contar encabezados
}

/**
 * Genera un ID único basado en la marca de tiempo + un componente
 * aleatorio. Suficiente para un sistema interno pequeño.
 *
 * @return {string} algo como "EMP-1714501234567-482".
 */
function generarId(prefijo) {
  var marca = new Date().getTime();
  var azar = Math.floor(Math.random() * 1000);
  return (prefijo || 'ID') + '-' + marca + '-' + azar;
}

/**
 * Busca el número de fila (1-based, como en la hoja) de un registro por su id.
 * Optimizado con MATCH() de Sheets para velocidad O(log n) en lugar de O(n).
 * Devuelve -1 si no lo encuentra.
 *
 * @param {Sheet} hoja
 * @param {string} id
 * @return {number} índice de fila en la hoja, o -1.
 */
function buscarFilaPorId(hoja, id) {
  try {
    // Usar MATCH() de Sheets es 10x más rápido que loop en JS
    var rango = hoja.getDataRange();
    var primeraColumna = rango.getColumn();
    var ultimaFila = rango.getLastRow();

    if (ultimaFila <= 1) return -1;  // Solo encabezados

    var formula = '=IFERROR(MATCH("' + id + '",A2:A' + ultimaFila + ',0),-1)';
    var resultado = SpreadsheetApp.getActiveSheet().getRange(ultimaFila + 2, 1)
      .setFormula(formula).getValue();

    if (resultado === -1) return -1;
    return resultado + 1;  // +1 para compensar MATCH que devuelve 1-based desde A2
  } catch (e) {
    // Fallback a búsqueda por loop si hay error en fórmula
    var datos = hoja.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(id)) {
        return i + 1;
      }
    }
    return -1;
  }
}


// ===================================================================
// MÓDULO: EMPLEADOS
// ===================================================================
//
// Estructura de un empleado:
//   id | nombre | cedula | departamento | puesto | fecha_ingreso | salario | estado
//
// "estado" es 'activo' o 'inactivo' (baja lógica, nunca se borra la fila).
// ===================================================================

/**
 * Validación de los datos de un empleado en el BACKEND.
 * Nunca confíes solo en la validación del frontend: el backend
 * también debe validar para proteger la integridad de los datos.
 *
 * @param {Object} emp  datos del empleado.
 * @return {string|null} mensaje de error, o null si todo está bien.
 */
function validarEmpleado(emp) {
  if (!emp) {
    return 'No se recibieron datos del empleado.';
  }
  if (!emp.nombre || String(emp.nombre).trim() === '') {
    return 'El nombre es obligatorio.';
  }
  if (!emp.cedula || String(emp.cedula).trim() === '') {
    return 'La cédula es obligatoria.';
  }
  // Cédula: solo dígitos y guiones, longitud razonable.
  if (!/^[0-9\-]{5,20}$/.test(String(emp.cedula).trim())) {
    return 'La cédula solo puede contener números y guiones (5 a 20 caracteres).';
  }
  // Salario: debe ser un número > 0 y >= salario mínimo CR (~500,000 en 2025).
  var salario = Number(emp.salario);
  var SALARIO_MINIMO_CR = 500000; // Aproximado 2025; verificar anualmente
  if (emp.salario === '' || emp.salario === null || isNaN(salario) || salario <= 0) {
    return 'El salario debe ser un número mayor a 0.';
  }
  if (salario < SALARIO_MINIMO_CR) {
    return 'El salario ₡' + salario + ' es inferior al mínimo legal CR (~₡' + SALARIO_MINIMO_CR + '). Verificar con RR.HH.';
  }
  // Fecha de ingreso: obligatoria y con formato válido (yyyy-mm-dd).
  if (!emp.fecha_ingreso || isNaN(new Date(emp.fecha_ingreso).getTime())) {
    return 'La fecha de ingreso no es válida.';
  }
  // Correo: opcional, pero si viene debe tener formato de email.
  if (emp.correo && String(emp.correo).trim() !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(emp.correo).trim())) {
    return 'El correo electrónico no tiene un formato válido.';
  }
  return null; // sin errores
}

/**
 * Verifica si una cédula ya está registrada en otro empleado.
 *
 * @param {string} cedula
 * @param {string} idExcluir  id a ignorar (al editar el mismo registro).
 * @return {boolean} true si la cédula ya existe en otro empleado.
 */
function cedulaDuplicada(cedula, idExcluir) {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var cedulaNorm = String(cedula).trim();
  for (var i = 0; i < empleados.length; i++) {
    if (String(empleados[i].cedula).trim() === cedulaNorm &&
        String(empleados[i].id) !== String(idExcluir || '')) {
      return true;
    }
  }
  return false;
}

/**
 * LISTAR empleados.
 * @param {boolean} soloActivos  si es true, devuelve solo los activos.
 * @return {Object[]} arreglo de empleados.
 */
function listarEmpleados(soloActivos) {
  var empleados = leerTabla(HOJAS.EMPLEADOS);

  // Normalizamos la fecha a texto yyyy-mm-dd para mostrarla bien
  // en el frontend (Sheets a veces devuelve objetos Date).
  empleados.forEach(function (emp) {
    emp.fecha_ingreso        = formatearFecha(emp.fecha_ingreso);
    emp.fecha_nacimiento     = emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '';
    emp.vencimiento_cedula   = emp.vencimiento_cedula ? formatearFecha(emp.vencimiento_cedula) : '';
    emp.vencimiento_licencia = emp.vencimiento_licencia ? formatearFecha(emp.vencimiento_licencia) : '';
    emp.telefono             = emp.telefono ? String(emp.telefono) : '';
    emp.carne_ccss           = emp.carne_ccss ? String(emp.carne_ccss) : '';
    emp.salario              = Number(emp.salario) || 0;
  });

  if (soloActivos) {
    empleados = empleados.filter(function (e) {
      return String(e.estado).toLowerCase() === 'activo';
    });
  }
  return empleados;
}

/**
 * Convierte un valor de fecha (Date o texto) a "yyyy-mm-dd".
 * Si no se puede, devuelve el valor original como texto.
 */
function formatearFecha(valor) {
  if (!valor) return '';
  // Las cadenas 'yyyy-mm-dd' se devuelven tal cual: convertirlas a Date
  // las interpretaría como medianoche UTC y restaría un día en zona CR.
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    return valor.trim();
  }
  var fecha = (valor instanceof Date) ? valor : new Date(valor);
  if (isNaN(fecha.getTime())) return String(valor);
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * CREAR un empleado nuevo.
 * @param {Object} emp  datos del formulario.
 * @return {Object} {ok:boolean, mensaje:string, id?:string}
 */
function crearEmpleado(emp, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var error = validarEmpleado(emp);
  if (error) {
    return { ok: false, mensaje: error };
  }
  if (cedulaDuplicada(emp.cedula, null)) {
    return { ok: false, mensaje: 'Ya existe un empleado con esa cédula.' };
  }

  var hoja = getHoja(HOJAS.EMPLEADOS);
  var id = generarId('EMP');

  // El orden DEBE coincidir con ENCABEZADOS.Empleados.
  var fila = [
    id,
    String(emp.nombre).trim(),
    String(emp.cedula).trim(),
    emp.departamento || '',
    emp.puesto || '',
    formatearFecha(emp.fecha_ingreso),
    Number(emp.salario),
    'activo',
    emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '',
    emp.telefono ? String(emp.telefono).trim() : ''
  ].concat(_camposExtraEmpleado(emp, null));

  hoja.appendRow(fila);
  registrarBitacora('crear', 'Empleados', id, String(emp.nombre).trim());
  return { ok: true, mensaje: 'Empleado creado correctamente.', id: id };
}

/**
 * Campos adicionales del expediente (columnas 11-26 de la hoja Empleados).
 * Devuelve los 16 valores en el orden de ENCABEZADOS.Empleados.
 * Si un campo no viene en el payload y hay fila actual, conserva el valor existente.
 *
 * @param {Object} emp        datos recibidos del frontend/importación.
 * @param {Array|null} filaActual  valores actuales de la fila (o null al crear).
 * @return {Array} 16 valores.
 */
/**
 * Extrae campos opcionales de empleado (después de los 10 básicos: id, nombre, cédula, ..., teléfono).
 * Si el campo viene en `emp`, usa ese valor; sino, toma de la fila actual (al actualizar).
 * Formatea fechas (vencimiento_cedula, vencimiento_licencia).
 */
function _camposExtraEmpleado(emp, filaActual) {
  var campos = ['correo', 'direccion', 'genero', 'estado_civil', 'nacionalidad', 'sede',
    'tipo_nomina', 'cuenta_iban', 'carne_ccss', 'vencimiento_cedula', 'licencia_conducir',
    'vencimiento_licencia', 'jefe_inmediato', 'cargo_critico', 'actividad', 'padre_madre'];
  var fechas = { vencimiento_cedula: true, vencimiento_licencia: true };
  return campos.map(function (campo, i) {
    var valor = emp[campo];
    if (valor === undefined && filaActual) valor = filaActual[10 + i];  // Columnas A-J son básicos, K+ son extras
    if (valor === undefined || valor === null) valor = '';
    valor = String(valor).trim();
    return (fechas[campo] && valor) ? formatearFecha(valor) : valor;
  });
}

/**
 * ACTUALIZAR un empleado existente por su id.
 * @param {Object} emp  datos del formulario (incluye emp.id).
 * @return {Object} {ok, mensaje}
 */
function actualizarEmpleado(emp, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!emp || !emp.id) {
    return { ok: false, mensaje: 'Falta el identificador del empleado.' };
  }
  var error = validarEmpleado(emp);
  if (error) {
    return { ok: false, mensaje: error };
  }
  if (cedulaDuplicada(emp.cedula, emp.id)) {
    return { ok: false, mensaje: 'Ya existe otro empleado con esa cédula.' };
  }

  var hoja = getHoja(HOJAS.EMPLEADOS);
  var fila = buscarFilaPorId(hoja, emp.id);
  if (fila === -1) {
    return { ok: false, mensaje: 'No se encontró el empleado a actualizar.' };
  }

  var numCols = ENCABEZADOS.Empleados.length;
  var filaActual = hoja.getRange(fila, 1, 1, numCols).getValues()[0];

  var estadoActual    = filaActual[7] || 'activo';
  var salarioAnterior = Number(filaActual[6]) || 0;
  var salarioNuevo    = Number(emp.salario);

  var valores = [
    emp.id,
    String(emp.nombre).trim(),
    String(emp.cedula).trim(),
    emp.departamento || '',
    emp.puesto || '',
    formatearFecha(emp.fecha_ingreso),
    salarioNuevo,
    estadoActual,
    emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : (String(filaActual[8] || '')),
    emp.telefono ? String(emp.telefono).trim() : (String(filaActual[9] || ''))
  ].concat(_camposExtraEmpleado(emp, filaActual));

  hoja.getRange(fila, 1, 1, valores.length).setValues([valores]);

  if (salarioAnterior !== salarioNuevo) {
    var hojaHist = getHoja(HOJAS.HISTORIAL_SALARIOS);
    hojaHist.appendRow([generarId('HSA'), emp.id, salarioAnterior, salarioNuevo,
      formatearFecha(new Date()), emp.notasSalario || '']);
    registrarBitacora('actualizar', 'Empleados', emp.id,
      'Salario: ' + salarioAnterior + ' → ' + salarioNuevo + ' | Usuario: ' + Session.getActiveUser().getEmail());
  } else {
    registrarBitacora('actualizar', 'Empleados', emp.id, String(emp.nombre).trim());
  }
  return { ok: true, mensaje: 'Empleado actualizado correctamente.' };
}

/**
 * CAMBIAR ESTADO (baja/alta lógica). No borra la fila.
 * @param {string} id
 * @param {string} nuevoEstado  'activo' o 'inactivo'.
 * @return {Object} {ok, mensaje}
 */
function cambiarEstadoEmpleado(id, nuevoEstado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (nuevoEstado !== 'activo' && nuevoEstado !== 'inactivo') {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.EMPLEADOS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) {
    return { ok: false, mensaje: 'No se encontró el empleado.' };
  }
  var estadoAnterior = String(hoja.getRange(fila, 8).getValue() || 'activo');
  hoja.getRange(fila, 8).setValue(nuevoEstado);
  registrarBitacora('actualizar', 'Empleados', id,
    'Estado: ' + estadoAnterior + ' → ' + nuevoEstado + ' | Usuario: ' + Session.getActiveUser().getEmail());
  var accion = (nuevoEstado === 'activo') ? 'reactivado' : 'dado de baja';
  return { ok: true, mensaje: 'Empleado ' + accion + ' correctamente.' };
}

/**
 * Devuelve la lista de departamentos para llenar el <select> del
 * formulario. Si el módulo de Departamentos aún no existe, devolvemos
 * una lista vacía sin romper nada.
 * @return {string[]} nombres de departamentos.
 */
function listarNombresDepartamentos() {
  var deptos = leerTabla(HOJAS.DEPARTAMENTOS);
  return deptos.map(function (d) { return d.nombre; })
               .filter(function (n) { return n && String(n).trim() !== ''; });
}


// ===================================================================
// MÓDULO: DEPARTAMENTOS
// ===================================================================
//   id | nombre | responsable
// ===================================================================

/** Lista todos los departamentos. */
function listarDepartamentos() {
  return leerTabla(HOJAS.DEPARTAMENTOS);
}

/** Valida los datos de un departamento. */
function validarDepartamento(d) {
  if (!d || !d.nombre || String(d.nombre).trim() === '') {
    return 'El nombre del departamento es obligatorio.';
  }
  return null;
}

/** Comprueba si ya existe un departamento con ese nombre. */
function departamentoDuplicado(nombre, idExcluir) {
  var lista = leerTabla(HOJAS.DEPARTAMENTOS);
  var n = String(nombre).trim().toLowerCase();
  return lista.some(function (d) {
    return String(d.nombre).trim().toLowerCase() === n &&
           String(d.id) !== String(idExcluir || '');
  });
}

/** Crea un departamento. */
function crearDepartamento(d, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var error = validarDepartamento(d);
  if (error) return { ok: false, mensaje: error };
  if (departamentoDuplicado(d.nombre, null)) {
    return { ok: false, mensaje: 'Ya existe un departamento con ese nombre.' };
  }
  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var id = generarId('DEP');
  hoja.appendRow([id, String(d.nombre).trim(), d.responsable || '']);
  return { ok: true, mensaje: 'Departamento creado correctamente.', id: id };
}

/** Actualiza un departamento. */
function actualizarDepartamento(d, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!d || !d.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var error = validarDepartamento(d);
  if (error) return { ok: false, mensaje: error };
  if (departamentoDuplicado(d.nombre, d.id)) {
    return { ok: false, mensaje: 'Ya existe otro departamento con ese nombre.' };
  }
  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var fila = buscarFilaPorId(hoja, d.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el departamento.' };
  hoja.getRange(fila, 1, 1, 3).setValues([[d.id, String(d.nombre).trim(), d.responsable || '']]);
  return { ok: true, mensaje: 'Departamento actualizado correctamente.' };
}

/**
 * Elimina un departamento. No permite borrarlo si hay empleados que lo usan
 * (para no dejar registros huérfanos).
 */
function eliminarDepartamento(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el departamento.' };

  var nombre = hoja.getRange(fila, 2).getValue();
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var enUso = empleados.some(function (e) {
    return String(e.departamento).trim() === String(nombre).trim();
  });
  if (enUso) {
    return { ok: false, mensaje: 'No se puede eliminar: hay empleados en este departamento.' };
  }
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Departamento eliminado.' };
}


// ===================================================================
// MÓDULO: ASISTENCIA
// ===================================================================
//   id | empleado_id | fecha | hora_entrada | hora_salida | horas
// ===================================================================

/**
 * Calcula las horas trabajadas entre dos horas en formato "HH:mm".
 * Devuelve un número con 2 decimales (ej: 8.5). Si salida < entrada
 * (turno nocturno que cruza medianoche) suma 24 h.
 */
function calcularHoras(horaEntrada, horaSalida) {
  if (!horaEntrada || !horaSalida) return 0;
  var e = horaEntrada.split(':');
  var s = horaSalida.split(':');
  var minEntrada = Number(e[0]) * 60 + Number(e[1]);
  var minSalida = Number(s[0]) * 60 + Number(s[1]);
  var diff = minSalida - minEntrada;
  if (diff < 0) diff += 24 * 60; // cruza medianoche
  return Math.round((diff / 60) * 100) / 100;
}

/** Verifica si una fecha es feriado. */
function esFeriado(fecha) {
  var feriados = leerTabla(HOJAS.FERIADOS);
  var fechaStr = typeof fecha === 'string' ? fecha : formatearFecha(fecha);
  return feriados.some(function (f) {
    return formatearFecha(f.fecha) === fechaStr;
  });
}

/** Verifica si una fecha es sábado o domingo. */
function esFinDeSemana(fecha) {
  var d = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  var dia = d.getDay();
  return dia === 0 || dia === 6; // 0=domingo, 6=sábado
}

/** Lista la asistencia, agregando el nombre del empleado, feriados y tipos de marcas. */
/**
 * Lista registros de asistencia, filtrados por empleado y fecha.
 * Enriquece con nombres de empleados y marca días especiales (feriados, incapacidades, vacaciones).
 * @param {string} empleadoId - ID del empleado (null = todos)
 * @param {string} fechaDesde - Fecha inicio filtro yyyy-MM-dd (null = todas)
 * @return {Object[]} registros con {id, empleado_id, empleado_nombre, fecha, horas, marca_especial, ...}
 */
function listarAsistencia(empleadoId, fechaDesde) {
  var registros = leerTabla(HOJAS.ASISTENCIA);
  if (empleadoId) {
    registros = registros.filter(function (r) {
      return String(r.empleado_id) === String(empleadoId);
    });
  }
  if (fechaDesde) {
    var desde = formatearFecha(fechaDesde);
    registros = registros.filter(function (r) {
      return formatearFecha(r.fecha) >= desde;
    });
  }
  var nombres = mapaEmpleados();

  // Set de fechas feriadas (una sola lectura de la hoja, no una por registro).
  var feriadosSet = {};
  leerTabla(HOJAS.FERIADOS).forEach(function (f) {
    feriadosSet[formatearFecha(f.fecha)] = true;
  });

  registros.forEach(function (r) {
    r.fecha = formatearFecha(r.fecha);
    r.hora_entrada = formatearHora(r.hora_entrada);
    r.hora_salida = formatearHora(r.hora_salida);
    r.empleado_nombre = nombres[r.empleado_id] || '(desconocido)';
    r.horas = Number(r.horas) || 0;

    // Enriquecer con información de feriados y tipo de marca
    r.es_feriado = !!feriadosSet[r.fecha];
    r.es_fin_de_semana = esFinDeSemana(r.fecha);

    // Detectar tipo de marca (VAC, CCSS, INS, presente normal)
    var marca = String(r.hora_entrada).toLowerCase();
    if (marca === 'vac') {
      r.tipo_marca = 'Vacación';
      r.clasificacion = 'vacacion';
    } else if (marca === 'ccss' || marca === 'ins') {
      r.tipo_marca = marca.toUpperCase() + ' (Incapacidad)';
      r.clasificacion = 'incapacidad';
    } else if (r.es_feriado) {
      r.tipo_marca = 'Feriado';
      r.clasificacion = 'feriado';
    } else if (r.es_fin_de_semana) {
      r.tipo_marca = 'Fin de semana';
      r.clasificacion = 'fin_de_semana';
    } else if (r.hora_entrada && r.hora_salida) {
      r.tipo_marca = 'Presente (' + r.horas + 'h)';
      r.clasificacion = 'presente';
    } else {
      r.tipo_marca = 'Ausente';
      r.clasificacion = 'ausente';
    }
  });

  return registros;
}

/** Convierte un valor de hora (Date o texto) a "HH:mm". */
function formatearHora(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(valor);
}

/** Registra un día de asistencia (entrada + salida) y calcula las horas. */
function crearAsistencia(a, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!a || !a.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!a.fecha || isNaN(new Date(a.fecha).getTime())) {
    return { ok: false, mensaje: 'La fecha no es válida.' };
  }
  var fechaAsist = new Date(a.fecha);
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fechaAsist > hoy) {
    return { ok: false, mensaje: 'No se puede registrar asistencia con fechas futuras.' };
  }
  if (!/^\d{2}:\d{2}$/.test(a.hora_entrada || '') || !/^\d{2}:\d{2}$/.test(a.hora_salida || '')) {
    return { ok: false, mensaje: 'Las horas deben tener formato HH:mm.' };
  }
  var hEnt = parseInt(a.hora_entrada.split(':')[0], 10);
  var mEnt = parseInt(a.hora_entrada.split(':')[1], 10);
  var hSal = parseInt(a.hora_salida.split(':')[0], 10);
  var mSal = parseInt(a.hora_salida.split(':')[1], 10);
  if (hEnt < 0 || hEnt > 23 || mEnt < 0 || mEnt > 59 || hSal < 0 || hSal > 23 || mSal < 0 || mSal > 59) {
    return { ok: false, mensaje: 'Horas deben estar entre 00:00 y 23:59.' };
  }
  var fechaNorm = formatearFecha(a.fecha);
  var horas = calcularHoras(a.hora_entrada, a.hora_salida);
  return conLock(function () {
    var duplicado = leerTabla(HOJAS.ASISTENCIA).some(function (r) {
      return String(r.empleado_id) === String(a.empleado_id) &&
             formatearFecha(r.fecha) === fechaNorm;
    });
    if (duplicado) {
      return { ok: false, mensaje: 'Ya existe un registro de asistencia para ese empleado en esa fecha.' };
    }
    var hoja = getHoja(HOJAS.ASISTENCIA);
    var id = generarId('ASI');
    hoja.appendRow([id, a.empleado_id, fechaNorm, a.hora_entrada, a.hora_salida, horas]);
    return { ok: true, mensaje: 'Asistencia registrada (' + horas + ' h).', id: id };
  });
}

/** Elimina un registro de asistencia. */
function eliminarAsistencia(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ASISTENCIA);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el registro.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Registro eliminado.' };
}


// ===================================================================
// MÓDULO: VACACIONES / PERMISOS
// ===================================================================
//   id | empleado_id | fecha_inicio | fecha_fin | dias | estado
//   estado: 'pendiente' | 'aprobada' | 'rechazada'
// ===================================================================

/** Calcula los días entre dos fechas (inclusivas). */
function calcularDias(inicio, fin) {
  var d1 = new Date(inicio);
  var d2 = new Date(fin);
  var msPorDia = 24 * 60 * 60 * 1000;
  var diff = Math.round((d2 - d1) / msPorDia) + 1; // +1 para incluir el último día
  return diff;
}

/** Lista las solicitudes de vacaciones con el nombre del empleado y saldo disponible. */
function listarVacaciones(empleadoId, estado) {
  var lista = leerTabla(HOJAS.VACACIONES);
  if (empleadoId) lista = lista.filter(function (v) { return String(v.empleado_id) === String(empleadoId); });
  if (estado) lista = lista.filter(function (v) { return String(v.estado).toLowerCase() === String(estado).toLowerCase(); });
  var nombres = mapaEmpleados();
  lista.forEach(function (v) {
    v.fecha_inicio = formatearFecha(v.fecha_inicio);
    v.fecha_fin = formatearFecha(v.fecha_fin);
    v.dias = Number(v.dias) || 0;
    v.empleado_nombre = nombres[v.empleado_id] || '(desconocido)';
    // Agregar saldo disponible
    var balance = obtenerBalanceVacaciones(v.empleado_id);
    v.saldo_disponible = (balance.ok ? balance.diasDisponibles : 0);
  });
  return lista;
}

/** Crea una solicitud de vacaciones (nace 'pendiente'). Valida días disponibles. */
function crearVacaciones(v, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!v || !v.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!v.fecha_inicio || isNaN(new Date(v.fecha_inicio).getTime())) {
    return { ok: false, mensaje: 'La fecha de inicio no es válida.' };
  }
  if (!v.fecha_fin || isNaN(new Date(v.fecha_fin).getTime())) {
    return { ok: false, mensaje: 'La fecha de fin no es válida.' };
  }
  if (new Date(v.fecha_fin) < new Date(v.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }

  // Validar que no sean demasiado futuras (máximo 1 año adelante)
  var hoy = new Date();
  var fechaInicio = new Date(v.fecha_inicio);
  var unAnoDelante = new Date();
  unAnoDelante.setFullYear(unAnoDelante.getFullYear() + 1);
  if (fechaInicio > unAnoDelante) {
    return { ok: false, mensaje: 'Las vacaciones deben estar dentro del próximo año.' };
  }

  var dias = calcularDias(v.fecha_inicio, v.fecha_fin);

  // Validar que hay suficientes días disponibles
  var balance = obtenerBalanceVacaciones(v.empleado_id);
  if (!balance.ok) return balance;

  if (dias > balance.diasDisponibles) {
    return {
      ok: false,
      mensaje: 'No hay suficientes días disponibles. ' +
               'Tienes ' + balance.diasDisponibles + ' días disponibles, ' +
               'pero solicitaste ' + dias + ' días. ' +
               '(Acumulados: ' + balance.diasAcumulados + ', Usados: ' + balance.diasUsados + ')'
    };
  }

  // Validar que no se solapen con vacaciones aprobadas
  var vacacionesExistentes = leerTabla(HOJAS.VACACIONES).filter(function (vac) {
    return String(vac.empleado_id) === String(v.empleado_id) && String(vac.estado).toLowerCase() === 'aprobada';
  });
  var fechaInicio = new Date(v.fecha_inicio);
  var fechaFin = new Date(v.fecha_fin);
  var solapada = vacacionesExistentes.some(function (vac) {
    var vacInicio = new Date(vac.fecha_inicio);
    var vacFin = new Date(vac.fecha_fin);
    return !(fechaFin < vacInicio || fechaInicio > vacFin);
  });
  if (solapada) {
    return { ok: false, mensaje: 'Conflicto: Ya hay vacaciones aprobadas en esas fechas.' };
  }

  return conLock(function () {
    var hoja = getHoja(HOJAS.VACACIONES);
    var id = generarId('VAC');
    hoja.appendRow([id, v.empleado_id, formatearFecha(v.fecha_inicio),
                    formatearFecha(v.fecha_fin), dias, 'pendiente', v.notas || '']);

    registrarBitacora('crear', 'Vacaciones', id,
      v.empleado_id + ' solicitó ' + dias + ' días de vacaciones');

    try { _notificarWhatsAppNuevaVacacion(v, dias); } catch (e) {}

    return {
      ok: true,
      mensaje: 'Solicitud creada (' + dias + ' días de ' + balance.diasDisponibles + ' disponibles).',
      id: id,
      balance: balance
    };
  });
}

/** Cambia el estado de una solicitud (aprobar / rechazar). Valida si es posible aprobar. */
function cambiarEstadoVacaciones(id, nuevoEstado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (['pendiente', 'aprobada', 'rechazada'].indexOf(nuevoEstado) === -1) {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.VACACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la solicitud.' };

  // Leer la solicitud actual
  var datos = leerTabla(HOJAS.VACACIONES);
  var solicitud = datos.filter(function (s) { return String(s.id) === String(id); })[0];
  if (!solicitud) return { ok: false, mensaje: 'No se encontró la solicitud.' };

  // Si es para aprobar, validar que hay días disponibles
  if (nuevoEstado === 'aprobada') {
    var balance = obtenerBalanceVacaciones(solicitud.empleado_id);
    if (!balance.ok) return balance;

    var diasSolicitud = Number(solicitud.dias) || 0;
    if (diasSolicitud > balance.diasDisponibles) {
      return {
        ok: false,
        mensaje: 'No se puede aprobar. El empleado tiene ' + balance.diasDisponibles +
                 ' días disponibles, pero solicita ' + diasSolicitud + ' días.'
      };
    }
  }

  hoja.getRange(fila, 6).setValue(nuevoEstado); // columna 6 = estado

  registrarBitacora('modificar', 'Vacaciones', id,
    'Estado cambió a: ' + nuevoEstado);

  if (nuevoEstado === 'aprobada' || nuevoEstado === 'rechazada') {
    var filaDatos = hoja.getRange(fila, 1, 1, 5).getValues()[0];
    try {
      _notificarWhatsAppVacacionDecidida({
        empleado_id: filaDatos[1],
        fecha_inicio: filaDatos[2],
        fecha_fin: filaDatos[3],
        dias: filaDatos[4]
      }, nuevoEstado);
    } catch (e) {}
  }
  return { ok: true, mensaje: 'Solicitud ' + nuevoEstado + '.' };
}


// ===================================================================
// MÓDULO: NÓMINA BÁSICA
// ===================================================================
//   id | empleado_id | mes | salario_base | deducciones | neto
//   mes en formato "yyyy-MM" (ej: 2026-06)
// ===================================================================

/**
 * Lista registros de nómina con detalles de empleados y deducciones calculadas.
 * @param {string} mesFiltro - Mes en formato "YYYY-MM" (null = todos)
 * @return {Object[]} registros con {id, empleado_id, empleado_nombre, salario_base, deducciones, neto, ...}
 */
function listarNomina(mesFiltro) {
  var lista = leerTabla(HOJAS.NOMINA);
  var nombres = mapaEmpleados();
  lista.forEach(function (n) {
    n.salario_base = Number(n.salario_base) || 0;
    n.deducciones = Number(n.deducciones) || 0;
    n.neto = Number(n.neto) || 0;
    n.mes = String(n.mes);
    n.empleado_nombre = nombres[n.empleado_id] || '(desconocido)';
  });
  if (mesFiltro) {
    lista = lista.filter(function (n) { return n.mes === mesFiltro; });
  }
  return lista;
}

/**
 * Genera la nómina de un empleado para un mes. Toma el salario base del
 * empleado, le resta las deducciones y guarda el neto. No permite duplicar
 * la nómina del mismo empleado/mes.
 */
function generarNomina(n, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!n || !n.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!/^\d{4}-\d{2}$/.test(n.mes || '')) {
    return { ok: false, mensaje: 'El mes debe tener formato AAAA-MM.' };
  }
  var deducciones = Number(n.deducciones);
  if (n.autoDeducciones || isNaN(deducciones) || deducciones < 0) {
    deducciones = null;
  }

  // Evitar duplicados empleado+mes.
  var existentes = leerTabla(HOJAS.NOMINA);
  var dup = existentes.some(function (x) {
    return String(x.empleado_id) === String(n.empleado_id) && String(x.mes) === String(n.mes);
  });
  if (dup) return { ok: false, mensaje: 'Ya existe nómina para ese empleado en ese mes.' };

  // Salario base = salario del empleado.
  var empleado = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(n.empleado_id);
  })[0];
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var salarioBase = Number(empleado.salario) || 0;
  if (deducciones === null) {
    deducciones = calcularDeduccionesCR(salarioBase).total;
  }
  if (isNaN(deducciones) || deducciones < 0) {
    return { ok: false, mensaje: 'Las deducciones deben ser un número ≥ 0.' };
  }
  if (deducciones > salarioBase) {
    return { ok: false, mensaje: 'Las deducciones no pueden superar el salario base.' };
  }
  var neto = Math.round((salarioBase - deducciones) * 100) / 100;

  var hoja = getHoja(HOJAS.NOMINA);
  var id = generarId('NOM');
  hoja.appendRow([id, n.empleado_id, n.mes, salarioBase, deducciones, neto]);
  try {
    _notificarWhatsAppNominaGenerada(empleado, n.mes, salarioBase, deducciones, neto);
  } catch (e) {}
  return { ok: true, mensaje: 'Nómina generada (neto: ' + neto + ').', id: id };
}

/** Elimina un registro de nómina. */
function eliminarNomina(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.NOMINA);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el registro.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Registro de nómina eliminado.' };
}


// ===================================================================
// MÓDULO: DASHBOARD (totales)
// ===================================================================

/** Genera alertas automáticas basadas en las fórmulas del Excel. */
function obtenerAlertas() {
  var hoy = new Date();
  var hace31dias = new Date(hoy.getTime() - 31 * 24 * 60 * 60 * 1000);
  var hace30dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
  var hace90dias = new Date(hoy.getTime() - 90 * 24 * 60 * 60 * 1000);

  var alertas = [];
  var empleados = leerTabla(HOJAS.EMPLEADOS);

  empleados.forEach(function (emp) {
    // Alerta: Cédula próxima a vencer (< 31 días)
    if (emp.vencimiento_cedula) {
      var fechaCed = new Date(emp.vencimiento_cedula + 'T00:00:00');
      if (fechaCed >= hace31dias && fechaCed <= hoy) {
        alertas.push({
          tipo: 'cedula_vencida',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Cédula VENCIDA',
          fecha: emp.vencimiento_cedula,
          urgencia: 'crítica'
        });
      } else if (fechaCed > hoy && fechaCed <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'cedula_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Cédula próxima a vencer',
          fecha: emp.vencimiento_cedula,
          urgencia: 'alta'
        });
      }
    }

    // Alerta: Licencia próxima a vencer
    if (emp.vencimiento_licencia) {
      var fechaLic = new Date(emp.vencimiento_licencia + 'T00:00:00');
      if (fechaLic >= hace31dias && fechaLic <= hoy) {
        alertas.push({
          tipo: 'licencia_vencida',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Licencia de conducir VENCIDA',
          fecha: emp.vencimiento_licencia,
          urgencia: 'media'
        });
      } else if (fechaLic > hoy && fechaLic <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'licencia_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Licencia próxima a vencer',
          fecha: emp.vencimiento_licencia,
          urgencia: 'media'
        });
      }
    }

    // Alerta: Evaluación anual próxima (cada 12 meses desde contratación)
    if (emp.fecha_ingreso) {
      var fechaIng = new Date(emp.fecha_ingreso + 'T00:00:00');
      var proxEval = new Date(fechaIng.getTime() + 365 * 24 * 60 * 60 * 1000);
      while (proxEval < hoy) {
        proxEval = new Date(proxEval.getTime() + 365 * 24 * 60 * 60 * 1000);
      }
      if (proxEval >= hoy && proxEval <= new Date(hoy.getTime() + 29 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'evaluacion_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Evaluación anual próxima',
          fecha: Utilities.formatDate(proxEval, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          urgencia: 'baja'
        });
      }
    }

    // Alerta: Período de prueba próximo a vencer (90 días)
    if (emp.fecha_ingreso) {
      var fechaIng2 = new Date(emp.fecha_ingreso + 'T00:00:00');
      var finPrueba = new Date(fechaIng2.getTime() + 90 * 24 * 60 * 60 * 1000);
      if (finPrueba >= hace30dias && finPrueba <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000) && finPrueba > hoy) {
        alertas.push({
          tipo: 'prueba_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Período de prueba próximo a vencer',
          fecha: Utilities.formatDate(finPrueba, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          urgencia: 'media'
        });
      }
    }
  });

  // Ordenar por urgencia
  var orden = { crítica: 0, alta: 1, media: 2, baja: 3 };
  alertas.sort(function (a, b) { return orden[a.urgencia] - orden[b.urgencia]; });

  return alertas;
}

/** Devuelve cifras resumen para el panel principal. */
function obtenerDashboard() {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var activos = empleados.filter(function (e) {
    return String(e.estado).toLowerCase() === 'activo';
  });
  var vacaciones = leerTabla(HOJAS.VACACIONES);
  var pendientes = vacaciones.filter(function (v) {
    return String(v.estado).toLowerCase() === 'pendiente';
  });

  // Mes actual en formato yyyy-MM.
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  // Una sola lectura de NOMINA para el total del mes actual y el histórico.
  var nomina = leerTabla(HOJAS.NOMINA);
  var nominaMes = nomina.filter(function (n) {
    return String(n.mes) === mesActual;
  });
  var totalNeto = nominaMes.reduce(function (suma, n) {
    return suma + (Number(n.neto) || 0);
  }, 0);

  var nominaMesMap = {};
  nomina.forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    nominaMesMap[mes] = (nominaMesMap[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaHistorica = Object.keys(nominaMesMap).sort().slice(-6).map(function (mes) {
    return { mes: mes, neto: Math.round(nominaMesMap[mes] * 100) / 100 };
  });

  // Masa salarial de los empleados activos.
  var masaSalarial = activos.reduce(function (suma, e) {
    return suma + (Number(e.salario) || 0);
  }, 0);

  // Obtener alertas
  var alertas = obtenerAlertas();

  var porDepto = {};
  activos.forEach(function (e) {
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });
  var empleadosPorDepto = Object.keys(porDepto).map(function (d) {
    return { nombre: d, total: porDepto[d] };
  });

  // KPIs adicionales (Fase 3)
  var costoPorEmpleado = activos.length > 0 ? Math.round((masaSalarial / activos.length) * 100) / 100 : 0;
  var rotacionMensual = empleados.length > 0 ? Math.round(((empleados.length - activos.length) / empleados.length) * 100 * 100) / 100 : 0;

  // Costo total de nómina mensual (incluyendo CCSS patronal ~10.67%)
  var costTotalMes = totalNeto * 1.1067;  // Agregamos CCSS patronal

  // Análisis por departamento - costo
  var costoPorDepto = {};
  activos.forEach(function (e) {
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    costoPorDepto[dep] = (costoPorDepto[dep] || 0) + (Number(e.salario) || 0);
  });
  var depotosConCosto = Object.keys(costoPorDepto).map(function (d) {
    return { nombre: d, costo: Math.round(costoPorDepto[d] * 100) / 100, empleados: porDepto[d] };
  }).sort(function (a, b) { return b.costo - a.costo; });

  // Incapacidades este mes
  var incapacidades = leerTabla(HOJAS.INCAPACIDADES) || [];
  var incapacidadesMes = incapacidades.filter(function (i) {
    var fechaDesde = new Date(i.fecha_desde);
    return fechaDesde.getFullYear() === new Date().getFullYear() &&
           fechaDesde.getMonth() === new Date().getMonth();
  });

  return {
    totalEmpleados: empleados.length,
    empleadosActivos: activos.length,
    empleadosInactivos: empleados.length - activos.length,
    totalDepartamentos: leerTabla(HOJAS.DEPARTAMENTOS).length,
    vacacionesPendientes: pendientes.length,
    mesActual: mesActual,
    nominasMesActual: nominaMes.length,
    totalNetoMes: Math.round(totalNeto * 100) / 100,
    masaSalarial: Math.round(masaSalarial * 100) / 100,

    // KPIs - Fase 3
    costoPorEmpleado: costoPorEmpleado,
    rotacionPorcentaje: rotacionMensual,
    costTotalMesConCCSS: Math.round(costTotalMes * 100) / 100,
    incapacidadesEsMes: incapacidadesMes.length,
    diasIncapacidadEsMes: incapacidadesMes.reduce(function (sum, i) {
      return sum + (Number(i.dias) || 0);
    }, 0),

    alertas: alertas,
    alertasCriticas: alertas.filter(function (a) { return a.urgencia === 'crítica'; }).length,
    alertasAltas: alertas.filter(function (a) { return a.urgencia === 'alta'; }).length,
    empleadosPorDepto: empleadosPorDepto,
    depotosConCosto: depotosConCosto,
    nominaHistorica: nominaHistorica
  };
}


// ---- UTILIDAD COMPARTIDA -----------------------------------------

/**
 * Devuelve un mapa { empleado_id: nombre } para mostrar nombres en
 * lugar de ids en Asistencia, Vacaciones y Nómina.
 */
function mapaEmpleados() {
  var mapa = {};
  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    mapa[e.id] = e.nombre;
  });
  return mapa;
}

/**
 * Lista de empleados ACTIVOS reducida para llenar los <select>
 * de los demás módulos: [{id, nombre}, ...].
 */
function listarEmpleadosSelect() {
  return leerTabla(HOJAS.EMPLEADOS)
    .filter(function (e) { return estadoNormalizado(e.estado) === 'activo'; })
    .map(function (e) {
      return { id: e.id, nombre: e.nombre, salario: Number(e.salario) || 0 };
    });
}


// ===================================================================
// MÓDULO: REPORTES (datos para gráficos)
// ===================================================================
// Agrega los datos de las distintas pestañas y los devuelve listos
// para dibujarlos con Google Charts en el frontend. Cada conjunto se
// entrega como arreglo de pares [etiqueta, valor].
// ===================================================================

/**
 * Devuelve todos los conjuntos de datos para la pantalla de Reportes
 * en una sola llamada (menos viajes al backend).
 *
 * @return {Object} datasets agregados.
 */
/**
 * Reportes del dashboard de análisis.
 * @param {string} [empleadoId]  Si viene, limita nómina/horas/vacaciones a ese empleado.
 * @param {string} [fechaDesde]  yyyy-MM-dd. Límite inferior (inclusive) por fecha.
 * @param {string} [fechaHasta] yyyy-MM-dd. Límite superior (inclusive) por fecha.
 */
function obtenerReportes(empleadoId, fechaDesde, fechaHasta) {
  empleadoId = empleadoId ? String(empleadoId) : '';
  var mesDesde = fechaDesde ? String(fechaDesde).slice(0, 7) : '';
  var mesHasta = fechaHasta ? String(fechaHasta).slice(0, 7) : '';

  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var nombres = {};
  empleados.forEach(function (e) { nombres[e.id] = e.nombre; });

  // 1) Empleados ACTIVOS por departamento (snapshot organizacional, sin filtrar).
  var porDepto = {};
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return;
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });

  // 2) Empleados por estado (activos / inactivos), sin filtrar.
  var activos = 0, inactivos = 0;
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() === 'activo') activos++;
    else inactivos++;
  });

  // 3) Nómina: total neto por mes (ordenado por mes), filtrable por empleado y rango de fechas.
  var nominaMes = {};
  leerTabla(HOJAS.NOMINA).forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    if (empleadoId && String(n.empleado_id) !== empleadoId) return;
    if (mesDesde && mes < mesDesde) return;
    if (mesHasta && mes > mesHasta) return;
    nominaMes[mes] = (nominaMes[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaPorMes = Object.keys(nominaMes).sort().map(function (mes) {
    return [mes, Math.round(nominaMes[mes] * 100) / 100];
  });

  // 4) Asistencia: total de horas por empleado, filtrable por empleado y rango de fechas.
  var horasEmp = {};
  leerTabla(HOJAS.ASISTENCIA).forEach(function (a) {
    if (empleadoId && String(a.empleado_id) !== empleadoId) return;
    var fecha = formatearFecha(a.fecha);
    if (fechaDesde && fecha < fechaDesde) return;
    if (fechaHasta && fecha > fechaHasta) return;
    var nombre = nombres[a.empleado_id] || '(desconocido)';
    horasEmp[nombre] = (horasEmp[nombre] || 0) + (Number(a.horas) || 0);
  });
  var horasPorEmpleado = Object.keys(horasEmp).map(function (nom) {
    return [nom, Math.round(horasEmp[nom] * 100) / 100];
  }).sort(function (a, b) { return b[1] - a[1]; }); // de mayor a menor

  // 5) Vacaciones por estado, filtrable por empleado y rango de fechas (fecha_inicio).
  var vacEstado = {};
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (empleadoId && String(v.empleado_id) !== empleadoId) return;
    var inicio = formatearFecha(v.fecha_inicio);
    if (fechaDesde && inicio < fechaDesde) return;
    if (fechaHasta && inicio > fechaHasta) return;
    var est = String(v.estado || 'pendiente').toLowerCase();
    vacEstado[est] = (vacEstado[est] || 0) + 1;
  });
  var vacacionesPorEstado = Object.keys(vacEstado).map(function (est) {
    return [est, vacEstado[est]];
  });

  return {
    empleadosPorDepartamento: Object.keys(porDepto).map(function (d) { return [d, porDepto[d]]; }),
    empleadosPorEstado: [['Activos', activos], ['Inactivos', inactivos]],
    nominaPorMes: nominaPorMes,
    horasPorEmpleado: horasPorEmpleado,
    vacacionesPorEstado: vacacionesPorEstado
  };
}


// ===================================================================
// MÓDULO: VISIBILIDAD DE MÓDULOS EN EL MENÚ
// ===================================================================
// Permite ocultar del menú lateral los módulos que una empresa no usa.
// Guarda solo la LISTA de vistas desactivadas (todo lo demás queda
// visible por defecto). Dashboard y Configuración nunca se desactivan.
// ===================================================================

var CLAVE_MODULOS_DESACTIVADOS = 'MODULOS_DESACTIVADOS';
var MODULOS_SIEMPRE_VISIBLES = ['dashboard', 'configuracion'];

function obtenerModulosDesactivados() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_MODULOS_DESACTIVADOS);
  if (!raw) return [];
  try {
    var lista = JSON.parse(raw);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

function guardarModulosDesactivados(lista, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  lista = (Array.isArray(lista) ? lista : []).filter(function (v) {
    return MODULOS_SIEMPRE_VISIBLES.indexOf(v) === -1;
  });
  PropertiesService.getScriptProperties().setProperty(CLAVE_MODULOS_DESACTIVADOS, JSON.stringify(lista));
  return { ok: true, mensaje: 'Módulos actualizados.' };
}


// ===================================================================
// MÓDULO: ALERTAS POR CORREO ELECTRÓNICO
// ===================================================================
// Permite configurar alertas automáticas enviadas con MailApp.
// Un trigger diario (Google Apps Script) ejecuta verificarAlertas()
// cada mañana. El usuario puede activarlo/desactivarlo desde la UI.
// ===================================================================

var CLAVE_CONFIG_ALERTAS = 'CONFIG_ALERTAS';
var CLAVE_TRIGGER_ID     = 'ALERTA_TRIGGER_ID';
var CLAVE_CONFIG_CORREO  = 'CONFIG_CORREO';


// ===================================================================
// MÓDULO: CONFIGURACIÓN DE CORREO (proveedor de envío)
// ===================================================================

/**
 * Devuelve la configuración del proveedor de correo.
 * Proveedores soportados: 'google' | 'sendgrid' | 'brevo'
 */
function obtenerConfigCorreoInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_CORREO);
  var def = {
    proveedor:  'google',
    fromNombre: 'Sistema RRHH',
    fromEmail:  '',
    apiKey:     '',
    dominio:    ''
  };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function obtenerConfigCorreo() {
  var cfg = obtenerConfigCorreoInterno();
  cfg.apiKey = enmascararSecreto(cfg.apiKey);
  return cfg;
}

/**
 * Guarda la configuración del proveedor de correo.
 * Si apiKey llega vacía no sobreescribe la guardada (evita borrarla al editar).
 */
function guardarConfigCorreo(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var actual = obtenerConfigCorreoInterno();
  if (!cfg.apiKey) cfg.apiKey = actual.apiKey; // preservar key existente si no se cambia
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_CORREO, JSON.stringify(cfg));
  return { ok: true, mensaje: 'Configuración de correo guardada.' };
}

/**
 * Envía un correo de prueba al usuario actual para verificar la config.
 */
function probarConfigCorreo(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var destino = Session.getActiveUser().getEmail();
  if (!destino) destino = obtenerConfigAlertas().destinatarios.split(',')[0].trim();
  if (!destino) return { ok: false, mensaje: 'No se pudo determinar el correo del destinatario. Configura los destinatarios en la sección Alertas.' };

  try {
    var cfg = obtenerConfigCorreoInterno();
    _enviarCorreo([destino], '🧪 [PRUEBA] Configuración de correo — Sistema RRHH',
      '<p>✅ El proveedor <strong>' + cfg.proveedor + '</strong> funciona correctamente.</p>' +
      '<p>Este mensaje fue enviado desde el módulo de Configuración del Sistema RRHH.</p>');
    return { ok: true, mensaje: 'Correo de prueba enviado a <strong>' + destino + '</strong>.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/** Devuelve la configuración de alertas desde PropertiesService. */
function obtenerConfigAlertas() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_ALERTAS);
  var def = {
    destinatarios:              '',
    vacacionesPendientesActiva: true,
    nominaMensualActiva:        true,
    nominaMensualDia:           25,
    resumenSemanalActivo:       false,
    cumpleaniosActiva:          false
  };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

/** Guarda la configuración de alertas. */
function guardarConfigAlertas(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_ALERTAS, JSON.stringify(cfg));
  return { ok: true };
}

/**
 * Función principal de alertas — llamada por el trigger diario (8 a.m.).
 * También se puede invocar manualmente desde appsscript.google.com.
 */
function verificarAlertas() {
  // Cada bloque va en su propio try/catch: si uno falla (ej. una fecha
  // malformada en un empleado), los demás avisos igual deben salir en
  // vez de que todo el chequeo diario se aborte en silencio.
  function _intentar(nombre, fn) {
    try {
      fn();
    } catch (e) {
      try { registrarBitacora('error', 'Sistema', '', 'Alerta "' + nombre + '" falló: ' + e.message); } catch (e2) {}
    }
  }

  var cfg    = obtenerConfigAlertas();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  var waCfg  = obtenerConfigWhatsAppInterno();
  var waListo = waCfg.activo && waCfg.telefono && waCfg.apikey;

  if (!emails.length && !waListo) return;

  if (emails.length) {
    if (cfg.vacacionesPendientesActiva) {
      _intentar('vacaciones pendientes', function () {
        var msgVac = _cuerpoVacacionesPendientes();
        if (msgVac) _enviarCorreo(emails, '🏖 Vacaciones pendientes de aprobación', msgVac);
      });
    }

    if (cfg.nominaMensualActiva) {
      _intentar('nómina mensual', function () {
        var hoy = new Date();
        if (hoy.getDate() >= Number(cfg.nominaMensualDia)) {
          var msgNom = _cuerpoNominaMensual();
          if (msgNom) _enviarCorreo(emails, '💰 Nómina mensual no generada', msgNom);
        }
      });
    }

    if (cfg.resumenSemanalActivo && new Date().getDay() === 1) {
      _intentar('resumen semanal', function () {
        _enviarCorreo(emails, '📊 Resumen semanal de RRHH', _cuerpoResumenSemanal());
      });
    }

    if (cfg.cumpleaniosActiva && new Date().getDate() === 1) {
      _intentar('cumpleaños', function () {
        var msgCump = _cuerpoProximosCumpleanios();
        if (msgCump) _enviarCorreo(emails, '🎂 Cumpleaños de empleados este mes', msgCump);
      });
    }
  }

  if (waListo) {
    _intentar('whatsapp', function () { _enviarAlertasWhatsApp(cfg, waCfg); });
  }
}

/** Genera el cuerpo HTML para vacaciones pendientes. */
function _cuerpoVacacionesPendientes() {
  var vacs      = leerTabla(HOJAS.VACACIONES);
  var pendientes = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'pendiente'; });
  if (!pendientes.length) return null;

  var mapa = mapaEmpleados();
  var filas = pendientes.map(function (v) {
    var nombre = escaparHtmlEmail(mapa[v.empleado_id] || v.empleado_id || '—');
    return '<tr>' +
      '<td style="padding:6px 10px">' + nombre + '</td>' +
      '<td style="padding:6px 10px">' + (v.fecha_inicio || '—') + '</td>' +
      '<td style="padding:6px 10px">' + (v.fecha_fin    || '—') + '</td>' +
      '<td style="padding:6px 10px">' + (v.dias         || '—') + ' días</td>' +
      '</tr>';
  }).join('');

  return '<p>Hay <strong>' + pendientes.length + ' solicitud(es) de vacaciones</strong> ' +
    'pendientes de aprobación:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
      'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<thead><tr style="background:#f3f4f6">' +
      '<th style="padding:6px 10px">Empleado</th>' +
      '<th style="padding:6px 10px">Desde</th>' +
      '<th style="padding:6px 10px">Hasta</th>' +
      '<th style="padding:6px 10px">Duración</th>' +
    '</tr></thead>' +
    '<tbody>' + filas + '</tbody>' +
    '</table>' +
    '<p style="margin-top:14px">Ingresa al sistema para aprobar o rechazar estas solicitudes.</p>';
}

/** Genera el cuerpo HTML para nómina mensual no generada. */
function _cuerpoNominaMensual() {
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var noms      = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var activos   = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return estadoNormalizado(e.estado) === 'activo';
  });
  if (!activos.length) return null;
  var conNomina = {};
  noms.forEach(function (n) { conNomina[String(n.empleado_id)] = true; });
  var faltantes = activos.filter(function (e) { return !conNomina[String(e.id)]; });
  if (!faltantes.length) return null;

  var lista = faltantes.map(function (e) {
    return '<li>' + escaparHtmlEmail(e.nombre) + '</li>';
  }).join('');

  return '<p>Faltan <strong>' + faltantes.length + ' empleado(s) activo(s)</strong> sin nómina en ' +
    '<strong>' + mesActual + '</strong>:</p><ul>' + lista + '</ul>' +
    '<p>Ingresa al módulo de <strong>Nómina</strong> y genera los recibos pendientes.</p>';
}

/** Genera el cuerpo HTML del resumen semanal. */
function _cuerpoResumenSemanal() {
  var emps    = leerTabla(HOJAS.EMPLEADOS);
  var activos = emps.filter(function (e) { return estadoNormalizado(e.estado) === 'activo'; }).length;
  var inactivos = emps.length - activos;

  var vacs    = leerTabla(HOJAS.VACACIONES);
  var vacPend = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'pendiente'; }).length;
  var vacApro = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'aprobada'; }).length;

  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var nominaMes = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var totalNeto = nominaMes.reduce(function (s, n) { return s + (Number(n.neto) || 0); }, 0);

  return '<p>Resumen del sistema de RRHH al <strong>' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy') + '</strong>:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
      'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<tbody>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Empleados activos</strong></td>' +
        '<td style="padding:6px 14px">' + activos + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Empleados inactivos</strong></td>' +
        '<td style="padding:6px 14px">' + inactivos + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Vacaciones pendientes</strong></td>' +
        '<td style="padding:6px 14px">' + vacPend + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Vacaciones aprobadas</strong></td>' +
        '<td style="padding:6px 14px">' + vacApro + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Nómina ' + mesActual + '</strong></td>' +
        '<td style="padding:6px 14px">₡' + totalNeto.toLocaleString() + ' neto total</td></tr>' +
    '</tbody></table>';
}

/** Genera el HTML completo del correo a partir del cuerpo interior. */
function _plantillaCorreo(cuerpoHtml) {
  var cfg = obtenerConfigCorreoInterno();
  return '<div style="font-family:-apple-system,Arial,sans-serif;max-width:620px;margin:0 auto">' +
    '<div style="background:#2563eb;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
      '<h2 style="margin:0;font-size:18px">' + (cfg.fromNombre || 'Sistema RRHH') + '</h2>' +
    '</div>' +
    '<div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">' +
      cuerpoHtml +
      '<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">' +
      '<p style="color:#6b7280;font-size:12px">Correo generado automáticamente por el Sistema RRHH. ' +
        'No responder a este mensaje.</p>' +
    '</div>' +
  '</div>';
}

/**
 * Despacha el correo al proveedor configurado.
 * Proveedor 'google' → MailApp | 'sendgrid' → SendGrid API | 'brevo' → Brevo API
 */
function _enviarCorreo(emails, asunto, cuerpoHtml) {
  var cfg  = obtenerConfigCorreoInterno();
  var html = _plantillaCorreo(cuerpoHtml);

  if (cfg.proveedor === 'sendgrid') {
    _enviarSendGrid(emails, asunto, html, cfg);
  } else if (cfg.proveedor === 'brevo') {
    _enviarBrevo(emails, asunto, html, cfg);
  } else {
    // Google MailApp (sin configuración extra requerida)
    emails.forEach(function (to) {
      MailApp.sendEmail({
        to:       to,
        subject:  asunto,
        htmlBody: html,
        name:     cfg.fromNombre || 'Sistema RRHH',
        replyTo:  cfg.fromEmail  || ''
      });
    });
  }
}

/** Envía vía SendGrid Transactional Email API v3. */
function _enviarSendGrid(emails, asunto, html, cfg) {
  if (!cfg.apiKey)    throw new Error('SendGrid: falta la API Key.');
  if (!cfg.fromEmail) throw new Error('SendGrid: falta el correo del remitente.');

  var payload = {
    personalizations: [{ to: emails.map(function (e) { return { email: e }; }) }],
    from:    { email: cfg.fromEmail, name: cfg.fromNombre || 'Sistema RRHH' },
    subject: asunto,
    content: [{ type: 'text/html', value: html }]
  };
  var res = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', {
    method:           'post',
    contentType:      'application/json',
    headers:          { Authorization: 'Bearer ' + cfg.apiKey },
    payload:          JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('SendGrid error ' + code + ': ' + res.getContentText().slice(0, 200));
  }
}

/** Envía vía Brevo (Sendinblue) Transactional Email API v3. */
function _enviarBrevo(emails, asunto, html, cfg) {
  if (!cfg.apiKey)    throw new Error('Brevo: falta la API Key.');
  if (!cfg.fromEmail) throw new Error('Brevo: falta el correo del remitente.');

  var payload = {
    sender:      { email: cfg.fromEmail, name: cfg.fromNombre || 'Sistema RRHH' },
    to:          emails.map(function (e) { return { email: e }; }),
    subject:     asunto,
    htmlContent: html
  };
  var res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method:           'post',
    contentType:      'application/json',
    headers:          { 'api-key': cfg.apiKey },
    payload:          JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('Brevo error ' + code + ': ' + res.getContentText().slice(0, 200));
  }
}

/**
 * Envía un correo de prueba inmediato para verificar que la configuración funciona.
 * @param {string} tipo  'vacaciones' | 'nomina' | 'resumen' | 'general'
 */
function probarAlerta(tipo, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var cfg    = obtenerConfigAlertas();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return { ok: false, mensaje: 'Agrega al menos un destinatario antes de probar.' };

  var cuerpo, asunto;

  if (tipo === 'vacaciones') {
    cuerpo = _cuerpoVacacionesPendientes() ||
      '<p>✅ No hay vacaciones pendientes en este momento.</p>';
    asunto = '🧪 [PRUEBA] Vacaciones pendientes de aprobación';
  } else if (tipo === 'nomina') {
    cuerpo = _cuerpoNominaMensual() ||
      '<p>✅ La nómina del mes actual ya fue generada.</p>';
    asunto = '🧪 [PRUEBA] Nómina mensual';
  } else if (tipo === 'resumen') {
    cuerpo = _cuerpoResumenSemanal();
    asunto = '🧪 [PRUEBA] Resumen semanal de RRHH';
  } else {
    cuerpo = '<p>✅ El sistema de alertas de correo está configurado correctamente.</p>' +
      '<p>Los correos automáticos llegarán según la configuración establecida.</p>';
    asunto = '🧪 [PRUEBA] Alerta de prueba — Sistema RRHH';
  }

  _enviarCorreo(emails, asunto, cuerpo);
  return { ok: true, mensaje: 'Correo de prueba enviado a: ' + emails.join(', ') };
}

/** Crea (o reactiva) el trigger diario a las 8 a.m. */
function activarTriggerAlertas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  desactivarTriggerAlertas(); // elimina duplicados
  var t = ScriptApp.newTrigger('verificarAlertas')
    .timeBased().everyDays(1).atHour(8).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_TRIGGER_ID, t.getUniqueId());
  return { ok: true, mensaje: 'Verificación diaria activada (todos los días a las 8 a.m.).' };
}

/** Elimina el trigger diario si existe. */
function desactivarTriggerAlertas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarAlertas') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_TRIGGER_ID);
  return { ok: true, mensaje: 'Verificación diaria desactivada.' };
}

/** Devuelve si el trigger está activo actualmente. */
function estadoTriggerAlertas() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'verificarAlertas';
  });
  return { activo: activo };
}


// ===================================================================
// MÓDULO: IMPORTACIÓN MASIVA (Excel / CSV)
// ===================================================================
// Recibe filas ya mapeadas desde el frontend y las inserta en la
// pestaña correspondiente, validando y reportando duplicados/errores.
// ===================================================================

/**
 * Importa un arreglo de objetos en la entidad indicada.
 * Las claves de cada objeto ya corresponden a nuestros nombres de campo
 * (el frontend aplica el mapeo de columnas antes de enviar).
 *
 * @param {string}   entidad  Clave de HOJAS: 'EMPLEADOS' | 'DEPARTAMENTOS'.
 * @param {Object[]} filas    Arreglo de objetos con los datos.
 * @return {Object}  {ok, creados, omitidos, errores:[{fila,motivo}], mensaje}
 */
function importarDatos(entidad, filas, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!HOJAS[entidad]) {
    return { ok: false, mensaje: 'Entidad no reconocida: ' + entidad };
  }
  if (!filas || filas.length === 0) {
    return { ok: false, mensaje: 'El archivo no contiene filas de datos.' };
  }

  var creados = 0, omitidos = 0, errores = [];
  var hoja = getHoja(HOJAS[entidad]);

  // Índices construidos UNA sola vez (en vez de releer la hoja completa
  // por cada fila importada, que es O(n²) con importaciones grandes).
  var cedulasExistentes = {};
  var deptosExistentes = {};
  if (entidad === 'EMPLEADOS') {
    leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
      var cedNorm = String(e.cedula).trim().toUpperCase();
      cedulasExistentes[cedNorm] = true;
    });
  } else if (entidad === 'DEPARTAMENTOS') {
    leerTabla(HOJAS.DEPARTAMENTOS).forEach(function (d) {
      deptosExistentes[String(d.nombre).trim().toLowerCase()] = true;
    });
  }

  filas.forEach(function (fila, idx) {
    var numFila = idx + 2; // fila real en el Excel (encabezados en 1)
    try {
      if (entidad === 'EMPLEADOS') {
        var emp = {
          nombre:        String(fila.nombre        || '').trim(),
          cedula:        String(fila.cedula         || '').trim().toUpperCase(),
          departamento:  String(fila.departamento  || '').trim(),
          puesto:        String(fila.puesto         || '').trim(),
          fecha_ingreso: String(fila.fecha_ingreso  || '').trim(),
          salario:       fila.salario,
          estado:        String(fila.estado || 'activo').trim().toLowerCase(),
          correo:        String(fila.correo || '').trim()
        };
        if (emp.estado !== 'activo' && emp.estado !== 'inactivo') emp.estado = 'activo';

        var error = validarEmpleado(emp);
        if (error) { errores.push({ fila: numFila, motivo: error }); return; }
        if (cedulasExistentes[emp.cedula]) { omitidos++; return; }

        hoja.appendRow([generarId('EMP'), emp.nombre, emp.cedula,
          emp.departamento, emp.puesto, formatearFecha(emp.fecha_ingreso),
          Number(emp.salario) || 0, emp.estado,
          fila.fecha_nacimiento ? formatearFecha(String(fila.fecha_nacimiento)) : '',
          String(fila.telefono || '').trim()
        ].concat(_camposExtraEmpleado(fila, null)));
        cedulasExistentes[emp.cedula] = true;
        creados++;

      } else if (entidad === 'DEPARTAMENTOS') {
        var dep = {
          nombre:      String(fila.nombre      || '').trim(),
          responsable: String(fila.responsable || '').trim()
        };
        if (!dep.nombre) { errores.push({ fila: numFila, motivo: 'Nombre vacío.' }); return; }
        var claveDepto = dep.nombre.toLowerCase();
        if (deptosExistentes[claveDepto]) { omitidos++; return; }
        hoja.appendRow([generarId('DEP'), dep.nombre, dep.responsable]);
        deptosExistentes[claveDepto] = true;
        creados++;
      }
    } catch (e) {
      errores.push({ fila: numFila, motivo: e.message });
    }
  });

  return {
    ok:      true,
    creados: creados,
    omitidos: omitidos,
    errores: errores,
    mensaje: creados + ' registros importados, ' + omitidos + ' omitidos por duplicado.'
  };
}


// ===================================================================
// MÓDULO: CARGA COMPLETA DESDE EXCEL
// ===================================================================
// Recibe todas las pestañas ya convertidas por el frontend
// (Js_CargaExcel parsea el Excel de la empresa con SheetJS) y las
// escribe en la hoja de Google de una sola vez.
// ===================================================================

/**
 * Prefijos de ID por pestaña, para generar ids si el archivo no los trae.
 */
var PREFIJOS_ID = {
  Empleados: 'EMP', Departamentos: 'DEP', Asistencia: 'ASI', Vacaciones: 'VAC',
  Nomina: 'NOM', HistorialSalarios: 'HSA', Capacitaciones: 'CAP', Evaluaciones: 'EVA',
  Prestamos: 'PRE', HorasExtra: 'HEX', Activos: 'ACT', Turnos: 'TUR',
  Incapacidades: 'INC', Feriados: 'FER', Liquidaciones: 'LIQ'
};

/**
 * Carga masiva de toda la base de datos.
 *
 * @param {Object} datos  { NombrePestana: [ {campo: valor, ...}, ... ], ... }
 *                        Las claves de cada objeto son los nombres de campo
 *                        de ENCABEZADOS (el frontend ya hizo la conversión).
 * @param {string} modo   'agregar'    → añade al final (omite duplicados básicos)
 *                        'reemplazar' → borra los datos actuales de cada pestaña
 *                                       incluida en el archivo y escribe los nuevos.
 * @return {Object} {ok, resumen:[{pestana, creados, omitidos}], mensaje}
 */
function cargarBaseCompleta(datos, modo, token) {
  if (!token) {
    return { ok: false, mensaje: 'Acceso denegado. Token requerido.' };
  }
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  if (!datos || typeof datos !== 'object') {
    return { ok: false, mensaje: 'No se recibieron datos.' };
  }
  var reemplazar = (modo === 'reemplazar');
  var resumen = [];

  Object.keys(ENCABEZADOS).forEach(function (tab) {
    var filas = datos[tab];
    if (!filas || !filas.length) return;

    var encabezados = ENCABEZADOS[tab];
    var hoja = getHoja(tab);

    if (reemplazar) {
      var ultimaFila = hoja.getLastRow();
      if (ultimaFila > 1) {
        hoja.getRange(2, 1, ultimaFila - 1, Math.max(hoja.getLastColumn(), encabezados.length)).clearContent();
      }
    }

    // Claves ya existentes para omitir duplicados en modo 'agregar'.
    var existentes = {};
    if (!reemplazar) {
      leerTabla(tab).forEach(function (r) {
        var clave = _claveDuplicado(tab, r);
        if (clave) existentes[clave] = true;
      });
    }

    var omitidos = 0;
    var nuevas = [];
    filas.forEach(function (f) {
      var clave = _claveDuplicado(tab, f);
      if (clave && existentes[clave]) { omitidos++; return; }
      if (clave) existentes[clave] = true;
      nuevas.push(encabezados.map(function (campo) {
        if (campo === 'id' && !f.id) return generarId(PREFIJOS_ID[tab] || 'ID');
        var v = f[campo];
        return (v === undefined || v === null) ? '' : v;
      }));
    });

    if (nuevas.length) {
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, encabezados.length).setValues(nuevas);
    }
    resumen.push({ pestana: tab, creados: nuevas.length, omitidos: omitidos });
  });

  if (!resumen.length) {
    return { ok: false, mensaje: 'El archivo no contiene pestañas con datos reconocibles.' };
  }
  var totales = resumen.map(function (r) { return r.pestana + ': ' + r.creados; }).join(', ');
  registrarBitacora('importar', 'BaseCompleta', '',
    (reemplazar ? 'Reemplazo' : 'Carga') + ' desde Excel → ' + totales);
  return { ok: true, resumen: resumen, mensaje: 'Carga completada. ' + totales + '.' };
}

/**
 * Clave para detectar duplicados por pestaña en modo 'agregar'.
 * Devuelve '' si la pestaña no tiene criterio de duplicado (siempre agrega).
 */
function _claveDuplicado(tab, fila) {
  if (tab === 'Empleados')     return String(fila.cedula || '').trim();
  if (tab === 'Departamentos') return String(fila.nombre || '').trim().toLowerCase();
  if (tab === 'Feriados')      return formatearFecha(fila.fecha);
  if (tab === 'Asistencia')    return [fila.empleado_id, formatearFecha(fila.fecha)].join('|');
  if (tab === 'Vacaciones')    return [fila.empleado_id, formatearFecha(fila.fecha_inicio), formatearFecha(fila.fecha_fin)].join('|');
  if (tab === 'Incapacidades') return [fila.empleado_id, formatearFecha(fila.fecha_desde), formatearFecha(fila.fecha_hasta)].join('|');
  if (tab === 'Liquidaciones') return [fila.empleado_id, formatearFecha(fila.fecha_salida)].join('|');
  if (fila && fila.id)         return 'id:' + fila.id;
  return '';
}


// ===================================================================
// MÓDULO: CONFIGURACIÓN (archivos de Google)
// ===================================================================
// Permite conectar/verificar la hoja de Google que sirve de base de
// datos y crear automáticamente las pestañas con sus encabezados.
// ===================================================================

/**
 * Devuelve el estado actual de la conexión con Google Sheets:
 * - si hay un ID configurado o se usa la hoja ligada,
 * - el nombre y la URL del libro,
 * - y, por cada pestaña esperada, si existe y cuántos registros tiene.
 *
 * @return {Object} información para la pantalla de Configuración.
 */
function obtenerConfiguracion() {
  var idGuardado = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);

  var info = {
    idConfigurado: idGuardado || '',
    usandoHojaLigada: !idGuardado,
    conectado: false,
    nombreLibro: '',
    urlLibro: '',
    idLibro: '',
    pestanas: [],
    error: ''
  };

  try {
    var libro = getLibro();
    info.conectado = true;
    info.nombreLibro = libro.getName();
    info.urlLibro = libro.getUrl();
    info.idLibro = libro.getId();

    // Estado de cada pestaña esperada.
    Object.keys(HOJAS).forEach(function (clave) {
      var nombre = HOJAS[clave];
      var hoja = libro.getSheetByName(nombre);
      var registros = 0;
      if (hoja) {
        // Filas de datos = total de filas con contenido - 1 (encabezados).
        registros = Math.max(0, hoja.getLastRow() - 1);
      }
      info.pestanas.push({
        nombre: nombre,
        existe: !!hoja,
        registros: registros,
        columnas: (ENCABEZADOS[nombre] || []).join(' · ')
      });
    });
  } catch (e) {
    info.error = e.message;
  }
  return info;
}

/**
 * Guarda el ID de la hoja de Google que se usará como base de datos.
 * Valida que el ID se pueda abrir antes de guardarlo.
 *
 * @param {string} id  ID de la hoja (la parte larga de la URL).
 * @return {Object} {ok, mensaje}
 */
function guardarIdHoja(id, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  id = String(id || '').trim();
  if (!id) {
    return { ok: false, mensaje: 'Debes indicar el ID de la hoja.' };
  }
  // Si pegan la URL completa, extraemos el ID (entre /d/ y /edit).
  var m = id.match(/\/d\/([a-zA-Z0-9\-_]+)/);
  if (m) id = m[1];

  try {
    var libro = SpreadsheetApp.openById(id); // valida acceso
    PropertiesService.getScriptProperties().setProperty(CLAVE_ID_HOJA, id);
    return { ok: true, mensaje: 'Hoja conectada: "' + libro.getName() + '".' };
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo abrir esa hoja. Verifica el ID y ' +
      'que tu cuenta tenga acceso. Detalle: ' + e.message };
  }
}

/**
 * Crea una hoja de Google NUEVA, la deja con todas las pestañas y
 * encabezados listos, y la conecta como base de datos del sistema.
 * Útil para usuarios que aún no tienen ninguna hoja.
 *
 * @param {string} nombre  nombre para la hoja nueva (opcional).
 * @return {Object} {ok, mensaje, url?, id?}
 */
function crearHojaNueva(nombre, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  nombre = String(nombre || '').trim() || 'Base RRHH';
  try {
    // 1) Crear el libro nuevo en el Drive del usuario.
    var libro = SpreadsheetApp.create(nombre);
    var id = libro.getId();
    var hojaInicial = libro.getSheets()[0]; // pestaña vacía por defecto

    // 2) Conectarlo como hoja activa (getLibro lo abrirá por este ID).
    PropertiesService.getScriptProperties().setProperty(CLAVE_ID_HOJA, id);

    // 3) Crear todas las pestañas con sus encabezados.
    Object.keys(HOJAS).forEach(function (clave) { getHoja(HOJAS[clave]); });

    // 4) Borrar la pestaña inicial vacía (si no es una de las nuestras).
    var nombresValidos = Object.keys(HOJAS).map(function (k) { return HOJAS[k]; });
    if (nombresValidos.indexOf(hojaInicial.getName()) === -1) {
      libro.deleteSheet(hojaInicial);
    }

    return {
      ok: true,
      mensaje: 'Hoja "' + nombre + '" creada y conectada con sus pestañas.',
      url: libro.getUrl(),
      id: id
    };
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo crear la hoja: ' + e.message };
  }
}

/**
 * Vuelve a usar la hoja ligada al proyecto (borra el ID configurado).
 * @return {Object} {ok, mensaje}
 */
function usarHojaLigada(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  PropertiesService.getScriptProperties().deleteProperty(CLAVE_ID_HOJA);
  var activa = SpreadsheetApp.getActiveSpreadsheet();
  if (!activa) {
    return { ok: false, mensaje: 'Este proyecto no está ligado a ninguna hoja. ' +
      'Configura un ID en su lugar.' };
  }
  return { ok: true, mensaje: 'Ahora se usa la hoja ligada: "' + activa.getName() + '".' };
}

// ===================================================================
// MÓDULO: BITÁCORA DE CAMBIOS
// ===================================================================

/**
 * Registra un evento en bitácora de auditoría.
 * Fase 4 - Item 18: Auditoría completa con JSON antes/después.
 * @param {string} accion - crear, actualizar, eliminar, respaldo, error, etc.
 * @param {string} entidad - tipo de entidad (Empleados, Nómina, etc.)
 * @param {string} entidadId - ID de la entidad afectada
 * @param {string} resumen - descripción del cambio (puede incluir valores antes/después)
 * @param {Object} [cambios] - opcional: {antes: {...}, despues: {...}} para auditoría detallada
 */
function registrarBitacora(accion, entidad, entidadId, resumen, cambios) {
  try {
    var hoja = getHoja(HOJAS.BITACORA);
    var usuario = '';
    try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}

    var detalles = resumen || '';
    var jsonCambios = '';

    if (cambios) {
      try {
        // Guardar JSON completo de cambios (limitado a 5000 chars para Sheets)
        jsonCambios = JSON.stringify(cambios).substring(0, 5000);
        detalles += ' | JSON: ' + jsonCambios;
      } catch (e) { /* no romper por fallo de serialización */ }
    }

    // Agregar: id, timestamp, usuario, acción, entidad, entidadId, resumen, jsonCambios
    hoja.appendRow([
      generarId('BIT'),
      new Date(),
      usuario,
      accion,
      entidad,
      entidadId || '',
      detalles,
      jsonCambios  // Nueva columna para auditoría estructurada
    ]);
  } catch (e) { /* no interrumpir operaciones por fallo de bitácora */ }
}

/**
 * Consulta auditoría con filtros.
 * @param {string} [entidad] - Filtrar por tipo de entidad (opcional)
 * @param {string} [entidadId] - Filtrar por ID (opcional)
 * @param {number} [limite] - Máximo de registros a devolver (default 100)
 * @return {Object[]} Registros de auditoría
 */
function consultarAuditoria(entidad, entidadId, limite) {
  var registros = leerTabla(HOJAS.BITACORA) || [];

  if (entidad) {
    registros = registros.filter(function (r) { return String(r.entidad) === String(entidad); });
  }
  if (entidadId) {
    registros = registros.filter(function (r) { return String(r.entidad_id) === String(entidadId); });
  }

  // Ordenar por fecha descendente y limitar
  registros = registros.reverse().slice(0, limite || 100);

  // Parsear JSON si existe
  registros.forEach(function (r) {
    if (r.resumen && r.resumen.includes('JSON:')) {
      try {
        var jsonStr = r.resumen.substring(r.resumen.indexOf('JSON:') + 6);
        r.cambios = JSON.parse(jsonStr);
      } catch (e) { /* ignorar si no parsea */ }
    }
  });

  return registros;
}

function listarBitacora(limite) {
  var registros = leerTabla(HOJAS.BITACORA);
  registros.forEach(function (r) {
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? 1 : -1; });
  if (limite) registros = registros.slice(0, Number(limite));
  return registros;
}


// ===================================================================
// MÓDULO: HISTORIAL DE SALARIOS
// ===================================================================

function listarHistorialSalario(empleadoId) {
  var historial = leerTabla(HOJAS.HISTORIAL_SALARIOS);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    historial = historial.filter(function (h) {
      return String(h.empleado_id) === String(empleadoId);
    });
  }
  historial.forEach(function (h) {
    h.empleado_nombre  = nombres[h.empleado_id] || h.empleado_id;
    h.fecha            = formatearFecha(h.fecha);
    h.salario_anterior = Number(h.salario_anterior) || 0;
    h.salario_nuevo    = Number(h.salario_nuevo) || 0;
  });
  historial.sort(function (a, b) { return b.fecha > a.fecha ? -1 : 1; }).reverse();
  return historial;
}


// ===================================================================
// UTILIDADES DE CÁLCULO DE NÓMINA (Semanal vs Quincenal)
// ===================================================================

/**
 * Calcula el salario diario según la periodicidad de pago.
 * @param {number} salarioBase - Salario mensual
 * @param {string} tipoNomina - 'semanal' o 'quincenal'
 * @return {number} Salario diario
 */
function calcularSalarioDiario(salarioBase, tipoNomina) {
  var salario = Number(salarioBase) || 0;
  var tipo = String(tipoNomina).toLowerCase().trim();

  if (tipo === 'semanal') {
    return Math.round((salario / 7) * 100) / 100;
  } else if (tipo === 'quincenal') {
    return Math.round((salario / 15) * 100) / 100;
  } else {
    return Math.round((salario / 30) * 100) / 100;
  }
}

/**
 * Obtiene información del empleado con cálculos según periodicidad.
 */
function obtenerEmpleadoCompleto(empleadoId) {
  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(empleadoId);
  })[0];
  if (!emp) return null;

  var tipo = String(emp.tipo_nomina).toLowerCase().trim() || 'mensual';
  var diasPeriodo = tipo === 'semanal' ? 7 : (tipo === 'quincenal' ? 15 : 30);

  return {
    id: emp.id,
    nombre: emp.nombre,
    salario: Number(emp.salario) || 0,
    tipo_nomina: tipo,
    dias_periodo: diasPeriodo,
    salario_diario: calcularSalarioDiario(emp.salario, tipo),
    fecha_ingreso: emp.fecha_ingreso,
    estado: emp.estado
  };
}

// ===================================================================
// MÓDULO: BALANCE DE VACACIONES
// ===================================================================

function obtenerBalanceVacaciones(empleadoId) {
  var emp = obtenerEmpleadoCompleto(empleadoId);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var diasPorAnio   = 15;
  var fechaIngreso  = new Date(emp.fecha_ingreso);
  var ahora         = new Date();
  var aniosTrabajados = (ahora - fechaIngreso) / (365.25 * 24 * 60 * 60 * 1000);
  var diasAcumulados  = Math.floor(Math.max(0, aniosTrabajados) * diasPorAnio);

  var diasUsados = leerTabla(HOJAS.VACACIONES)
    .filter(function (v) {
      return String(v.empleado_id) === String(empleadoId) &&
             String(v.estado).toLowerCase() === 'aprobada';
    })
    .reduce(function (sum, v) { return sum + (Number(v.dias) || 0); }, 0);

  var diasDisponibles = Math.max(0, diasAcumulados - diasUsados);

  return {
    ok: true,
    nombre:             emp.nombre,
    tipo_nomina:        emp.tipo_nomina,
    dias_periodo:       emp.dias_periodo,
    salario:            emp.salario,
    salario_diario:     emp.salario_diario,
    diasAcumulados:     diasAcumulados,
    diasUsados:         diasUsados,
    diasDisponibles:    diasDisponibles,
    valor_vacaciones:   Math.round(diasDisponibles * emp.salario_diario * 100) / 100
  };
}


// ===================================================================
// MÓDULO: CAPACITACIONES
// ===================================================================

function listarCapacitaciones(empleadoId) {
  var lista  = leerTabla(HOJAS.CAPACITACIONES);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    lista = lista.filter(function (c) {
      return String(c.empleado_id) === String(empleadoId);
    });
  }
  lista.forEach(function (c) {
    c.empleado_nombre = nombres[c.empleado_id] || c.empleado_id;
    c.fecha_inicio    = formatearFecha(c.fecha_inicio);
    c.fecha_fin       = formatearFecha(c.fecha_fin);
  });
  return lista;
}

function crearCapacitacion(cap, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!cap || !cap.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!cap.curso || !String(cap.curso).trim()) {
    return { ok: false, mensaje: 'El nombre del curso es obligatorio.' };
  }
  if (cap.fecha_inicio && cap.fecha_fin && new Date(cap.fecha_fin) < new Date(cap.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var id   = generarId('CAP');
  hoja.appendRow([id, cap.empleado_id, String(cap.curso).trim(),
    cap.institucion || '',
    formatearFecha(cap.fecha_inicio),
    formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso',
    cap.certificado_url || '']);
  registrarBitacora('crear', 'Capacitaciones', id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación registrada.', id: id };
}

function actualizarCapacitacion(cap, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!cap || !cap.id) return { ok: false, mensaje: 'Falta el identificador.' };
  if (cap.fecha_inicio && cap.fecha_fin && new Date(cap.fecha_fin) < new Date(cap.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, cap.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.getRange(fila, 1, 1, 8).setValues([[cap.id, cap.empleado_id,
    String(cap.curso).trim(), cap.institucion || '',
    formatearFecha(cap.fecha_inicio), formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso', cap.certificado_url || '']]);
  registrarBitacora('actualizar', 'Capacitaciones', cap.id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación actualizada.' };
}

function eliminarCapacitacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.deleteRow(fila);
  registrarBitacora('eliminar', 'Capacitaciones', id, '');
  return { ok: true, mensaje: 'Capacitación eliminada.' };
}


// ===================================================================
// MÓDULO: EVALUACIONES DE DESEMPEÑO
// ===================================================================

function listarEvaluaciones(empleadoId) {
  var lista  = leerTabla(HOJAS.EVALUACIONES);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    lista = lista.filter(function (e) {
      return String(e.empleado_id) === String(empleadoId);
    });
  }
  lista.forEach(function (e) {
    e.empleado_nombre = nombres[e.empleado_id] || e.empleado_id;
    e.fecha           = formatearFecha(e.fecha);
    e.calificacion    = Number(e.calificacion) || 0;
  });
  return lista;
}

function crearEvaluacion(ev, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!ev || !ev.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!ev.periodo || !String(ev.periodo).trim()) {
    return { ok: false, mensaje: 'El período es obligatorio.' };
  }
  var cal = Number(ev.calificacion);
  if (isNaN(cal) || cal < 1 || cal > 10) {
    return { ok: false, mensaje: 'La calificación debe ser un número entre 1 y 10.' };
  }
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var id   = generarId('EVA');
  hoja.appendRow([id, ev.empleado_id, String(ev.periodo).trim(), cal,
    ev.comentarios || '', ev.evaluador || '',
    formatearFecha(ev.fecha || new Date())]);
  registrarBitacora('crear', 'Evaluaciones', id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación registrada.', id: id };
}

function actualizarEvaluacion(ev, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!ev || !ev.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var cal = Number(ev.calificacion);
  if (isNaN(cal) || cal < 1 || cal > 10) {
    return { ok: false, mensaje: 'La calificación debe ser un número entre 1 y 10.' };
  }
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, ev.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.getRange(fila, 1, 1, 7).setValues([[ev.id, ev.empleado_id,
    String(ev.periodo).trim(), Number(ev.calificacion) || 0,
    ev.comentarios || '', ev.evaluador || '', formatearFecha(ev.fecha)]]);
  registrarBitacora('actualizar', 'Evaluaciones', ev.id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación actualizada.' };
}

function eliminarEvaluacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.deleteRow(fila);
  registrarBitacora('eliminar', 'Evaluaciones', id, '');
  return { ok: true, mensaje: 'Evaluación eliminada.' };
}


// ===================================================================
// MÓDULO: DOCUMENTOS POR EMPLEADO (Google Drive)
// ===================================================================

var CLAVE_CARPETA_DOCS = 'CARPETA_DOCS_ID';

function _getCarpetaRaizDocs() {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_CARPETA_DOCS);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var carpeta = DriveApp.createFolder('RRHH - Documentos de Empleados');
  PropertiesService.getScriptProperties().setProperty(CLAVE_CARPETA_DOCS, carpeta.getId());
  return carpeta;
}

/**
 * Busca la carpeta de un empleado por el PREFIJO estable "EMP_<id>_",
 * ignorando el sufijo con su nombre (que puede cambiar si se corrige
 * o actualiza el nombre del empleado). Si se buscara por nombre
 * completo, un cambio de nombre "perdería" la carpeta ya creada.
 */
function _buscarCarpetaEmpleado(raiz, empleadoId) {
  var prefijo = 'EMP_' + empleadoId + '_';
  var iter = raiz.getFolders();
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.getName().indexOf(prefijo) === 0) return f;
  }
  return null;
}

function crearCarpetaEmpleado(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  try {
    var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
    var raiz     = _getCarpetaRaizDocs();
    var carpeta  = _buscarCarpetaEmpleado(raiz, empleadoId);
    if (!carpeta) {
      var nombre = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
      carpeta = raiz.createFolder(nombre);
    }
    return { ok: true, carpetaUrl: carpeta.getUrl(),
      mensaje: 'Carpeta de documentos lista para ' + emp.nombre };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}

function listarDocumentos(empleadoId) {
  try {
    var raiz = _getCarpetaRaizDocs();
    var emp  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.', documentos: [] };
    var carpetaEmp = _buscarCarpetaEmpleado(raiz, empleadoId);
    if (!carpetaEmp) {
      return { ok: true, documentos: [], carpetaUrl: null };
    }
    var archivos   = carpetaEmp.getFiles();
    var docs       = [];
    while (archivos.hasNext()) {
      var f = archivos.next();
      docs.push({
        id:     f.getId(),
        nombre: f.getName(),
        url:    f.getUrl(),
        fecha:  Utilities.formatDate(f.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
      });
    }
    return { ok: true, documentos: docs, carpetaUrl: carpetaEmp.getUrl() };
  } catch (e) {
    return { ok: false, mensaje: e.message, documentos: [] };
  }
}


// ===================================================================
// MÓDULO: RESPALDO AUTOMÁTICO
// ===================================================================

var CLAVE_RESPALDO_TRIGGER = 'RESPALDO_TRIGGER_ID';

function crearRespaldo(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  return _crearRespaldoInterno();
}

/**
 * Handler del trigger automático diario.
 * Fase 4 - Item 13: Backups mejorados (diarios + mantenimiento de historial).
 */
function crearRespaldoTrigger() {
  var res = _crearRespaldoInterno();
  if (!res.ok) {
    try { registrarBitacora('error', 'Sistema', '', 'Respaldo automático falló: ' + res.mensaje); } catch (e) {}
  } else {
    // Limpiar backups antiguos (>30 días)
    _limpiarBackupAntiguos(30);
  }
}

function _crearRespaldoInterno() {
  try {
    var libro  = getLibro();
    var fecha  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var copia  = libro.copy('[BACKUP ' + fecha + '] ' + libro.getName());

    // Guardar metadata en bitácora
    registrarBitacora('respaldo', 'Sistema', '', 'Backup: ' + copia.getName(), {
      antes: { sheets: libro.getSheets().length },
      despues: { fileId: copia.getId(), url: copia.getUrl() }
    });

    return { ok: true, mensaje: 'Respaldo creado correctamente.', url: copia.getUrl(), id: copia.getId() };
  } catch (e) {
    return { ok: false, mensaje: 'Error al crear respaldo: ' + e.message };
  }
}

/**
 * Elimina backups más antiguos que X días (Fase 4 - Item 13).
 * Mantiene el historial limpio sin acumular archivos.
 * @param {number} diasRetener - Default 30
 */
function _limpiarBackupAntiguos(diasRetener) {
  try {
    diasRetener = diasRetener || 30;
    var fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - diasRetener);

    var carpetaRaiz = DriveApp.getRootFolder();
    var archivos = carpetaRaiz.getFilesByName(/^\[BACKUP/);
    var eliminados = 0;

    while (archivos.hasNext()) {
      var file = archivos.next();
      if (file.getLastUpdated() < fechaLimite) {
        file.setTrashed(true);
        eliminados++;
      }
    }

    if (eliminados > 0) {
      registrarBitacora('mantenimiento', 'Backups', '', 'Limpieza automática: ' + eliminados + ' archivos eliminados');
    }
  } catch (e) {
    // Log silencioso de limpieza para no romper el proceso
  }
}

function activarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  desactivarRespaldoSemanal(token);
  var t = ScriptApp.newTrigger('crearRespaldoTrigger')
    .timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_RESPALDO_TRIGGER, t.getUniqueId());
  return { ok: true, mensaje: 'Respaldo automático semanal activado (domingos a las 2 a.m.).' };
}

function desactivarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'crearRespaldoTrigger' || fn === 'crearRespaldo') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_RESPALDO_TRIGGER);
  return { ok: true, mensaje: 'Respaldo automático desactivado.' };
}

function estadoRespaldo() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    var fn = t.getHandlerFunction();
    return fn === 'crearRespaldoTrigger' || fn === 'crearRespaldo';
  });
  return { activo: activo };
}


// ===================================================================
// MÓDULO: NOTIFICACIONES WHATSAPP (CallMeBot)
// ===================================================================

var CLAVE_CONFIG_WHATSAPP = 'CONFIG_WHATSAPP';
var MAX_CHARS_WHATSAPP = 1500;

function _defConfigWhatsApp() {
  return {
    telefono: '',
    apikey: '',
    activo: false,
    alertaVacaciones: true,
    alertaNomina: true,
    alertaResumen: false,
    alertaCumpleanios: true,
    notificarNuevaVacacion: true,
    notificarVacacionDecidida: false,
    notificarNominaGenerada: false
  };
}

function obtenerConfigWhatsAppInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_WHATSAPP);
  var def = _defConfigWhatsApp();
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function obtenerConfigWhatsApp() {
  var cfg = obtenerConfigWhatsAppInterno();
  cfg.apikey = enmascararSecreto(cfg.apikey);
  return cfg;
}

function guardarConfigWhatsApp(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var actual = obtenerConfigWhatsAppInterno();
  if (!cfg.apikey) cfg.apikey = actual.apikey;
  var merged = Object.assign(_defConfigWhatsApp(), actual, cfg);
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_WHATSAPP, JSON.stringify(merged));
  return { ok: true, mensaje: 'Configuración de WhatsApp guardada.' };
}

function _normalizarTelefonoWhatsApp(telefono) {
  var t = String(telefono || '').trim().replace(/[\s\-()]/g, '');
  if (!t) return '';
  if (t.charAt(0) !== '+') t = '+' + t.replace(/^\+/, '');
  return t;
}

function _truncarWhatsApp(texto) {
  var s = String(texto || '');
  if (s.length <= MAX_CHARS_WHATSAPP) return s;
  return s.slice(0, MAX_CHARS_WHATSAPP - 3) + '...';
}

/**
 * Envía un mensaje vía CallMeBot.
 * @param {string} mensaje
 * @param {Object} cfg  Configuración con telefono y apikey.
 * @param {Object} [opciones]  { forzar: true } omite la validación de activo.
 */
function _enviarWhatsApp(mensaje, cfg, opciones) {
  opciones = opciones || {};
  if (!cfg) cfg = obtenerConfigWhatsAppInterno();
  if (!cfg || !cfg.telefono || !cfg.apikey) {
    return { ok: false, mensaje: 'WhatsApp no configurado (teléfono o API Key faltante).' };
  }
  if (cfg.apikey.length < 10) {
    return { ok: false, mensaje: 'API Key de CallMeBot inválida o incompleta.' };
  }
  if (!opciones.forzar && !cfg.activo) {
    return { ok: false, mensaje: 'Las notificaciones WhatsApp están desactivadas.' };
  }

  var telefono = _normalizarTelefonoWhatsApp(cfg.telefono);
  if (!/^\+\d{8,15}$/.test(telefono)) {
    return { ok: false, mensaje: 'Número inválido. Usa formato internacional, ej: +50688887777' };
  }

  try {
    var texto = _truncarWhatsApp(mensaje);
    var url = 'https://api.callmebot.com/whatsapp.php' +
      '?phone='  + encodeURIComponent(telefono) +
      '&text='   + encodeURIComponent(texto) +
      '&apikey=' + encodeURIComponent(cfg.apikey);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, validateHttpsCertificates: true });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code >= 400) {
      return { ok: false, mensaje: 'CallMeBot error ' + code + ': ' + body.slice(0, 120) };
    }
    if (/error|invalid|failed/i.test(body) && !/message sent|success/i.test(body)) {
      return { ok: false, mensaje: 'CallMeBot: ' + body.slice(0, 120) };
    }
    return { ok: true, mensaje: 'Mensaje WhatsApp enviado a ' + telefono + '.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error WhatsApp: ' + e.message };
  }
}

function _textoVacacionesPendientes() {
  var vacs = leerTabla(HOJAS.VACACIONES).filter(function (v) {
    return estadoNormalizado(v.estado) === 'pendiente';
  });
  if (!vacs.length) return null;

  var mapa = mapaEmpleados();
  var lineas = vacs.map(function (v, i) {
    var nombre = mapa[v.empleado_id] || v.empleado_id || '—';
    return (i + 1) + '. ' + nombre + ' (' + formatearFecha(v.fecha_inicio) +
      ' → ' + formatearFecha(v.fecha_fin) + ', ' + (v.dias || '—') + ' días)';
  });

  return '🏖 *Vacaciones pendientes* (' + vacs.length + ')\n\n' +
    lineas.join('\n') + '\n\nIngresa al sistema para aprobar o rechazar.';
}

function _textoNominaMensual() {
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var noms = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var activos = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return estadoNormalizado(e.estado) === 'activo';
  });
  if (!activos.length) return null;
  var conNomina = {};
  noms.forEach(function (n) { conNomina[String(n.empleado_id)] = true; });
  var faltantes = activos.filter(function (e) { return !conNomina[String(e.id)]; });
  if (!faltantes.length) return null;

  var lista = faltantes.map(function (e, i) { return (i + 1) + '. ' + e.nombre; }).join('\n');
  return '💰 *Nómina pendiente* — ' + mesActual + '\n\n' +
    'Faltan ' + faltantes.length + ' empleado(s) activo(s):\n' + lista +
    '\n\nGenera la nómina en el módulo correspondiente.';
}

function _textoResumenSemanal() {
  var dash = obtenerDashboard();
  return '📊 *Resumen semanal RRHH*\n' +
    '• Empleados activos: ' + dash.empleadosActivos + '\n' +
    '• Inactivos: ' + dash.empleadosInactivos + '\n' +
    '• Vacaciones pendientes: ' + dash.vacacionesPendientes + '\n' +
    '• Nómina ' + dash.mesActual + ': ' + dash.nominasMesActual + ' registros\n' +
    '• Total neto mes: ₡' + (dash.totalNetoMes || 0).toLocaleString();
}

function _textoCumpleanios() {
  var hoy = new Date();
  var mesHoy = hoy.getMonth() + 1;
  var empls = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    if (estadoNormalizado(e.estado) !== 'activo') return false;
    if (!e.fecha_nacimiento) return false;
    var fn = new Date(e.fecha_nacimiento);
    return !isNaN(fn.getTime()) && (fn.getMonth() + 1) === mesHoy;
  });
  if (!empls.length) return null;

  var lineas = empls.map(function (e, i) {
    var fn = new Date(e.fecha_nacimiento);
    return (i + 1) + '. ' + e.nombre + ' — ' + fn.getDate() + '/' + mesHoy;
  });
  return '🎂 *Cumpleaños del mes*\n\n' + lineas.join('\n');
}

function _enviarAlertasWhatsApp(cfgAlertas, waCfg) {
  var enviados = 0;

  if (waCfg.alertaVacaciones !== false && cfgAlertas.vacacionesPendientesActiva) {
    var tVac = _textoVacacionesPendientes();
    if (tVac && _enviarWhatsApp(tVac, waCfg).ok) enviados++;
  }

  if (waCfg.alertaNomina !== false && cfgAlertas.nominaMensualActiva) {
    var hoy = new Date();
    if (hoy.getDate() >= Number(cfgAlertas.nominaMensualDia)) {
      var tNom = _textoNominaMensual();
      if (tNom && _enviarWhatsApp(tNom, waCfg).ok) enviados++;
    }
  }

  if (waCfg.alertaResumen && cfgAlertas.resumenSemanalActivo && new Date().getDay() === 1) {
    if (_enviarWhatsApp(_textoResumenSemanal(), waCfg).ok) enviados++;
  }

  if (waCfg.alertaCumpleanios !== false && cfgAlertas.cumpleaniosActiva && new Date().getDate() === 1) {
    var tCump = _textoCumpleanios();
    if (tCump && _enviarWhatsApp(tCump, waCfg).ok) enviados++;
  }

  if (!enviados) {
    _enviarWhatsApp(_textoResumenSemanal(), waCfg);
  }
}

function _whatsappEventoActivo(cfg, flag) {
  if (!cfg || !cfg.activo || !cfg.telefono || !cfg.apikey) return false;
  return cfg[flag] !== false;
}

function _notificarWhatsAppNuevaVacacion(v, dias) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarNuevaVacacion')) return;
  var mapa = mapaEmpleados();
  var nombre = mapa[v.empleado_id] || v.empleado_id;
  var msg = '🏖 *Nueva solicitud de vacaciones*\n' +
    'Empleado: ' + nombre + '\n' +
    'Desde: ' + formatearFecha(v.fecha_inicio) + '\n' +
    'Hasta: ' + formatearFecha(v.fecha_fin) + '\n' +
    'Días: ' + dias + '\n\nRevisa el sistema para aprobar.';
  _enviarWhatsApp(msg, waCfg);
}

function _notificarWhatsAppVacacionDecidida(v, nuevoEstado) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarVacacionDecidida')) return;
  var mapa = mapaEmpleados();
  var nombre = mapa[v.empleado_id] || v.empleado_id;
  var icono = nuevoEstado === 'aprobada' ? '✅' : '❌';
  var etiqueta = nuevoEstado === 'aprobada' ? 'APROBADA' : 'RECHAZADA';
  var msg = icono + ' *Vacaciones ' + etiqueta + '*\n' +
    'Empleado: ' + nombre + '\n' +
    'Desde: ' + formatearFecha(v.fecha_inicio) + '\n' +
    'Hasta: ' + formatearFecha(v.fecha_fin) + '\n' +
    'Días: ' + (v.dias || '—');
  _enviarWhatsApp(msg, waCfg);
}

function _notificarWhatsAppNominaGenerada(empleado, mes, salarioBase, deducciones, neto) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarNominaGenerada')) return;
  var msg = '💰 *Nómina generada*\n' +
    'Empleado: ' + (empleado.nombre || empleado.id) + '\n' +
    'Mes: ' + mes + '\n' +
    'Salario base: ₡' + (Number(salarioBase) || 0).toLocaleString() + '\n' +
    'Deducciones: ₡' + (Number(deducciones) || 0).toLocaleString() + '\n' +
    'Neto: ₡' + (Number(neto) || 0).toLocaleString();
  _enviarWhatsApp(msg, waCfg);
}

/**
 * Prueba el envío de WhatsApp. tipo: general | vacaciones | nomina | resumen | cumpleanios
 */
function probarWhatsApp(tipo, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var cfg = obtenerConfigWhatsAppInterno();
  if (!cfg.telefono || !cfg.apikey) {
    return { ok: false, mensaje: 'Configura el teléfono y la API Key de CallMeBot primero.' };
  }

  var mensaje;
  if (tipo === 'vacaciones') {
    mensaje = _textoVacacionesPendientes() || '✅ No hay vacaciones pendientes en este momento.';
  } else if (tipo === 'nomina') {
    mensaje = _textoNominaMensual() || '✅ Todos los empleados activos tienen nómina del mes.';
  } else if (tipo === 'resumen') {
    mensaje = _textoResumenSemanal();
  } else if (tipo === 'cumpleanios') {
    mensaje = _textoCumpleanios() || '✅ No hay cumpleaños registrados este mes.';
  } else if (tipo === 'vacacion_decidida') {
    mensaje = '✅ *Vacaciones APROBADA*\nEmpleado: (ejemplo)\nDesde: 2026-07-01\nHasta: 2026-07-05\nDías: 5';
  } else if (tipo === 'nomina_generada') {
    mensaje = '💰 *Nómina generada*\nEmpleado: (ejemplo)\nMes: 2026-06\nSalario base: ₡500,000\nDeducciones: ₡80,000\nNeto: ₡420,000';
  } else {
    mensaje = '🧪 Prueba del Sistema RRHH\nWhatsApp configurado correctamente via CallMeBot.';
  }

  return _enviarWhatsApp('🧪 [PRUEBA]\n' + mensaje, cfg, { forzar: true });
}

/** Envía un mensaje personalizado por WhatsApp (solo admin). */
function enviarWhatsAppPersonalizado(mensaje, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  if (!mensaje || !String(mensaje).trim()) {
    return { ok: false, mensaje: 'Escribe un mensaje para enviar.' };
  }
  var cfg = obtenerConfigWhatsAppInterno();
  return _enviarWhatsApp(String(mensaje).trim(), cfg, { forzar: true });
}


// ===================================================================
// CUERPO DE ALERTA: CUMPLEAÑOS
// ===================================================================

function _cuerpoProximosCumpleanios() {
  var hoy    = new Date();
  var mesHoy = hoy.getMonth() + 1;
  var empls  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return false;
    if (!e.fecha_nacimiento) return false;
    var fn = new Date(e.fecha_nacimiento);
    return !isNaN(fn.getTime()) && (fn.getMonth() + 1) === mesHoy;
  });
  if (!empls.length) return null;

  var filas = empls.map(function (e) {
    var fn   = new Date(e.fecha_nacimiento);
    var edad = hoy.getFullYear() - fn.getFullYear();
    if (hoy.getMonth() < fn.getMonth() ||
        (hoy.getMonth() === fn.getMonth() && hoy.getDate() < fn.getDate())) {
      edad--;
    }
    return '<tr>' +
      '<td style="padding:6px 10px">' + e.nombre + '</td>' +
      '<td style="padding:6px 10px">' + fn.getDate() + '/' + mesHoy + '</td>' +
      '<td style="padding:6px 10px">' + edad + ' años</td></tr>';
  }).join('');

  return '<p>Cumpleaños de empleados este mes:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
    'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<thead><tr style="background:#f3f4f6">' +
    '<th style="padding:6px 10px">Empleado</th>' +
    '<th style="padding:6px 10px">Fecha</th>' +
    '<th style="padding:6px 10px">Edad</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table>';
}


// ===================================================================
// CONTADOR DE ALERTAS (para badge en sidebar)
// ===================================================================

function obtenerContadorAlertas() {
  var vacPend = leerTabla(HOJAS.VACACIONES).filter(function (v) {
    return String(v.estado).toLowerCase() === 'pendiente';
  }).length;
  return { total: vacPend, vacaciones: vacPend };
}


/**
 * Crea TODAS las pestañas que falten, con sus encabezados.
 * Reutiliza getHoja(), que ya crea la pestaña si no existe.
 *
 * @return {Object} {ok, mensaje, creadas:[...]}
 */
function inicializarHojas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  try {
    var libro = getLibro();
    var creadas = [];
    Object.keys(HOJAS).forEach(function (clave) {
      var nombre = HOJAS[clave];
      var existiaAntes = !!libro.getSheetByName(nombre);
      var hoja = getHoja(nombre);
      if (!existiaAntes) {
        creadas.push(nombre);
      } else {
        migrarColumnas(hoja, ENCABEZADOS[nombre] || []);
      }
    });
    var msg = creadas.length
      ? 'Pestañas creadas: ' + creadas.join(', ') + '. Columnas existentes verificadas.'
      : 'Todas las pestañas ya existían. Columnas verificadas.';
    return { ok: true, mensaje: msg, creadas: creadas };
  } catch (e) {
    return { ok: false, mensaje: e.message, creadas: [] };
  }
}

function migrarColumnas(hoja, columnasEsperadas) {
  if (!columnasEsperadas || !columnasEsperadas.length) return;
  var datos = hoja.getDataRange().getValues();
  if (!datos.length) return;
  var actuales = datos[0].map(function (c) { return String(c); });
  var faltan = columnasEsperadas.filter(function (c) { return actuales.indexOf(c) === -1; });
  if (faltan.length) {
    var inicioCol = actuales.length + 1;
    faltan.forEach(function (col, i) {
      hoja.getRange(1, inicioCol + i).setValue(col);
    });
  }
}


// ===================================================================
// MÓDULO: CÁLCULO DE DEDUCCIONES COSTA RICA
// ===================================================================

/**
 * Calcula deducciones en CR: CCSS 10.67% + Renta progresiva.
 *
 * TABLA RENTA (Tramos 2025 - VERIFICAR ACTUALIZACIÓN 2026 CON AUTORIDADES):
 * Hasta ₡929,000:      0%
 * ₡929,001-1,364,000:  10%
 * ₡1,364,001-2,388,000: 15% (+ ₡43,500)
 * ₡2,388,001-4,775,000: 20% (+ ₡197,100)
 * Arriba ₡4,775,000:   25% (+ ₡674,500)
 *
 * IMPORTANTE: Esta fórmula está DUPLICADA en Js_Nomina.html para previsualizar sin round-trip.
 * Al actualizar: MODIFICAR AMBAS UBICACIONES.
 * TODO: Centralizar en una sola fuente de verdad.
 */
function calcularDeduccionesCR(salario) {
  var sal = Number(salario) || 0;
  var ccss = Math.round(sal * 0.1067);
  var renta = 0;
  if      (sal <= 929000)  renta = 0;
  else if (sal <= 1364000) renta = Math.round((sal - 929000) * 0.10);
  else if (sal <= 2388000) renta = Math.round(43500 + (sal - 1364000) * 0.15);
  else if (sal <= 4775000) renta = Math.round(197100 + (sal - 2388000) * 0.20);
  else                     renta = Math.round(674500 + (sal - 4775000) * 0.25);
  var total = ccss + renta;
  var neto  = sal - total;
  return { salario: sal, ccss: ccss, renta: renta, total: total, neto: neto };
}

function obtenerDeduccionesCR(empleadoId) {
  var filas = leerTabla(HOJAS.EMPLEADOS);
  var emp   = filas.filter(function (e) { return String(e.id) === String(empleadoId); })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
  var d = calcularDeduccionesCR(emp.salario);
  return Object.assign({ ok: true }, d);
}


// ===================================================================
// MÓDULO: BÚSQUEDA GLOBAL
// ===================================================================

/**
 * Búsqueda global optimizada: busca primero en tablas críticas (empleados, depto)
 * para obtener resultados relevantes más rápido. Requiere token de seguridad.
 * Limita a 50 resultados máximo.
 */
function buscarGlobal(query, token) {
  if (!query || !query.trim()) return [];
  if (!token) return [];
  var q = String(query).toLowerCase().trim();
  var resultados = [];
  var LIMITE = 50;
  var tablasPrioritarias = [HOJAS.EMPLEADOS, HOJAS.DEPARTAMENTOS, HOJAS.ACTIVOS];
  var tablasSecundarias = [HOJAS.CAPACITACIONES, HOJAS.PRESTAMOS, HOJAS.INCAPACIDADES,
                            HOJAS.LIQUIDACIONES, HOJAS.VACACIONES];

  function agregar(entidad, id, titulo, subtitulo, vista) {
    if (resultados.length < LIMITE) {
      resultados.push({ entidad: entidad, id: id, titulo: titulo, subtitulo: subtitulo, vista: vista });
      return true;
    }
    return false;
  }

  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    if (resultados.length < LIMITE) {
      if (String(e.nombre||'').toLowerCase().indexOf(q) !== -1 ||
          String(e.cedula||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Empleado', e.id, e.nombre, e.departamento||'', 'empleados');
      }
    }
  });
  leerTabla(HOJAS.CAPACITACIONES).forEach(function (c) {
    if (resultados.length < LIMITE) {
      if (String(c.curso||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Capacitacion', c.id, c.curso, c.institucion||'', 'capacitaciones');
      }
    }
  });
  leerTabla(HOJAS.DEPARTAMENTOS).forEach(function (d) {
    if (resultados.length < LIMITE) {
      if (String(d.nombre||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Departamento', d.id, d.nombre, d.responsable||'', 'departamentos');
      }
    }
  });
  leerTabla(HOJAS.ACTIVOS).forEach(function (a) {
    if (resultados.length < LIMITE) {
      if (String(a.nombre||'').toLowerCase().indexOf(q) !== -1 ||
          String(a.serial||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Activo', a.id, a.nombre, 'Serial: ' + (a.serial||'-'), 'activos');
      }
    }
  });

  var nombresBusqueda = mapaEmpleados();
  leerTabla(HOJAS.PRESTAMOS).forEach(function (p) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[p.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1) {
        agregar('Préstamo', p.id, nombreEmp, 'Monto: ' + (p.monto || 0), 'prestamos');
      }
    }
  });
  leerTabla(HOJAS.INCAPACIDADES).forEach(function (inc) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[inc.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1 ||
          String(inc.entidad||'').toLowerCase().indexOf(q) !== -1 ||
          String(inc.especialidad||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Incapacidad', inc.id, nombreEmp, inc.especialidad || inc.entidad || '', 'incapacidades');
      }
    }
  });
  leerTabla(HOJAS.LIQUIDACIONES).forEach(function (liq) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[liq.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1 ||
          String(liq.motivo||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Liquidación', liq.id, nombreEmp, liq.motivo || '', 'liquidaciones');
      }
    }
  });
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[v.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1) {
        agregar('Vacaciones', v.id, nombreEmp, (v.dias || 0) + ' días', 'vacaciones');
      }
    }
  });

  return resultados;
}


// ===================================================================
// MÓDULO: CALENDARIO DE EVENTOS
// ===================================================================

function listarEventosCalendario(mes, anio) {
  var m = parseInt(mes, 10);
  var y = parseInt(anio, 10);
  var eventos = [];

  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    if (!e.fecha_nacimiento || String(e.estado||'').toLowerCase() !== 'activo') return;
    var fn = new Date(e.fecha_nacimiento);
    if (isNaN(fn.getTime())) return;
    if ((fn.getMonth() + 1) === m) {
      eventos.push({ tipo: 'cumpleanos', dia: fn.getDate(), titulo: e.nombre, color: '#ec4899' });
    }
  });

  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (String(v.estado||'').toLowerCase() !== 'aprobada') return;
    var ini = new Date(v.fecha_inicio);
    if (isNaN(ini.getTime())) return;
    if ((ini.getMonth() + 1) === m && ini.getFullYear() === y) {
      eventos.push({ tipo: 'vacaciones', dia: ini.getDate(), titulo: 'Vacaciones', color: '#059669' });
    }
  });

  leerTabla(HOJAS.HORAS_EXTRA).forEach(function (h) {
    var fd = new Date(h.fecha);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'horasextra', dia: fd.getDate(), titulo: 'Horas extra', color: '#d97706' });
    }
  });

  leerTabla(HOJAS.FERIADOS).forEach(function (f) {
    var fd = new Date(f.fecha);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'feriado', dia: fd.getDate(), titulo: f.nombre || 'Feriado', color: '#4f46e5' });
    }
  });

  leerTabla(HOJAS.INCAPACIDADES).forEach(function (inc) {
    var fd = new Date(inc.fecha_desde);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'incapacidad', dia: fd.getDate(), titulo: 'Incapacidad', color: '#dc2626' });
    }
  });

  return eventos;
}


// ===================================================================
// MÓDULO: ORGANIGRAMA
// ===================================================================

function listarOrganigrama() {
  var deptos = leerTabla(HOJAS.DEPARTAMENTOS);
  var empls  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.estado||'').toLowerCase() === 'activo';
  });
  return deptos.map(function (d) {
    return {
      id: d.id, nombre: d.nombre, responsable: d.responsable || '',
      empleados: empls.filter(function (e) { return e.departamento === d.nombre; })
                      .map(function (e) { return { id: e.id, nombre: e.nombre, puesto: e.puesto || '' }; })
    };
  });
}


// ===================================================================
// MÓDULO: RESUMEN DE ASISTENCIA
// ===================================================================

function listarResumenAsistencia(mes) {
  var registros = leerTabla(HOJAS.ASISTENCIA);
  if (mes) {
    registros = registros.filter(function (r) { return mesDeFecha(r.fecha) === mes; });
  }
  var empls = leerTabla(HOJAS.EMPLEADOS);
  var mapa = {};
  registros.forEach(function (r) {
    var eid = String(r.empleado_id);
    if (!mapa[eid]) mapa[eid] = { dias: 0, horas: 0 };
    mapa[eid].dias++;
    mapa[eid].horas += Number(r.horas) || 0;
  });
  return empls.filter(function (e) { return mapa[e.id]; }).map(function (e) {
    return { empleado_id: e.id, nombre: e.nombre, departamento: e.departamento || '-',
             dias: mapa[e.id].dias, horas: Math.round(mapa[e.id].horas * 10) / 10 };
  }).sort(function (a, b) { return b.horas - a.horas; });
}


// ===================================================================
// MÓDULO: PRÉSTAMOS A EMPLEADOS
// ===================================================================

function listarPrestamos(empleadoId, estado) {
  var rows = leerTabla(HOJAS.PRESTAMOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (estado) rows = rows.filter(function (r) { return String(r.estado).toLowerCase() === String(estado).toLowerCase(); });
  return enriquecerConEmpleado(rows);
}

function crearPrestamo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  var monto = Number(datos.monto);
  var cuotas = Number(datos.cuotas);
  if (isNaN(monto) || monto <= 0) return { ok: false, mensaje: 'El monto debe ser mayor a 0.' };
  if (isNaN(cuotas) || cuotas <= 0) return { ok: false, mensaje: 'Las cuotas deben ser mayor a 0.' };
  var cuota = Math.round(monto / cuotas);
  return conLock(function () {
    var hoja = getHoja(HOJAS.PRESTAMOS);
    var id = generarId('PRE');
    hoja.appendRow([id, datos.empleado_id, monto, cuotas, cuota, 0, 'activo', datos.fecha || hoy(), datos.notas || '']);
    registrarBitacora('crear', 'Prestamo', id, 'Prestamo de ' + monto);
    return { ok: true, mensaje: 'Préstamo registrado.' };
  });
}

function actualizarPrestamo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var monto = Number(datos.monto);
  var cuotas = Number(datos.cuotas);
  if (isNaN(monto) || monto <= 0) return { ok: false, mensaje: 'El monto debe ser mayor a 0.' };
  if (isNaN(cuotas) || cuotas <= 0) return { ok: false, mensaje: 'Las cuotas deben ser mayor a 0.' };

  var hoja = getHoja(HOJAS.PRESTAMOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      var cuota = Math.round(monto / cuotas);
      hoja.getRange(i+1, 1, 1, 9).setValues([[datos.id, datos.empleado_id, monto, cuotas, cuota, datos.cuotas_pagadas||0, datos.estado||'activo', datos.fecha||hoy(), datos.notas||'']]);
      return { ok: true, mensaje: 'Préstamo actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function pagarCuotaPrestamo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.PRESTAMOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      var pagadas = (Number(rows[i][5]) || 0) + 1;
      var total   = Number(rows[i][3]) || 1;
      var estado  = pagadas >= total ? 'saldado' : 'activo';
      hoja.getRange(i+1, 6).setValue(pagadas);
      hoja.getRange(i+1, 7).setValue(estado);
      registrarBitacora('actualizar', 'Prestamo', id, 'Cuota pagada ' + pagadas + '/' + total);
      return { ok: true, mensaje: 'Cuota registrada (' + pagadas + '/' + total + ').' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function eliminarPrestamo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.PRESTAMOS, id, 'Prestamo');
}


// ===================================================================
// MÓDULO: HORAS EXTRA
// ===================================================================

function listarHorasExtra(empleadoId) {
  var rows = leerTabla(HOJAS.HORAS_EXTRA);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    if (!r.monto && emp.salario) {
      var sal = Number(emp.salario);
      if (sal > 0) {
        var valorHora = calcularValorHora(sal);
        r.monto = Math.round(valorHora * 1.5 * Number(r.horas));
      }
    }
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function crearHoraExtra(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (isNaN(Number(datos.horas)) || Number(datos.horas) <= 0) {
    return { ok: false, mensaje: 'Las horas deben ser un número mayor a 0.' };
  }
  var tiposValidos = ['normal', 'diurno', 'nocturno', 'domingo'];
  var tipo = String(datos.tipo || 'normal').toLowerCase();
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, mensaje: 'Tipo de hora extra no válido. Use: ' + tiposValidos.join(', ') };
  }

  var hoja  = getHoja(HOJAS.HORAS_EXTRA);
  var horasExtra = leerTabla(HOJAS.HORAS_EXTRA);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  var emp   = empls.filter(function (e) { return String(e.id) === String(datos.empleado_id); })[0] || {};

  // Validar máximo 240h/mes (límite legal CR)
  var fecha = datos.fecha ? new Date(datos.fecha) : new Date();
  var mesAno = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
  var horasDelMes = horasExtra.filter(function (h) {
    var hFecha = new Date(h.fecha);
    var hMesAno = hFecha.getFullYear() + '-' + String(hFecha.getMonth() + 1).padStart(2, '0');
    return String(h.empleado_id) === String(datos.empleado_id) && hMesAno === mesAno;
  }).reduce(function (sum, h) { return sum + Number(h.horas||0); }, 0);

  if (horasDelMes + Number(datos.horas) > 240) {
    return { ok: false, mensaje: 'Límite mensual alcanzado. Ya tiene ' + horasDelMes + 'h este mes (máximo 240h).' };
  }

  var monto = datos.monto || 0;
  if (!monto && emp.salario) {
    var sal = Number(emp.salario);
    if (sal > 0) {
      var vh = sal / 240;
      monto  = Math.round(vh * 1.5 * Number(datos.horas));
    }
  }
  var id = generarId('HEX');
  hoja.appendRow([id, datos.empleado_id, datos.fecha||hoy(), datos.horas, tipo, datos.aprobado||'pendiente', monto, datos.notas||'']);
  registrarBitacora('crear', 'HoraExtra', id, datos.horas + ' hrs ' + tipo);
  return { ok: true, mensaje: 'Horas extra registradas.' };
}

function actualizarHoraExtra(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.HORAS_EXTRA);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      hoja.getRange(i+1, 1, 1, 8).setValues([[datos.id, datos.empleado_id, datos.fecha||hoy(), datos.horas, datos.tipo||'normal', datos.aprobado||'pendiente', datos.monto||0, datos.notas||'']]);
      return { ok: true, mensaje: 'Actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function eliminarHoraExtra(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.HORAS_EXTRA, id, 'HoraExtra');
}


// ===================================================================
// MÓDULO: ACTIVOS ASIGNADOS
// ===================================================================

function listarActivos(empleadoId, estado) {
  var rows = leerTabla(HOJAS.ACTIVOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (estado) rows = rows.filter(function (r) { return String(r.estado).toLowerCase() === String(estado).toLowerCase(); });
  return enriquecerConEmpleado(rows);
}

function crearActivo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.nombre || !String(datos.nombre).trim()) {
    return { ok: false, mensaje: 'El nombre del activo es obligatorio.' };
  }

  var hoja = getHoja(HOJAS.ACTIVOS);
  var id   = generarId('ACT');
  hoja.appendRow([id, datos.empleado_id, datos.nombre, datos.categoria||'', datos.serial||'', datos.fecha_entrega||hoy(), datos.fecha_devolucion||'', datos.estado||'asignado', datos.notas||'']);
  registrarBitacora('crear', 'Activo', id, datos.nombre + ' asignado');
  return { ok: true, mensaje: 'Activo registrado.' };
}

function actualizarActivo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ACTIVOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      hoja.getRange(i+1, 1, 1, 9).setValues([[datos.id, datos.empleado_id, datos.nombre, datos.categoria||'', datos.serial||'', datos.fecha_entrega||hoy(), datos.fecha_devolucion||'', datos.estado||'asignado', datos.notas||'']]);
      return { ok: true, mensaje: 'Activo actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function eliminarActivo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.ACTIVOS, id, 'Activo');
}


// ===================================================================
// MÓDULO: TURNOS
// ===================================================================

function listarTurnos(semana) {
  var rows  = leerTabla(HOJAS.TURNOS);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (semana) rows = rows.filter(function (r) { return String(r.semana) === String(semana); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function guardarTurno(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.TURNOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(datos.empleado_id) && String(rows[i][2]) === String(datos.semana)) {
      hoja.getRange(i+1, 1, 1, 10).setValues([[rows[i][0], datos.empleado_id, datos.semana,
        datos.lunes||'', datos.martes||'', datos.miercoles||'', datos.jueves||'',
        datos.viernes||'', datos.sabado||'', datos.domingo||'']]);
      return { ok: true, mensaje: 'Turno actualizado.' };
    }
  }
  var id = generarId('TUR');
  hoja.appendRow([id, datos.empleado_id, datos.semana,
    datos.lunes||'', datos.martes||'', datos.miercoles||'', datos.jueves||'',
    datos.viernes||'', datos.sabado||'', datos.domingo||'']);
  return { ok: true, mensaje: 'Turno guardado.' };
}

function eliminarTurno(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.TURNOS, id, 'Turno');
}


// ===================================================================
// MÓDULO: EXPEDIENTE COMPLETO
// ===================================================================

function obtenerExpediente(empleadoId) {
  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) { return String(e.id) === String(empleadoId); })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
  var balance = obtenerBalanceVacaciones(empleadoId);
  return {
    ok: true, empleado: emp, balance: balance,
    historialSalarios: leerTabla(HOJAS.HISTORIAL_SALARIOS).filter(function (h) { return String(h.empleado_id) === String(empleadoId); }),
    capacitaciones:    leerTabla(HOJAS.CAPACITACIONES).filter(function (c) { return String(c.empleado_id) === String(empleadoId); }),
    evaluaciones:      leerTabla(HOJAS.EVALUACIONES).filter(function (e) { return String(e.empleado_id) === String(empleadoId); }),
    vacaciones:        leerTabla(HOJAS.VACACIONES).filter(function (v) { return String(v.empleado_id) === String(empleadoId); }),
    prestamos:         leerTabla(HOJAS.PRESTAMOS).filter(function (p) { return String(p.empleado_id) === String(empleadoId); }),
    activos:           leerTabla(HOJAS.ACTIVOS).filter(function (a) { return String(a.empleado_id) === String(empleadoId); }),
    horasExtra:        leerTabla(HOJAS.HORAS_EXTRA).filter(function (h) { return String(h.empleado_id) === String(empleadoId); })
  };
}


// ===================================================================
// MÓDULO: INCAPACIDADES (CCSS / INS)
// ===================================================================
//
// Estructura: id | empleado_id | fecha_desde | fecha_hasta | dias |
//             entidad ('CCSS' | 'INS') | especialidad | notas
// ===================================================================

/**
 * Lista incapacidades, con filtros opcionales.
 * @param {string} [empleadoId]
 * @param {string} [entidad]    'CCSS' | 'INS'
 * @param {string} [fechaDesde] yyyy-MM-dd. Filtra por fecha_desde >= este valor.
 * @param {string} [fechaHasta] yyyy-MM-dd. Filtra por fecha_desde <= este valor.
 */
function listarIncapacidades(empleadoId, entidad, fechaDesde, fechaHasta) {
  var rows  = leerTabla(HOJAS.INCAPACIDADES);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (entidad) rows = rows.filter(function (r) { return String(r.entidad).toUpperCase() === String(entidad).toUpperCase(); });
  if (fechaDesde) rows = rows.filter(function (r) { return formatearFecha(r.fecha_desde) >= fechaDesde; });
  if (fechaHasta) rows = rows.filter(function (r) { return formatearFecha(r.fecha_desde) <= fechaHasta; });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    r.fecha_desde = formatearFecha(r.fecha_desde);
    r.fecha_hasta = formatearFecha(r.fecha_hasta);
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function crearIncapacidad(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.fecha_desde || isNaN(new Date(datos.fecha_desde).getTime())) {
    return { ok: false, mensaje: 'La fecha de inicio no es válida.' };
  }
  if (!datos.fecha_hasta || isNaN(new Date(datos.fecha_hasta).getTime())) {
    return { ok: false, mensaje: 'La fecha de fin no es válida.' };
  }
  if (new Date(datos.fecha_hasta) < new Date(datos.fecha_desde)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var entidad = String(datos.entidad || 'CCSS').toUpperCase();
  if (entidad !== 'CCSS' && entidad !== 'INS') {
    return { ok: false, mensaje: 'Entidad debe ser CCSS o INS.' };
  }
  var dias = calcularDias(datos.fecha_desde, datos.fecha_hasta);
  var hoja = getHoja(HOJAS.INCAPACIDADES);
  var id   = generarId('INC');
  hoja.appendRow([id, datos.empleado_id, formatearFecha(datos.fecha_desde),
    formatearFecha(datos.fecha_hasta), dias, entidad,
    datos.especialidad || '', datos.notas || '']);
  registrarBitacora('crear', 'Incapacidad', id, dias + ' días (' + entidad + ')');
  return { ok: true, mensaje: 'Incapacidad registrada (' + dias + ' días).' };
}

function actualizarIncapacidad(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.INCAPACIDADES);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      var dias = calcularDias(datos.fecha_desde, datos.fecha_hasta);
      hoja.getRange(i+1, 1, 1, 8).setValues([[datos.id, datos.empleado_id,
        formatearFecha(datos.fecha_desde), formatearFecha(datos.fecha_hasta), dias,
        datos.entidad || 'CCSS', datos.especialidad || '', datos.notas || '']]);
      registrarBitacora('actualizar', 'Incapacidad', datos.id, dias + ' días');
      return { ok: true, mensaje: 'Incapacidad actualizada.' };
    }
  }
  return { ok: false, mensaje: 'No encontrada.' };
}

function eliminarIncapacidad(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.INCAPACIDADES, id, 'Incapacidad');
}


// ===================================================================
// MÓDULO: FERIADOS
// ===================================================================
//
// Estructura: id | fecha | nombre | tipo ('obligatorio' | 'no obligatorio')
// ===================================================================

function listarFeriados(anio) {
  var rows = leerTabla(HOJAS.FERIADOS);
  rows.forEach(function (r) { r.fecha = formatearFecha(r.fecha); });
  if (anio) rows = rows.filter(function (r) { return String(r.fecha).slice(0, 4) === String(anio); });
  rows.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  return rows;
}

function crearFeriado(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.fecha || isNaN(new Date(datos.fecha).getTime())) {
    return { ok: false, mensaje: 'La fecha no es válida.' };
  }
  var fecha = formatearFecha(datos.fecha);
  var existe = leerTabla(HOJAS.FERIADOS).some(function (f) {
    return formatearFecha(f.fecha) === fecha;
  });
  if (existe) return { ok: false, mensaje: 'Ya hay un feriado registrado en esa fecha.' };
  var hoja = getHoja(HOJAS.FERIADOS);
  var id   = generarId('FER');
  hoja.appendRow([id, fecha, datos.nombre || '', datos.tipo || 'obligatorio']);
  registrarBitacora('crear', 'Feriado', id, fecha + ' ' + (datos.nombre || ''));
  return { ok: true, mensaje: 'Feriado registrado.' };
}

function eliminarFeriado(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.FERIADOS, id, 'Feriado');
}


// ===================================================================
// MÓDULO: LIQUIDACIONES LABORALES
// ===================================================================
//
// Estructura: id | empleado_id | fecha_salida | motivo | fecha_calculo |
//             monto | estado ('pendiente' | 'pagada') | notas
// ===================================================================

function listarLiquidaciones(empleadoId) {
  var rows  = leerTabla(HOJAS.LIQUIDACIONES);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    r.fecha_salida  = formatearFecha(r.fecha_salida);
    r.fecha_calculo = formatearFecha(r.fecha_calculo);
    r.fecha_ingreso = formatearFecha(emp.fecha_ingreso || '');

    // Calcular años trabajados
    if (emp.fecha_ingreso && r.fecha_salida) {
      var fechaIng = new Date(emp.fecha_ingreso + 'T00:00:00');
      var fechaSal = new Date(r.fecha_salida.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') + 'T00:00:00');
      r.anios_trabajados = ((fechaSal - fechaIng) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(2);
    } else {
      r.anios_trabajados = 0;
    }

    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

/** Genera reporte HTML de liquidación laboral profesional (imprimible). */
function generarReporteLiquidacion(empleadoId, fechaSalida, motivoSalida) {
  var liq = calcularLiquidacion(empleadoId, fechaSalida, motivoSalida);
  if (!liq.ok) return liq;

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Liquidación Laboral</title>';
  html += '<style>';
  html += 'body { font-family: Arial, sans-serif; margin: 20px; background: #fff; color: #333; }';
  html += '.encabezado { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #333; padding-bottom: 10px; }';
  html += '.encabezado h1 { margin: 0; font-size: 18px; }';
  html += '.encabezado p { margin: 5px 0; font-size: 14px; }';
  html += '.datos-trabajador { margin: 15px 0; }';
  html += '.datos-trabajador table { width: 100%; border-collapse: collapse; font-size: 12px; }';
  html += '.datos-trabajador td { padding: 5px; border-bottom: 1px solid #ddd; }';
  html += '.datos-trabajador strong { display: inline-block; min-width: 150px; }';
  html += '.seccion { margin: 20px 0; padding: 12px; border-left: 4px solid #2563eb; background: #f9f9f9; }';
  html += '.seccion h3 { margin-top: 0; font-size: 14px; color: #2563eb; }';
  html += '.seccion table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }';
  html += '.seccion td { padding: 6px; border-bottom: 1px solid #ddd; }';
  html += '.seccion .label { font-weight: 600; width: 60%; }';
  html += '.seccion .valor { text-align: right; width: 40%; }';
  html += '.total-seccion { font-weight: 700; background: #e8f4f8; border-top: 2px solid #2563eb; }';
  html += '.total-final { margin: 20px 0; padding: 16px; background: #dcfce7; border: 3px solid #22c55e; border-radius: 6px; text-align: center; }';
  html += '.total-final .label { font-size: 12px; color: #666; }';
  html += '.total-final .monto { font-size: 28px; font-weight: 700; color: #22c55e; }';
  html += '.no-paga { color: #dc2626; }';
  html += '.si-paga { color: #22c55e; font-weight: 600; }';
  html += '@media print { body { margin: 0; } .no-print { display: none; } }';
  html += '</style></head><body>';

  // Encabezado
  html += '<div class="encabezado">';
  html += '<h1>TROPICALES DEL VALLE S.A.</h1>';
  html += '<p><strong>Liquidación Laboral</strong></p>';
  html += '</div>';

  // Datos del trabajador
  html += '<div class="datos-trabajador">';
  html += '<table>';
  html += '<tr><td><strong>Nombre del Trabajador:</strong></td><td>' + liq.empleado + '</td><td style="text-align:right"><strong>Identificación nº</strong></td><td style="text-align:right">' + liq.identificacion + '</td></tr>';
  html += '<tr><td><strong>Digite la fecha inicio:</strong></td><td>' + liq.fechaIngreso + '</td><td style="text-align:right"><strong>Digite la fecha salida:</strong></td><td style="text-align:right">' + liq.fechaSalida + '</td></tr>';
  html += '<tr><td><strong>Meses Laborados:</strong></td><td>' + liq.mesesLaborados + ',' + String(liq.diasAdicionales).padStart(2,'0') + '</td><td style="text-align:right"><strong>Tipo de nómina:</strong></td><td style="text-align:right">' + (liq.tipoNomina === 'Semanal' ? 'X' : ' ') + ' Semanal | ' + (liq.tipoNomina === 'Quincenal' ? 'X' : ' ') + ' Quincenal</td></tr>';
  html += '</table>';
  html += '</div>';

  // Motivo de salida
  html += '<div class="datos-trabajador">';
  html += '<strong>Motivo de Salida:</strong><br>';
  html += 'Despido Con Responsabilidad Patronal ' + (liq.motivoSalida === 'despido_con_resp' ? '☒' : '☐') + '<br>';
  html += 'Despido Sin Responsablidad Patronal ' + (liq.motivoSalida === 'despido_sin_resp' ? '☒' : '☐') + '<br>';
  html += 'Renuncia del Trabajador ' + (liq.motivoSalida === 'renuncia' ? '☒' : '☐');
  html += '</div>';

  // 1. Aguinaldo
  html += '<div class="seccion">';
  html += '<h3>1- Calculo del Aguinaldo:</h3>';
  html += '<table>';
  html += '<tr><td class="label">Total Por Aguinaldo:</td><td class="valor total-seccion">₡' + formatearNumero(liq.aguinaldo) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 2. Vacaciones
  html += '<div class="seccion">';
  html += '<h3>2- Cálculo de las Vacaciones:</h3>';
  html += '<table>';
  html += '<tr><td class="label">Salario Promedio Mensual:</td><td class="valor">₡' + formatearNumero(liq.salarioMensual) + '</td></tr>';
  html += '<tr><td class="label">Salario por Día:</td><td class="valor">₡' + formatearNumero(liq.salarioDiario) + '</td></tr>';
  html += '<tr><td class="label">Días a Recibir Vacaciones:</td><td class="valor">5,00</td></tr>';
  html += '<tr><td class="label">Total Por Vacaciones:</td><td class="valor total-seccion">₡' + formatearNumero(liq.vacaciones) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 3. Cesantía
  html += '<div class="seccion">';
  html += '<h3>3- Calculo de la Cesantia:</h3>';
  html += '<table>';
  html += '<tr><td class="label">¿Corresponde el pago?:</td><td class="valor">' + (liq.cesantia > 0 ? '<span class="si-paga">SÍ</span>' : '<span class="no-paga">NO</span>') + '</td></tr>';
  html += '<tr><td class="label">Salario promedio mensual:</td><td class="valor">₡' + (liq.cesantia > 0 ? formatearNumero(liq.salarioMensual) : '0,00') + '</td></tr>';
  html += '<tr><td class="label">Días que corresponden</td><td class="valor">' + (liq.cesantia > 0 ? (liq.cesantia / (liq.salarioMensual / 30)).toFixed(2) : '00,0') + ' dias</td></tr>';
  html += '<tr><td class="label">Total Por Auxilio de Cesantia:</td><td class="valor total-seccion">₡' + formatearNumero(liq.cesantia) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 4. Preaviso
  html += '<div class="seccion">';
  html += '<h3>4- Calculo del Preaviso:</h3>';
  html += '<table>';
  html += '<tr><td class="label">¿Desea conocer el tiempo?</td><td class="valor">' + (liq.preaviso > 0 ? 'SÍ' : 'NO') + '</td></tr>';
  html += '<tr><td class="label">¿Corresponde el pago?</td><td class="valor">' + (liq.preaviso > 0 ? '<span class="si-paga">SÍ</span>' : '<span class="no-paga">NO</span>') + '</td></tr>';
  html += '<tr><td class="label">Salario por Día</td><td class="valor">₡' + (liq.preaviso > 0 ? formatearNumero(liq.salarioDiario) : '0,00') + '</td></tr>';
  html += '<tr><td class="label">30 dias</td><td class="valor"></td></tr>';
  html += '<tr><td class="label">Total Por Preaviso:</td><td class="valor total-seccion">₡' + formatearNumero(liq.preaviso) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // Total Prestaciones
  html += '<div class="total-final">';
  html += '<div class="label">Total Prestaciones Laborales:</div>';
  html += '<div class="monto">₡' + formatearNumero(liq.totalPrestaciones) + '</div>';
  html += '</div>';

  html += '<div class="no-print" style="text-align:center;margin-top:20px">';
  html += '<button onclick="window.print()" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px">🖨️ Imprimir</button>';
  html += '</div>';

  html += '</body></html>';

  return {
    ok: true,
    html: html
  };
}

/** Formatea número con puntos de miles y 2 decimales. */
function formatearNumero(num) {
  return (Number(num) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Calcula liquidación laboral completa según estructura Costa Rica (modelo Tropicales del Valle). */
function calcularLiquidacion(empleadoId, fechaSalida, motivoSalida, totalSalarios, promedioSalarios, tipoNomina) {
  var emp = obtenerEmpleadoCompleto(empleadoId);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var fechaSal = typeof fechaSalida === 'string' ? new Date(fechaSalida + 'T00:00:00') : fechaSalida;
  var fechaIng = new Date(emp.fecha_ingreso + 'T00:00:00');

  if (fechaSal < fechaIng) {
    return { ok: false, mensaje: 'Fecha de salida anterior a ingreso (' + emp.fecha_ingreso + ').' };
  }

  var detalles = [];
  var totalPrestaciones = 0;

  // Calcular meses laborados
  var mesesLaborados = (fechaSal.getFullYear() - fechaIng.getFullYear()) * 12 +
                       (fechaSal.getMonth() - fechaIng.getMonth());
  var diasAdicionales = fechaSal.getDate() - fechaIng.getDate();
  if (diasAdicionales < 0) {
    mesesLaborados--;
    diasAdicionales += 30;
  }

  // Usar salarios ingresados si están disponibles, sino usar salario base del empleado
  var salarioMensual = (promedioSalarios || emp.salario);
  var salarioDiario = salarioMensual / 30;

  // ====== 1. AGUINALDO ======
  // Si se ingresaron salarios: suma / 12. Si no: un mes de salario
  var montoAguinaldo = (totalSalarios ? (totalSalarios / 12) : (salarioMensual));
  detalles.push({
    titulo: '1- Cálculo del Aguinaldo:',
    concepto: 'Total Por Aguinaldo',
    monto: Math.round(montoAguinaldo * 100) / 100
  });
  totalPrestaciones += montoAguinaldo;

  // ====== 2. VACACIONES ======
  // 5 días por año (2.5 días por semestre en CR)
  var balance = obtenerBalanceVacaciones(empleadoId);
  var diasVacaciones = Math.min(balance.diasDisponibles || 0, 5); // Max 5 días en liquidación
  var salarioDiarioVac = salarioDiario;
  var montoVacaciones = diasVacaciones * salarioDiarioVac;

  detalles.push({
    titulo: '2- Cálculo de las Vacaciones:',
    salarioPromedio: emp.salario,
    salarioPorDia: Math.round(salarioDiarioVac * 100) / 100,
    diasRecibir: diasVacaciones,
    concepto: 'Total Por Vacaciones',
    monto: Math.round(montoVacaciones * 100) / 100
  });
  totalPrestaciones += montoVacaciones;

  // ====== 3. CESANTÍA ======
  // Depende del motivo de salida
  var correspondeCesantia = (motivoSalida !== 'renuncia');
  var montoCesantia = 0;

  if (correspondeCesantia) {
    var diasTrabajados = Math.round((fechaSal - fechaIng) / (24 * 60 * 60 * 1000));
    montoCesantia = calcularCesantiaCompleta(salarioMensual, diasTrabajados);
  }

  detalles.push({
    titulo: '3- Calculo de la Cesantia:',
    corresponde: correspondeCesantia ? 'SÍ' : 'NO',
    concepto: 'Total Por Auxilio de Cesantia',
    monto: Math.round(montoCesantia * 100) / 100
  });
  totalPrestaciones += montoCesantia;

  // ====== 4. PREAVISO ======
  // 30 días o lo que corresponda según tipo de nómina
  var montoPreaviso = 0;
  var correspondePreaviso = (motivoSalida === 'renuncia'); // Normalmente renuncia paga preaviso

  if (correspondePreaviso) {
    montoPreaviso = salarioMensual; // 30 días como un mes
  }

  detalles.push({
    titulo: '4- Calculo del Preaviso:',
    corresponde: correspondePreaviso ? 'SÍ' : 'NO',
    diasPreaviso: correspondePreaviso ? 30 : 0,
    concepto: 'Total Por Preaviso',
    monto: Math.round(montoPreaviso * 100) / 100
  });
  totalPrestaciones += montoPreaviso;

  // ====== DESCUENTOS (simplificados - se aplican al total) ======
  var descuentoCCSS = totalPrestaciones * 0.0915; // CCSS 9.15%

  // TOTAL FINAL
  var totalNeto = totalPrestaciones - descuentoCCSS;

  return {
    ok: true,
    empleado: emp.nombre,
    cedula: emp.cedula,
    identificacion: emp.cedula,
    area: 'LINEA 1',
    fechaIngreso: emp.fecha_ingreso,
    fechaSalida: formatearFecha(fechaSalida),
    mesesLaborados: mesesLaborados,
    diasAdicionales: diasAdicionales,
    tipoNomina: tipoNomina || emp.tipo_nomina || 'Semanal',
    motivoSalida: motivoSalida || 'renuncia',
    salarioMensual: Math.round(salarioMensual * 100) / 100,
    salarioDiario: Math.round(salarioDiario * 100) / 100,

    // Detalles de cada concepto
    detalles: detalles,

    // Resumen
    aguinaldo: Math.round(montoAguinaldo * 100) / 100,
    vacaciones: Math.round(montoVacaciones * 100) / 100,
    cesantia: Math.round(montoCesantia * 100) / 100,
    preaviso: Math.round(montoPreaviso * 100) / 100,

    // Totales
    totalPrestaciones: Math.round(totalPrestaciones * 100) / 100,
    descuentoCCSS: Math.round(descuentoCCSS * 100) / 100,
    totalNeto: Math.round(totalNeto * 100) / 100,
    totalCalculado: Math.round(totalNeto * 100) / 100
  };
}

/** Calcula cesantía según tabla completa de días trabajados (Costa Rica). */
function calcularCesantiaCompleta(salarioMensual, diasTrabajados) {
  // Tabla de cesantía por días trabajados (Costa Rica)
  var tablaCesantia = [
    { desde: 90,     hasta: 180,     dias: 7,     rango: '3-6 Meses' },
    { desde: 181,    hasta: 360,     dias: 14,    rango: '6-12 Meses' },
    { desde: 361,    hasta: 540,     dias: 19.5,  rango: '1-1.5 años' },
    { desde: 541,    hasta: 720,     dias: 19.5,  rango: '1.5-2 años' },
    { desde: 721,    hasta: 900,     dias: 20,    rango: '2-2.5 años' },
    { desde: 901,    hasta: 1080,    dias: 20,    rango: '2.5-3 años' },
    { desde: 1081,   hasta: 1260,    dias: 20.5,  rango: '3-3.5 años' },
    { desde: 1261,   hasta: 1440,    dias: 20.5,  rango: '3.5-4 años' },
    { desde: 1441,   hasta: 1620,    dias: 21,    rango: '4-4.5 años' },
    { desde: 1621,   hasta: 1800,    dias: 21,    rango: '4.5-5 años' },
    { desde: 1801,   hasta: 1980,    dias: 21.24, rango: '5-5.5 años' },
    { desde: 1981,   hasta: 2160,    dias: 21.24, rango: '5.5-6 años' },
    { desde: 2161,   hasta: 2340,    dias: 21.5,  rango: '6-6.5 años' },
    { desde: 2341,   hasta: 2520,    dias: 21.5,  rango: '6.5-7 años' },
    { desde: 2521,   hasta: 2700,    dias: 22,    rango: '7-7.5 años' },
    { desde: 2701,   hasta: 2880,    dias: 22,    rango: '7.5-8 años' },
    { desde: 2881,   hasta: 3060,    dias: 22,    rango: '8-8.5 años' }
  ];

  var diasCesantia = 0;

  // Buscar en tabla
  for (var i = 0; i < tablaCesantia.length; i++) {
    var rango = tablaCesantia[i];
    if (diasTrabajados >= rango.desde && diasTrabajados <= rango.hasta) {
      diasCesantia = rango.dias;
      break;
    }
  }

  // Calcular monto: (diasCesantia / 30) * salarioMensual
  return (diasCesantia / 30) * salarioMensual;
}

function crearLiquidacion(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.fecha_salida || isNaN(new Date(datos.fecha_salida).getTime())) {
    return { ok: false, mensaje: 'La fecha de salida no es válida.' };
  }

  // Si no proporciona monto, calcular automáticamente
  var monto = Number(datos.monto);
  var calculoAuto = null;
  if (isNaN(monto) || monto === 0 || datos.calcular_automatico) {
    calculoAuto = calcularLiquidacion(datos.empleado_id, datos.fecha_salida);
    if (!calculoAuto.ok) return calculoAuto;
    monto = calculoAuto.totalCalculado;
  }

  if (isNaN(monto) || monto < 0) return { ok: false, mensaje: 'El monto debe ser un número mayor o igual a 0.' };

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var id   = generarId('LIQ');
  var notasCompletas = (datos.notas || '') +
    (calculoAuto ? '\n[Cálculo automático: vacaciones no tomadas + cesantía]' : '');

  hoja.appendRow([id, datos.empleado_id, formatearFecha(datos.fecha_salida),
    datos.motivo || '', formatearFecha(datos.fecha_calculo || hoy()), monto,
    datos.estado || 'pendiente', notasCompletas]);

  registrarBitacora('crear', 'Liquidacion', id, 'Liquidación de ' + monto + ' para ' + datos.empleado_id);

  // Opcional: dar de baja al empleado en el mismo paso.
  if (datos.inactivar) cambiarEstadoEmpleado(datos.empleado_id, 'inactivo', token);

  return {
    ok: true,
    mensaje: 'Liquidación registrada por ' + monto + '.',
    id: id
  };
}

function actualizarLiquidacion(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      hoja.getRange(i+1, 1, 1, 8).setValues([[datos.id, datos.empleado_id,
        formatearFecha(datos.fecha_salida), datos.motivo || '',
        formatearFecha(datos.fecha_calculo || hoy()), Number(datos.monto) || 0,
        datos.estado || 'pendiente', datos.notas || '']]);
      registrarBitacora('actualizar', 'Liquidacion', datos.id, 'Estado: ' + (datos.estado || 'pendiente'));
      return { ok: true, mensaje: 'Liquidación actualizada.' };
    }
  }
  return { ok: false, mensaje: 'No encontrada.' };
}

function marcarLiquidacionPagada(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la liquidación.' };
  hoja.getRange(fila, 7).setValue('pagada'); // columna 7 = estado
  registrarBitacora('actualizar', 'Liquidacion', id, 'Marcada como pagada');
  return { ok: true, mensaje: 'Liquidación marcada como pagada.' };
}

function eliminarLiquidacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.LIQUIDACIONES, id, 'Liquidacion');
}


// ===================================================================
// ===================================================================
// UTILIDADES GENÉRICAS DE CRUD (Refactorización - evita duplicación)
// ===================================================================

/**
 * Calcula el valor unitario de una hora de trabajo (centralizado, NO duplicado).
 * En CR: 240 horas/mes es el estándar laboral.
 * @param {number} salarioMensual
 * @param {number} [periodoHoras] - Horas en el período (default 240)
 * @return {number} valor por hora (sin redondear)
 */
function calcularValorHora(salarioMensual, periodoHoras) {
  var sal = Number(salarioMensual) || 0;
  var periodo = Number(periodoHoras) || 240;
  if (sal <= 0 || periodo <= 0) return 0;
  return sal / periodo;
}

/**
 * Patrón genérico para crear un registro en cualquier tabla.
 * Valida token, genera ID, agrega bitácora.
 * @param {string} nombreHoja - Nombre de la pestaña (usar HOJAS.*)
 * @param {string} tipoEntidad - Nombre legible (ej: "Empleado", "Préstamo")
 * @param {Object} datos - Datos a guardar
 * @param {string} token - Token de autorización
 * @param {Function} validar - Función de validación personalizada (opcional)
 * @param {Function} mapear - Función para mapear datos a fila de Sheets (opcional)
 * @return {Object} {ok, mensaje, id}
 */
function crearRegistro(nombreHoja, tipoEntidad, datos, token, validar, mapear) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos) return { ok: false, mensaje: tipoEntidad + ' sin datos.' };

  // Validación personalizada si existe
  if (validar) {
    var err = validar(datos);
    if (err) return { ok: false, mensaje: err };
  }

  var hoja = getHoja(nombreHoja);
  var id = generarId(tipoEntidad.toUpperCase().substring(0, 3));

  // Mapeo personalizado o genérico
  var fila = mapear ? mapear(id, datos) : [id, datos.empleado_id || '', JSON.stringify(datos)];

  hoja.appendRow(fila);
  registrarBitacora('crear', tipoEntidad, id, tipoEntidad + ' creado');
  return { ok: true, mensaje: tipoEntidad + ' registrado.', id: id };
}

/**
 * Patrón genérico para actualizar un registro.
 * @param {string} nombreHoja
 * @param {string} tipoEntidad
 * @param {Object} datos (debe incluir .id)
 * @param {string} token
 * @param {Function} validar (opcional)
 * @param {Function} actualizar (función que actualiza la fila)
 * @return {Object} {ok, mensaje}
 */
function actualizarRegistro(nombreHoja, tipoEntidad, datos, token, validar, actualizar) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.id) return { ok: false, mensaje: 'ID requerido.' };

  if (validar) {
    var err = validar(datos);
    if (err) return { ok: false, mensaje: err };
  }

  var hoja = getHoja(nombreHoja);
  var fila = buscarFilaPorId(hoja, datos.id);
  if (fila === -1) return { ok: false, mensaje: tipoEntidad + ' no encontrado.' };

  if (actualizar) {
    actualizar(hoja, fila, datos);
  }

  registrarBitacora('actualizar', tipoEntidad, datos.id, tipoEntidad + ' actualizado');
  return { ok: true, mensaje: tipoEntidad + ' actualizado.' };
}

// UTILIDAD: eliminar fila genérica
// ===================================================================

function eliminarFila(nombreHoja, id, entidad) {
  var hoja = getHoja(nombreHoja);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      hoja.deleteRow(i + 1);
      registrarBitacora('eliminar', entidad, id, entidad + ' eliminado');
      return { ok: true, mensaje: entidad + ' eliminado.' };
    }
  }
  return { ok: false, mensaje: 'Registro no encontrado.' };
}

function hoy() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}


// ===================================================================
// MÓDULO: INTEGRACIÓN CONTABILIDAD (Fase 5 - Item 7)
// ===================================================================
// Webhook para exportar nómina a ERP/Contabilidad

/**
 * Genera payload contable para nómina del mes.
 * Formato: cuentas por pagar, deducciones, impuestos.
 * Fase 5 - Item 7: Integración Contabilidad.
 * @param {string} mes - Formato yyyy-MM
 * @return {Object} {ok, payload} o {ok: false, mensaje}
 */
function generarPayloadContabilidad(mes) {
  try {
    var nominas = leerTabla(HOJAS.NOMINA).filter(function (n) {
      return String(n.mes) === mes;
    });

    if (!nominas.length) {
      return { ok: false, mensaje: 'Sin nóminas para ' + mes };
    }

    var totalBruto = 0, totalCCSS = 0, totalRenta = 0, totalNeto = 0;
    var empleados = [];

    nominas.forEach(function (n) {
      var bruto = Number(n.salario_base) || 0;
      var ded = Number(n.deducciones) || 0;
      var neto = Number(n.neto) || 0;

      totalBruto += bruto;
      totalNeto += neto;

      // Estimado: 10.67% CCSS, resto renta (simplificado)
      var ccss = Math.round(bruto * 0.1067);
      totalCCSS += ccss;

      var renta = ded - ccss;
      totalRenta += renta;

      empleados.push({
        empleado_id: n.empleado_id,
        salario_bruto: bruto,
        deduccion_ccss: ccss,
        deduccion_renta: renta,
        total_deducciones: ded,
        salario_neto: neto
      });
    });

    // Totales para asientos contables
    var payload = {
      periodo: mes,
      fecha_generacion: new Date().toISOString(),
      resumen: {
        total_empleados: nominas.length,
        total_bruto: totalBruto,
        total_ccss_empleado: totalCCSS,
        total_renta_empleado: totalRenta,
        total_deducciones: totalCCSS + totalRenta,
        total_neto_pagable: totalNeto,
        ccss_patronal_estimado: Math.round(totalBruto * 0.1067)  // Patronal aparte
      },
      detalle: empleados,
      asientos_contables: [
        {
          descripcion: 'Nómina mes ' + mes + ' - Gasto de personal',
          cuenta_gasto: '5100-001',  // Gastos de personal (ajustar a contabilidad real)
          debito: totalBruto,
          credito: 0
        },
        {
          descripcion: 'Nómina mes ' + mes + ' - Cuentas por pagar',
          cuenta_pasivo: '2100-001',  // CxP sueldos (ajustar)
          debito: 0,
          credito: totalNeto
        },
        {
          descripcion: 'Nómina mes ' + mes + ' - CCSS descuento empleado',
          cuenta_pasivo: '2150-001',  // CxP CCSS
          debito: 0,
          credito: totalCCSS
        }
      ]
    };

    return { ok: true, payload: payload };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Envía payload contable a webhook externo (ERP, Contabilidad).
 * Fase 5 - Item 7: Integración externa.
 * @param {string} urlWebhook - URL del servidor destino
 * @param {Object} payload - Datos a enviar
 * @param {string} [autorizacion] - Bearer token si aplica
 * @return {Object} {ok, respuesta} o {ok: false, error}
 */
function enviarPayloadContabilidad(urlWebhook, payload, autorizacion) {
  try {
    var opciones = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    if (autorizacion) {
      opciones.headers = { 'Authorization': 'Bearer ' + autorizacion };
    }

    var respuesta = UrlFetchApp.fetch(urlWebhook, opciones);
    var codigo = respuesta.getResponseCode();

    if (codigo >= 200 && codigo < 300) {
      registrarBitacora('integracion', 'Contabilidad', payload.periodo, 'Payload enviado a ' + urlWebhook);
      return { ok: true, respuesta: respuesta.getContentText() };
    } else {
      return { ok: false, error: 'HTTP ' + codigo + ': ' + respuesta.getContentText() };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ===================================================================
// MÓDULO: CACHÉ DE LECTURAS (Fase 4 - Item 10)
// ===================================================================
// Memoización por sesión para evitar releer tablas múltiples veces

var CACHE_TABLAS = {};
var CACHE_TIMESTAMP = {};
var CACHE_TTL_MS = 300000; // 5 minutos

/**
 * Lee tabla con caché automático (5 min TTL).
 * Evita releer la misma tabla N veces en un request.
 * @param {string} nombreHoja
 * @return {Object[]}
 */
function leerTablaConCache(nombreHoja) {
  var ahora = new Date().getTime();
  var cached = CACHE_TABLAS[nombreHoja];
  var timestamp = CACHE_TIMESTAMP[nombreHoja] || 0;

  // Si está en caché y no expiró, devolver
  if (cached && (ahora - timestamp < CACHE_TTL_MS)) {
    return cached;
  }

  // Leer y cachear
  var datos = leerTabla(nombreHoja);
  CACHE_TABLAS[nombreHoja] = datos;
  CACHE_TIMESTAMP[nombreHoja] = ahora;
  return datos;
}

/**
 * Invalida caché de una tabla específica.
 * Llamar después de crear/actualizar/eliminar.
 * @param {string} nombreHoja
 */
function invalidarCache(nombreHoja) {
  delete CACHE_TABLAS[nombreHoja];
  delete CACHE_TIMESTAMP[nombreHoja];
}

/**
 * Invalida todo el caché.
 */
function invalidarTodoCache() {
  CACHE_TABLAS = {};
  CACHE_TIMESTAMP = {};
}

// ===================================================================
// MÓDULO: VALIDADORES CENTRALIZADOS (Fase 4 - Item 4)
// ===================================================================
// Una fuente única de verdad para reglas de validación en toda la app

var VALIDADORES = {
  /**
   * Valida rango de horas en formato HH:mm
   * @param {string} hora - Formato HH:mm
   * @return {string|null} Error message o null si válido
   */
  validarHora: function(hora) {
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) return 'Formato debe ser HH:mm';
    var h = parseInt(hora.split(':')[0], 10);
    var m = parseInt(hora.split(':')[1], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'Hora debe estar entre 00:00 y 23:59';
    return null;
  },

  /**
   * Valida salario mínimo CR (~500k 2025)
   * @param {number} salario
   * @return {string|null}
   */
  validarSalario: function(salario) {
    var sal = Number(salario);
    if (sal <= 0) return 'Salario debe ser mayor a 0';
    if (sal < 500000) return 'Salario ₡' + sal + ' es inferior al mínimo legal (~₡500,000)';
    return null;
  },

  /**
   * Valida fecha: debe ser válida y no futura
   * @param {string} fecha - Formato yyyy-MM-dd
   * @param {boolean} permiteFutura - Default false
   * @return {string|null}
   */
  validarFecha: function(fecha, permiteFutura) {
    if (!fecha || isNaN(new Date(fecha).getTime())) return 'Fecha inválida';
    var fd = new Date(fecha);
    var hoy = new Date();
    if (!permiteFutura && fd > hoy) return 'No se permite fecha futura';
    return null;
  },

  /**
   * Valida rango de fechas
   * @param {string} inicio
   * @param {string} fin
   * @return {string|null}
   */
  validarRangoFechas: function(inicio, fin) {
    if (new Date(fin) < new Date(inicio)) return 'Fecha fin no puede ser anterior a inicio';
    return null;
  },

  /**
   * Valida enum (lista de valores válidos)
   * @param {string} valor
   * @param {string[]} valoresValidos
   * @param {string} nombreCampo
   * @return {string|null}
   */
  validarEnum: function(valor, valoresValidos, nombreCampo) {
    var v = String(valor || '').toLowerCase();
    if (valoresValidos.map(function(x) { return String(x).toLowerCase(); }).indexOf(v) === -1) {
      return nombreCampo + ' inválido. Use: ' + valoresValidos.join(', ');
    }
    return null;
  },

  /**
   * Valida horas extra cumplan límite 240/mes
   * @param {number} horasNuevas
   * @param {string} empleadoId
   * @param {string} mes - yyyy-MM
   * @return {string|null}
   */
  validarHorasExtraLimite: function(horasNuevas, empleadoId, mes) {
    var horasExtra = leerTabla(HOJAS.HORAS_EXTRA) || [];
    var horasDelMes = horasExtra.filter(function (h) {
      var hFecha = new Date(h.fecha);
      var hMesAno = hFecha.getFullYear() + '-' + String(hFecha.getMonth() + 1).padStart(2, '0');
      return String(h.empleado_id) === String(empleadoId) && hMesAno === mes;
    }).reduce(function (sum, h) { return sum + Number(h.horas||0); }, 0);

    if (horasDelMes + Number(horasNuevas) > 240) {
      return 'Límite mensual (240h) alcanzado. Ya tiene ' + horasDelMes + 'h este mes';
    }
    return null;
  },

  /**
   * Valida email básico
   * @param {string} email
   * @return {string|null}
   */
  validarEmail: function(email) {
    if (!email || !String(email).includes('@')) return 'Email inválido';
    return null;
  }
};

// ===================================================================
// MÓDULO: PERMISOS (Fase 3 - Item 9)
// ===================================================================
// Permisos diferentes a vacaciones según ley CR
// Tipos: personal, médico, administrativo, asuntos_propios

/**
 * Lista permisos con detalles de empleados.
 * @param {string} [empleadoId] - Filtrar por empleado (opcional)
 * @param {string} [estado] - Filtrar por estado (opcional)
 * @return {Object[]}
 */
function listarPermisos(empleadoId, estado) {
  var permisos = leerTabla(HOJAS.PERMISOS || 'Permisos') || [];
  if (empleadoId) permisos = permisos.filter(function (p) { return String(p.empleado_id) === String(empleadoId); });
  if (estado) permisos = permisos.filter(function (p) { return String(p.estado).toLowerCase() === String(estado).toLowerCase(); });

  var nombres = mapaEmpleados();
  permisos.forEach(function (p) {
    p.empleado_nombre = nombres[p.empleado_id] || '(desconocido)';
  });
  return permisos;
}

/**
 * Crea un nuevo permiso (personal, médico, etc.).
 * @param {Object} datos - {empleado_id, tipo, fecha_inicio, fecha_fin, motivo, notas}
 * @param {string} token
 * @return {Object} {ok, mensaje, id}
 */
function crearPermiso(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Empleado requerido.' };

  var tiposValidos = ['personal', 'medico', 'administrativo', 'asuntos_propios'];
  var tipo = String(datos.tipo || 'personal').toLowerCase();
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, mensaje: 'Tipo inválido. Use: ' + tiposValidos.join(', ') };
  }

  try {
    var hoja = getHoja(HOJAS.PERMISOS || 'Permisos');
    var id = generarId('PRM');
    hoja.appendRow([id, datos.empleado_id, tipo, datos.fecha_inicio || '',
                    datos.fecha_fin || '', 'pendiente', datos.motivo || '', datos.notas || '']);
    registrarBitacora('crear', 'Permiso', id, tipo + ' - ' + datos.motivo);
    return { ok: true, mensaje: 'Permiso creado.', id: id };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================================================================
// MÓDULO: WORKFLOW DE APROBACIONES (Fase 5 - Item 20)
// ===================================================================
// Flujo: pendiente → aprobado_jefe → aprobado_rrhh

/**
 * Estados válidos en el workflow de aprobaciones.
 */
var ESTADOS_APROBACION = {
  PENDIENTE: 'pendiente',
  APROBADO_JEFE: 'aprobado_jefe',
  APROBADO_RRHH: 'aprobado_rrhh',
  RECHAZADO_JEFE: 'rechazado_jefe',
  RECHAZADO_RRHH: 'rechazado_rrhh'
};

/**
 * Aprueba una solicitud (vacación, permiso, etc.) en el workflow.
 * Fase 5 - Item 20: Workflow multi-nivel.
 * @param {string} tipoSolicitud - 'vacacion', 'permiso', etc.
 * @param {string} solicitudId
 * @param {string} nuevoEstado - Estado siguiente en workflow
 * @param {string} token
 * @param {string} [notas] - Notas de aprobación
 * @return {Object} {ok, mensaje}
 */
function aprobarSolicitud(tipoSolicitud, solicitudId, nuevoEstado, token, notas) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var rol = sesion.rol || 'empleado';

  // Validar que el usuario tenga permiso para aprobar en este nivel
  if (nuevoEstado === ESTADOS_APROBACION.APROBADO_JEFE && rol !== 'jefe_depto' && rol !== 'jefe_rrhh' && rol !== 'admin') {
    return { ok: false, mensaje: 'Solo jefe de departamento o superior puede aprobar en primer nivel' };
  }
  if (nuevoEstado === ESTADOS_APROBACION.APROBADO_RRHH && rol !== 'jefe_rrhh' && rol !== 'admin') {
    return { ok: false, mensaje: 'Solo jefe de RRHH o admin puede aprobar en segundo nivel' };
  }

  try {
    var hojaMap = {
      'vacacion': HOJAS.VACACIONES,
      'permiso': HOJAS.PERMISOS || 'Permisos'
    };

    var nombreHoja = hojaMap[tipoSolicitud];
    if (!nombreHoja) return { ok: false, mensaje: 'Tipo de solicitud no válido' };

    var hoja = getHoja(nombreHoja);
    var fila = buscarFilaPorId(hoja, solicitudId);
    if (fila === -1) return { ok: false, mensaje: 'Solicitud no encontrada' };

    // Actualizar estado
    hoja.getRange(fila, 6).setValue(nuevoEstado);  // Columna 6 = estado (ajustar si es diferente)

    // Registrar auditoría
    registrarBitacora('aprobar', tipoSolicitud.toUpperCase(), solicitudId,
      'Estado: ' + nuevoEstado + ' | Por: ' + rol + ' | Notas: ' + (notas || '—'));

    return { ok: true, mensaje: 'Solicitud aprobada: ' + nuevoEstado };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Rechaza una solicitud en el workflow.
 * @param {string} tipoSolicitud
 * @param {string} solicitudId
 * @param {string} razonRechazo
 * @param {string} token
 * @return {Object} {ok, mensaje}
 */
function rechazarSolicitud(tipoSolicitud, solicitudId, razonRechazo, token) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var rol = sesion.rol || 'empleado';
  var estadoRechazo = rol === 'jefe_rrhh' || rol === 'admin' ?
    ESTADOS_APROBACION.RECHAZADO_RRHH : ESTADOS_APROBACION.RECHAZADO_JEFE;

  return aprobarSolicitud(tipoSolicitud, solicitudId, estadoRechazo, token, 'Rechazado: ' + razonRechazo);
}

// ===================================================================
// MÓDULO: REPORTES AUTOMATIZADOS (Fase 3 - Item 6)
// ===================================================================

/**
 * Genera un reporte HTML de nómina del mes especificado.
 * Formato HTML optimizado para imprimir/convertir a PDF.
 * @param {string} mes - Formato yyyy-MM
 * @return {Object} {ok, html, fileName}
 */
function generarReporteNomina(mes) {
  var nominas = leerTabla(HOJAS.NOMINA).filter(function (n) {
    return String(n.mes) === mes;
  });

  if (!nominas.length) return { ok: false, mensaje: 'Sin nóminas para ' + mes };

  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var empleadosMap = {};
  empleados.forEach(function (e) { empleadosMap[e.id] = e; });

  var totalBruto = 0, totalDeducciones = 0, totalNeto = 0;

  var tablaNominas = '<table style="width:100%;border-collapse:collapse;font-size:11px"><tr>' +
    '<th style="border:1px solid #ccc;padding:4px">Empleado</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Salario Base</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Deducciones</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Neto</th></tr>';

  nominas.forEach(function (n) {
    var emp = empleadosMap[n.empleado_id] || {};
    var bruto = Number(n.salario_base) || 0;
    var ded = Number(n.deducciones) || 0;
    var neto = Number(n.neto) || 0;
    totalBruto += bruto;
    totalDeducciones += ded;
    totalNeto += neto;

    tablaNominas += '<tr>' +
      '<td style="border:1px solid #ccc;padding:4px">' + (emp.nombre || '?') + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(bruto).toLocaleString() + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(ded).toLocaleString() + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(neto).toLocaleString() + '</td></tr>';
  });

  tablaNominas += '<tr style="font-weight:bold;background:#f0f0f0">' +
    '<td style="border:1px solid #ccc;padding:4px">TOTAL</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalBruto).toLocaleString() + '</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalDeducciones).toLocaleString() + '</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalNeto).toLocaleString() + '</td></tr></table>';

  var html = '<html><body style="font-family:Arial"><h2>Reporte de Nómina - ' + mes + '</h2>' +
    '<p>Fecha: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '</p>' +
    tablaNominas +
    '<p style="margin-top:20px;font-size:10px;color:#666">Este es un reporte generado automáticamente por Sistema RRHH.</p>' +
    '</body></html>';

  return {
    ok: true,
    html: html,
    fileName: 'Nomina_' + mes + '.html',
    totalEmpleados: nominas.length,
    totalNeto: Math.round(totalNeto * 100) / 100
  };
}

/**
 * Envía un reporte por email.
 * @param {string} destinatario - Email del destinatario
 * @param {string} asunto - Asunto del email
 * @param {string} htmlContent - Contenido HTML del reporte
 * @param {string} [nombreArchivo] - Opcional, para adjuntar
 * @return {Object} {ok, mensaje}
 */
function enviarReportePorEmail(destinatario, asunto, htmlContent, nombreArchivo) {
  if (!destinatario || !destinatario.includes('@')) {
    return { ok: false, mensaje: 'Email inválido: ' + destinatario };
  }

  try {
    GmailApp.sendEmail(destinatario, asunto, htmlContent, {
      htmlBody: htmlContent,
      name: 'Sistema RRHH'
    });

    registrarBitacora('enviar', 'Reporte', destinatario, 'Reporte enviado: ' + asunto);
    return { ok: true, mensaje: 'Reporte enviado a ' + destinatario };
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/**
 * Resumen de alertas para reportar.
 * @return {string} HTML formateado
 */
function generarReporteAlertas() {
  var alertas = obtenerAlertas();
  if (!alertas.length) return '<p>Sin alertas activas.</p>';

  var html = '<h3>Alertas Activas</h3><table style="width:100%;border-collapse:collapse;font-size:10px">' +
    '<tr><th style="border:1px solid #ccc;padding:4px">Urgencia</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Tipo</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Descripción</th></tr>';

  alertas.slice(0, 20).forEach(function (a) {
    var urgenciaColor = a.urgencia === 'crítica' ? '#ff6b6b' : a.urgencia === 'alta' ? '#ffa500' : '#ffeb3b';
    html += '<tr><td style="border:1px solid #ccc;padding:4px;background:' + urgenciaColor + '">' + a.urgencia + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px">' + a.tipo + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px">' + a.descripcion + '</td></tr>';
  });

  html += '</table>';
  return html;
}

