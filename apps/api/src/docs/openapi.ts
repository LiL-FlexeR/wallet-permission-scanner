import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import {
  amountSchema,
  coverageResponseSchema,
  errorEnvelopeSchema,
  fieldWarningSchema,
  livenessSchema,
  permissionRecordSchema,
  readinessSchema,
  riskSignalSchema,
  scanRequestSchema,
  scanSuccessSchema,
} from '@wps/contracts';
import type { ErrorCode } from '@wps/contracts';
import {
  completeScanFixture,
  coverageFixture,
  partialScanFixture,
} from '@wps/contracts/fixtures';
import {
  errorDefinitions,
  errorPayload,
  sendError,
} from '../common/http/errors.js';

/** Zod 4 native JSON Schema -> OpenAPI 3.1. No duplicated DTO schemas.
 * Cross-field refinements remain enforced by the shared runtime schemas. */
export function generateOpenApi() {
  const schemas = {
    ScanRequest: z.toJSONSchema(scanRequestSchema, {
      io: 'input',
      target: 'draft-2020-12',
    }),
    ScanSuccess: z.toJSONSchema(scanSuccessSchema),
    Coverage: z.toJSONSchema(coverageResponseSchema),
    PermissionRecord: z.toJSONSchema(permissionRecordSchema),
    Amount: z.toJSONSchema(amountSchema),
    RiskSignal: z.toJSONSchema(riskSignalSchema),
    FieldWarning: z.toJSONSchema(fieldWarningSchema),
    Error: z.toJSONSchema(errorEnvelopeSchema),
    Liveness: z.toJSONSchema(livenessSchema),
    Readiness: z.toJSONSchema(readinessSchema),
  };
  const ref = (name: keyof typeof schemas) => ({
    $ref: `#/components/schemas/${name}`,
  });
  const headers = {
    'X-Request-Id': {
      description: 'Server generated UUID.',
      schema: { type: 'string', format: 'uuid' },
    },
    'Cache-Control': {
      description: 'Responses are never cached.',
      schema: { const: 'no-store' },
    },
  };
  const errors = (codes: ErrorCode[]) =>
    Object.fromEntries(
      [...new Set(codes.map((code) => errorDefinitions[code].status))].map(
        (status) => [
          status,
          {
            description: codes
              .filter((code) => errorDefinitions[code].status === status)
              .join(', '),
            headers: {
              ...headers,
              ...([429, 503].includes(status)
                ? {
                    'Retry-After': {
                      description:
                        'Integer seconds; caller quota reset for 429, 1 for busy capacity.',
                      schema: { type: 'integer', minimum: 1 },
                    },
                  }
                : {}),
            },
            content: {
              'application/json': {
                schema: ref('Error'),
                examples: Object.fromEntries(
                  codes
                    .filter((code) => errorDefinitions[code].status === status)
                    .map((code) => [
                      code,
                      {
                        value: errorPayload(
                          code,
                          completeScanFixture.requestId,
                        ),
                      },
                    ]),
                ),
              },
            },
          },
        ],
      ),
    );
  return {
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'Wallet Permission Scanner',
      version: 'mvp-1',
      description:
        'Read-only Ethereum mainnet configured-pair scans. Labels describe permission exposure, not contract safety. No completed-result cache or persistent history. Cross-field counts, exact formatting, checksums, warning links and risk invariants are enforced by @wps/contracts in addition to JSON Schema.',
    },
    servers: [{ url: '/' }],
    components: { schemas },
    paths: {
      '/api/v1/scans': {
        post: {
          operationId: 'scan',
          summary: 'Inspect configured permissions at one finalized snapshot',
          description:
            'No query parameters. Only address is accepted, trimmed and checksum-validated; zero is rejected. Maximum JSON body: 1024 bytes. 10 requests/minute/client IP, including malformed attempts. Four concurrent scans/process, no queue; 15-second admission deadline. source=demo is synthetic and never a fallback. At least one readable allowance is required for success. Missing fields remain null with ordered warnings. Exact uint256 and formatted strings use no floating point.',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: ref('ScanRequest'),
                example: { address: completeScanFixture.walletAddress },
              },
            },
          },
          responses: {
            200: {
              description: 'Complete or partial configured-pair scan.',
              headers,
              content: {
                'application/json': {
                  schema: ref('ScanSuccess'),
                  examples: {
                    complete: { value: completeScanFixture },
                    partial: { value: partialScanFixture },
                  },
                },
              },
            },
            ...errors([
              'INVALID_REQUEST',
              'INVALID_ADDRESS',
              'METHOD_NOT_ALLOWED',
              'PAYLOAD_TOO_LARGE',
              'UNSUPPORTED_MEDIA_TYPE',
              'RATE_LIMITED',
              'SCAN_CAPACITY_EXCEEDED',
              'CHAIN_MISMATCH',
              'SNAPSHOT_UNAVAILABLE',
              'RPC_UNAVAILABLE',
              'SERVICE_NOT_READY',
              'SCAN_TIMEOUT',
              'INTERNAL_ERROR',
            ]),
          },
        },
      },
      '/api/v1/coverage': {
        get: {
          operationId: 'coverage',
          summary: 'Publish the configured pair set without RPC reads',
          description:
            'No query or body. 60 requests/minute/client IP. Embedded scan registryVersion remains authoritative after a registry change.',
          parameters: [],
          responses: {
            200: {
              description: 'Bounded explicit pair registry.',
              headers,
              content: {
                'application/json': {
                  schema: ref('Coverage'),
                  example: coverageFixture,
                },
              },
            },
            ...errors([
              'INVALID_REQUEST',
              'METHOD_NOT_ALLOWED',
              'PAYLOAD_TOO_LARGE',
              'UNSUPPORTED_MEDIA_TYPE',
              'RATE_LIMITED',
              'SCAN_CAPACITY_EXCEEDED',
              'SERVICE_NOT_READY',
              'INTERNAL_ERROR',
            ]),
          },
        },
      },
      '/health/live': {
        get: {
          operationId: 'liveness',
          responses: {
            200: {
              description: 'Process responds.',
              headers,
              content: { 'application/json': { schema: ref('Liveness') } },
            },
            ...errors([
              'INVALID_REQUEST',
              'METHOD_NOT_ALLOWED',
              'PAYLOAD_TOO_LARGE',
              'UNSUPPORTED_MEDIA_TYPE',
              'INTERNAL_ERROR',
            ]),
          },
        },
      },
      '/health/ready': {
        get: {
          operationId: 'readiness',
          responses: {
            200: {
              description: 'Ready.',
              headers,
              content: { 'application/json': { schema: ref('Readiness') } },
            },
            503: {
              description: 'Not ready; cached status, no request-time RPC.',
              headers,
              content: { 'application/json': { schema: ref('Readiness') } },
            },
            ...errors([
              'INVALID_REQUEST',
              'METHOD_NOT_ALLOWED',
              'PAYLOAD_TOO_LARGE',
              'UNSUPPORTED_MEDIA_TYPE',
              'INTERNAL_ERROR',
            ]),
          },
        },
      },
    },
  };
}

export function installApiDocs(app: NestExpressApplication): void {
  const document = generateOpenApi();
  const server = app.getHttpAdapter().getInstance();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      /^\/api\/(openapi\.json|docs(?:\/.*)?)$/i.test(req.path) &&
      req.method !== 'GET'
    ) {
      res.setHeader('Allow', 'GET');
      sendError(res, 405);
      return;
    }
    next();
  });
  server.get('/api/openapi.json', (_req: Request, res: Response) =>
    res.json(document),
  );
  server.get(
    '/api/docs',
    swaggerUi.setup(document, {
      swaggerOptions: { validatorUrl: null, persistAuthorization: false },
      customSiteTitle: 'Wallet Permission Scanner API',
    }),
  );
  app.use('/api/docs', swaggerUi.serve);
}
