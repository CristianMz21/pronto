# Pronto Barber Constitution

## Core Principles

### I. Pronto-First — No Reinventar
Toda funcionalidad nueva debe partir de lo que Pronto ya resuelve. Antes de escribir código: auditar, entender y extender. Nunca reescribir desde cero si el módulo existe. Cada cambio distingue entre mejora genérica (aportable upstream) y customización barbería (mantenida modular).

### II. Cliente Real Primero — Operación Diaria Tracciona el Roadmap
La prioridad absoluta es que una barbería real pueda abrir por la mañana y operar el día completo sin Excel/WhatsApp manual. Simpleza, estabilidad, velocidad y facilidad de uso pesan más que features vistosos. Cada feature responde a una necesidad operativa verificable.

### III. Integridad Transaccional y Seguridad (NON-NEGOTIABLE)
Citas, pagos, caja e inventario son sensibles a condiciones de carrera y a exposición de datos. Doble reserva debe ser imposible a nivel DB (trigger + `pg_advisory_xact_lock`), RLS de Supabase auditado, nunca `service_role` en cliente, validación Zod en todos los `api/*`, sanitización, rate limiting y secrets solo en `.env`/Supabase, jamás en git.

### IV. Mobile-First y PWA Offline-Safe
La barbería opera desde móvil/tablet. Toda UI crítica (calendario, POS, CRM) debe ser usable con touch, botones grandes, cargas rápidas y PWA instalable. Offline solo donde es seguro (POS con cola IndexedDB + sync), nunca para operaciones con riesgo de conflicto.

### V. Simplicidad, Trazabilidad y Mantenibilidad
TypeScript estricto, funciones pequeñas, componentes mantenibles, nombres claros, código muerto eliminado, dependencias justificadas. Cada operación crítica registra quién/qué/cuándo/sobre qué. Observabilidad y logs accionables desde el día uno. No agregar dependencia sin evaluar alternativas, mantenimiento, seguridad y tamaño.

## Technology Constraints

**Stack congelado**: Next.js 16 + React 19 + Tailwind + shadcn/ui + Supabase (PostgreSQL + Auth + Storage) + Next API Routes + Serwist PWA + next-intl + Docker (multi-stage, `output: standalone`). No cambiar stack sin ADR.

**Base de datos**: Migraciones SQL en `supabase/migrations/` ordenadas e idempotentes, RLS habilitado en toda tabla, triggers transaccionales para disponibilidad, `schema_migrations` como source of truth. `DATABASE_URL` directo a 5432, no pooler.

**Localización**: Español LatAm por defecto, pesos COP, formato fecha/hora Colombia, `es-CO`. Evitar hardcodear moneda/locale; parametrizar vía `businesses.timezone/currency` y `lib/utils.formatCurrency`.

**Multi-tenant**: Prioridad: una barbería funcionando. Arquitectura evita bloquear futuro multi-sede/multi-tenant (interfaces/límites razonables en `businesses`, `my_business_ids()`), pero sin implementar multi-tenant complejo prematuro.

## Development Workflow

**Spec-Driven (Spec Kit) es obligatorio**:
1. `specify init` ya ejecutado con integración `opencode` (`.opencode/commands/`, `.specify/`).
2. `/speckit.constitution` → principios (este archivo).
3. `/speckit.specify` → spec de feature (qué/por qué, no cómo) en `specs/###-name/spec.md`.
4. `/speckit.clarify` (opcional, recomendado) → resolver ambigüedades antes de planificar.
5. `/speckit.plan` → plan técnico, `research.md`, `data-model.md`, `contracts/`.
6. `/speckit.tasks` → `tasks.md` por user story, testeable independientemente.
7. `/speckit.implement` → ejecutar tareas.
8. `/speckit.analyze` / `/speckit.checklist` → validar consistencia y calidad (post-plan, pre-implement).

**Git**: `upstream = https://github.com/SGrappelli/pronto.git`, `origin = <tu-repo-privado>`. Nunca destruir historia, nunca force push destructivo. Cambios genéricos en ramas `feat/upstream-*` (aportables), custom barbería en `feat/barber-*` modular.

**Definition of Done**: funciona + validación + manejo de errores + permisos correctos + no rompe otras funciones + pruebas apropiadas + móvil ok cuando aplica + documentado cuando corresponde + verificado con ejecución real (no "compila = listo").

## Quality Gates

- **Testing**: descubrir primero qué testing existe (`npm run lint` es lo único hoy). Luego cobertura en críticos: unit (precios, disponibilidad, comisiones, inventario, caja), integration (auth, DB, bookings, POS, inventory), E2E del flujo completo cliente→reserva→recepción→servicio→checkout→pago→cita completada→historial. Doble reserva, cancelación, reprogramación, no-show, stock insuficiente y permisos deben tener pruebas.
- **Review**: anti-patrones delegación obligatoria en orquestación: 4+ archivos = delegar exploración, 2+ archivos con lógica nueva = delegar writer, >400 líneas = chained PRs.
- **Seguridad**: tras `docker compose up`, revisar `Supabase Dashboard → Advisors → Security Advisor` y corregir flags antes de producción con datos reales.
- **Docs**: toda feature con cambio de comportamiento actualiza `docs/` y `specs/*/spec.md`. `README.md`, `docs/architecture.md`, `docs/local-development.md`, `docs/deployment.md`, `docs/barbershop.md`, `docs/database.md`, `docs/security.md`, `docs/testing.md`, `docs/backup.md` deben permitir levantar el sistema desde cero.

## Governance

Esta constitución prevalece sobre cualquier otra práctica. Enmiendas requieren PR con justificación, impacto y plan de migración. Todos los PRs deben verificar conformidad con I–V. Complejidad debe justificarse; simplicidad es la opción por defecto.

**Version**: 1.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-27
