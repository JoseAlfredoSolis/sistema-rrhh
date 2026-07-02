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
  TURNOS:            'Turnos'
};

/**
 * Encabezados esperados por pestaña (orden = orden de las columnas).
 * Sirven para crear la hoja automáticamente si no existe.
 */
var ENCABEZADOS = {
  Empleados:         ['id', 'nombre', 'cedula', 'departamento', 'puesto', 'fecha_ingreso', 'salario', 'estado', 'fecha_nacimiento', 'telefono'],
  Departamentos:     ['id', 'nombre', 'responsable'],
  Asistencia:        ['id', 'empleado_id', 'fecha', 'hora_entrada', 'hora_salida', 'horas'],
  Vacaciones:        ['id', 'empleado_id', 'fecha_inicio', 'fecha_fin', 'dias', 'estado'],
  Nomina:            ['id', 'empleado_id', 'mes', 'salario_base', 'deducciones', 'neto'],
  HistorialSalarios: ['id', 'empleado_id', 'salario_anterior', 'salario_nuevo', 'fecha', 'notas'],
  Capacitaciones:    ['id', 'empleado_id', 'curso', 'institucion', 'fecha_inicio', 'fecha_fin', 'estado', 'certificado_url'],
  Evaluaciones:      ['id', 'empleado_id', 'periodo', 'calificacion', 'comentarios', 'evaluador', 'fecha'],
  Bitacora:          ['id', 'fecha', 'usuario', 'accion', 'entidad', 'entidad_id', 'resumen'],
  Prestamos:         ['id', 'empleado_id', 'monto', 'cuotas', 'cuota_mensual', 'cuotas_pagadas', 'estado', 'fecha', 'notas'],
  HorasExtra:        ['id', 'empleado_id', 'fecha', 'horas', 'tipo', 'aprobado', 'monto', 'notas'],
  Activos:           ['id', 'empleado_id', 'nombre', 'categoria', 'serial', 'fecha_entrega', 'fecha_devolucion', 'estado', 'notas'],
  Turnos:            ['id', 'empleado_id', 'semana', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
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
  var mapa = { chart: 'Lib_Chart', xlsx: 'Lib_Xlsx' };
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
 * Lee TODA una pestaña y la devuelve como un arreglo de objetos,
 * usando la primera fila como nombres de propiedad.
 * Ej: [{id:'...', nombre:'...', ...}, ...]
 *
 * @param {string} nombreHoja
 * @return {Object[]} filas como objetos.
 */
function leerTabla(nombreHoja) {
  var hoja = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();

  // Si solo hay encabezados (o nada), no hay registros.
  if (datos.length < 2) {
    return [];
  }

  var encabezados = datos[0];
  var filas = [];

  for (var i = 1; i < datos.length; i++) {
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      obj[encabezados[c]] = datos[i][c];
    }
    filas.push(obj);
  }
  return filas;
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
 * Busca el número de fila (1-based, como en la hoja) de un registro
 * por su id. Devuelve -1 si no lo encuentra.
 * Recuerda: la fila 1 son encabezados, los datos empiezan en la 2.
 *
 * @param {Sheet} hoja
 * @param {string} id
 * @return {number} índice de fila en la hoja, o -1.
 */
function buscarFilaPorId(hoja, id) {
  var datos = hoja.getDataRange().getValues();
  // Columna 0 = id (primera columna en todas nuestras tablas).
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(id)) {
      return i + 1; // +1 porque las filas de la hoja son 1-based.
    }
  }
  return -1;
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
  // Salario: debe ser un número >= 0.
  var salario = Number(emp.salario);
  if (emp.salario === '' || emp.salario === null || isNaN(salario) || salario < 0) {
    return 'El salario debe ser un número mayor o igual a 0.';
  }
  // Fecha de ingreso: obligatoria y con formato válido (yyyy-mm-dd).
  if (!emp.fecha_ingreso || isNaN(new Date(emp.fecha_ingreso).getTime())) {
    return 'La fecha de ingreso no es válida.';
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
    emp.fecha_ingreso     = formatearFecha(emp.fecha_ingreso);
    emp.fecha_nacimiento  = emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '';
    emp.telefono          = emp.telefono ? String(emp.telefono) : '';
    emp.salario           = Number(emp.salario) || 0;
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
  ];

  hoja.appendRow(fila);
  registrarBitacora('crear', 'Empleados', id, String(emp.nombre).trim());
  return { ok: true, mensaje: 'Empleado creado correctamente.', id: id };
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

  var estadoActual   = hoja.getRange(fila, 8).getValue() || 'activo';
  var salarioAnterior = Number(hoja.getRange(fila, 7).getValue()) || 0;
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
    emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : (String(hoja.getRange(fila, 9).getValue() || '')),
    emp.telefono ? String(emp.telefono).trim() : (String(hoja.getRange(fila, 10).getValue() || ''))
  ];

  hoja.getRange(fila, 1, 1, valores.length).setValues([valores]);

  if (salarioAnterior !== salarioNuevo) {
    var hojaHist = getHoja(HOJAS.HISTORIAL_SALARIOS);
    hojaHist.appendRow([generarId('HSA'), emp.id, salarioAnterior, salarioNuevo,
      formatearFecha(new Date()), emp.notasSalario || '']);
  }

  registrarBitacora('actualizar', 'Empleados', emp.id, String(emp.nombre).trim());
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
  // Columna 8 = estado.
  hoja.getRange(fila, 8).setValue(nuevoEstado);
  registrarBitacora('actualizar', 'Empleados', id, 'Estado: ' + nuevoEstado);
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

/** Lista la asistencia, agregando el nombre del empleado. */
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
  registros.forEach(function (r) {
    r.fecha = formatearFecha(r.fecha);
    r.hora_entrada = formatearHora(r.hora_entrada);
    r.hora_salida = formatearHora(r.hora_salida);
    r.empleado_nombre = nombres[r.empleado_id] || '(desconocido)';
    r.horas = Number(r.horas) || 0;
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
  if (!/^\d{2}:\d{2}$/.test(a.hora_entrada || '') || !/^\d{2}:\d{2}$/.test(a.hora_salida || '')) {
    return { ok: false, mensaje: 'Las horas deben tener formato HH:mm.' };
  }
  var fechaNorm = formatearFecha(a.fecha);
  var duplicado = leerTabla(HOJAS.ASISTENCIA).some(function (r) {
    return String(r.empleado_id) === String(a.empleado_id) &&
           formatearFecha(r.fecha) === fechaNorm;
  });
  if (duplicado) {
    return { ok: false, mensaje: 'Ya existe un registro de asistencia para ese empleado en esa fecha.' };
  }
  var horas = calcularHoras(a.hora_entrada, a.hora_salida);
  return conLock(function () {
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

/** Lista las solicitudes de vacaciones con el nombre del empleado. */
function listarVacaciones() {
  var lista = leerTabla(HOJAS.VACACIONES);
  var nombres = mapaEmpleados();
  lista.forEach(function (v) {
    v.fecha_inicio = formatearFecha(v.fecha_inicio);
    v.fecha_fin = formatearFecha(v.fecha_fin);
    v.dias = Number(v.dias) || 0;
    v.empleado_nombre = nombres[v.empleado_id] || '(desconocido)';
  });
  return lista;
}

/** Crea una solicitud de vacaciones (nace 'pendiente'). */
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
  var dias = calcularDias(v.fecha_inicio, v.fecha_fin);
  var balance = obtenerBalanceVacaciones(v.empleado_id);
  if (!balance.ok) return balance;
  if (dias > balance.diasDisponibles) {
    return { ok: false, mensaje: 'Solicitud excede días disponibles (' + balance.diasDisponibles + ').' };
  }
  return conLock(function () {
    var hoja = getHoja(HOJAS.VACACIONES);
    var id = generarId('VAC');
    hoja.appendRow([id, v.empleado_id, formatearFecha(v.fecha_inicio),
                    formatearFecha(v.fecha_fin), dias, 'pendiente']);
    try { _notificarWhatsAppNuevaVacacion(v, dias); } catch (e) {}
    return { ok: true, mensaje: 'Solicitud creada (' + dias + ' días).', id: id };
  });
}

/** Cambia el estado de una solicitud (aprobar / rechazar). */
function cambiarEstadoVacaciones(id, nuevoEstado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (['pendiente', 'aprobada', 'rechazada'].indexOf(nuevoEstado) === -1) {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.VACACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la solicitud.' };
  hoja.getRange(fila, 6).setValue(nuevoEstado); // columna 6 = estado
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

/** Lista la nómina con nombre del empleado. */
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
  var nominaMes = leerTabla(HOJAS.NOMINA).filter(function (n) {
    return String(n.mes) === mesActual;
  });
  var totalNeto = nominaMes.reduce(function (suma, n) {
    return suma + (Number(n.neto) || 0);
  }, 0);

  // Masa salarial de los empleados activos.
  var masaSalarial = activos.reduce(function (suma, e) {
    return suma + (Number(e.salario) || 0);
  }, 0);

  var porDepto = {};
  activos.forEach(function (e) {
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });
  var empleadosPorDepto = Object.keys(porDepto).map(function (d) {
    return { nombre: d, total: porDepto[d] };
  });

  var nominaMesMap = {};
  leerTabla(HOJAS.NOMINA).forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    nominaMesMap[mes] = (nominaMesMap[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaHistorica = Object.keys(nominaMesMap).sort().slice(-6).map(function (mes) {
    return { mes: mes, neto: Math.round(nominaMesMap[mes] * 100) / 100 };
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
    empleadosPorDepto: empleadosPorDepto,
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
function obtenerReportes() {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var nombres = mapaEmpleados();

  // 1) Empleados ACTIVOS por departamento.
  var porDepto = {};
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return;
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });

  // 2) Empleados por estado (activos / inactivos).
  var activos = 0, inactivos = 0;
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() === 'activo') activos++;
    else inactivos++;
  });

  // 3) Nómina: total neto por mes (ordenado por mes).
  var nominaMes = {};
  leerTabla(HOJAS.NOMINA).forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    nominaMes[mes] = (nominaMes[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaPorMes = Object.keys(nominaMes).sort().map(function (mes) {
    return [mes, Math.round(nominaMes[mes] * 100) / 100];
  });

  // 4) Asistencia: total de horas por empleado.
  var horasEmp = {};
  leerTabla(HOJAS.ASISTENCIA).forEach(function (a) {
    var nombre = nombres[a.empleado_id] || '(desconocido)';
    horasEmp[nombre] = (horasEmp[nombre] || 0) + (Number(a.horas) || 0);
  });
  var horasPorEmpleado = Object.keys(horasEmp).map(function (nom) {
    return [nom, Math.round(horasEmp[nom] * 100) / 100];
  }).sort(function (a, b) { return b[1] - a[1]; }); // de mayor a menor

  // 5) Vacaciones por estado.
  var vacEstado = {};
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
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
  var cfg    = obtenerConfigAlertas();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  var waCfg  = obtenerConfigWhatsAppInterno();
  var waListo = waCfg.activo && waCfg.telefono && waCfg.apikey;

  if (!emails.length && !waListo) return;

  if (emails.length) {
    if (cfg.vacacionesPendientesActiva) {
      var msgVac = _cuerpoVacacionesPendientes();
      if (msgVac) _enviarCorreo(emails, '🏖 Vacaciones pendientes de aprobación', msgVac);
    }

    if (cfg.nominaMensualActiva) {
      var hoy = new Date();
      if (hoy.getDate() >= Number(cfg.nominaMensualDia)) {
        var msgNom = _cuerpoNominaMensual();
        if (msgNom) _enviarCorreo(emails, '💰 Nómina mensual no generada', msgNom);
      }
    }

    if (cfg.resumenSemanalActivo && new Date().getDay() === 1) {
      _enviarCorreo(emails, '📊 Resumen semanal de RRHH', _cuerpoResumenSemanal());
    }

    if (cfg.cumpleaniosActiva && new Date().getDate() === 1) {
      var msgCump = _cuerpoProximosCumpleanios();
      if (msgCump) _enviarCorreo(emails, '🎂 Cumpleaños de empleados este mes', msgCump);
    }
  }

  if (waListo) {
    _enviarAlertasWhatsApp(cfg, waCfg);
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

  filas.forEach(function (fila, idx) {
    var numFila = idx + 2; // fila real en el Excel (encabezados en 1)
    try {
      if (entidad === 'EMPLEADOS') {
        var emp = {
          nombre:        String(fila.nombre        || '').trim(),
          cedula:        String(fila.cedula         || '').trim(),
          departamento:  String(fila.departamento  || '').trim(),
          puesto:        String(fila.puesto         || '').trim(),
          fecha_ingreso: String(fila.fecha_ingreso  || '').trim(),
          salario:       fila.salario,
          estado:        String(fila.estado || 'activo').trim().toLowerCase(),
          fecha_nacimiento: String(fila.fecha_nacimiento || '').trim(),
          telefono:      String(fila.telefono || '').trim()
        };
        if (emp.estado !== 'activo' && emp.estado !== 'inactivo') emp.estado = 'activo';

        var error = validarEmpleado(emp);
        if (error) { errores.push({ fila: numFila, motivo: error }); return; }
        if (cedulaDuplicada(emp.cedula, null)) { omitidos++; return; }

        hoja.appendRow([generarId('EMP'), emp.nombre, emp.cedula,
          emp.departamento, emp.puesto, formatearFecha(emp.fecha_ingreso),
          Number(emp.salario) || 0, emp.estado,
          emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '',
          emp.telefono || '']);
        creados++;

      } else if (entidad === 'DEPARTAMENTOS') {
        var dep = {
          nombre:      String(fila.nombre      || '').trim(),
          responsable: String(fila.responsable || '').trim()
        };
        if (!dep.nombre) { errores.push({ fila: numFila, motivo: 'Nombre vacío.' }); return; }
        if (departamentoDuplicado(dep.nombre, null)) { omitidos++; return; }
        hoja.appendRow([generarId('DEP'), dep.nombre, dep.responsable]);
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

function registrarBitacora(accion, entidad, entidadId, resumen) {
  try {
    var hoja = getHoja(HOJAS.BITACORA);
    var usuario = '';
    try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}
    hoja.appendRow([generarId('BIT'), new Date(), usuario,
      accion, entidad, entidadId || '', resumen || '']);
  } catch (e) { /* no interrumpir operaciones por fallo de bitácora */ }
}

function listarBitacora(limite) {
  var registros = leerTabla(HOJAS.BITACORA);
  registros.forEach(function (r) {
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? -1 : 1; }).reverse();
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
// MÓDULO: BALANCE DE VACACIONES
// ===================================================================

function obtenerBalanceVacaciones(empleadoId) {
  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(empleadoId);
  })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var diasPorAnio   = 15; // días mínimos legales en Costa Rica
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

  return {
    ok: true,
    nombre:          emp.nombre,
    diasAcumulados:  diasAcumulados,
    diasUsados:      diasUsados,
    diasDisponibles: Math.max(0, diasAcumulados - diasUsados)
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

function crearCarpetaEmpleado(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  try {
    var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
    var raiz     = _getCarpetaRaizDocs();
    var nombre   = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
    var iter     = raiz.getFoldersByName(nombre);
    var carpeta  = iter.hasNext() ? iter.next() : raiz.createFolder(nombre);
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
    var nombreCarpeta = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
    var iter = raiz.getFoldersByName(nombreCarpeta);
    if (!iter.hasNext()) {
      return { ok: true, documentos: [], carpetaUrl: null };
    }
    var carpetaEmp = iter.next();
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

  try {
    var libro  = getLibro();
    var fecha  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var copia  = libro.copy('[BACKUP ' + fecha + '] ' + libro.getName());
    registrarBitacora('respaldo', 'Sistema', '', 'Backup: ' + copia.getName());
    return { ok: true, mensaje: 'Respaldo creado correctamente.', url: copia.getUrl() };
  } catch (e) {
    return { ok: false, mensaje: 'Error al crear respaldo: ' + e.message };
  }
}

function activarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  desactivarRespaldoSemanal();
  var t = ScriptApp.newTrigger('crearRespaldo')
    .timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_RESPALDO_TRIGGER, t.getUniqueId());
  return { ok: true, mensaje: 'Respaldo automático semanal activado (domingos a las 2 a.m.).' };
}

function desactivarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'crearRespaldo') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_RESPALDO_TRIGGER);
  return { ok: true, mensaje: 'Respaldo automático desactivado.' };
}

function estadoRespaldo() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'crearRespaldo';
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
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
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

function buscarGlobal(query) {
  if (!query || !query.trim()) return [];
  var q = String(query).toLowerCase().trim();
  var resultados = [];

  function agregar(entidad, id, titulo, subtitulo, vista) {
    resultados.push({ entidad: entidad, id: id, titulo: titulo, subtitulo: subtitulo, vista: vista });
  }

  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    if (String(e.nombre||'').toLowerCase().indexOf(q) !== -1 ||
        String(e.cedula||'').toLowerCase().indexOf(q) !== -1) {
      agregar('Empleado', e.id, e.nombre, e.departamento||'', 'empleados');
    }
  });
  leerTabla(HOJAS.CAPACITACIONES).forEach(function (c) {
    if (String(c.curso||'').toLowerCase().indexOf(q) !== -1) {
      agregar('Capacitacion', c.id, c.curso, c.institucion||'', 'capacitaciones');
    }
  });
  leerTabla(HOJAS.DEPARTAMENTOS).forEach(function (d) {
    if (String(d.nombre||'').toLowerCase().indexOf(q) !== -1) {
      agregar('Departamento', d.id, d.nombre, d.responsable||'', 'departamentos');
    }
  });
  leerTabla(HOJAS.ACTIVOS).forEach(function (a) {
    if (String(a.nombre||'').toLowerCase().indexOf(q) !== -1 ||
        String(a.serial||'').toLowerCase().indexOf(q) !== -1) {
      agregar('Activo', a.id, a.nombre, 'Serial: ' + (a.serial||'-'), 'activos');
    }
  });
  return resultados.slice(0, 25);
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
      eventos.push({ tipo: 'vacaciones', dia: ini.getDate(), titulo: 'Vacaciones', color: '#10b981' });
    }
  });

  leerTabla(HOJAS.HORAS_EXTRA).forEach(function (h) {
    var fd = new Date(h.fecha);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'horasextra', dia: fd.getDate(), titulo: 'Horas extra', color: '#f59e0b' });
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

function listarPrestamos(empleadoId) {
  var rows = leerTabla(HOJAS.PRESTAMOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
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

  var hoja = getHoja(HOJAS.PRESTAMOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      var cuota = Math.round(Number(datos.monto) / Number(datos.cuotas));
      hoja.getRange(i+1, 1, 1, 9).setValues([[datos.id, datos.empleado_id, datos.monto, datos.cuotas, cuota, datos.cuotas_pagadas||0, datos.estado||'activo', datos.fecha||hoy(), datos.notas||'']]);
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
      var valorHora = Number(emp.salario) / 240;
      r.monto = Math.round(valorHora * 1.5 * Number(r.horas));
    }
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function crearHoraExtra(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja  = getHoja(HOJAS.HORAS_EXTRA);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  var emp   = empls.filter(function (e) { return String(e.id) === String(datos.empleado_id); })[0] || {};
  var monto = datos.monto || 0;
  if (!monto && emp.salario) {
    var vh = Number(emp.salario) / 240;
    monto  = Math.round(vh * 1.5 * Number(datos.horas));
  }
  var id = generarId();
  hoja.appendRow([id, datos.empleado_id, datos.fecha||hoy(), datos.horas, datos.tipo||'normal', datos.aprobado||'pendiente', monto, datos.notas||'']);
  registrarBitacora('crear', 'HoraExtra', id, datos.horas + ' hrs extra');
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

function listarActivos(empleadoId) {
  var rows = leerTabla(HOJAS.ACTIVOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  return enriquecerConEmpleado(rows);
}

function crearActivo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ACTIVOS);
  var id   = generarId();
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
  var id = generarId();
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

