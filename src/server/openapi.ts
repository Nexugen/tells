// The OpenAPI 3.1 description of the public API at /openapi.json, for custom GPT actions and API clients,
// and the web app manifest at /manifest.webmanifest.
import { SITE } from './page.ts';

const registerSchema = { type: 'string', enum: ['auto', 'casual', 'professional', 'technical', 'marketing'], default: 'auto', description: 'Kind of writing. auto guesses from the text.' };
const error = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function openApi(version: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'tells',
      version,
      description: 'Find the phrases that make writing read as AI-written, and fix only those sentences. Checking is free and needs no key. A flagged phrase is not proof that AI wrote a text.',
      license: { name: 'MIT', identifier: 'MIT' },
      contact: { name: 'Nexugen', url: 'https://nexugen.app' },
    },
    servers: [{ url: SITE }],
    paths: {
      '/v1/lint': {
        post: {
          operationId: 'checkText',
          summary: 'Check text for AI tells',
          description: 'Returns each flagged phrase with character offsets, its rule, why it stands out and what to write instead, plus the human signals present and missing.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'The text to check.' }, register: registerSchema } } } } },
          responses: { '200': { description: 'Check result', content: { 'application/json': { schema: { $ref: '#/components/schemas/LintResult' } } } }, '400': error, '413': error, '429': error },
        },
      },
      '/v1/rewrite': {
        post: {
          operationId: 'fixText',
          summary: 'Fix only the flagged sentences',
          description: 'Rewrites only the flagged sentences, keeping every fact. A few free tries a day per address; more with a free key. With a voice profile, rewrites the draft in that style.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, register: registerSchema, voice: { type: 'object', description: 'Profile from buildVoice.' }, polish: { type: 'boolean' } } } } } },
          responses: { '200': { description: 'Rewrite result', content: { 'application/json': { schema: { $ref: '#/components/schemas/RewriteResult' } } } }, '400': error, '401': error, '429': error, '502': error, '503': error },
        },
      },
      '/v1/voice': {
        post: {
          operationId: 'buildVoice',
          summary: 'Learn a writing style from samples',
          description: 'At least 5 samples and 600 words. Nothing is stored. Returns a profile to pass to fixText as voice.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['samples'], properties: { samples: { type: 'array', items: { type: 'string' } }, name: { type: 'string' } } } } } },
          responses: { '200': { description: 'Voice profile', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, '400': error, '413': error },
        },
      },
      '/v1/keys': {
        post: {
          operationId: 'getFreeKey',
          summary: 'Get a free key for more rewrites a day',
          responses: { '200': { description: 'Key', content: { 'application/json': { schema: { type: 'object', properties: { key: { type: 'string' }, dailyRewrites: { type: 'integer' }, note: { type: 'string' } } } } } }, '429': error },
        },
      },
      '/v1/rules': {
        get: {
          operationId: 'listRules',
          summary: 'Every rule tells checks',
          responses: { '200': { description: 'Rules', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } },
        },
      },
    },
    components: {
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
        Finding: {
          type: 'object',
          properties: {
            ruleId: { type: 'string' }, name: { type: 'string' }, severity: { type: 'string', enum: ['error', 'warning', 'info'] },
            start: { type: 'integer' }, end: { type: 'integer' }, line: { type: 'integer' }, column: { type: 'integer' },
            match: { type: 'string', description: 'The flagged phrase.' }, fix: { type: 'string', description: 'What to write instead.' },
          },
        },
        LintResult: {
          type: 'object',
          properties: {
            findings: { type: 'array', items: { $ref: '#/components/schemas/Finding' } },
            words: { type: 'integer' }, score: { type: 'number' }, grade: { type: 'string' }, register: { type: 'string' },
            human: { type: 'object', additionalProperties: true, description: 'Human signals present and missing, and the human-pattern score.' },
          },
        },
        RewriteResult: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            changes: { type: 'array', items: { type: 'object', properties: { before: { type: 'string' }, after: { type: 'string' } } } },
            suggestions: { type: 'array', items: { type: 'object', properties: { placeholder: { type: 'string' }, sentence: { type: 'string' } } } },
          },
        },
      },
      securitySchemes: { freeKey: { type: 'http', scheme: 'bearer', description: 'Optional free key from POST /v1/keys.' } },
    },
  };
}

export function webManifest() {
  return {
    name: 'tells: does it sound like AI?',
    short_name: 'tells',
    description: 'Paste or share any text and see which phrases make it read like a chatbot wrote it.',
    id: '/',
    start_url: '/?source=app',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfaf7',
    theme_color: '#fbfaf7',
    categories: ['productivity', 'utilities', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'application/x-www-form-urlencoded',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  };
}
