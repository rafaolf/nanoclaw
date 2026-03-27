---
name: calendar
description: Manage Google Calendar — list, create, update, delete events, check availability, and find free slots. Only available when the Google service account is configured.
---

# Google Calendar Integration

You have access to Google Calendar via MCP tools (prefixed `mcp__calendar__`). Use these tools — do NOT use curl to call the Calendar API directly.

## Available MCP tools

| Tool | Purpose |
|------|---------|
| `calendar_list_calendars` | List all calendars the user has access to |
| `calendar_get_events` | List events in a date range (defaults to next 7 days) |
| `calendar_get_event` | Get details of a specific event by ID |
| `calendar_create_event` | Create a new event (timed or all-day) |
| `calendar_update_event` | Update an existing event (partial update) |
| `calendar_delete_event` | Delete an event |
| `calendar_freebusy` | Check free/busy status to find available slots |

## Workflow tips

- **"What's on my calendar?"**: Use `calendar_get_events` with default time range (next 7 days).
- **"Schedule a meeting"**: Use `calendar_create_event`. Always confirm date, time, and attendees before creating.
- **"Find a free slot"**: Use `calendar_freebusy` to check availability, then suggest open times.
- **"Move my 3pm"**: Use `calendar_get_events` to find the event, then `calendar_update_event` to change it.
- **All-day events**: Use `YYYY-MM-DD` format for start/end (not ISO 8601 with time).
- **Recurring events**: Pass `recurrence` with RRULE strings (e.g. `["RRULE:FREQ=WEEKLY;COUNT=10"]`).
- **Timezones**: Defaults to the configured TIMEZONE env var. Always specify timezone for users in different zones.

## Conflict-aware creation

Before creating any event, follow this workflow:

1. **Check conflicts**: Call `calendar_freebusy` for the proposed time window
2. **If busy**: Inform the user of the conflict and suggest the nearest free slot
3. **If free**: Proceed to create, confirming details with the user first
4. **Never silently overbook**: Always tell the user if there's an overlap

## Common scenarios

| User says | What to do |
|-----------|-----------|
| "What's on my calendar today?" | `get_events` with today's date range |
| "Schedule a meeting with X tomorrow at 3pm" | `freebusy` to check 3-4pm → confirm → `create_event` |
| "Cancel my 2pm" | `get_events` to find it → confirm which event → `delete_event` |
| "When am I free this week?" | `freebusy` for the full week → summarize open slots |
| "Move my standup to 10am" | `get_events` (find standup) → `update_event` with new time |
| "Set up a weekly 1:1 with [name]" | `create_event` with recurrence `RRULE:FREQ=WEEKLY` |

## Response format

Present calendar data clearly. For event lists, show: title, date/time, location (if any), and attendees (if any). Don't dump raw JSON. Use the channel-appropriate formatting (check your group folder name).
