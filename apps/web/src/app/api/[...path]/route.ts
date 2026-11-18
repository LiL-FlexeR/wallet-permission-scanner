import 'server-only';
import { proxyApiRequest } from '../../../server/api-proxy';
import { getWebEnvironment } from '../../../server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handle(request: Request): Promise<Response> {
  return proxyApiRequest(request, getWebEnvironment().API_PROXY_TARGET);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
  handle as HEAD,
};
