import type { App } from '../types.js';

export async function registerRequestId(app: App): Promise<void> {
  // genReqId is set in buildApp; this plugin only enriches the log context.
  app.addHook('onRequest', async (req) => {
    req.log = req.log.child({ requestId: req.id });
  });
}
