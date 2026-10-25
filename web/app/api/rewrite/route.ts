import { handleRewrite } from '../../../lib/model-handler.mjs';

export const POST = (request: Request) => handleRewrite(request);
