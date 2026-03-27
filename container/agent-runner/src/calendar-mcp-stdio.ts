/**
 * Google Calendar MCP Server for NanoClaw
 * Provides Google Calendar API access via Service Account.
 * Reuses the same service account JSON as Google Drive.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSign } from 'crypto';
import fs from 'fs';
import { errorResult } from './mcp-utils.js';

const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? '/workspace/google-service-account.json';

if (!fs.existsSync(SA_PATH)) {
  console.error(`Service account file not found at ${SA_PATH} — Google Calendar MCP server cannot start.`);
  process.exit(1);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf-8'));
  const now = Math.floor(Date.now() / 1000);

  // Domain-wide delegation: impersonate the calendar owner
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT ?? sa.client_email;

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: subject,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signingInput = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key, 'base64url');

  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function calendarRequest(path: string, method = 'GET', body?: object): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${text}`);
  }

  if (res.status === 204) return {};
  return res.json();
}

const server = new McpServer({ name: 'calendar', version: '1.0.0' });

// ── List calendars ─────────────────────────────────────────────────────

server.tool(
  'calendar_list_calendars',
  'List all calendars the user has access to.',
  {},
  async () => {
    try {
      const data = await calendarRequest('/users/me/calendarList?maxResults=100');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Get events ─────────────────────────────────────────────────────────

server.tool(
  'calendar_get_events',
  'List events from a calendar within a date range.',
  {
    calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    time_min: z.string().optional().describe('Start of range (ISO 8601, e.g. "2026-03-25T00:00:00Z"). Defaults to now.'),
    time_max: z.string().optional().describe('End of range (ISO 8601). Defaults to 7 days from now.'),
    query: z.string().optional().describe('Free-text search within event fields'),
    max_results: z.number().optional().describe('Max events to return (default 25, max 250)'),
  },
  async ({ calendar_id = 'primary', time_min, time_max, query, max_results = 25 }) => {
    try {
      const now = new Date();
      const tMin = time_min ?? now.toISOString();
      const tMax = time_max ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const params = new URLSearchParams({
        timeMin: tMin,
        timeMax: tMax,
        maxResults: String(Math.min(max_results, 250)),
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      if (query) params.set('q', query);

      const data = await calendarRequest(
        `/calendars/${encodeURIComponent(calendar_id)}/events?${params}`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Get single event ───────────────────────────────────────────────────

server.tool(
  'calendar_get_event',
  'Get details of a specific event by ID.',
  {
    calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID'),
  },
  async ({ calendar_id = 'primary', event_id }) => {
    try {
      const data = await calendarRequest(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Create event ───────────────────────────────────────────────────────

server.tool(
  'calendar_create_event',
  'Create a new calendar event. Supports all-day events, timed events, attendees, and recurrence.',
  {
    calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    summary: z.string().describe('Event title'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    start_time: z.string().describe('Start time (ISO 8601 for timed, or YYYY-MM-DD for all-day)'),
    end_time: z.string().describe('End time (ISO 8601 for timed, or YYYY-MM-DD for all-day)'),
    timezone: z.string().optional().describe('Timezone (e.g. "America/New_York"). Defaults to env TIMEZONE.'),
    attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
    recurrence: z.array(z.string()).optional().describe('RRULE strings (e.g. ["RRULE:FREQ=WEEKLY;COUNT=10"])'),
    reminders: z.array(z.object({
      method: z.enum(['email', 'popup']),
      minutes: z.number(),
    })).optional().describe('Custom reminders'),
    color_id: z.string().optional().describe('Color ID (1-11)'),
  },
  async ({ calendar_id = 'primary', summary, description, location, start_time, end_time, timezone, attendees, recurrence, reminders, color_id }) => {
    try {
      const tz = timezone ?? process.env.TIMEZONE ?? 'America/New_York';
      const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start_time);

      const event: Record<string, unknown> = {
        summary,
        ...(description && { description }),
        ...(location && { location }),
        start: isAllDay ? { date: start_time } : { dateTime: start_time, timeZone: tz },
        end: isAllDay ? { date: end_time } : { dateTime: end_time, timeZone: tz },
        ...(attendees && { attendees: attendees.map(email => ({ email })) }),
        ...(recurrence && { recurrence }),
        ...(reminders && {
          reminders: { useDefault: false, overrides: reminders },
        }),
        ...(color_id && { colorId: color_id }),
      };

      const data = await calendarRequest(
        `/calendars/${encodeURIComponent(calendar_id)}/events`,
        'POST',
        event,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Update event ───────────────────────────────────────────────────────

server.tool(
  'calendar_update_event',
  'Update an existing calendar event. Only provided fields are changed.',
  {
    calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID to update'),
    summary: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    location: z.string().optional().describe('New location'),
    start_time: z.string().optional().describe('New start time (ISO 8601 or YYYY-MM-DD)'),
    end_time: z.string().optional().describe('New end time (ISO 8601 or YYYY-MM-DD)'),
    timezone: z.string().optional().describe('Timezone'),
    attendees: z.array(z.string()).optional().describe('Replace attendees list'),
    color_id: z.string().optional().describe('Color ID (1-11)'),
  },
  async ({ calendar_id = 'primary', event_id, summary, description, location, start_time, end_time, timezone, attendees, color_id }) => {
    try {
      const tz = timezone ?? process.env.TIMEZONE ?? 'America/New_York';
      const patch: Record<string, unknown> = {};

      if (summary !== undefined) patch.summary = summary;
      if (description !== undefined) patch.description = description;
      if (location !== undefined) patch.location = location;
      if (color_id !== undefined) patch.colorId = color_id;
      if (attendees !== undefined) patch.attendees = attendees.map(email => ({ email }));

      if (start_time) {
        const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(start_time);
        patch.start = isAllDay ? { date: start_time } : { dateTime: start_time, timeZone: tz };
      }
      if (end_time) {
        const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(end_time);
        patch.end = isAllDay ? { date: end_time } : { dateTime: end_time, timeZone: tz };
      }

      const data = await calendarRequest(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        'PATCH',
        patch,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Delete event ───────────────────────────────────────────────────────

server.tool(
  'calendar_delete_event',
  'Delete a calendar event.',
  {
    calendar_id: z.string().optional().describe('Calendar ID (default: "primary")'),
    event_id: z.string().describe('Event ID to delete'),
  },
  async ({ calendar_id = 'primary', event_id }) => {
    try {
      await calendarRequest(
        `/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(event_id)}`,
        'DELETE',
      );
      return { content: [{ type: 'text' as const, text: 'Event deleted.' }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ── Find free/busy ─────────────────────────────────────────────────────

server.tool(
  'calendar_freebusy',
  'Check free/busy status for one or more calendars. Useful for finding available time slots.',
  {
    calendar_ids: z.array(z.string()).optional().describe('Calendar IDs to check (default: ["primary"])'),
    time_min: z.string().describe('Start of range (ISO 8601)'),
    time_max: z.string().describe('End of range (ISO 8601)'),
    timezone: z.string().optional().describe('Timezone'),
  },
  async ({ calendar_ids = ['primary'], time_min, time_max, timezone }) => {
    try {
      const tz = timezone ?? process.env.TIMEZONE ?? 'America/New_York';
      const data = await calendarRequest('/freeBusy', 'POST', {
        timeMin: time_min,
        timeMax: time_max,
        timeZone: tz,
        items: calendar_ids.map(id => ({ id })),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
