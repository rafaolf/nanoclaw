---
name: hubspot
description: Query and update HubSpot CRM — contacts, companies, deals, pipeline, notes, associations. Use when the user asks about CRM data, leads, pipeline, deals, customers, or activity history. Only available when HUBSPOT_ACCESS_TOKEN is configured.
---

# HubSpot CRM Integration

You have access to HubSpot CRM via MCP tools (prefixed `mcp__hubspot__`). Use these tools — do NOT use curl to call the HubSpot API directly.

## Available MCP tools

| Tool | Purpose |
|------|---------|
| `hubspot_search_contacts` | Search contacts by name, email, or other properties |
| `hubspot_get_contact` | Get full details of a specific contact by ID |
| `hubspot_update_contact` | Update contact properties (email, phone, lifecycle stage, etc.) |
| `hubspot_create_contact` | Create a new contact (email required) |
| `hubspot_search_deals` | Search deals by name or stage. Use for pipeline queries |
| `hubspot_get_deal` | Get full details of a specific deal by ID |
| `hubspot_create_deal` | Create a new deal (dealname required) |
| `hubspot_update_deal` | Update deal properties (stage, amount, close date, etc.) |
| `hubspot_search_companies` | Search companies by name or domain |
| `hubspot_get_pipeline_stages` | List all pipelines and stages (map stage IDs to names) |
| `hubspot_get_owners` | List sales reps (map owner IDs to names) |
| `hubspot_get_notes` | Get notes/activities attached to a contact, deal, or company |
| `hubspot_add_note` | Add a note to a contact, deal, or company (log calls, meetings, observations) |
| `hubspot_get_associations` | Get linked objects (e.g. contacts on a deal, deals on a company) |

## Workflow tips

- **Pipeline overview**: Call `hubspot_get_pipeline_stages` first to map stage IDs to names, then `hubspot_search_deals` to list deals.
- **Owner lookup**: Call `hubspot_get_owners` to map `hubspot_owner_id` values to actual names.
- **Vague questions** like "how's the pipeline": Show a deal stage summary grouped by stage with total amounts.
- **Deal deep-dive**: Use `hubspot_get_deal` + `hubspot_get_associations` (to contacts) + `hubspot_get_notes` for full context.
- **Log activity**: Use `hubspot_add_note` to record call summaries, meeting notes, or status updates.
- **Contact history**: Use `hubspot_get_notes` on a contact to review interaction history before a call or meeting.

## Common scenarios

| User says | What to do |
|-----------|-----------|
| "How's the pipeline?" | `get_pipeline_stages` → `search_deals` → summarize by stage with totals |
| "Tell me about [company]" | `search_companies` → `get_associations` (deals) → `get_associations` (contacts) |
| "Log a call with [contact]" | `search_contacts` → `add_note` with call summary |
| "Move deal X to won" | `search_deals` → `update_deal` with new stage ID |
| "Who's working on [deal]?" | `get_deal` → `get_owners` to resolve owner → `get_associations` (contacts) |

## Response format

Present CRM data in a clean, readable format. Summarize key fields — don't dump raw JSON at the user. When listing multiple records, use a concise table or bullet format.
