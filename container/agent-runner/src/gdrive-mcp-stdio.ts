/**
 * Google Drive MCP Server for NanoClaw
 * Provides Google Drive API access via Service Account.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execSync } from 'child_process';
import fs from 'fs';

const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? '/workspace/google-service-account.json';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf-8'));
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signingInput = `${header}.${claims}`;

  // Sign with openssl (available in container)
  const tmpKey = '/tmp/sa-key.pem';
  fs.writeFileSync(tmpKey, sa.private_key, { mode: 0o600 });
  const sig = execSync(`echo -n '${signingInput}' | openssl dgst -sha256 -sign ${tmpKey} | base64 -w0`, {
    encoding: 'utf-8',
  }).trim();
  fs.unlinkSync(tmpKey);

  const signature = sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

async function driveRequest(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error ${res.status}: ${text}`);
  }

  return res.json();
}

const server = new McpServer({ name: 'gdrive', version: '1.0.0' });

server.tool(
  'gdrive_list_files',
  'List files and folders in Google Drive. Returns files shared with the service account.',
  {
    query: z.string().optional().describe('Search query (file name). Omit to list all files.'),
    folder_id: z.string().optional().describe('Folder ID to list contents of. Omit for root.'),
    mime_type: z.string().optional().describe('Filter by MIME type (e.g. "application/vnd.google-apps.spreadsheet")'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ query, folder_id, mime_type, limit = 20 }) => {
    const parts: string[] = [];
    if (query) parts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    if (folder_id) parts.push(`'${folder_id}' in parents`);
    if (mime_type) parts.push(`mimeType = '${mime_type}'`);
    parts.push('trashed = false');

    const q = encodeURIComponent(parts.join(' and '));
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,webViewLink,parents)');
    const data = await driveRequest(`/files?q=${q}&pageSize=${Math.min(limit, 100)}&fields=${fields}&orderBy=modifiedTime desc`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'gdrive_get_file',
  'Get metadata of a specific file by ID.',
  {
    file_id: z.string().describe('Google Drive file ID'),
  },
  async ({ file_id }) => {
    const fields = encodeURIComponent('id,name,mimeType,modifiedTime,size,webViewLink,parents,description,createdTime');
    const data = await driveRequest(`/files/${file_id}?fields=${fields}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'gdrive_read_text',
  'Read text content of a Google Docs document or export a Google Slides/Sheets as plain text.',
  {
    file_id: z.string().describe('Google Drive file ID'),
    format: z.enum(['text', 'html', 'csv']).optional().describe('Export format (default: text)'),
  },
  async ({ file_id, format = 'text' }) => {
    const token = await getAccessToken();
    const mimeMap: Record<string, string> = {
      text: 'text/plain',
      html: 'text/html',
      csv: 'text/csv',
    };
    const exportMime = mimeMap[format] ?? 'text/plain';
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file_id}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive export error ${res.status}: ${text}`);
    }

    const content = await res.text();
    return { content: [{ type: 'text' as const, text: content }] };
  }
);

server.tool(
  'gdrive_list_folders',
  'List folders in Google Drive. Useful for navigating the folder structure.',
  {
    parent_id: z.string().optional().describe('Parent folder ID. Omit for root.'),
  },
  async ({ parent_id }) => {
    const parts = ["mimeType = 'application/vnd.google-apps.folder'", 'trashed = false'];
    if (parent_id) parts.push(`'${parent_id}' in parents`);

    const q = encodeURIComponent(parts.join(' and '));
    const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
    const data = await driveRequest(`/files?q=${q}&pageSize=50&fields=${fields}&orderBy=name`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
