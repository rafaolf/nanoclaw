---
name: hubspot
description: Query and update HubSpot CRM — contacts, companies, deals, pipeline. Use when the user asks about CRM data, leads, pipeline, deals, or customers. Only available when HUBSPOT_ACCESS_TOKEN is configured.
---

# HubSpot CRM Integration

You have access to HubSpot CRM via MCP tools (prefixed `mcp__hubspot__`). Use these tools — do NOT use curl to call the HubSpot API directly.

## Available MCP tools

| Tool | Purpose |
|------|---------|
| `hubspot_search_contacts` | Search contacts by name, email, or other properties |
| `hubspot_search_deals` | Search deals by name or stage. Use for pipeline queries |
| `hubspot_search_companies` | Search companies by name or domain |
| `hubspot_get_deal` | Get full details of a specific deal by ID |
| `hubspot_get_pipeline_stages` | List all pipelines and stages (map stage IDs to names) |
| `hubspot_get_owners` | List sales reps (map owner IDs to names) |
| `hubspot_create_contact` | Create a new contact (email required) |
| `hubspot_create_deal` | Create a new deal (dealname required) |
| `hubspot_update_deal` | Update deal properties (stage, amount, close date, etc.) |

## Workflow tips

- **Pipeline overview**: Call `hubspot_get_pipeline_stages` first to map stage IDs to names, then `hubspot_search_deals` to list deals.
- **Owner lookup**: Call `hubspot_get_owners` to map `hubspot_owner_id` values to actual names.
- **Vague questions** like "how's the pipeline": Show a deal stage summary grouped by stage with total amounts.

## Response format

Present CRM data in a clean, readable format. Summarize key fields — don't dump raw JSON at the user. When listing multiple records, use a concise table or bullet format.
