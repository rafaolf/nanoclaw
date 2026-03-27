/**
 * HubSpot MCP Server for NanoClaw
 * Provides HubSpot CRM API access to the container agent.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { errorResult } from './mcp-utils.js';

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
if (!HUBSPOT_TOKEN) {
  console.error('HUBSPOT_ACCESS_TOKEN not set — HubSpot MCP server cannot start.');
  process.exit(1);
}

async function hubspotRequest(path: string, method = 'GET', body?: object): Promise<unknown> {
  const url = `https://api.hubapi.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }

  return res.json();
}

const server = new McpServer({ name: 'hubspot', version: '1.0.0' });

server.tool(
  'hubspot_search_contacts',
  'Search HubSpot contacts by name, email, or other properties.',
  {
    query: z.string().describe('Search term (name, email, company, etc.)'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ query, limit = 10 }) => {
    try {
      const data = await hubspotRequest('/crm/v3/objects/contacts/search', 'POST', {
        filterGroups: [
          {
            filters: [
              { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: `*${query}*` },
            ],
          },
          {
            filters: [
              { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: `*${query}*` },
            ],
          },
          {
            filters: [
              { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: `*${query}*` },
            ],
          },
        ],
        properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'lifecyclestage', 'hs_lead_status'],
        limit: Math.min(limit, 50),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_search_deals',
  'Search HubSpot deals by name or properties. Use this for pipeline queries.',
  {
    query: z.string().optional().describe('Search term for deal name. Omit to list all deals.'),
    stage: z.string().optional().describe('Filter by deal stage ID'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ query, stage, limit = 20 }) => {
    try {
      const filters: object[] = [];
      if (query) {
        filters.push({ propertyName: 'dealname', operator: 'CONTAINS_TOKEN', value: `*${query}*` });
      }
      if (stage) {
        filters.push({ propertyName: 'dealstage', operator: 'EQ', value: stage });
      }

      const body: Record<string, unknown> = {
        properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 'hubspot_owner_id', 'hs_lastmodifieddate'],
        limit: Math.min(limit, 50),
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      };
      if (filters.length > 0) {
        body.filterGroups = [{ filters }];
      }

      const data = await hubspotRequest('/crm/v3/objects/deals/search', 'POST', body);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_deal',
  'Get full details of a specific HubSpot deal by ID.',
  {
    deal_id: z.string().describe('HubSpot deal ID'),
  },
  async ({ deal_id }) => {
    try {
      const data = await hubspotRequest(
        `/crm/v3/objects/deals/${encodeURIComponent(deal_id)}?properties=dealname,dealstage,amount,closedate,pipeline,hubspot_owner_id,description,notes_last_updated`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_search_companies',
  'Search HubSpot companies by name or domain.',
  {
    query: z.string().describe('Company name or domain to search'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ query, limit = 10 }) => {
    try {
      const data = await hubspotRequest('/crm/v3/objects/companies/search', 'POST', {
        filterGroups: [
          {
            filters: [
              { propertyName: 'name', operator: 'CONTAINS_TOKEN', value: `*${query}*` },
            ],
          },
          {
            filters: [
              { propertyName: 'domain', operator: 'CONTAINS_TOKEN', value: `*${query}*` },
            ],
          },
        ],
        properties: ['name', 'domain', 'industry', 'phone', 'city', 'state', 'country', 'numberofemployees', 'annualrevenue'],
        limit: Math.min(limit, 50),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_pipeline_stages',
  'List all deal pipelines and their stages. Useful for mapping stage IDs to human-readable names.',
  {},
  async () => {
    try {
      const data = await hubspotRequest('/crm/v3/pipelines/deals');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_create_contact',
  'Create a new contact in HubSpot.',
  {
    email: z.string().describe('Contact email'),
    firstname: z.string().optional().describe('First name'),
    lastname: z.string().optional().describe('Last name'),
    phone: z.string().optional().describe('Phone number'),
    company: z.string().optional().describe('Company name'),
  },
  async ({ email, firstname, lastname, phone, company }) => {
    try {
      const properties: Record<string, string> = { email };
      if (firstname) properties.firstname = firstname;
      if (lastname) properties.lastname = lastname;
      if (phone) properties.phone = phone;
      if (company) properties.company = company;
      const data = await hubspotRequest('/crm/v3/objects/contacts', 'POST', { properties });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_create_deal',
  'Create a new deal in HubSpot.',
  {
    dealname: z.string().describe('Deal name'),
    pipeline: z.string().optional().describe('Pipeline ID (omit for default)'),
    dealstage: z.string().optional().describe('Stage ID'),
    amount: z.string().optional().describe('Deal amount'),
    closedate: z.string().optional().describe('Expected close date (YYYY-MM-DD)'),
  },
  async ({ dealname, pipeline, dealstage, amount, closedate }) => {
    try {
      const properties: Record<string, string> = { dealname };
      if (pipeline) properties.pipeline = pipeline;
      if (dealstage) properties.dealstage = dealstage;
      if (amount) properties.amount = amount;
      if (closedate) properties.closedate = closedate;
      const data = await hubspotRequest('/crm/v3/objects/deals', 'POST', { properties });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_update_deal',
  'Update properties of an existing deal.',
  {
    deal_id: z.string().describe('Deal ID'),
    dealname: z.string().optional().describe('New deal name'),
    dealstage: z.string().optional().describe('New stage ID'),
    amount: z.string().optional().describe('New amount'),
    closedate: z.string().optional().describe('New close date (YYYY-MM-DD)'),
  },
  async ({ deal_id, dealname, dealstage, amount, closedate }) => {
    try {
      const properties: Record<string, string> = {};
      if (dealname) properties.dealname = dealname;
      if (dealstage) properties.dealstage = dealstage;
      if (amount) properties.amount = amount;
      if (closedate) properties.closedate = closedate;
      await hubspotRequest(`/crm/v3/objects/deals/${encodeURIComponent(deal_id)}`, 'PATCH', { properties });
      return { content: [{ type: 'text' as const, text: `Deal ${deal_id} updated.` }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_owners',
  'List HubSpot owners (sales reps). Useful for mapping owner IDs to names.',
  {},
  async () => {
    try {
      const data = await hubspotRequest('/crm/v3/owners');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_contact',
  'Get full details of a specific HubSpot contact by ID.',
  {
    contact_id: z.string().describe('HubSpot contact ID'),
  },
  async ({ contact_id }) => {
    try {
      const data = await hubspotRequest(
        `/crm/v3/objects/contacts/${encodeURIComponent(contact_id)}?properties=firstname,lastname,email,phone,company,jobtitle,lifecyclestage,hs_lead_status,city,state,country,notes_last_updated`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_update_contact',
  'Update properties of an existing HubSpot contact.',
  {
    contact_id: z.string().describe('Contact ID'),
    email: z.string().optional().describe('New email'),
    firstname: z.string().optional().describe('New first name'),
    lastname: z.string().optional().describe('New last name'),
    phone: z.string().optional().describe('New phone'),
    company: z.string().optional().describe('New company name'),
    jobtitle: z.string().optional().describe('Job title'),
    lifecyclestage: z.string().optional().describe('Lifecycle stage (subscriber, lead, opportunity, customer, etc.)'),
  },
  async ({ contact_id, ...props }) => {
    try {
      const properties: Record<string, string> = {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== undefined) properties[k] = v;
      }
      await hubspotRequest(`/crm/v3/objects/contacts/${encodeURIComponent(contact_id)}`, 'PATCH', { properties });
      return { content: [{ type: 'text' as const, text: `Contact ${contact_id} updated.` }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_notes',
  'Get notes (engagements) associated with a CRM object. Use to review activity history.',
  {
    object_type: z.enum(['contacts', 'deals', 'companies']).describe('Object type'),
    object_id: z.string().describe('Object ID'),
    limit: z.number().optional().describe('Max results (default 10)'),
  },
  async ({ object_type, object_id, limit = 10 }) => {
    try {
      const data = await hubspotRequest(
        `/crm/v3/objects/${object_type}/${encodeURIComponent(object_id)}/associations/notes?limit=${Math.min(limit, 50)}`
      );
      const noteIds = ((data as { results: { id: string }[] }).results ?? []).map(r => r.id);
      if (noteIds.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No notes found.' }] };
      }
      const notes = await hubspotRequest('/crm/v3/objects/notes/batch/read', 'POST', {
        inputs: noteIds.map(id => ({ id })),
        properties: ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id'],
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_add_note',
  'Add a note to a contact, deal, or company. Use for logging calls, meetings, or observations.',
  {
    object_type: z.enum(['contacts', 'deals', 'companies']).describe('Object type to attach note to'),
    object_id: z.string().describe('Object ID'),
    body: z.string().describe('Note content (HTML supported)'),
  },
  async ({ object_type, object_id, body }) => {
    try {
      const singularType: Record<string, string> = { contacts: 'contact', deals: 'deal', companies: 'company' };
      const data = await hubspotRequest('/crm/v3/objects/notes', 'POST', {
        properties: {
          hs_note_body: body,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [{
          to: { id: object_id },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: singularType[object_type] === 'contact' ? 202
              : singularType[object_type] === 'deal' ? 214
              : 190,
          }],
        }],
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'hubspot_get_associations',
  'Get objects associated with a given CRM record (e.g. contacts linked to a deal).',
  {
    object_type: z.enum(['contacts', 'deals', 'companies']).describe('Source object type'),
    object_id: z.string().describe('Source object ID'),
    to_object_type: z.enum(['contacts', 'deals', 'companies']).describe('Target object type'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ object_type, object_id, to_object_type, limit = 20 }) => {
    try {
      const data = await hubspotRequest(
        `/crm/v3/objects/${object_type}/${encodeURIComponent(object_id)}/associations/${to_object_type}?limit=${Math.min(limit, 50)}`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
