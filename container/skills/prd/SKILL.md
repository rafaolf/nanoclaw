---
name: prd
description: Create, manage, and track Product Requirements Documents. Use when the user asks to create a PRD, write requirements, define features, break down stories, plan product work, or push specs to Jira.
---

# PRD Management

Create and manage Product Requirements Documents (PRDs) in your workspace. PRDs are stored as structured markdown files in `/workspace/group/prd/`.

## Creating a PRD

When the user asks to create a PRD, gather the following through conversation:

1. **Product/Feature name**
2. **Problem statement** — what problem does this solve?
3. **Target users** — who benefits?
4. **Success metrics** — how do we measure success?
5. **Requirements** — what must be built?

Then create a structured PRD file:

```
/workspace/group/prd/{slug}.md
```

### PRD Template

```markdown
# {Feature Name} — PRD

**Status:** Draft | In Review | Approved | In Progress | Done
**Author:** {name}
**Created:** {date}
**Last Updated:** {date}
**Version:** 1.0

## Problem Statement
{Why are we building this? What pain point does it address?}

## Goals & Success Metrics
| Metric | Target | How Measured |
|--------|--------|-------------|
| {Metric 1} | {target} | {tool/method} |

## Target Users
{Who are the primary users? What are their characteristics?}

## Requirements

### Must Have (P0)
- [ ] REQ-001: {Requirement}
- [ ] REQ-002: {Requirement}

### Should Have (P1)
- [ ] REQ-010: {Requirement}

### Nice to Have (P2)
- [ ] REQ-020: {Requirement}

## User Stories

### Epic: {Epic Name}

**Story 1:** As a {role}, I want to {action} so that {benefit}
- Acceptance criteria:
  - [ ] {criterion}
  - [ ] {criterion}
- Estimate: {S/M/L/XL}

**Story 2:** ...

## Technical Considerations
{Architecture notes, dependencies, constraints, risks}

## Dependencies & Risks
| Risk/Dependency | Impact | Mitigation |
|-----------------|--------|-----------|
| {risk} | {H/M/L} | {plan} |

## Timeline
| Phase | Scope | Target | Status |
|-------|-------|--------|--------|
| Phase 1 | {MVP scope} | {date} | Not Started |
| Phase 2 | {Extended scope} | {date} | Not Started |

## Open Questions
- [ ] OQ-001: {Question that needs resolution}

## Change Log
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {date} | {name} | Initial draft |
```

## PRD Index

Maintain an index file at `/workspace/group/prd/INDEX.md`:

```markdown
# PRD Index

| PRD | Status | Author | Last Updated |
|-----|--------|--------|-------------|
| [{name}](./{slug}.md) | Draft | {author} | {date} |
```

Update this index whenever you create or change a PRD's status.

## Breaking PRDs into Jira

When the user wants to push stories to Jira, follow this workflow:

1. **Create the Epic**: `mcp__jira__jira_create_issue` with `issue_type: "Epic"`, summary = PRD title
2. **Create Stories** under the epic: `mcp__jira__jira_create_issue` with `issue_type: "Story"` and `parent_key` set to the epic key
3. **Link related issues**: `mcp__jira__jira_link_issues` to connect stories to dependencies or related work
4. **Add acceptance criteria** as the story description in Atlassian Document Format
5. **Update the PRD** with Jira issue keys for traceability (e.g., `REQ-001 → PM-42`)

Always confirm with the user before creating Jira issues. Summarize what you'll create first.

## Syncing PRDs to Google Drive

If Google Drive tools are available (`mcp__gdrive__*`), you can:

1. **Export**: Create a Google Doc from the PRD with `mcp__gdrive__gdrive_create_file` (set `convert_to_doc=true`)
2. **Update**: Overwrite the Drive copy with `mcp__gdrive__gdrive_update_file` after PRD changes
3. **Share**: Tell the user the `webViewLink` so stakeholders can review in Drive

Store the Drive file ID in the PRD metadata for future syncs.

## Common scenarios

| User says | What to do |
|-----------|-----------|
| "Create a PRD for X" | Ask clarifying questions → generate PRD file → update INDEX.md |
| "Show me the PRD for X" | Read from `/workspace/group/prd/` and summarize |
| "Update the PRD" | Read current PRD → apply changes → bump version → update change log |
| "Break this into stories" | Parse requirements into stories → confirm → create in Jira with links |
| "What PRDs do we have?" | Read and present INDEX.md |
| "Push this to Jira" | Create epic + stories → link them → update PRD with issue keys |
| "Push this PRD to Drive" | Create/update Google Doc → return share link |
| "What's the status of the PRDs?" | Read INDEX.md → summarize status of each |

## Tips

- Number requirements (REQ-001) for easy cross-referencing in Jira and conversations.
- Always update the version, change log, and last updated date on edits.
- Keep the INDEX.md current — it's the team's single view of all product specs.
- When breaking into stories, preserve requirement IDs in story descriptions for traceability.
