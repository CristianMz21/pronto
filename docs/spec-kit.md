# Spec Kit — Cómo trabajamos en Pronto Barber

> Este proyecto usa **GitHub Spec Kit** (`github/spec-kit`) con integración **opencode** para trazabilidad spec→plan→tasks→implement.

## Estructura

```
.specify/
├── memory/constitution.md        # Principios (I-V + constraints + workflow)
├── templates/{spec,plan,tasks,checklist}-template.md
├── scripts/bash/{create-new-feature.sh, setup-plan.sh, setup-tasks.sh, common.sh}
├── extensions/agent-context/     # auto-update de AGENTS.md
└── integrations/opencode.manifest.json

specs/
└── 001-pronto-barber-platform/
    ├── spec.md                   # Qué/por qué (8 user stories P1-P3, 30 FR, 10 SC)
    ├── plan.md                   # Cómo (stack, constitution check, structure)
    ├── research.md               # Auditoría Pronto + decisiones
    ├── data-model.md             # Entidades + migraciones 036..041
    ├── quickstart.md             # Cómo levantar desde cero
    ├── contracts/api-book.openapi.yaml
    └── tasks.md                  # 43 tasks por fase/story
```

## Comandos (opencode)

| Comando | Qué hace | Cuándo |
|---------|----------|--------|
| `/speckit.constitution` | Crea/actualiza principios en `.specify/memory/constitution.md` | Una vez por proyecto, luego enmiendas |
| `/speckit.specify` | Genera `specs/###-name/spec.md` desde prompt | Nueva feature |
| `/speckit.clarify` | Resuelve ambigüedades (recomendado antes de plan) | Antes de `/speckit.plan` |
| `/speckit.plan` | Genera `research.md` + `plan.md` + `data-model.md` + `quickstart.md` + `contracts/` | Después de spec |
| `/speckit.tasks` | Genera `tasks.md` por user story testeable | Después de plan |
| `/speckit.implement` | Ejecuta tasks | Después de tasks |
| `/speckit.analyze` | Reporte consistencia cross-artifact | Después de tasks, antes de implement |
| `/speckit.checklist` | Checklists calidad | Después de plan |
| `specify check` | Valida herramientas instaladas | Siempre |
| `specify extension ...` | Gestiona extensiones (ej: `bug`, `assess`) | Opt-in |

## Workflow vigente (001)

1. **Constitution** ✅ `1.0.0` (2026-08-27) — Pronto-First, Cliente Real Primero, Integridad/Seguridad NON-NEGOTIABLE, Mobile-First PWA, Simplicidad.
2. **Specify** ✅ `specs/001-pronto-barber-platform/spec.md` — 8 stories (P1: bootstrap/hardening/clientes-barberos-servicios/agenda; P2: POS-caja-comisiones/CRM-inventario-dashboard/notifs-PWA; P3: reportes).
3. **Plan** ✅ `plan.md` + `research.md` + `data-model.md` + `quickstart.md` + `contracts/`.
4. **Tasks** ✅ `tasks.md` — 43 tasks en 11 fases (Setup→Producción), gates de concurrencia y caja.
5. **Implement** ⏳ siguiente: ejecutar tasks por fase con `git` branches `feat/barber-*` vs `feat/upstream-*`.

## Git: upstream vs origin

```bash
git remote -v
# upstream  https://github.com/SGrappelli/pronto.git
# origin    <TU-REPOSITORIO-PRIVADO>  (agregar cuando crees el remoto)
git branch -a # main sigue a upstream/main
```

Cambios genéricos → `feat/upstream-*` (aportables upstream). Customs barbería → `feat/barber-*` modular.

## Próximos features (después de 001)

- `002-*` no hace falta si 001 cubre todo; pero si el scope crece, crear nuevo `specify` con `create-new-feature.sh --short-name "barber-analytics"` etc. Cada feature es slice entregable.

## Referencias

- Repo Spec Kit: https://github.com/github/spec-kit
- Docs: https://github.github.io/spec-kit/
- CLI: `uv tool install specify-cli` (ya instalado 0.11.1)
