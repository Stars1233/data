import { DEBUG } from '@warp-drive/core/build-config/env';

import { getOrSetGlobal } from '../../types/-private';
import type {
  RequestInfo,
  StructuredDataDocument,
  StructuredDocument,
  StructuredErrorDocument,
} from '../../types/request';
import { STRUCTURED } from '../../types/request';
import { Context, ContextOwner } from './context';
import { assertValidRequest } from './debug';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Fetch } from './fetch.ts';
import { createFuture, isFuture } from './future';
import { setRequestResult } from './promise-cache';
import type { DeferredFuture, Future, GodContext, Handler } from './types';

export const IS_CACHE_HANDLER: '___(unique) Symbol(IS_CACHE_HANDLER)' = getOrSetGlobal(
  'IS_CACHE_HANDLER',
  Symbol('IS_CACHE_HANDLER')
);
export function curryFuture<T>(owner: ContextOwner, inbound: Future<T>, outbound: DeferredFuture<T>): Future<T> {
  owner.setStream(inbound.getStream());

  inbound.then(
    (doc: StructuredDataDocument<T>) => {
      const document = {
        [STRUCTURED]: true as const,
        request: owner.request,
        response: doc.response,
        content: doc.content,
      };
      outbound.resolve(document);
    },
    (error: Error & StructuredErrorDocument) => {
      if (isDoc(error)) {
        owner.setStream(owner.god.stream);
      }
      if (!error || !(error instanceof Error)) {
        try {
          throw new Error(error ? error : `Request Rejected with an Unknown Error`);
        } catch (e: unknown) {
          if (error && typeof error === 'object') {
            Object.assign(e as Error, error);
            (e as Error & StructuredErrorDocument).message =
              (error as Error).message || `Request Rejected with an Unknown Error`;
          }
          error = e as Error & StructuredErrorDocument;
        }
      }

      error[STRUCTURED] = true;
      error.request = owner.request;
      error.response = owner.getResponse();
      error.error = error.error || error.message;

      outbound.reject(error);
    }
  );
  return outbound.promise;
}

function isDoc<T>(doc: T | StructuredDataDocument<T>): doc is StructuredDataDocument<T> {
  return doc && (doc as StructuredDataDocument<T>)[STRUCTURED] === true;
}

function ensureDoc<T>(owner: ContextOwner, content: T | Error, isError: boolean): StructuredDocument<T> {
  if (isDoc(content)) {
    return content as StructuredDocument<T>;
  }

  if (isError) {
    return {
      [STRUCTURED]: true,
      request: owner.request,
      response: owner.getResponse(),
      error: content as Error,
    } as StructuredErrorDocument<T>;
  }

  return {
    [STRUCTURED]: true,
    request: owner.request,
    response: owner.getResponse(),
    content: content as T,
  };
}

/**
 * Additional properties exposed on errors thrown by the
 * {@link Fetch | Fetch Handler}.
 *
 * In the case of an Abort or system/browser level issue,
 * this extends {@link DOMException}.
 *
 * Else it extends from {@link AggregateError} if the
 * response includes an array of errors, falling back
 * to {@link Error} as its base.
 */
export interface FetchError extends DOMException {
  /**
   * Alias for {@link FetchError.status | status}.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/status)
   */
  code: number;
  /**
   * The name associated to the {@link FetchError.status | status code}.
   *
   * Typically this will be of the formula `StatusTextError` for instance
   * a 404 status with status text of `Not Found` would have the name
   * `NotFoundError`.
   */
  name: string;
  /**
   * The http status code associated to the returned error.
   *
   * Browser/System level network errors will often have an error code of `0` or `5`.
   * Aborted requests will have an error code of `20`.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/status)
   */
  status: number;
  /**
   * The Status Text associated to the {@link FetchError.status | status code}
   * for the error.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/statusText)
   *
   */
  statusText: string;
  /**
   * A property signifying that an Error uses the {@link FetchError}
   * interface.
   */
  isRequestError: true;
}

export function enhanceReason(reason?: string): DOMException {
  return new DOMException(reason || 'The user aborted a request.', 'AbortError');
}

export function handleOutcome<T>(
  owner: ContextOwner,
  inbound: Promise<T | StructuredDataDocument<T>>,
  outbound: DeferredFuture<T>
): Future<T> {
  inbound.then(
    (content: T | StructuredDataDocument<T>) => {
      if (owner.controller.signal.aborted) {
        // the next function did not respect the signal, we handle it here
        outbound.reject(enhanceReason(owner.controller.signal.reason as string));
        return;
      }
      if (isDoc(content)) {
        owner.setStream(owner.god.stream);
        content = content.content;
      }
      const document = {
        [STRUCTURED]: true as const,
        request: owner.request,
        response: owner.getResponse(),
        content,
      };
      outbound.resolve(document);
    },
    (error: Error & StructuredErrorDocument) => {
      if (isDoc(error)) {
        owner.setStream(owner.god.stream);
      }
      if (!error || !(error instanceof Error)) {
        try {
          throw new Error(error ? error : `Request Rejected with an Unknown Error`);
        } catch (e: unknown) {
          if (error && typeof error === 'object') {
            Object.assign(e as Error, error);
            (e as Error & StructuredErrorDocument).message =
              (error as Error).message || `Request Rejected with an Unknown Error`;
          }
          error = e as Error & StructuredErrorDocument;
        }
      }

      error[STRUCTURED] = true;
      error.request = owner.request;
      error.response = owner.getResponse();
      error.error = error.error || error.message;
      outbound.reject(error);
    }
  );
  return outbound.promise;
}

function isCacheHandler(handler: Handler & { [IS_CACHE_HANDLER]?: boolean }, index: number): boolean {
  return index === 0 && Boolean(handler[IS_CACHE_HANDLER]);
}

export function executeNextHandler<T>(
  wares: Readonly<Handler[]>,
  request: RequestInfo,
  i: number,
  god: GodContext
): Future<T> {
  if (DEBUG) {
    if (i === wares.length) {
      throw new Error(`No handler was able to handle this request.`);
    }
    assertValidRequest(request, false);
  }
  const owner = new ContextOwner(request, god, i === 0);

  function next(r: RequestInfo): Future<T> {
    owner.nextCalled++;
    return executeNextHandler(wares, r, i + 1, god);
  }

  const _isCacheHandler = isCacheHandler(wares[i], i);
  const context = new Context(owner, _isCacheHandler);
  let outcome: Promise<T | StructuredDataDocument<T>> | Future<T>;
  try {
    outcome = wares[i].request<T>(context, next);
    if (_isCacheHandler) {
      context._finalize();
    }
    if (!!outcome && _isCacheHandler) {
      if (!(outcome instanceof Promise)) {
        setRequestResult(owner.requestId, { isError: false, result: ensureDoc(owner, outcome, false) });
        outcome = Promise.resolve(outcome);
      }
    } else if (DEBUG) {
      if (!outcome || (!(outcome instanceof Promise) && !(typeof outcome === 'object' && 'then' in outcome))) {
        // eslint-disable-next-line no-console
        console.log({ request, handler: wares[i], outcome });
        if (outcome === undefined) {
          throw new Error(`Expected handler.request to return a promise, instead received undefined.`);
        }
        throw new Error(`Expected handler.request to return a promise, instead received a synchronous value.`);
      }
    }
  } catch (e) {
    if (_isCacheHandler) {
      setRequestResult(owner.requestId, { isError: true, result: ensureDoc(owner, e, true) });
    }
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    outcome = Promise.reject<StructuredDataDocument<T>>(e);
  }
  const future = createFuture<T>(owner);

  if (isFuture<T>(outcome)) {
    return curryFuture(owner, outcome, future);
  }

  return handleOutcome(owner, outcome, future);
}
