# Informe de cambios de integración Backend–Frontend

**Proyecto:** SIG Piscícola (Póngase Trucha)  
**Fecha:** 15 de noviembre de 2026  
**Alcance:** corrección de los defectos confirmados en la auditoría, mejora del contrato OpenAPI, configuración centralizada del frontend y ejecución integrada con Docker Compose.

## 1. Resultado general

Se corrigieron los errores de integración confirmados entre el Backend y el Frontend. Los flujos afectados ahora usan rutas existentes, los permisos conservan la semántica definida por el Backend, la selección opcional de ciclo en reportes de lote tiene soporte real y los errores HTTP dejan de ocultarse como listas vacías.

La validación final se realizó exclusivamente dentro de Docker:

- **Backend:** 100 pruebas ejecutadas, 100 aprobadas.
- **OpenAPI:** esquema generado y validado con **0 errores**. Permanecen 50 advertencias únicas no bloqueantes de tipado inferido, nombres de enums y `operationId`.
- **Frontend:** compilación de producción correcta para todas las rutas.
- **Lint del Frontend:** 0 errores y 15 advertencias heredadas no bloqueantes.
- **Integración:** PostgreSQL, Backend y Frontend en estado `healthy`; `/login` y `/api/schema/` responden HTTP 200.

## 2. Cambios en `/Backend`

### 2.1. Eventos de clasificación y transferencias de lote

Se corrigió la discrepancia entre el parámetro `farm_pk` declarado en las URL y el parámetro `farm_id` esperado por las vistas:

- [apps/events/views.py](Backend/apps/events/views.py): las operaciones de crear, listar y consultar eventos de clasificación ahora reciben y propagan `farm_pk` correctamente.
- [apps/batch/views.py](Backend/apps/batch/views.py): las operaciones de crear, listar y consultar transferencias de lote ahora reciben `farm_pk`, usan el contexto correcto y devuelven 404 cuando el registro no existe.
- Ambas vistas declaran su `serializer_class`, por lo que drf-spectacular puede documentarlas.

### 2.2. Ciclos relacionados con un lote

Se añadió un endpoint explícito para respaldar el filtro de ciclo del reporte de producción:

```text
GET /api/farms/{farm_pk}/batches/{batch_id}/cycles/
```

Cambios asociados:

- [apps/batch/urls.py](Backend/apps/batch/urls.py): registro de la nueva ruta.
- [apps/batch/views.py](Backend/apps/batch/views.py): consulta de los ciclos relacionados mediante la trazabilidad `CyclePondBatch`, restringida a la granja y al lote solicitados, sin duplicados.

### 2.3. Acción de estado de lote

Se corrigió la firma de la acción `set-status` para que acepte `farm_pk`, tal como lo entrega el router. Esto evita el error de argumento inesperado al invocar:

```text
PATCH /api/farms/{farm_pk}/batches/{batch_id}/set-status/
```

### 2.4. Documentación OpenAPI y autenticación

- [apps/accounts/schema.py](Backend/apps/accounts/schema.py): nueva extensión de drf-spectacular para documentar `SessionJWTAuthentication` como Bearer JWT.
- [apps/accounts/apps.py](Backend/apps/accounts/apps.py): carga de la extensión al iniciar Django.
- [configs/base.py](Backend/configs/base.py): título y descripción propios del proyecto; el endpoint de Swagger ya no se incluye a sí mismo dentro del contrato.
- [apps/accounts/views.py](Backend/apps/accounts/views.py), [apps/ponds/views.py](Backend/apps/ponds/views.py), [apps/species/views.py](Backend/apps/species/views.py), [apps/sales/views.py](Backend/apps/sales/views.py) y [apps/harvest/views.py](Backend/apps/harvest/views.py): declaración de serializadores en las vistas basadas en `APIView`.
- [configs/project_settings.py](Backend/configs/project_settings.py): eliminación de una importación duplicada.

El resultado pasó de **43 errores únicos** detectados durante esta implementación a **0 errores** de generación. Las advertencias restantes no eliminan endpoints del esquema, pero conviene resolverlas progresivamente para precisar tipos de campos calculados, enums y nombres de operaciones.

### 2.5. Pruebas de regresión

Se agregó [apps/batch/tests.py](Backend/apps/batch/tests.py) con cobertura integrada para:

- consulta de ciclos vinculados a un lote;
- acción `set-status` con el parámetro correcto;
- listado de transferencias de lote;
- listado de eventos de clasificación.

No se requirieron migraciones de base de datos.

## 3. Cambios en `/Frontend`

### 3.1. Reporte de lote por ciclo

- [src/lib/batchService.js](Frontend/src/lib/batchService.js): `getBatchCycles` consume la nueva ruta soportada por el Backend y elimina los dos intentos contra endpoints inexistentes.
- [src/app/components/batches/BatchReportModal.jsx](Frontend/src/app/components/batches/BatchReportModal.jsx): muestra una advertencia no bloqueante si no se pueden cargar los ciclos. El usuario todavía puede generar el reporte sin filtro, pero un 401, 403, 404 o error de red ya no se presenta falsamente como “no hay ciclos”.

### 3.2. Semántica de permisos

- [src/lib/roleService.js](Frontend/src/lib/roleService.js): seleccionar crear, actualizar o eliminar concede automáticamente `can_view`, porque una operación de escritura sin consulta no es funcionalmente utilizable.
- [apps/farms/serializers.py](Backend/apps/farms/serializers.py): el Backend aplica la misma normalización. Por tanto, otro cliente API tampoco puede guardar un rol con editar/eliminar pero sin ver.
- Al desmarcar `Ver` en la interfaz se apagan también crear, editar y eliminar.
- Se conserva la restricción especial de solo lectura para los módulos de alertas y auditoría.

### 3.3. Rutas inválidas de lote y ciclo

- [src/app/components/batches/batches.jsx](Frontend/src/app/components/batches/batches.jsx): se eliminaron las rutas farm-scoped `cycle-batches` que no existen.
- Las asignaciones y eliminaciones de un lote en un ciclo exigen ahora tanto `pondId` como `cycleId`, que son los dos segmentos requeridos por el Backend.
- Cuando falta el estanque se produce un error explícito y comprensible en lugar de enviar una petición inválida.

### 3.4. Rangos ocupados de alimentación

- [src/lib/feedingService.js](Frontend/src/lib/feedingService.js): `getOccupiedRanges` recibe ahora `(farmId, pondId, cycleId)` y construye la ruta correcta:

```text
GET /api/farms/{farm}/ponds/{pond}/cycles/{cycle}/feeding-plans/occupied-ranges/
```

### 3.5. URL base centralizada

Se reemplazaron las declaraciones locales del dominio de producción en componentes y servicios por [src/lib/apiConfig.js](Frontend/src/lib/apiConfig.js). El valor de producción permanece una sola vez como valor predeterminado, mientras que los demás archivos consumen `API_BASE` o `buildApiUrl`.

La centralización cubre autenticación, perfil, granjas, estanques, lotes, ciclos, planes de producción, alimentación, salud, monitoreo, inventario, cosechas, ventas, trabajadores y navegación. Así, una compilación local o de staging ya no mezcla accidentalmente peticiones hacia distintos servidores.

### 3.6. Contenedor y calidad estática

- [Dockerfile](Frontend/Dockerfile): incorpora `NEXT_PUBLIC_API_BASE_URL` y `NEXT_PUBLIC_API_AUDIT` como argumentos y variables de compilación.
- [eslint.config.mjs](Frontend/eslint.config.mjs): explicita la compatibilidad con los patrones existentes de carga asíncrona mediante efectos cuando React Compiler no está habilitado. Las reglas principales de Next.js siguen activas.
- Se corrigieron las entidades HTML del texto agregado al modal.

## 4. Ejecución simultánea con Docker

Se creó [docker-compose.yml](docker-compose.yml) en la raíz con tres servicios:

| Servicio | Función | Puerto local | Validación de salud |
| --- | --- | ---: | --- |
| `db` | PostgreSQL 16 | interno | `pg_isready` |
| `backend` | migraciones + Gunicorn/Django | `8001` | `/api/schema/` |
| `frontend` | Next.js de producción | `3000` | `/login` |

Inicio del sistema:

```bash
docker compose up --build -d
```

Consulta de estado:

```bash
docker compose ps
```

Detención del sistema:

```bash
docker compose down
```

El volumen `piscicola_postgres_data` conserva la base de datos local entre reinicios. `docker compose down -v` también elimina ese volumen y, por tanto, los datos locales.

## 5. Endpoints sin pantalla nueva

La auditoría encontró capacidades del Backend sin una interfaz directa, entre ellas administración completa de referencias de especies, estadísticas diarias y asignación de miembros por estanque. Los eventos manuales de clasificación dentro de ciclos permanecen deshabilitados. Las transferencias manuales se habilitaron posteriormente solo para lotes que no estén comprometidos con ciclos activos o pausados, mientras que el remanente de una vinculación parcial se sigue trasladando obligatoriamente y de forma automática.

No se añadieron pantallas aisladas para estas capacidades porque no existe todavía una ubicación funcional ni un flujo de producto definido que determine:

- quién debe operarlas;
- desde qué entidad se abren;
- qué campos son obligatorios para el usuario;
- qué permisos y estados deben mostrarse;
- cómo se relacionan con las pantallas actuales.

Sí se corrigieron sus fallos de Backend y su documentación donde correspondía. Añadir formularios sin esas decisiones habría creado accesos posiblemente inútiles o inconsistentes. Antes de implementar esas interfaces se recomienda definir prioridades funcionales en este orden: estadísticas diarias, transferencias/eventos, acceso por estanque y administración de referencias de especies.

## 6. Evidencia de verificación

Todas las ejecuciones se realizaron en Docker.

| Verificación | Resultado |
| --- | --- |
| `docker compose config --quiet` | Correcto |
| Build de imagen Backend | Correcto |
| Build de producción Frontend | Correcto; todas las rutas compiladas |
| Suite Django | 100/100 pruebas aprobadas |
| Validación OpenAPI | 0 errores; 50 advertencias únicas |
| ESLint | 0 errores; 15 advertencias |
| Estado de Compose | `db`, `backend` y `frontend` saludables |
| HTTP Frontend | `/login` → 200 |
| HTTP Backend desde la red de Compose | `/api/schema/` → 200 |

## 7. Observaciones pendientes no bloqueantes

1. Las 50 advertencias únicas de OpenAPI corresponden principalmente a métodos de serializador sin tipo explícito, parámetros de router inferidos como texto, colisiones de nombres de enums y `operationId`. El contrato se genera completo, pero esos detalles pueden refinarse.
2. Las 15 advertencias de ESLint corresponden a dependencias de efectos ya existentes y dos recomendaciones para sustituir `<img>` por `next/image`.
3. La cobertura automatizada del Backend es satisfactoria para los cambios realizados. El Frontend no tiene una suite de pruebas configurada; por eso se validó con compilación de producción, lint y prueba HTTP integrada.

## 8. Conclusión

Los defectos confirmados de integración quedaron corregidos y protegidos por validaciones reproducibles en Docker. Backend y Frontend arrancan juntos, la documentación ya no omite operaciones por errores de inferencia y el Frontend utiliza un único origen configurable para la API. Las capacidades sin interfaz se conservaron como decisiones de producto pendientes, no como rutas rotas ni pantallas improvisadas.

## 9. Actualización: invariantes productivas y trazabilidad

### 9.1. Dependencia automática del permiso `Ver`

**Backend:** [apps/farms/serializers.py](Backend/apps/farms/serializers.py) normaliza `can_view=true` si el rol recibe crear, actualizar o eliminar.  
**Frontend:** [src/lib/roleService.js](Frontend/src/lib/roleService.js) y [src/app/components/workers/farm_workers_tab.jsx](Frontend/src/app/components/workers/farm_workers_tab.jsx) aplican la misma dependencia antes de enviar el rol.

**Cómo probarlo:**

1. Entrar a una granja y abrir **Trabajadores de la granja**.
2. En la sección de roles, pulsar **Crear rol** o editar uno existente.
3. Para el módulo **Lotes**, dejar `Ver` desmarcado y marcar `Editar` o `Eliminar`.
4. Comprobar que `Ver` se activa automáticamente.
5. Guardar el rol, volver a abrirlo y confirmar que ambos permisos permanecen activos.

Datos sugeridos: nombre del rol `Supervisor de lotes`; módulo `Lotes`; permisos `Editar` y `Eliminar`.

### 9.2. Ciclo en proceso inmutable salvo fecha estimada y comentarios

**Backend:** [apps/cycle/serializers.py](Backend/apps/cycle/serializers.py) rechaza cambios de especie, plan, estanque, nombre, fecha inicial, estado, fecha real de fin y pesos. Un ciclo finalizado o cancelado tampoco se puede editar. [apps/cycle/views.py](Backend/apps/cycle/views.py) impide eliminar un ciclo en progreso o pausado.  
**Frontend:** [src/app/components/cycles/cycle_form.jsx](Frontend/src/app/components/cycles/cycle_form.jsx) muestra en edición solamente fecha estimada y comentarios; [src/app/components/cycles/cycles.jsx](Frontend/src/app/components/cycles/cycles.jsx) retiró los controles manuales de finalizar y eliminar.

**Cómo probarlo:**

1. Abrir **Granja → Estanque → Ciclos**.
2. En un ciclo `En Ejecución`, pulsar el lápiz.
3. Verificar que solo aparecen **Fecha estimada de finalización** y **Comentarios**.
4. Cambiar la fecha, por ejemplo de `2026-12-01` a `2026-12-20`, escribir `Ajuste por crecimiento observado` y pulsar **Actualizar**.
5. Volver a abrir el ciclo y confirmar el cambio. No debe existir selector de estado, fecha inicial, especie o plan.

### 9.3. Lotes y asignaciones bloqueados durante el ciclo

**Backend:** [apps/batch/serializers.py](Backend/apps/batch/serializers.py) impide modificar un lote o su asignación al estanque si participa en un ciclo activo/pausado. [apps/batch/views.py](Backend/apps/batch/views.py) impide cambiar manualmente su estado. [apps/cycle/serializers.py](Backend/apps/cycle/serializers.py) y [apps/cycle/views.py](Backend/apps/cycle/views.py) hacen inmutable la relación lote–ciclo y deshabilitan su eliminación.  
**Frontend:** [src/app/components/batches/batches.jsx](Frontend/src/app/components/batches/batches.jsx) oculta editar y desvincular cuando el lote ya está asociado a un ciclo.

**Cómo probarlo:**

1. Abrir **Granja → Estanque → Ciclo** y consultar sus lotes.
2. Confirmar que el lote conserva los botones **Ver trazabilidad** y **Generar reporte**, pero no ofrece **Editar** ni **Desvincular**.
3. Volver a la lista de lotes del estanque: el lote debe mostrar `Ciclo: <nombre>` y tampoco permitir edición manual.

Datos sugeridos: lote con 1.000 peces vinculado a un ciclo `Ciclo engorde noviembre`.

### 9.4. Estanque bloqueado mientras tiene un ciclo activo

**Backend:** [apps/ponds/serializers.py](Backend/apps/ponds/serializers.py) impide editar datos o estado; [apps/ponds/views.py](Backend/apps/ponds/views.py) rechaza activar/inactivar si existe un ciclo en progreso o pausado.  
**Frontend:** [src/app/components/ponds/ponds.jsx](Frontend/src/app/components/ponds/ponds.jsx) recibe `has_active_cycle`, oculta editar/eliminar, desactiva el interruptor de estado y muestra el motivo.

**Cómo probarlo:**

1. Abrir la lista de estanques de una granja.
2. Localizar el estanque usado por un ciclo en ejecución.
3. Comprobar que el interruptor está deshabilitado y aparece `Estado y datos bloqueados mientras el ciclo esté en proceso`.
4. Confirmar que tampoco aparecen los botones de lápiz y papelera en esa tarjeta.

### 9.5. Fecha estimada informativa y alerta de vencimiento

Se eliminaron los bloqueos que impedían superar `estimated_finish_date` en [apps/cycle/services/lifecycle.py](Backend/apps/cycle/services/lifecycle.py), [apps/harvest/serializers.py](Backend/apps/harvest/serializers.py), [apps/harvest/utils.py](Backend/apps/harvest/utils.py), [apps/feeding/utils.py](Backend/apps/feeding/utils.py) y [apps/health/utils.py](Backend/apps/health/utils.py).

[apps/core/utils.py](Backend/apps/core/utils.py) genera una alerta de severidad media cuando la fecha estimada ya se alcanzó y el ciclo sigue en progreso/pausado. Si se amplía la fecha o termina el ciclo, la alerta se resuelve. [apps/core/models.py](Backend/apps/core/models.py) incorpora el origen de alerta `Cycle`.

**Cómo probarlo:**

1. Editar un ciclo activo y colocar como fecha estimada la fecha actual, manteniéndola posterior a la fecha inicial.
2. Abrir **Alertas** en la granja.
3. Debe aparecer `Fecha estimada alcanzada para el ciclo <nombre>` sin bloquear alimentación, tratamientos, cosecha ni cierre.
4. Ampliar la fecha estimada a una fecha futura y volver a cargar Alertas; la alerta anterior debe figurar resuelta o dejar de aparecer en el filtro de pendientes.

### 9.6. División y traslado obligatorio del remanente

**Backend:** [apps/cycle/serializers.py](Backend/apps/cycle/serializers.py) realiza una transacción atómica cuando se usa menos cantidad que la disponible:

1. conserva en el lote origen únicamente la cantidad que entra al ciclo;
2. crea un lote derivado para el remanente;
3. registra su parentesco en `BatchSource`;
4. lo asigna al estanque destino;
5. registra un `BatchTransfer` automático;
6. revierte todo si cualquier validación falla.

[apps/batch/models.py](Backend/apps/batch/models.py) incorpora el origen `batch_split`. Los eventos manuales de clasificación permanecen deshabilitados en [apps/events/views.py](Backend/apps/events/views.py). Las transferencias manuales se habilitaron exclusivamente para lotes fuera de ciclos activos o pausados, como se detalla en la sección 9.11.

**Frontend:** [src/app/components/cycles/assign_cycle_form.jsx](Frontend/src/app/components/cycles/assign_cycle_form.jsx) solicita cantidad y, solo cuando existe remanente, obliga a elegir un estanque activo y vacío.

**Cómo probarlo:**

1. Tener un lote de `1.000` peces asignado al **Estanque A**, y un **Estanque B** activo, vacío y con capacidad mínima de `400`.
2. En **Estanque A → Lotes**, pulsar **Vincular a Ciclo**.
3. Elegir el ciclo, ingresar `600` en **Cantidad que iniciará el ciclo**.
4. Seleccionar **Estanque B** como destino del remanente y pulsar **Vincular a Ciclo**.
5. Verificar que el ciclo tiene `600` peces; en Estanque B debe existir un nuevo lote derivado con `400` peces.
6. Si se ingresan los `1.000`, el selector de destino no aparece. Si se ingresan `600` sin destino, el formulario no permite continuar.

### 9.7. Trazabilidad visible del lote y su crecimiento

**Backend:** [apps/batch/services/traceability.py](Backend/apps/batch/services/traceability.py) consolida:

- compra, factura y proveedor de origen;
- lote padre e hijos derivados;
- asignaciones y movimientos entre estanques;
- ciclos asociados;
- evaluaciones de crecimiento y mortalidad;
- cosechas relacionadas.

La consulta está disponible en:

```text
GET /api/farms/{farm_id}/batches/{batch_id}/traceability/
```

[apps/batch/reports/collector.py](Backend/apps/batch/reports/collector.py), [apps/batch/reports/pdf_exporter.py](Backend/apps/batch/reports/pdf_exporter.py) y [apps/batch/reports/excel_exporter.py](Backend/apps/batch/reports/excel_exporter.py) incorporan esta información a PDF y Excel.

**Frontend:** [src/app/components/batches/BatchTraceabilityModal.jsx](Frontend/src/app/components/batches/BatchTraceabilityModal.jsx) muestra origen, genealogía, recorrido y crecimiento; [src/app/components/batches/batches.jsx](Frontend/src/app/components/batches/batches.jsx) añade el botón con icono de ramificación.

**Cómo probarlo:**

1. Registrar una compra de un producto tipo `Lote`, por ejemplo proveedor `Alevinos del Norte`, factura `FV-2026-100`, cantidad `1.000`, con los datos de especie y pesos.
2. Asignar el lote a un estanque, vincularlo a un ciclo y registrar al menos una evaluación biométrica, por ejemplo pesos `10 / 12 / 14 g` y posteriormente `20 / 24 / 28 g`.
3. Abrir la tarjeta del lote y pulsar **Ver trazabilidad** (icono de ramificación).
4. Confirmar que aparecen el proveedor, factura, estanques, ciclo y la tabla de crecimiento.
5. Pulsar **Generar Reporte Histórico**, elegir PDF o Excel y descargarlo; la sección **Origen y trazabilidad del lote** debe contener los mismos datos.

### 9.8. Migraciones y pruebas agregadas

- [apps/batch/migrations/0002_alter_batch_origin_type.py](Backend/apps/batch/migrations/0002_alter_batch_origin_type.py): origen de lote dividido.
- [apps/core/migrations/0009_alter_alert_source_type.py](Backend/apps/core/migrations/0009_alter_alert_source_type.py): alerta de ciclo.
- [apps/batch/tests.py](Backend/apps/batch/tests.py): regresiones para bloqueos, remanente, alertas, proveedor, trazabilidad y transferencias manuales.
- [apps/ponds/tests.py](Backend/apps/ponds/tests.py) y [apps/farms/tests.py](Backend/apps/farms/tests.py): reglas actualizadas de ciclo activo y permisos dependientes de consulta.

### 9.9. Ejecución integrada y CORS local restringido

[docker-compose.yml](docker-compose.yml) levanta Backend y Frontend simultáneamente, espera la salud del API antes de iniciar la interfaz y expone `http://localhost:3000` y `http://localhost:8001`. El Backend admite los hosts internos necesarios, pero CORS queda limitado a `http://localhost:3000`. [configs/project_settings.py](Backend/configs/project_settings.py) permite declarar esa lista mediante `CORS_ALLOWED_ORIGINS`, sin habilitar orígenes arbitrarios.

**Cómo probarlo:**

1. Desde la carpeta raíz ejecutar `docker compose up -d --build`.
2. Ejecutar `docker compose ps` y confirmar que `backend` y `frontend` aparecen como `healthy`.
3. Abrir `http://localhost:3000/login`; la pantalla debe cargar y sus peticiones al API de `http://localhost:8001/api` no deben producir errores CORS.
4. Como control negativo, una petición desde otro origen no debe recibir la cabecera `Access-Control-Allow-Origin`.

En la verificación final ambos servicios respondieron `HTTP 200`; el origen local recibió `Access-Control-Allow-Origin: http://localhost:3000` y un origen externo de prueba no recibió autorización CORS.

### 9.10. Confirmación visible de la división y acceso a ambos lotes

Se corrigió un problema de experiencia de usuario: el Backend sí dividía y trasladaba el remanente, pero el `POST` devolvía únicamente la asignación al ciclo y el Frontend recargaba la página sin explicar dónde quedaron las dos partes. En una vista de lotes sin estanque ambos podían dejar de aparecer porque, correctamente, ya estaban asignados; esto se percibía como pérdida del lote.

**Backend:** [apps/cycle/serializers.py](Backend/apps/cycle/serializers.py) incluye ahora `split_result` en la respuesta de creación con lote origen, cantidad incorporada al ciclo, lote derivado, cantidad remanente, estanque destino y relación genealógica. [apps/batch/tests.py](Backend/apps/batch/tests.py) comprueba que:

- el lote origen continúa en su estanque y con la cantidad usada por el ciclo;
- el lote remanente aparece en el estanque seleccionado;
- la genealogía padre → hijo se obtiene consultando cualquiera de los dos lotes;
- la cantidad de la relación coincide con el remanente trasladado.

**Frontend:** [src/app/components/cycles/assign_cycle_form.jsx](Frontend/src/app/components/cycles/assign_cycle_form.jsx) ya no hace una recarga ciega. Después de dividir muestra una confirmación persistente con las dos tarjetas, códigos, cantidades, estanques y la flecha genealógica. Incluye **Ver lote dentro del ciclo** y **Ver lote remanente** para abrir directamente cada ubicación. [src/app/components/batches/BatchTraceabilityModal.jsx](Frontend/src/app/components/batches/BatchTraceabilityModal.jsx) diferencia visualmente `Origen` y `Remanente` e indica la cantidad separada.

**Cómo probarlo:**

1. En un estanque con un lote de `1.000` peces y un ciclo en progreso, pulsar **Vincular a Ciclo**.
2. Ingresar `600` y seleccionar otro estanque activo como destino.
3. Pulsar **Vincular a Ciclo**. No debe producirse una recarga inmediata.
4. Confirmar que aparece **Lote dividido correctamente**, con `600` peces en el lote origen y `400` en el remanente, sus códigos y estanques.
5. Pulsar **Ver lote dentro del ciclo** y comprobar el lote de `600` peces.
6. Repetir el flujo y pulsar **Ver lote remanente**, o volver a la confirmación con un caso nuevo; debe abrir el estanque destino y mostrar el lote derivado de `400` peces.
7. En cualquiera de los dos lotes, pulsar **Ver trazabilidad**. La sección **Genealogía** debe mostrar `Origen: <código padre> → Remanente: <código hijo>` y `Cantidad separada: 400 peces`.

### 9.11. Transferencias manuales e historial visual

Se habilitaron las transferencias manuales solicitadas sin modificar lotes que ya formen parte de un ciclo activo o pausado. El traslado obligatorio del remanente al iniciar parcialmente un ciclo continúa funcionando de manera automática.

**Backend:** [apps/batch/serializers.py](Backend/apps/batch/serializers.py) implementa la operación atómica y valida granja, disponibilidad, capacidad, especie, etapa biológica, estado de los estanques y ausencia de ciclos activos/pausados. [apps/batch/views.py](Backend/apps/batch/views.py) habilita `POST /api/farms/{farm_id}/batch-transfers/` y devuelve nombres, códigos y estanques para su presentación. El comportamiento es:

- transferencia parcial: descuenta la cantidad del origen, crea un lote hijo en el destino y registra `BatchSource`;
- transferencia total: cierra la asignación anterior y conserva el mismo lote en el nuevo estanque;
- ambos casos registran `BatchTransfer`, actualizan los estados de los estanques y aparecen en trazabilidad;
- un lote dentro de un ciclo activo/pausado es rechazado por el Backend aunque se intente invocar el endpoint directamente.

**Frontend:** [src/app/components/batches/BatchTransferForm.jsx](Frontend/src/app/components/batches/BatchTransferForm.jsx) agrega el botón **Transferir a otro estanque**, selector de destino, cantidad, fecha y motivo. [src/app/components/batches/BatchTransferHistoryModal.jsx](Frontend/src/app/components/batches/BatchTransferHistoryModal.jsx) presenta movimientos automáticos y manuales del estanque. [src/app/components/batches/batches.jsx](Frontend/src/app/components/batches/batches.jsx) oculta el botón cuando el lote está comprometido con un ciclo. [src/lib/batchTransferService.js](Frontend/src/lib/batchTransferService.js) conecta ambas interfaces con el API.

**Cómo probar una transferencia parcial:**

1. Crear o utilizar un lote activo de `1.000` peces asignado a un estanque, sin vincularlo a ningún ciclo.
2. Disponer de otro estanque activo o en uso, sin ciclo activo/pausado, con capacidad suficiente y sin peces incompatibles.
3. Abrir **Granja → Estanque origen → Lotes activos** y pulsar **Transferir a otro estanque**.
4. Elegir el estanque destino, ingresar `300`, seleccionar la fecha actual y escribir `Redistribución por densidad`.
5. Pulsar **Confirmar transferencia**. Debe indicar **Transferencia parcial con lote derivado**, mostrar el código padre y el nuevo código hijo.
6. Pulsar **Ver lote en estanque destino**; deben aparecer `300` peces. En el origen deben permanecer `700`.
7. Abrir **Ver trazabilidad** en cualquiera de los lotes y confirmar la relación genealógica y el movimiento.

**Cómo probar una transferencia total y el historial:**

1. Repetir el formulario ingresando toda la cantidad disponible.
2. La confirmación debe indicar **Transferencia total del lote** y conservar el mismo código.
3. El origen debe quedar sin ese lote activo y el destino debe mostrarlo con la cantidad completa.
4. Pulsar **Historial de transferencias** en cualquiera de los estanques involucrados. Deben aparecer origen, destino, fecha, cantidad, códigos, motivo y si el movimiento fue parcial o total.

**Cómo probar el bloqueo:** vincular un lote a un ciclo en progreso y volver a la lista del estanque. El botón **Transferir a otro estanque** no debe aparecer. Una petición directa al endpoint con ese `source_pond_batch` debe responder `400`.

### 9.12. Exclusividad de especie y etapa biológica por estanque

Cada estanque puede contener simultáneamente varios lotes únicamente cuando todos pertenecen a la misma especie exacta y a la misma etapa biológica. Por ejemplo, `Cachama blanca` y `Cachama negra` son especies diferentes y no pueden convivir; tampoco pueden convivir alevines y peces en levante aunque pertenezcan a la misma especie.

**Backend:** [apps/batch/serializers.py](Backend/apps/batch/serializers.py) rechaza la transferencia si cualquier lote activo del estanque destino tiene un `specie_id` o `biological_state` diferente. La regla se comprueba durante la validación y nuevamente dentro de la transacción, después de bloquear el destino, para evitar que una modificación concurrente permita mezclar peces incompatibles. La misma regla ya se aplica al asignar directamente lotes mediante [apps/batch/serializers.py](Backend/apps/batch/serializers.py).

[apps/ponds/serializers.py](Backend/apps/ponds/serializers.py) expone `resident_profile` con especie, etapa y cantidad actual para que la interfaz pueda identificar la ocupación compatible del estanque. [apps/batch/tests.py](Backend/apps/batch/tests.py) verifica explícitamente los dos rechazos y confirma que no se descuenta ningún pez ni se registra una transferencia fallida.

**Frontend:** [src/app/components/batches/BatchTransferForm.jsx](Frontend/src/app/components/batches/BatchTransferForm.jsx) filtra los destinos antes de mostrar el selector. Solo aparecen estanques vacíos o estanques ocupados exclusivamente por la misma especie y etapa del lote origen. Cada opción ocupada muestra especie, etapa y cantidad residente.

**Cómo probar especie diferente:**

1. Crear un lote de `Cachama blanca`, etapa `Alevín`, con `100` peces en el Estanque A.
2. Crear un lote de `Cachama negra`, etapa `Alevín`, en el Estanque B.
3. En **Estanque A → Lotes activos**, pulsar **Transferir a otro estanque**.
4. Confirmar que el Estanque B no aparece como destino.
5. Como comprobación del Backend, enviar directamente la transferencia hacia el Estanque B; debe responder `400` indicando que contiene otra especie o etapa y el lote origen debe conservar los `100` peces.

**Cómo probar etapa diferente:**

1. Mantener el lote origen como `Cachama blanca / Alevín`.
2. Crear en el Estanque C un lote `Cachama blanca / Levante`.
3. Abrir nuevamente **Transferir a otro estanque** y confirmar que el Estanque C tampoco aparece.
4. Un intento directo al API debe responder `400`, sin crear movimiento ni modificar cantidades.

**Caso permitido:** un estanque vacío sí aparece. También aparece un estanque que contenga únicamente `Cachama blanca / Alevín`; la transferencia debe completarse si tiene capacidad y no posee un ciclo activo o pausado.

### 9.13. División de un lote antes de asignarlo a estanques

Ahora es posible dividir un lote mientras todavía está en la lista de lotes sin estanque. La operación conserva una parte en el lote original, crea un lote hijo con la cantidad separada y deja ambos disponibles para asignarlos posteriormente a estanques diferentes.

**Backend:** [apps/batch/serializers.py](Backend/apps/batch/serializers.py) incorpora `BatchSplitSerializer`, que bloquea el lote durante la operación, valida estado y cantidades, crea el hijo con origen `batch_split`, registra `BatchSource` y reduce la cantidad del padre de forma atómica. [apps/batch/views.py](Backend/apps/batch/views.py) y [apps/batch/urls.py](Backend/apps/batch/urls.py) exponen:

```text
POST /api/farms/{farm_id}/batches/{batch_id}/split/
```

El endpoint solo acepta lotes activos que nunca hayan sido asignados a un estanque. Si el lote ya tiene cualquier `PondBatch`, se debe usar el flujo de transferencia desde el estanque. [apps/batch/tests.py](Backend/apps/batch/tests.py) comprueba creación del hijo, cantidades, genealogía, visibilidad de ambos lotes sin estanque, trazabilidad desde el hijo y rechazo después de una asignación.

**Frontend:** [src/app/components/batches/batches.jsx](Frontend/src/app/components/batches/batches.jsx) muestra **Dividir antes de asignar** únicamente en lotes activos sin estanque y con al menos dos peces. [src/app/components/batches/BatchSplitForm.jsx](Frontend/src/app/components/batches/BatchSplitForm.jsx) solicita cantidad y motivo, calcula en tiempo real cuánto conservará el padre y presenta los dos códigos tras completar la operación. [src/lib/batchSplitService.js](Frontend/src/lib/batchSplitService.js) conecta el formulario con el endpoint.

**Cómo probarlo:**

1. Crear o comprar un lote de `1.000` peces y no asignarlo todavía a ningún estanque.
2. Abrir la lista de **Lotes sin estanque** de la granja.
3. En la tarjeta del lote, pulsar **Dividir antes de asignar**.
4. Escribir `400` en **Cantidad que tendrá el nuevo lote** y `Separar cantidades para dos estanques` como motivo.
5. Confirmar que el formulario indica que el lote original conservará `600` peces y pulsar **Dividir lote**.
6. La confirmación debe mostrar el código original con `600` y un nuevo código hijo con `400`, unidos por la genealogía.
7. Pulsar **Ver los dos lotes disponibles**. Ambos deben aparecer por separado y cada uno debe ofrecer **Asignar a Estanque**.
8. Abrir **Ver trazabilidad** en cualquiera de los dos y comprobar `Origen: <padre> → Remanente: <hijo> · 400 peces`.
9. Asignar el lote de `600` al Estanque A y el de `400` al Estanque B.

**Validaciones:** no se permite separar `0`, una cantidad negativa, una cantidad igual o superior al total, un lote inactivo o un lote que ya haya estado asignado a un estanque. Una petición rechazada no modifica cantidades ni crea genealogía.
