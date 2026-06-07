import type { App } from '../types.js';
import { requestIdStore } from '../db/observe.js';

export async function registerRequestId(app: App): Promise<void> {
  // genReqId is set in buildApp; this plugin enriches the log context
  // AND seeds the requestIdStore AsyncLocalStorage so deep call stacks
  // (e.g. db/observe.ts) can read the current request's id.
  app.addHook('onRequest', async (req) => {
    req.log = req.log.child({ requestId: req.id });
    requestIdStore.enterWith(req.id);
  });
}
