import type { Page } from 'playwright';

export type Handler = (payload: any) => Promise<any>;
export type Broadcaster = (msg: any) => void;
export type Dispatcher = (type: string, payload: any) => Promise<any>;

export interface HandlerContext {
  broadcast: Broadcaster;
  dispatch?: Dispatcher;
  p: () => Promise<Page>;
}
