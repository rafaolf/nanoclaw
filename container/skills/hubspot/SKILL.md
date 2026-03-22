---
name: hubspot
description: Query and update HubSpot CRM — contacts, companies, deals. Use when the user asks about CRM data, leads, pipeline, deals, or customers.
---

# HubSpot CRM Integration

**Access control:** Before using any HubSpot API, verify you have the credential:

```bash
test -n "$HUBSPOT_ACCESS_TOKEN" && echo "OK" || echo "NO_ACCESS"
```

If `NO_ACCESS`, do NOT attempt any CRM operations. Instead, check the channel-routing skill for where to redirect the user.

You have access to the HubSpot API via the `HUBSPOT_ACCESS_TOKEN` environment variable. Use `curl` to make API calls.

**Base URL:** `https://api.hubapi.com`
**Auth header:** `Authorization: Bearer $HUBSPOT_ACCESS_TOKEN`

## Common operations

### Search contacts

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filterGroups": [{"filters": [{"propertyName": "email", "operator": "CONTAINS_TOKEN", "value": "example.com"}]}],
    "properties": ["firstname", "lastname", "email", "company", "phone"],
    "limit": 10
  }'
```

### Search deals

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/deals/search" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filterGroups": [{"filters": [{"propertyName": "dealstage", "operator": "EQ", "value": "appointmentscheduled"}]}],
    "properties": ["dealname", "dealstage", "amount", "pipeline", "closedate", "hubspot_owner_id"],
    "limit": 10
  }'
```

### List contacts (recent)

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=firstname,lastname,email,company,phone&sorts=-createdate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### List deals (recent)

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/deals?limit=10&properties=dealname,dealstage,amount,pipeline,closedate&sorts=-createdate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### List companies (recent)

```bash
curl -s "https://api.hubapi.com/crm/v3/objects/companies?limit=10&properties=name,domain,industry,city,phone&sorts=-createdate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### Get a specific record

```bash
# Contact by ID
curl -s "https://api.hubapi.com/crm/v3/objects/contacts/{contactId}?properties=firstname,lastname,email,company,phone,lifecyclestage" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

# Deal by ID
curl -s "https://api.hubapi.com/crm/v3/objects/deals/{dealId}?properties=dealname,dealstage,amount,pipeline,closedate" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### Get associations (e.g. contacts on a deal)

```bash
curl -s "https://api.hubapi.com/crm/v4/objects/deals/{dealId}/associations/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### Create a note

```bash
curl -s -X POST "https://api.hubapi.com/crm/v3/objects/notes" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "hs_note_body": "Note content here",
      "hs_timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }'
```

### Associate a note with a contact

```bash
curl -s -X PUT "https://api.hubapi.com/crm/v4/objects/notes/{noteId}/associations/contacts/{contactId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 202}]'
```

### Update a record

```bash
curl -s -X PATCH "https://api.hubapi.com/crm/v3/objects/contacts/{contactId}" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"phone": "+1234567890"}}'
```

### Get deal pipeline stages

```bash
curl -s "https://api.hubapi.com/crm/v3/pipelines/deals" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### Get owners (sales reps)

```bash
curl -s "https://api.hubapi.com/crm/v3/owners" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

## Search operators

Use these in `filterGroups[].filters[].operator`:
- `EQ` — equals
- `NEQ` — not equal
- `LT` / `LTE` / `GT` / `GTE` — comparisons (dates use millisecond timestamps)
- `CONTAINS_TOKEN` — contains word/token
- `NOT_CONTAINS_TOKEN` — does not contain
- `HAS_PROPERTY` / `NOT_HAS_PROPERTY` — property exists or not

## Response format

Always present CRM data in a clean, readable format. Summarize key fields — don't dump raw JSON at the user. When listing multiple records, use a concise table or bullet format.

## Important

- Always check `$HUBSPOT_ACCESS_TOKEN` is set before making calls
- Parse JSON responses with `jq` for readability
- Respect rate limits: max 100 requests per 10 seconds
- When the user asks vague questions like "how's the pipeline", show a deal stage summary
