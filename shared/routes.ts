import { z } from 'zod';
import { metrics } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  metrics: {
    list: {
      method: 'GET' as const,
      path: '/api/metrics' as const,
      responses: {
        200: z.array(z.custom<typeof metrics.$inferSelect>()),
      },
    },
    latest: {
      method: 'GET' as const,
      path: '/api/metrics/latest' as const,
      responses: {
        200: z.custom<typeof metrics.$inferSelect>().nullable(),
      },
    },
  },
  brief: {
    latest: {
      method: 'GET' as const,
      path: '/api/brief' as const,
      responses: {
        200: z.object({
          brief: z.string(),
          generatedAt: z.string(),
        }),
      },
    },
  },
  analyze: {
    method: 'POST' as const,
    path: '/api/analyze' as const,
  },
  treasury: {
    stats: {
      method: 'GET' as const,
      path: '/api/treasury/stats' as const,
    },
    buybacks: {
      list: {
        method: 'GET' as const,
        path: '/api/treasury/buybacks' as const,
      },
      create: {
        method: 'POST' as const,
        path: '/api/treasury/buybacks' as const,
      },
      updateStatus: {
        method: 'PATCH' as const,
        path: '/api/treasury/buybacks/:id/status' as const,
      },
    },
    burns: {
      list: {
        method: 'GET' as const,
        path: '/api/treasury/burns' as const,
      },
      create: {
        method: 'POST' as const,
        path: '/api/treasury/burns' as const,
      },
      updateStatus: {
        method: 'PATCH' as const,
        path: '/api/treasury/burns/:id/status' as const,
      },
    },
    campaigns: {
      list: {
        method: 'GET' as const,
        path: '/api/treasury/campaigns' as const,
      },
      create: {
        method: 'POST' as const,
        path: '/api/treasury/campaigns' as const,
      },
      toggle: {
        method: 'PATCH' as const,
        path: '/api/treasury/campaigns/:id/toggle' as const,
      },
    },
    claims: {
      list: {
        method: 'GET' as const,
        path: '/api/treasury/campaigns/:id/claims' as const,
      },
      create: {
        method: 'POST' as const,
        path: '/api/treasury/campaigns/:id/claims' as const,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
