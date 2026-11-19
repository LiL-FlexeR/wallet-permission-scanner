import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type {
  ScanRequest,
  ScanSuccess,
  CoverageResponse,
} from '@wps/contracts';
import type { Request, Response } from 'express';
import { ScanRequestPipe } from '../common/http/scan-request.pipe.js';
import { ScansService } from './scans.service.js';

@Controller('api/v1')
export class ScansController {
  constructor(@Inject(ScansService) private readonly scans: ScansService) {}
  @Get('coverage')
  coverage(): CoverageResponse {
    return this.scans.coverage();
  }
  @Post('scans')
  @HttpCode(200)
  async scan(
    @Body(ScanRequestPipe) input: ScanRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ScanSuccess> {
    const controller = new AbortController();
    const abort = () => {
      if (!response.writableEnded) controller.abort();
    };
    request.once('aborted', abort);
    response.once('close', abort);
    if (request.aborted || response.destroyed) controller.abort();
    try {
      return await this.scans.scan(
        input.address,
        String(response.getHeader('X-Request-Id')),
        controller.signal,
      );
    } finally {
      request.off('aborted', abort);
      response.off('close', abort);
    }
  }
}
