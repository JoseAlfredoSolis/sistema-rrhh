# Guía de diseño UX/UI — Sistema RRHH

Documento de referencia del sistema de diseño "Minimalista & Profesional" (v4)
aplicado en `Stylesheet.html`. Todos los valores son los tokens reales en uso,
no recomendaciones genéricas.

## 1. Qué se eliminó / simplificó

| Elemento | Antes | Ahora |
|---|---|---|
| Acento de color | Indigo muy saturado (`#6366f1`) en múltiples superficies | Un solo acento (`#4f46e5`), solo en estados activo/foco/acción |
| Barra de 3px decorativa | En tarjetas KPI y borde superior de modales | Eliminada |
| Sombras | Dobles, con tinte de color | Neutras, casi planas — la jerarquía la da el borde 1px |
| Radios de esquina | 5+ valores sueltos (4/5/8/10/16/20px) | 5 tokens consistentes (6/8/10/12/14px) |
| Tipografía | ~16 tamaños, varios con medios-píxeles | Escala de 8 pasos, enteros |
| Labels de formulario | MAYÚSCULAS + letter-spacing | Texto normal, peso 600 |
| Sidebar | Gradiente con viraje índigo | Sólido, neutro |
| Colores hardcodeados | `#1e40af`, `#a7f3d0`, `#fca5a5` sueltos (rompían el modo oscuro) | Tokens semánticos (`--info-txt`, `--ok`, `--err`) |

**Pendiente de evaluar:** `.version-badge` (chip flotante de versión, esquina
inferior derecha) es el único elemento "flotante" que queda. Útil para
soporte/QA; si distrae al usuario final, moverlo al pie del sidebar.

## 2. Guía de estilos

### Color
```
--bg:          #f8fafc   --surface:     #ffffff
--border:      #e4e7ec   --border-dark: #cbd5e1

--txt-1: #0f172a (principal)   --txt-2: #475569 (secundario)
--txt-3: #64748b (terciario)   --txt-4: #94a3b8 (hints/disabled)

--p:      #4f46e5  hover: #4338ca   fondo tenue: #eef2ff
--ok:     #059669   --warn: #d97706   --err: #dc2626   --info: #0284c7
```

### Tipografía
Pila del sistema: `-apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif`
(equivalente nativo de SF Pro/Segoe/Roboto, sin depender de fuente web externa).

| Token | Tamaño | Uso |
|---|---|---|
| `--fs-2xs` | 11px | Separadores de sección, "eyebrows" |
| `--fs-xs`  | 12px | Labels, badges, celdas secundarias |
| `--fs-sm`  | 13px | Tablas, inputs, botones |
| `--fs-base`| 14px | Cuerpo de texto |
| `--fs-md`  | 16px | Títulos de tarjeta/modal |
| `--fs-lg`  | 20px | Subtítulos |
| `--fs-xl`  | 24px | Íconos/números medianos |
| `--fs-2xl` | 28px | Números KPI |

Pesos: 400 cuerpo · 500 botones · 600 seminegrita (labels/títulos/thead) · 700 KPI.

### Espaciado (escala de 4px)
`--sp-1..8` → `4 · 8 · 12 · 16 · 20 · 24 · 32 px`

### Radios y sombras
Radios: `--r 6px · --r-md 8px · --r-lg 10px · --r-xl 12px · --r-2xl 14px`
Sombras: `--sh-xs` (0 1px 1px, .03) a `--sh-xl` (0 12px 28px, .10) — solo para
profundidad sutil en modales/dropdowns; el borde de 1px es el separador principal.

## 3. Reorganización de elementos clave

- **Acción principal**: `.btn-primario` (único acento de color) a la derecha
  de la barra de acciones; secundarias neutras (`.btn-secundario`),
  destructivas en rojo contenido (`.btn-peligro`) — nunca dos acentos
  compitiendo en la misma barra.
- **Navegación**: marca fija arriba del sidebar, menú (`.sidebar-nav`) con
  scroll propio independiente del contenido, pie fijo abajo (modo oscuro +
  versión).
- **KPIs**: tarjeta plana, número grande con `font-variant-numeric:
  tabular-nums`, etiqueta pequeña en mayúsculas — sin barra de color ni
  ícono decorativo adicional.
- **Tablas**: encabezado en mayúsculas 12px/600, hover de fila sutil
  (`--row-hover`), fila de totales con fondo tenue del acento (`--p-light`)
  — jerarquía por peso y fondo, no por bordes gruesos.
