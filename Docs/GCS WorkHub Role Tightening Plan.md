# GCS WorkHub — Role tightening and reporting hub plan

Insert this **between Phase 3 and Phase 4** of `GCS WorkHub Development Roadmap.md`. Do not start capacity, KPIs, clients, or AI until Waves 0–3 below are done.

This plan turns the three-persona audit into sequenced work. Recommended product defaults are **locked for implementation** so we are not blocked on debate. Override a default in writing before that wave starts if Globecon wants a different cut.

---

## Locked product defaults

These are the intended desks after the plan ships. They replace the current “almost the same” buckets.

| Role | Job at Globecon | Sees | Creates | People | Reports |
| --- | --- | --- | --- | --- | --- |
| `admin` | Keep the company structure honest | Everything MD sees | Work + org (departments, teams, roles on people) | Invite any role; activate / deactivate anyone | Company |
| `managing_director` | Run the company from one cockpit | All work, people, projects | Work, reminders, resolve requests | Invite `department_head`, `manager`, `employee` only (not `admin`) | Company (Home + Reports) |
| `department_head` | Run a function | Own department work, people, projects; activity tied to that department’s work | Tasks, projects, responsibilities, department invites | Invite `employee` and `manager` into **own department only**; cannot deactivate | Department pack |
| `manager` | Assign and move work on a team | Same visibility as head for that department | Tasks, projects, responsibilities | Cannot invite | Same department pack as head (read) |
| `employee` | Execute assigned work | Own tasks; projects they own or are on; own activity; own responsibilities | Comments, progress, status on **visible** tasks; **work requests** to their head | Self only | Personal Overview only |

**Manager vs head:** managers **can** edit department tasks (same `canEditTaskActor` as heads). They still cannot invite or change org structure. The seed description already says “leads a team and assigns work.”

**Admin vs MD:** not identical. Shared: company-wide read, create work, reminders. Split: only `admin` edits departments/teams and can grant the `admin` role. MD is the reporting owner.

**Employee on a project:** Projects appears in nav if they own a project or sit on `project_teams`. Workspace is **read + act on own linked tasks**. Milestone/team/project settings stay `canManageProject`.

**Central reporting:** one metric engine, three audiences. No company totals for heads or employees. No Phase-4 KPI engine yet — scoped operational packs only.

---

## Architecture: one permission kernel

Today helpers live in `lib/auth/permissions.ts` **and** are duplicated in `lib/db/queries.ts`. Writes in `app/actions.ts` are inconsistent.

### Target

All role logic lives in `lib/auth/permissions.ts`. Queries and actions **only** call those helpers. UI uses the same helpers (or a thin `lib/auth/capabilities.ts` that maps to nav flags) so a button cannot appear for a right the server will deny.

```
canSeeTask(user, task)
canProgressTask(user, task)     // status, progress, complete, comment, attach, submit deliverable
canEditTask(user, task)         // title, assignee, dates, priority, category, dependencies
canCreateWork(user)
canManageProject(user, project)
canManageOrg(user)              // admin only
canInvite(user, { role, departmentId })
canViewCompanyReports(user)     // admin + MD
canViewDepartmentReports(user)  // head + manager with departmentId
canSubmitWorkRequest(user)      // employee (+ optional head)
canSubmitLeadershipRequest(user) // head + manager + management
```

`canProgressTask` = `canSeeTask`. If you can see the task, you can move your work on it. `canEditTask` stays stricter (management, assignee, or department head/manager of the task’s department).

### Deny-by-default wrapper

Add `assertCan(ok, message)` used at the top of every mutation. Missing check = fail closed, not “signed in is enough.”

### Duplicate role checks to delete

- `isManagement` / `isDepartmentLeader` copies in `lib/db/queries.ts` — import from permissions.
- Nav flags in `workhub-dashboard-db.tsx` (`canCreateWork`, `canViewProjects`, …) — derive from capabilities, including employee project membership.

---

## Wave 0 — Permission kernel and leaky writes (do first)

**Why first:** every later feature is unsafe if status, comments, and requests stay ungated.

### Build

1. Expand `lib/auth/permissions.ts` with the helpers above. Keep `isManagement` but stop treating it as the only gate.
2. `canEditTaskActor` → alias of `canEditTask`; include `manager` with `departmentId` match (same as head).
3. Gate every mutation in `app/actions.ts`:

   | Action | Required check |
   | --- | --- |
   | `updateTaskStatus`, `completeTask`, `updateTaskProgress`, `addComment`, `addAttachment`, `createDeliverable`, `submitDeliverable` | `canProgressTask` |
   | `updateTaskDetails`, `createTaskDependency` | `canEditTask` on **both** tasks for deps |
   | `createManagementRequest` | `canSubmitLeadershipRequest` **or** `canSubmitWorkRequest` (employee path in Wave 3) |
   | `createTask` / `createProject` / `createResponsibility` | `canCreateWork` (unchanged set, plus keep employees out) |
   | `inviteEmployee` | `canInvite` with target role + department |
   | `toggleUserStatus` | `canManageUsers` (MD + admin); admin-only if target is `admin` |
   | Approvals / deliverable verify | keep approver checks; also require `canSeeTask` |

4. Return `{ error }` with a stable message; never throw to the client for auth.
5. Unit tests (Vitest or existing runner if none, add a small `lib/auth/permissions.test.ts`) covering: employee cannot complete another dept’s task; manager can edit dept task; employee comment denied on unseen id; MD can see all.

### Files

`lib/auth/permissions.ts`, `lib/db/queries.ts`, `app/actions.ts`, new test file.

### Done when

A signed-in employee with a guessed task id cannot change status, comment, attach, or add a dependency. Manager can edit a colleague’s department task details.

---

## Wave 1 — Three desks in the shell (nav + data + seed hygiene)

**Why:** UI must match the kernel so people are not “allowed in data, hidden in nav” or the reverse.

### Build

1. **Projects for employees:** `canViewProjects = management || department leader || owner || team member`. Nav includes Projects when true. Project workspace: if `canManageProject`, full CRUD; else read-only chrome + act on own tasks.
2. **Reports in MD/admin nav** under Lead, after Home. `resolveWorkspaceView` already special-cases Reports for management — keep that, but **allow** `view=Reports` instead of collapsing it to Home.
3. **Heads/managers:** keep landing on Departments. Overview stays their personal/dept mix. Do **not** show company Home.
4. **Activity:** `listActivity` filters by:
   - management: all
   - head/manager: actor in department **or** `entityType=task` whose task `departmentId` matches **or** `entityType=project` whose project home dept matches
   - employee: actor is self **or** entity is a task they can see  
   Requires joining/looking up entity ids (batch `inArray`), not only `actor.departmentId`.
5. **Seed:** remove dual `department_head` + `employee` on Sofia; one role per person except we never stack head+employee. Fix MD email typo `globeconcs` → `globecons` only if you are ready to update login docs (otherwise leave email, document the typo).
6. **URL lock:** `allowedViews` must include Reports for management and Projects for employee teammates so deep links are not bounced.

### Files

`lib/workspace-nav.ts`, `components/workhub-dashboard-db.tsx`, `components/project-workspace.tsx`, `lib/db/queries.ts`, `scripts/seed.ts`.

### Done when

Login as employee-on-a-team → Projects in sidebar → can open workspace, cannot add milestones. Login as head → no Home, no Settings, no company scorecard. Login as MD → Home and Reports both reachable.

---

## Wave 2 — Central reporting hub (the point of the system)

One module: `lib/reporting/build-report.ts` (or `lib/db/reporting.ts`) that takes `{ viewer, scope: 'company' | 'department' | 'personal' }` and returns the same shape Home already uses: completion, overdue, stuck, due today/week, projects, scorecard rows, request counts.

### Surfaces

| Audience | Entry | Scope | Contents |
| --- | --- | --- | --- |
| MD / admin | Home (decisions) + **Reports** (pack) | Company | Scorecard by department, attention tiles, open requests, project health, people coverage |
| Head / manager | **Department report** (new nav item or Departments header action) | Own `departmentId` | Same tiles, one department, people in dept, projects home’d here |
| Employee | Overview | Personal | Assigned / in progress / completed — already exists; do not add company numbers |

### Build

1. Extract metric math out of `getOverviewData` / dashboard JSX into `buildReport`. Home, Reports, and the head pack all call it.
2. Put **Reports** in the sidebar for management. Differentiate copy: Home = “what needs a decision today”; Reports = “operational pack you can stand behind in a meeting.”
3. Head pack: reuse `ScorecardList` / `AttentionTiles` / request list filtered to the department. Link tiles into `My tasks` with existing `deadline` / `scope` query params.
4. **Export CSV** (no PDF yet): current scoped task list + a one-row summary. Action `exportReportCsv` that re-checks `canViewCompanyReports` or `canViewDepartmentReports`. Download via a small route or data URL from the client after the action returns text.
5. **Print stylesheet** for Reports / department pack (`@media print`) so Monday meetings can print from the browser. That is the “document” until PDF exists.
6. Optional in this wave (if summaries already email): include heads on **department** daily/weekly summaries, not company-wide. Confirm existing jobs in `lib/notifications` before adding new cron.

### Files

New `lib/reporting/build-report.ts`, `app/actions.ts` (export), `app/globals.css` (print), dashboard Reports + new head report panel, possibly `app/api/reports/export/route.ts`.

### Done when

MD can open Reports from nav, print a pack, download CSV of company open work. Head can open a department pack whose numbers match Departments + My tasks for that dept. Employee CSV/export is absent.

**Out of scope here:** KPI definitions, capacity, client reporting (Phase 4+).

---

## Wave 3 — Org CRUD, staffing, employee voice, archive

This is the ops completeness wave. Still not Phase 4.

### 3a Org structure (admin)

In Settings (admin only):

- Create / rename department (name, slug, color, owner).
- Create / rename team under a department.
- Assign user `departmentId`, `teamId`, `managerId`.
- Assign **one** primary role (replace dual-role seed pattern). Changing someone to `department_head` requires `departmentId`.

Actions: `createDepartment`, `updateDepartment`, `createTeam`, `updateTeam`, `updateUserPlacement`. All `canManageOrg`. Soft-delete later; v1 is rename + deactivate people only.

### 3b Staffing (MD + heads)

- MD invite: roles `department_head` | `manager` | `employee`; any department.
- Head invite: roles `manager` | `employee`; `departmentId` forced to the head’s department; ignore client-supplied department.
- Deactivate: MD + admin; cannot deactivate yourself; cannot deactivate the last admin.

`invite-employee-dialog.tsx` must hide illegal role options.

### 3c Employee work requests

Employees get “Request work” (not free create-task):

- Creates a `management_requests` row (or a dedicated `work_requests` table if you want a cleaner model — prefer **reuse** `management_requests` with `priority` + assignee = department head).
- Head sees it on Department report and can **promote** to a task (`createTask` from request, then resolve request).
- Employee cannot assign other people.

### 3d Soft archive (no hard delete of work)

- Task / project / responsibility: `cancelled` or `on_hold` already exist where applicable. Add **archive** only if product needs it off lists; otherwise filter `cancelled` from default My tasks (if not already).
- Projects: `updateProjectDetails` already has status — add `archived` to enum if missing, hide from default portfolio.

### 3e Notifications for the new desks

- Head: notify on employee work request.
- Employee: notify when request is promoted or declined.
- Do not spam MD with department-local requests unless unassigned.

### Files

`lib/db/schema.ts` + migration if project archive enum or work-request fields need it; `app/actions.ts`; Settings UI in dashboard; invite dialog; employee Overview CTA.

### Done when

Admin can add a department in Settings and invite a head into it. A head can invite an employee who only appears in that department. An employee can file a request that becomes a task without ever getting `canCreateWork`.

---

## Wave 4 — Proof, not more features

1. **Persona login matrix** (browser, seed users): MD, one head, one manager, one employee, one employee on a project team. For each: landing view, nav items, one create, one forbidden action (expect error), one report/export where allowed.
2. **Regression:** project workspace CRUD, create-task Other category, unlink milestone, invite flow for MD.
3. **Audit leftover:** grep `actions.ts` for `getCurrentUser` blocks that mutate without a `can*` call.
4. Add a short “Roles” subsection to the roadmap pointing at this file. Only then consider Phase 4.

---

## Explicitly not in this plan

- Capacity, leave, workload heatmaps
- Client / engagement module
- AI summaries
- PDF generation service
- Impersonation (`switchUser` stays disabled)
- Hard-delete of tasks or people

---

## Suggested execution order in git

| PR | Wave | Theme |
| --- | --- | --- |
| 1 | 0 | Permission kernel + gate writes + tests |
| 2 | 1 | Nav, employee projects, activity entity scope, seed role hygiene |
| 3 | 2 | `buildReport`, Reports nav, head pack, CSV + print |
| 4 | 3a–3b | Org CRUD + scoped invite |
| 5 | 3c–3e | Employee work requests + archive polish |
| 6 | 4 | Persona verification notes (no feature dump) |

Do not mix Wave 0 with UI chrome in the same PR. A missed `canProgressTask` is easier to review when the diff is mostly `actions.ts`.

---

## Acceptance bar for “central reporting”

Globecon can answer, without leaving WorkHub:

- MD: what is late, stuck, or unowned **across the company**, by department, today.
- Head: the same questions **for my function**, plus who on my team is idle vs overloaded *as task counts* (not hours — hours are Phase 4).
- Employee: what I owe, what I requested, which project I am on.

If a meeting still needs a spreadsheet, CSV export from the matching pack is the answer — not a new dashboard.
