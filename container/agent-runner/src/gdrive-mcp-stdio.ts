/**
 * Google Drive MCP Server for NanoClaw
 * Provides Google Drive API access via Service Account.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createSign } from 'crypto';
import fs from 'fs';
import { errorResult } from './mcp-utils.js';

const SA_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_PATH ?? '/workspace/google-service-account.json';

if (!fs.existsSync(SA_PATH)) {
  console.error(`Service account file not found at ${SA_PATH} — Google Drive MCP server cannot start.`);
  process.exit(1);
}

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
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signingInput = `${header}.${claims}`;

  // Sign with Node's native crypto — no shell commands needed
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
    try {
      const parts: string[] = [];
      if (query) parts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
      if (folder_id) parts.push(`'${folder_id.replace(/'/g, "\\'")}' in parents`);
      if (mime_type) parts.push(`mimeType = '${mime_type.replace(/'/g, "\\'")}'`);
      parts.push('trashed = false');

      const q = encodeURIComponent(parts.join(' and '));
      const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,size,webViewLink,parents)');
      const data = await driveRequest(`/files?q=${q}&pageSize=${Math.min(limit, 100)}&fields=${fields}&orderBy=modifiedTime desc`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'gdrive_get_file',
  'Get metadata of a specific file by ID.',
  {
    file_id: z.string().describe('Google Drive file ID'),
  },
  async ({ file_id }) => {
    try {
      const fields = encodeURIComponent('id,name,mimeType,modifiedTime,size,webViewLink,parents,description,createdTime');
      const data = await driveRequest(`/files/${encodeURIComponent(file_id)}?fields=${fields}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
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
    try {
      const token = await getAccessToken();
      const mimeMap: Record<string, string> = {
        text: 'text/plain',
        html: 'text/html',
        csv: 'text/csv',
      };
      const exportMime = mimeMap[format] ?? 'text/plain';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file_id)}/export?mimeType=${encodeURIComponent(exportMime)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Drive export error ${res.status}: ${text}`);
      }

      const content = await res.text();
      return { content: [{ type: 'text' as const, text: content }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'gdrive_list_folders',
  'List folders in Google Drive. Useful for navigating the folder structure.',
  {
    parent_id: z.string().optional().describe('Parent folder ID. Omit for root.'),
  },
  async ({ parent_id }) => {
    try {
      const parts = ["mimeType = 'application/vnd.google-apps.folder'", 'trashed = false'];
      if (parent_id) parts.push(`'${parent_id.replace(/'/g, "\\'")}' in parents`);

      const q = encodeURIComponent(parts.join(' and '));
      const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
      const data = await driveRequest(`/files?q=${q}&pageSize=50&fields=${fields}&orderBy=name`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'gdrive_create_file',
  'Create a new file in Google Drive. Set convert_to_doc=true to create a Google Doc (editable in Docs).',
  {
    name: z.string().describe('File name'),
    content: z.string().describe('File content (plain text)'),
    folder_id: z.string().optional().describe('Parent folder ID (optional)'),
    convert_to_doc: z.boolean().optional().describe('Convert to Google Docs format (default false)'),
  },
  async ({ name, content, folder_id, convert_to_doc = false }) => {
    try {
      const token = await getAccessToken();
      const metadata: Record<string, unknown> = {
        name,
        ...(folder_id && { parents: [folder_id] }),
        ...(convert_to_doc && { mimeType: 'application/vnd.google-apps.document' }),
      };
      const boundary = 'nanoclaw_gdrive_boundary';
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        '',
        content,
        `--${boundary}--`,
      ].join('\r\n');
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Drive create error ${res.status}: ${text}`);
      }
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  'gdrive_update_file',
  'Replace the content of an existing file in Google Drive (plain text files).',
  {
    file_id: z.string().describe('Google Drive file ID'),
    content: z.string().describe('New content (replaces existing)'),
  },
  async ({ file_id, content }) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file_id)}?uploadType=media&fields=id,name,modifiedTime`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/plain; charset=UTF-8',
          },
          body: content,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Drive update error ${res.status}: ${text}`);
      }
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  'gdrive_append_to_doc',
  'Append text to the end of a Google Doc.',
  {
    doc_id: z.string().describe('Google Doc file ID'),
    text: z.string().describe('Text to append'),
  },
  async ({ doc_id, text }) => {
    try {
      const token = await getAccessToken();
      // Fetch the document to find its end index
      const docRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(doc_id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!docRes.ok) {
        const t = await docRes.text();
        throw new Error(`Docs API error ${docRes.status}: ${t}`);
      }
      const doc = (await docRes.json()) as {
        body: { content: Array<{ endIndex?: number }> };
      };
      // Insert before the terminal newline (endIndex - 1 of the last content element)
      const bodyContent = doc.body.content;
      const lastEndIndex = bodyContent[bodyContent.length - 1]?.endIndex ?? 1;
      const insertAt = Math.max(1, lastEndIndex - 1);
      const batchRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(doc_id)}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: insertAt }, text } }],
          }),
        },
      );
      if (!batchRes.ok) {
        const t = await batchRes.text();
        throw new Error(`Docs batchUpdate error ${batchRes.status}: ${t}`);
      }
      return {
        content: [{ type: 'text' as const, text: `Appended ${text.length} characters to document.` }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
