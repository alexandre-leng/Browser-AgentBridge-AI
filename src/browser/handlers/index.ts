import type { Broadcaster, Dispatcher, Handler } from './types.js';
import { controller, sessionStore } from '../controller.js';
import { navigationHandlers } from './navigation.js';
import { domHandlers } from './dom.js';
import { agentHandlers } from './agent.js';
import { extractionHandlers } from './extraction.js';
import { formHandlers } from './forms.js';
import { webHandlers } from './web.js';
import { inputHandlers } from './input.js';
import { sessionHandlers } from './session.js';
import { specialHandlers } from './special.js';

async function p() {
  return controller.page(sessionStore.getStore());
}

export function buildHandlers(broadcast: Broadcaster, dispatch?: Dispatcher): Record<string, Handler> {
  const ctx = { broadcast, dispatch, p };
  
  return {
    ...navigationHandlers(ctx),
    ...domHandlers(ctx),
    ...agentHandlers(ctx),
    ...extractionHandlers(ctx),
    ...formHandlers(ctx),
    ...webHandlers(ctx),
    ...inputHandlers(ctx),
    ...sessionHandlers(ctx),
    ...specialHandlers(ctx),
  };
}
