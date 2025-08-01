/* eslint-disable no-irregular-whitespace */

import type { Store } from '../../store/-private';
import type { RequestKey } from '../../types/identifier';
import type { IS_FUTURE, RequestContext, RequestInfo, ResponseInfo, StructuredDataDocument } from '../../types/request';
import type { RequestManager } from './manager';

export interface GodContext {
  controller: AbortController;
  response: ResponseInfo | null;
  stream: ReadableStream | Promise<ReadableStream | null> | null;
  hasRequestedStream: boolean;
  id: number;
  identifier: RequestKey | null;
  requester: RequestManager | Store;
}

export type Deferred<T> = {
  resolve(v: T): void;
  reject(v: unknown): void;
  promise: Promise<T>;
};

export type ManagedRequestPriority = { blocking: boolean };

export type DeferredStream = {
  resolve(v: ReadableStream | null): void;
  reject(v: unknown): void;
  promise: Promise<ReadableStream | null> & { sizeHint?: number };
};

/**
 * A Future is a {@link Promise} which resolves to a {@link StructuredDataDocument | StructuredDocument}
 * while providing the ability to {@link Future.abort | abort} the underlying request, and
 * {@link Future.getStream | access the response stream} before the outer promise resolves;
 *
 * @public
 */
export interface Future<T> extends Promise<StructuredDataDocument<T>> {
  /** @internal */
  [IS_FUTURE]: true;
  /**
   * Cancel this request by firing the {@link AbortController}'s signal.
   *
   * This method can be used as an action or event handler as its
   * context is bound to the Future instance.
   *
   * @privateRemarks
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortController/abort)
   *
   * @param reason optional reason for aborting the request
   * @public
   */
  abort(reason?: string): void;
  /**
   * Get the response stream, if any, once made available.
   *
   * This method can be used as an action or event handler as its
   * context is bound to the Future instance.
   *
   * @public
   */
  getStream(): Promise<ReadableStream | null>;

  /**
   *  Run a callback when this request completes. Use sparingly,
   *  mostly useful for instrumentation and infrastructure.
   *
   * @param cb the callback to run
   */
  onFinalize(cb: () => void): void;

  /**
   * The identifier of the associated request, if any, as
   * assigned by the CacheHandler.
   */
  lid: RequestKey | null;

  /**
   * The id of the associated request, if any, as assigned
   * by the RequestManager
   *
   * This is not unique across Manager instances and cannot
   * be used to identify or dedupe requests.
   */
  id: number;

  /**
   * The RequestManager or Store that initiated this request.
   *
   * @private
   */
  requester: RequestManager | Store;
}

export type DeferredFuture<T> = {
  resolve(v: StructuredDataDocument<T>): void;
  reject(v: unknown): void;
  promise: Future<T>;
};

export type NextFn<P = unknown> = (req: RequestInfo) => Future<P>;

/**
 * Requests are fulfilled by handlers. A handler receives the request context
as well as a `next` function with which to pass along a request to the next
handler if it so chooses.

A handler may be any object with a `request` method. This allows both stateful and non-stateful
handlers to be utilized.

If a handler calls `next`, it receives a `Future` which resolves to a `StructuredDocument`
that it can then compose how it sees fit with its own response.

```ts
type NextFn<P> = (req: RequestInfo) => Future<P>;

interface Handler {
  async request<T>(context: RequestContext, next: NextFn<P>): T;
}
```

`RequestContext` contains a readonly version of the RequestInfo as well as a few methods for building up the `StructuredDocument` and `Future` that will be part of the response.

```ts
interface RequestContext<T> {
  readonly request: RequestInfo;

  setStream(stream: ReadableStream | Promise<ReadableStream>): void;
  setResponse(response: Response | ResponseInfo): void;
}
```

A basic `fetch` handler with support for streaming content updates while
the download is still underway might look like the following, where we use
[`response.clone()`](https://developer.mozilla.org/en-US/docs/Web/API/Response/clone) to `tee` the `ReadableStream` into two streams.

A more efficient handler might read from the response stream, building up the
response content before passing along the chunk downstream.

```ts
const FetchHandler = {
  async request(context) {
    const response = await fetch(context.request);
    context.setResponse(reponse);
    context.setStream(response.clone().body);

    return response.json();
  }
}
```

### Stream Currying

`RequestManager.request` and `next` differ from `fetch` in one **crucial detail** in that the outer Promise resolves only once the response stream has been processed.

For context, it helps to understand a few of the use-cases that RequestManager
is intended to allow.

 - to manage and return streaming content (such as video files)
 - to fulfill a request from multiple sources or by splitting one request into multiple requests
   - for instance one API call for a user and another for the user's friends
   - or e.g. fulfilling part of the request from one source (one API, in-memory, localStorage, IndexedDB etc.) and the rest from another source (a different API, a WebWorker, etc.)
 - to coalesce multiple requests
 - to decorate a request with additional info
   - e.g. an Auth handler that ensures the correct tokens or headers or cookies are attached.

----

`await fetch(<req>)` resolves at the moment headers are received. This allows for the body of the request to be processed as a stream by application
code *while chunks are still being received by the browser*.

When an app chooses to `await response.json()` what occurs is the browser reads the stream to completion and then returns the result. Additionally, this stream may only be read **once**.

The `RequestManager` preserves this ability to subscribe to and utilize the stream by either the application or the handler – thereby delivering the full power and flexibility of native APIs – without restricting developers in ways that lead to complicated workarounds.

Each handler may call `setStream` only once, but may do so *at any time* until the promise that the handler returns has resolved. The associated promise returned by calling `future.getStream` will resolve with the stream set by `setStream` if that method is called, or `null` if that method
has not been called by the time that the handler's request method has resolved.

Handlers that do not create a stream of their own, but which call `next`, should defensively pipe the stream forward. While this is not required (see automatic currying below) it is better to do so in most cases as otherwise the stream may not become available to downstream handlers or the application until the upstream handler has fully read it.

```ts
context.setStream(future.getStream());
```

Handlers that either call `next` multiple times or otherwise have reason to create multiple  fetch requests should either choose to return no stream, meaningfully combine the streams, or select a single prioritized stream.

Of course, any handler may choose to read and handle the stream, and return either no stream or a different stream in the process.

### Automatic Currying of Stream and Response

In order to simplify the common case for handlers which decorate a request, if `next` is called only a single time and `setResponse` was never called by the handler, the response set by the next handler in the chain will be applied to that handler's outcome. For instance, this makes the following pattern possible `return (await next(<req>)).content;`.

Similarly, if `next` is called only a single time and neither `setStream` nor `getStream` was called, we automatically curry the stream from the future returned by `next` onto the future returned by the handler.

Finally, if the return value of a handler is a `Future`, we curry `content` and `errors` as well, thus enabling the simplest form `return next(<req>)`.

In the case of the `Future` being returned, `Stream` proxying is automatic and immediate and does not wait for the `Future` to resolve.

### Handler Order

Request handlers are registered by configuring the manager via `use`

```ts
const manager = new RequestManager()
  .use([Handler1, Handler2]);
```

Handlers will be invoked in the order they are registered ("fifo", first-in first-out), and may only be registered up until the first request is made. It is recommended but not required to register all handlers at one time in order to ensure explicitly visible handler ordering.

 @public
*/
export interface Handler {
  /**
   * Method to implement to handle requests. Receives the request
   * context and a nextFn to call to pass-along the request to
   * other handlers.
   *
   * @public
   */
  request<T = unknown>(context: RequestContext, next: NextFn<T>): Promise<T | StructuredDataDocument<T>> | Future<T>;
}

/**
 * The CacheHandler is identical to other handlers except that it
 * is allowed to return a value synchronously. This is useful for
 * features like reducing microtask queueing when de-duping.
 *
 * A RequestManager may only have one CacheHandler, registered via
 * `manager.useCache(CacheHandler)`.
 *
 * @public
 */
export interface CacheHandler {
  /**
   * Method to implement to handle requests. Receives the request
   * context and a nextFn to call to pass-along the request to
   * other handlers.
   *
   * @public
   */
  request<T = unknown>(
    context: RequestContext,
    next: NextFn<T>
  ): Promise<T | StructuredDataDocument<T>> | Future<T> | T;
}

export interface RequestResponse<T> {
  result: T;
}

export type GenericCreateArgs = Record<string | symbol, unknown>;
