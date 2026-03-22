/**
 * Jira MCP Server for NanoClaw
 * Provides Jira Cloud REST API access to the container agent.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const JIRA_URL = process.env.JIRA_URL ?? '';
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? '';


const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

async function jiraRequest(path: string, method = 'GET', body?: object): Promise<unknown> {
  const url = `${JIRA_URL}/rest/api/3${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }

  return res.json();
}

const server = new McpServer({ name: 'jira', version: '1.0.0' });

server.tool(
  'jira_search',
  'Search Jira issues using JQL. Returns summary, status, assignee, priority, due date. Tip: use "sprint in openSprints()" for active sprint issues.',
  {
    jql: z.string().describe('JQL query, e.g. "project = PM AND status != Done ORDER BY updated DESC"'),
    max_results: z.number().optional().describe('Max results (default 20, max 50)'),
    fields: z.array(z.string()).optional().describe('Fields to include. Defaults to summary, status, assignee, priority, updated, duedate, issuetype'),
  },
  async ({ jql, max_results = 20, fields }) => {
    const defaultFields = ['summary', 'status', 'assignee', 'priority', 'updated', 'duedate', 'issuetype', 'project'];
    const requestedFields = fields ?? defaultFields;
    const data = await jiraRequest(
      `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(max_results, 50)}&fields=${requestedFields.join(',')}`
    );
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'jira_get_issue',
  'Get full details of a specific Jira issue by key (e.g. PM-42).',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
  },
  async ({ issue_key }) => {
    const data = await jiraRequest(`/issue/${issue_key}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'jira_list_projects',
  'List all Jira projects accessible to the authenticated user.',
  {},
  async () => {
    const data = await jiraRequest('/project');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'jira_create_issue',
  'Create a new Jira issue.',
  {
    project_key: z.string().describe('Project key, e.g. "PM"'),
    summary: z.string().describe('Issue summary/title'),
    issue_type: z.string().describe('Issue type: Task, Bug, Story, Epic, etc.').default('Task'),
    description: z.string().optional().describe('Issue description (plain text)'),
    assignee_account_id: z.string().optional().describe('Assignee Jira account ID'),
    priority: z.string().optional().describe('Priority: Highest, High, Medium, Low, Lowest'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    parent_key: z.string().optional().describe('Parent issue key for subtasks'),
  },
  async ({ project_key, summary, issue_type, description, assignee_account_id, priority, due_date, parent_key }) => {
    const fields: Record<string, unknown> = {
      project: { key: project_key },
      summary,
      issuetype: { name: issue_type },
      ...(description && {
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        },
      }),
      ...(assignee_account_id && { assignee: { accountId: assignee_account_id } }),
      ...(priority && { priority: { name: priority } }),
      ...(due_date && { duedate: due_date }),
      ...(parent_key && { parent: { key: parent_key } }),
    };
    const data = await jiraRequest('/issue', 'POST', { fields });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'jira_update_issue',
  'Update fields of an existing Jira issue.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    summary: z.string().optional().describe('New summary/title'),
    description: z.string().optional().describe('New description (plain text)'),
    assignee_account_id: z.string().optional().describe('New assignee account ID'),
    priority: z.string().optional().describe('New priority: Highest, High, Medium, Low, Lowest'),
    due_date: z.string().optional().describe('New due date in YYYY-MM-DD format'),
  },
  async ({ issue_key, summary, description, assignee_account_id, priority, due_date }) => {
    const fields: Record<string, unknown> = {};
    if (summary) fields.summary = summary;
    if (description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      };
    }
    if (assignee_account_id) fields.assignee = { accountId: assignee_account_id };
    if (priority) fields.priority = { name: priority };
    if (due_date) fields.duedate = due_date;
    await jiraRequest(`/issue/${issue_key}`, 'PUT', { fields });
    return { content: [{ type: 'text' as const, text: `Issue ${issue_key} updated successfully.` }] };
  }
);

server.tool(
  'jira_transition_issue',
  'Change the status of a Jira issue (e.g. "In Progress", "Done"). Lists available transitions if the given name is not found.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    transition_name: z.string().describe('Target status name, e.g. "In Progress", "Done", "To Do"'),
  },
  async ({ issue_key, transition_name }) => {
    const result = (await jiraRequest(`/issue/${issue_key}/transitions`)) as {
      transitions: { id: string; name: string }[];
    };
    const match = result.transitions.find((t) => t.name.toLowerCase() === transition_name.toLowerCase());
    if (!match) {
      const available = result.transitions.map((t) => t.name).join(', ');
      throw new Error(`Transition "${transition_name}" not found. Available: ${available}`);
    }
    await jiraRequest(`/issue/${issue_key}/transitions`, 'POST', { transition: { id: match.id } });
    return { content: [{ type: 'text' as const, text: `Issue ${issue_key} transitioned to "${match.name}".` }] };
  }
);

server.tool(
  'jira_add_comment',
  'Add a comment to a Jira issue.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    comment: z.string().describe('Comment text'),
  },
  async ({ issue_key, comment }) => {
    const data = await jiraRequest(`/issue/${issue_key}/comment`, 'POST', {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
      },
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
