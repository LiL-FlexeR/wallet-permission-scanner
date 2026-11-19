import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { scanRequestSchema } from '@wps/contracts';
import type { ScanRequest } from '@wps/contracts';
import { ApiError } from './errors.js';

@Injectable()
export class ScanRequestPipe implements PipeTransform<unknown, ScanRequest> {
  transform(raw: unknown): ScanRequest {
    let input: unknown;
    try {
      input = Buffer.isBuffer(raw)
        ? (JSON.parse(raw.toString('utf8')) as unknown)
        : undefined;
    } catch {
      throw new ApiError('INVALID_REQUEST');
    }
    const parsed = scanRequestSchema.safeParse(input);
    if (parsed.success) return parsed.data;
    const addressOnly =
      parsed.error.issues.every(
        (issue) => issue.path.length === 1 && issue.path[0] === 'address',
      ) &&
      typeof input === 'object' &&
      input !== null &&
      'address' in input &&
      typeof input.address === 'string';
    throw new ApiError(addressOnly ? 'INVALID_ADDRESS' : 'INVALID_REQUEST');
  }
}
