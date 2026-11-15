# Backend–Frontend API Integration Audit
.

**Project:** SIG-Piscicola (Póngase Trucha)  
**Audit date:** 2026-11-15  
**Scope:** Django REST backend, Next.js frontend, handwritten backend documentation, and generated OpenAPI documentation.

## 1. Executive summary

The frontend implements the main user flows for authentication, farms, ponds, production plans, cycles, inventory, feeding, monitoring, health, harvests, sales, farm workers, permissions, alerts, and audit logs. The frontend also builds successfully in its production Docker image, and the backend passes Django's system check.

The integration is **not fully correct or complete**. The audit confirmed:

- **2 backend endpoint families are wired incorrectly** and are expected to fail at runtime: grading events and batch transfers.
- **2 nonexistent endpoints are called by the batch report UI**, so the optional cycle selector never receives data.
- **1 frontend permission transformation contradicts the documented backend contract** by automatically granting `view` when another operation is selected.
- **2 additional invalid frontend route constructions** exist in the batch/cycle component, one of which is reachable when a cycle is supplied without a pond.
- **1 incorrectly constructed feeding endpoint** exists in a service, although its only caller is currently commented out.
- The generated OpenAPI schema completes, but reports **45 unique errors and 138 unique warnings**. A substantial part of Swagger therefore lacks reliable request/response schemas and authentication information.
- Several backend capabilities have no frontend implementation, especially grading events, batch transfers, daily statistics, pond-specific member assignment, species reference administration, and several detail/update operations.
- API base URL configuration is fragmented: there are **23 hard-coded `API_BASE` declarations including the central default**, so 22 declarations bypass the intended environment-configurable API helper.

No source fixes were made as part of this audit. This document is the requested deliverable.

## 2. Methodology and validation

The audit reviewed:

- All URL registrations in `Backend/project/urls.py` and every `Backend/apps/*/urls.py`.
- Backend views, viewsets, custom actions, permissions, filters, serializers, and report request contracts.
- Every frontend `fetch`, shared API client, service function, and service usage under `Frontend/src`.
- Handwritten documentation under `Backend/docs` and `Frontend/README.md`.
- Generated router routes, including DRF list/detail and custom `@action` routes.

Docker checks performed:

| Check | Result |
| --- | --- |
| `python manage.py check` in the backend Docker service | Passed: no Django system-check issues |
| `python manage.py spectacular` in the backend Docker service | Completed with 45 unique errors and 138 unique warnings |
| Frontend production Docker build (`pnpm build`) | Passed; all Next.js routes compiled |

This was a source-contract audit. It did not mutate production data or call authenticated production endpoints, because no test credentials or disposable dataset were provided.

## 3. Confirmed defects

### F-01 — Grading-event and batch-transfer handlers receive the wrong URL keyword

**Severity:** Critical  
**Affected backend:** `Backend/apps/events/urls.py`, `Backend/apps/events/views.py`, `Backend/apps/batch/urls.py`, `Backend/apps/batch/views.py`

Both URL modules declare `<int:farm_pk>`, but the corresponding `create`, `list`, and `retrieve` handlers accept `farm_id` instead of `farm_pk`.

Examples:

- `GET/POST /api/farms/{farm_pk}/grading-events/`
- `GET /api/farms/{farm_pk}/grading-events/{id}/`
- `GET/POST /api/farms/{farm_pk}/batch-transfers/`
- `GET /api/farms/{farm_pk}/batch-transfers/{id}/`

Django/DRF passes `farm_pk` as a keyword argument. These handlers do not accept that name, so requests are expected to fail with an unexpected-keyword-argument error before normal serialization. For creates, their serializer context would also receive `farm_id=None` if the signature were made permissive without correcting the value.

**Recommendation:** Rename the handler parameter to `farm_pk` and consistently use it in serializer context and `serializer.save`, or change the URL keyword everywhere. Add URL-level API tests for list, create, and retrieve.

### F-02 — Batch report cycle selector calls two endpoints that do not exist

**Severity:** High  
**Affected frontend:** `Frontend/src/lib/batchService.js`, `Frontend/src/app/components/batches/BatchReportModal.jsx`

`getBatchCycles` tries:

1. `GET /api/farms/{farm}/batches/{batch}/cycles/`
2. `GET /api/farms/{farm}/cycles/?batch={batch}`

Neither route exists. Backend cycle routes are pond-scoped:

`GET /api/farms/{farm}/ponds/{pond}/cycles/`

The service catches both failures and returns `[]`, hiding the defect. As a result, production report generation works without a cycle, but the optional cycle selector remains empty and users cannot request a cycle-filtered report.

**Recommendation:** Add a supported backend batch-to-cycle endpoint, or derive cycles through a valid traceability endpoint. Do not silently convert both HTTP failures into an empty successful result.

### F-03 — Frontend changes the semantics of independent permissions

**Severity:** High  
**Affected frontend:** `Frontend/src/lib/roleService.js`  
**Contract:** `Backend/docs/frontend-permissions-guide.md`

The backend documentation explicitly states that operations are independent and that, for example, `can_update: true` does not imply `can_view: true`. The frontend's `sanitizeAppPermissions` computes `anyAction` and sends `can_view: true` whenever create, update, or delete is selected.

This means the UI cannot express valid backend role configurations such as update-only, and it may grant broader access than the administrator selected.

**Recommendation:** Preserve each checkbox independently. Only force non-view operations to `false` for the documented view-only modules (`alerts` and `audit_logs`).

### F-04 — Invalid cycle-batch routes in the batch component

**Severity:** High when the fallback branch is reached  
**Affected frontend:** `Frontend/src/app/components/batches/batches.jsx`

The component constructs two routes that do not exist:

- `GET /api/farms/{farm}/cycles/{cycle}/cycle-batches/` when `cycleId` is present but `pondId` is absent.
- `DELETE /api/farms/{farm}/cycle-batches/{id}/` in the equivalent delete fallback.

The backend requires both pond and cycle:

`/api/farms/{farm}/ponds/{pond}/cycles/{cycle}/cycle-batches[/<id>/]`

**Recommendation:** Require `pondId` whenever operating on cycle-batch records and remove the invalid fallbacks, or add an intentionally supported farm-scoped backend route.

### F-05 — Feeding occupied-range service omits the pond path segment

**Severity:** Medium / latent  
**Affected frontend:** `Frontend/src/lib/feedingService.js`

The service constructs:

`GET /api/farms/{farm}/cycles/{cycle}/feeding-plans/occupied-ranges/`

The backend defines:

`GET /api/farms/{farm}/ponds/{pond}/cycles/{cycle}/feeding-plans/occupied-ranges/`

The only identified caller is commented out, so this does not currently trigger a visible runtime failure.

**Recommendation:** Add `pondId` to the service signature and route before re-enabling the feature.

### F-06 — OpenAPI/Swagger documentation is incomplete and misleading

**Severity:** High for API consumers; medium for runtime  
**Affected backend:** `Backend/project/urls.py` and many APIView classes

Docker schema generation completed with:

- **284 total errors (45 unique)**
- **275 total warnings (138 unique)**

The principal issues are:

- Many `APIView` classes do not expose a `serializer_class` and have no `@extend_schema`, so drf-spectacular cannot infer request/response contracts.
- `SessionJWTAuthentication` has no OpenAPI authentication extension, so protected endpoints frequently appear without the correct security scheme.
- Several serializer method fields have unresolved types.
- Multiple generated operation IDs collide and are renamed with numeric suffixes.
- Several router path parameters default to strings because their types cannot be inferred.

Affected groups include authentication, ponds, species, sales, invitations, grading events, batch transfers, and harvest derivation.

**Recommendation:** Treat schema generation warnings/errors as CI failures after first adding explicit serializers/schema annotations and an authentication extension. Publish the generated schema as the primary API contract.

### F-07 — API base URL configuration is bypassed throughout the frontend

**Severity:** Medium  
**Affected frontend:** 22 files outside the central default configuration

`Frontend/src/lib/apiConfig.js` supports `NEXT_PUBLIC_API_BASE_URL`, but many services and components independently hard-code `https://backend-pongase-trucha.onrender.com/api`. This prevents consistent staging/local configuration and can make different screens talk to different backends.

**Recommendation:** Route all requests through `buildApiUrl` and the shared API client. Keep the production URL only as the single default in `apiConfig.js`.

### F-08 — Some HTTP errors are intentionally hidden as empty data

**Severity:** Medium  
**Examples:** `Frontend/src/lib/batchService.js`

`getBatchCycles` suppresses network errors and 404 responses and returns an empty array. This makes “endpoint missing,” “not authorized,” and “there are no cycles” indistinguishable.

**Recommendation:** Return typed errors to the UI and show a non-blocking warning. Reserve empty arrays for valid successful responses.

## 4. Backend endpoint inventory and frontend coverage

The table groups all backend route templates. “Partial” means at least one allowed backend operation or route in that group has no active frontend usage.

| Backend module | Backend route groups and methods | Frontend coverage | Assessment |
| --- | --- | --- | --- |
| Accounts/auth | Login, logout, refresh, change/reset/confirm password; profile read/update/complete; admin/productor/operario lists; invitations send/list/detail/accept/reject | Login, logout, refresh, password reset/change, profile, completion, user lists, sending/listing invitations are used | **Partial:** invitation detail/accept/reject are not actively implemented in the UI; admin listing usage is limited |
| Core | Units; farm alerts list/detail; farm audit logs list/detail | Units, alerts, and audit logs are implemented | **Good**; handwritten docs cover these endpoints |
| Farms and roles | Farm CRUD and `by_productor`; role CRUD/modules; member list/detail/update/delete; personal permission add/remove; departments/cities | Main farm CRUD, roles, members, permissions, departments/cities, and `by_productor` are implemented | **Good overall**; permission payload semantics have F-03 |
| Ponds | Pond list/create/detail/update/delete; allowed ponds; farm pond-members; per-pond member get/add/remove; activate/inactivate | Pond CRUD and activate/inactivate are implemented | **Partial:** allowed-pond and pond-specific member assignment endpoints have no frontend integration |
| Batches | Batch list/create/detail/update/set-status; pond-batch list/create/detail/update; batch transfers; production report | Batch and pond assignment flows plus report generation are present | **Partial/broken:** no set-status UI, no transfer UI, report cycle lookup is broken (F-02), and invalid cycle-batch fallbacks exist (F-04) |
| Production plans/cycles | Production-plan list/create/detail/update/delete; pond-cycle list/create/detail/update/delete/current state; cycle-batch list/create/detail/update/delete | Main plans, cycles, current state, and pond-scoped cycle batches are implemented | **Mostly implemented**, subject to F-04 |
| Farm events | Grading-event list/create/detail | No frontend implementation | **Missing**, and backend handlers are broken by F-01 |
| Species | Species CRUD; pond-type CRUD; parameter CRUD; feeding-reference CRUD; production-reference CRUD | Only the species list is consumed as a catalog | **Largely missing:** all administration and reference endpoints are absent from the frontend |
| Products/suppliers | Product-type CRUD; product CRUD; product stock detail and aggregate stock; supplier CRUD | Product/supplier CRUD, product stock detail, and catalog reads are implemented | **Partial:** aggregate `/products/stock/` and product-type mutations are not implemented |
| Purchases/inventory | Buy CRUD; inventory-movement list/detail | Buy CRUD and movement list are implemented | **Mostly implemented:** movement detail is not exposed separately |
| Feeding | Options; schedule list/create/detail/update/delete/versions; schedule plans/events; cycle feeding plans CRUD; occupied ranges; cycle events list/detail/update | Schedule creation/list/history, cycle plans, plan deletion/update, and event updates are implemented | **Partial:** schedule delete, several detail routes, and occupied ranges are unused; occupied-range service is wrong (F-05) |
| Monitoring | Fish-evaluation CRUD; farm/cycle daily-stat list/create and detail update/delete; farm/cycle control-stat reads | Fish-evaluation list/create and cycle control-stat/current-state reads are implemented | **Partial:** daily statistics are entirely absent; fish-evaluation detail/update/delete and farm-wide stat endpoints are absent |
| Harvest | Harvest list/create/detail; classifications; derive batch | List/create, classifications, and derive-batch flows are implemented | **Mostly implemented:** standalone harvest detail has no clear dedicated UI use |
| Health | Options; health-stat list/create/combined/detail/update/delete; treatment plans and occupied ranges; cycle/plan treatment-event reads and event update | Main health stats, plans, plan deletion, event list, and event update flows are implemented | **Partial:** occupied ranges, cycle-wide event list, plan update, and event-detail service functions are not used by UI |
| Sales | Client CRUD/can-delete; sales list/create/detail/edit/observations/can-edit; by-client/by-classification queries; sale-detail list/update/can-edit | Main clients, sale creation/list/detail/edit, observations, and detail editing are implemented | **Mostly implemented:** by-client and by-classification service methods exist but have no active UI caller |

## 5. Backend capabilities not implemented in the frontend

The most important missing frontend work is:

1. **Grading events:** no list, create, or detail UI/service.
2. **Batch transfers:** no list, create, or detail UI/service.
3. **Daily statistics:** no farm-wide or cycle-scoped list/create/update/delete UI.
4. **Species administration:** no create/update/delete UI for species, pond types, water/production parameters, feeding references, or production references.
5. **Pond member assignment:** no integration for allowed ponds, farm pond-member listing, or per-pond member add/remove.
6. **Batch status action:** no call to `PATCH /batches/{id}/set-status/`.
7. **Monitoring maintenance:** no fish-evaluation detail/update/delete UI and no farm-wide control-stat views.
8. **Product catalog administration:** no product-type create/update/delete UI and no aggregate stock endpoint usage.
9. **Invitation lifecycle:** no active invitation detail, accept, or reject flow.
10. **Several health/feeding secondary operations:** occupied ranges, cycle-wide treatment events, treatment-plan updates, feeding-schedule deletion, and several read-only detail routes.

Some omissions may be deliberate product-scope choices. They are listed because the backend exposes them and the request specifically asks which endpoints the frontend has not implemented.

## 6. Documentation assessment

### Handwritten backend documentation

The handwritten documentation is strongest for:

- Authentication and role behavior.
- Farm roles, members, personalized permissions, and invitations.
- Units, alerts, and audit logs.
- Audit-log filters and display fields.

It is missing a consolidated contract for most operational modules: ponds, batches, cycles, events, species, products, purchases, feeding, monitoring, harvests, health, and sales. Developers currently need to read URLs, views, and serializers to know request fields, filters, response shapes, status codes, and business rules.

### OpenAPI documentation

Swagger is exposed at `/api/docs/` and the schema at `/api/schema/`, but the schema-generation errors mean it should not yet be considered authoritative. In particular, consumers cannot reliably discover serializers or authentication requirements for many `APIView` endpoints.

### Frontend documentation

`Frontend/README.md` documents installation and execution but does not document:

- API base URL configuration beyond the code-level helper.
- Authentication/token/session behavior.
- Implemented backend modules.
- Known unsupported endpoints.
- Service-to-endpoint mappings.

## 7. Correct integrations worth preserving

The audit found coherent backend/frontend contracts in these areas:

- Farm role/member/personal-permission endpoint paths and primary payloads.
- Audit-log pagination and filter mapping.
- Alert filters and detail retrieval.
- Product, supplier, purchase, and inventory movement primary flows.
- Pond activation/inactivation.
- Production-plan and pond-scoped cycle routes.
- Cycle current-state and control-stat retrieval.
- Feeding schedule creation/listing, cycle feeding plans, and feeding event updates.
- Health-stat creation (including combined fish evaluation), treatment-plan creation/deletion, and treatment-event updates.
- Harvest creation/classifications/derive-batch.
- Client and sale primary workflows.
- Production-report request payload (`modules`, `format`, optional `cycle_id`) and blob download handling; only cycle discovery is broken.

## 8. Recommended remediation order

1. Fix `farm_pk`/`farm_id` in grading events and batch transfers and add endpoint tests.
2. Decide and implement one supported batch-to-cycle query; update the report modal service.
3. Stop the frontend permission sanitizer from changing independent permission choices.
4. Remove or correct the invalid cycle-batch fallback routes.
5. Correct the feeding occupied-range signature and route.
6. Centralize all frontend URLs through `apiConfig.js` and the shared API client.
7. Repair OpenAPI annotations/authentication until schema generation has zero errors; then enforce it in CI.
8. Prioritize missing UI modules based on product needs: daily statistics, transfers/events, pond access, then species administration.
9. Add contract/integration tests for every frontend service against Django URL resolution and serializer payloads.

## 9. Suggested automated regression checks

- Backend URL tests using `reverse`/`resolve` for every custom action and manually declared route.
- API tests for every allowed HTTP method, including permission-denied cases.
- A frontend test that extracts service routes and verifies them against an exported OpenAPI schema.
- Schema generation in CI with warnings treated as failures after the current backlog is corrected.
- A Docker frontend build and backend `manage.py check` on every pull request.
- Mock-service tests that assert frontend payload fields and response handling for roles, feeding, health, reports, and sales.

## 10. Conclusion

The application has broad frontend coverage of its core operational flows and both projects compile/check successfully in Docker. However, it is not accurate to say that all backend functions are correctly or completely implemented in the frontend. The critical backend URL-keyword defects, broken batch cycle discovery, permission semantic mismatch, invalid latent routes, fragmented API configuration, and incomplete OpenAPI contract should be resolved before treating the frontend/backend integration as complete.
