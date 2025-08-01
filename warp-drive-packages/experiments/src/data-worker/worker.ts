import type { Store } from '@warp-drive/core';
import type { Future } from '@warp-drive/core/request';
import type { ResponseInfo, StructuredDataDocument } from '@warp-drive/core/types/request';

import { DocumentStorage } from '../document-storage';
import type { AbortEventData, RequestEventData, ThreadInitEventData, WorkerThreadEvent } from './types';

const WorkerScope = (globalThis as unknown as { SharedWorkerGlobalScope: FunctionConstructor }).SharedWorkerGlobalScope;

export class DataWorker {
  declare store: Store;
  declare threads: Map<string, MessagePort>;
  declare pending: Map<string, Map<number, Future<unknown>>>;
  declare isSharedWorker: boolean;
  declare options: { persisted: boolean; scope?: string };
  declare storage: DocumentStorage;

  constructor(UserStore: typeof Store, options?: { persisted: boolean; scope?: string }) {
    // disable if running on main thread
    if (typeof window !== 'undefined') {
      return;
    }
    this.store = new UserStore();
    this.threads = new Map();
    this.pending = new Map();
    this.options = Object.assign({ persisted: false, scope: '' }, options);
    this.isSharedWorker = WorkerScope && globalThis instanceof WorkerScope;
    this.initialize();
  }

  initialize(): void {
    // enable the CacheHandler to access the worker
    (this.store as unknown as { _worker: DataWorker })._worker = this;
    if (this.options.persisted) {
      // will be accessed by the worker's CacheHandler off of store
      this.storage = new DocumentStorage({ scope: this.options.scope });
    }
    if (this.isSharedWorker) {
      (globalThis as unknown as { onconnect: typeof globalThis.onmessage }).onconnect = (e) => {
        const port = e.ports[0];
        port.onmessage = (event: MessageEvent<ThreadInitEventData>) => {
          const { type } = event.data;

          switch (type) {
            case 'connect':
              this.setupThread(event.data.thread, port);
              break;
          }
        };
        port.start();
      };
    } else {
      globalThis.onmessage = (event: MessageEvent<ThreadInitEventData>) => {
        const { type } = event.data;

        switch (type) {
          case 'connect':
            this.setupThread(event.data.thread, event.ports[0]);
            break;
        }
      };
    }
  }

  setupThread(thread: string, port: MessagePort): void {
    this.threads.set(thread, port);
    this.pending.set(thread, new Map());
    port.onmessage = (event: WorkerThreadEvent) => {
      if (event.type === 'close') {
        this.threads.delete(thread);
        return;
      }

      const { type } = event.data;
      switch (type) {
        case 'abort':
          this.abortRequest(event.data);
          break;
        case 'request':
          void this.request(prepareRequest(event.data));
          break;
      }
    };
  }

  abortRequest(event: AbortEventData): void {
    const { thread, id } = event;
    const future = this.pending.get(thread)!.get(id);

    if (future) {
      future.abort();
      this.pending.get(thread)!.delete(id);
    }
  }

  async request(event: RequestEventData): Promise<void> {
    const { thread, id, data } = event;

    try {
      const future = this.store.request(data);
      this.pending.get(thread)!.set(id, future);

      const result = await future;

      this.threads.get(thread)?.postMessage({ type: 'success-response', id, thread, data: prepareResponse(result) });
    } catch (error) {
      if (isAbortError(error)) return;

      this.threads.get(thread)?.postMessage({ type: 'error-response', id, thread, data: error });
    } finally {
      this.pending.get(thread)!.delete(id);
    }
  }
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function softCloneResponse(response: Response | ResponseInfo | null) {
  if (!response) return null;

  const clone: Partial<Mutable<Response>> = {};

  if (response.headers) {
    clone.headers = Array.from(response.headers as unknown as Iterable<[string, string][]>) as unknown as Headers;
  }

  clone.ok = response.ok;
  clone.redirected = response.redirected;
  clone.status = response.status;
  clone.statusText = response.statusText;
  clone.type = response.type;
  clone.url = response.url;

  return clone;
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

function prepareResponse<T>(result: StructuredDataDocument<T>) {
  const newResponse = {
    response: softCloneResponse(result.response),
    content: result.content,
  };

  return newResponse;
}

function prepareRequest(event: RequestEventData) {
  if (event.data.headers) {
    event.data.headers = new Headers(event.data.headers);
  }

  return event;
}
