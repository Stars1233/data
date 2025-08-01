import { recordIdentifierFor } from '@warp-drive/core';
import { assert } from '@warp-drive/core/build-config/macros';
import type { PersistedResourceKey, ResourceKey } from '@warp-drive/core/types/identifier';
import type { TypedRecordInstance } from '@warp-drive/core/types/record';
import type {
  ConstrainedRequestOptions,
  CreateRequestOptions,
  DeleteRequestOptions,
  UpdateRequestOptions,
} from '@warp-drive/core/types/request';
import type { SingleResourceDataDocument } from '@warp-drive/core/types/spec/document';

import {
  buildBaseURL,
  type CreateRecordUrlOptions,
  type DeleteRecordUrlOptions,
  type UpdateRecordUrlOptions,
} from '../../index.ts';
import { camelize, pluralize } from '../../string';
import { copyForwardUrlOptions } from '../builder-utils.ts';

function isExisting(identifier: ResourceKey): identifier is PersistedResourceKey {
  return 'id' in identifier && identifier.id !== null && 'type' in identifier && identifier.type !== null;
}

/**
 * Builds request options to delete record for resources,
 * configured for the url, method and header expectations of REST APIs.
 *
 * **Basic Usage**
 *
 * ```ts
 * import { deleteRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.peekRecord('person', '1');
 *
 * // mark record as deleted
 * store.deleteRecord(person);
 *
 * // persist deletion
 * const data = await store.request(deleteRecord(person));
 * ```
 *
 * **Supplying Options to Modify the Request Behavior**
 *
 * The following options are supported:
 *
 * - `host` - The host to use for the request, defaults to the `host` configured with `setBuildURLConfig`.
 * - `namespace` - The namespace to use for the request, defaults to the `namespace` configured with `setBuildURLConfig`.
 * - `resourcePath` - The resource path to use for the request, defaults to pluralizing the supplied type
 * - `reload` - Whether to forcibly reload the request if it is already in the store, not supplying this
 *      option will delegate to the store's CachePolicy, defaulting to `false` if none is configured.
 * - `backgroundReload` - Whether to reload the request if it is already in the store, but to also resolve the
 *      promise with the cached value, not supplying this option will delegate to the store's CachePolicy,
 *      defaulting to `false` if none is configured.
 * - `urlParamsSetting` - an object containing options for how to serialize the query params (see `buildQueryParams`)
 *
 * ```ts
 * import { deleteRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.peekRecord('person', '1');
 *
 * // mark record as deleted
 * store.deleteRecord(person);
 *
 * // persist deletion
 * const options = deleteRecord(person, { namespace: 'api/v1' });
 * const data = await store.request(options);
 * ```
 *
 * @public
 * @param record
 * @param options
 */
export function deleteRecord<T>(record: T, options?: ConstrainedRequestOptions): DeleteRequestOptions<T>;
export function deleteRecord(record: unknown, options?: ConstrainedRequestOptions): DeleteRequestOptions;
export function deleteRecord(record: unknown, options: ConstrainedRequestOptions = {}): DeleteRequestOptions {
  const identifier = recordIdentifierFor(record);
  assert(`Expected to be given a record instance`, identifier);
  assert(`Cannot delete a record that does not have an associated type and id.`, isExisting(identifier));

  const urlOptions: DeleteRecordUrlOptions = {
    identifier: identifier,
    op: 'deleteRecord',
    resourcePath: pluralize(camelize(identifier.type)),
  };

  copyForwardUrlOptions(urlOptions, options);

  const url = buildBaseURL(urlOptions);
  const headers = new Headers();
  headers.append('Accept', 'application/json;charset=utf-8');

  return {
    url,
    method: 'DELETE',
    headers,
    op: 'deleteRecord',
    data: {
      record: identifier,
    },
    records: [identifier],
  };
}

/**
 * Builds request options to create new record for resources,
 * configured for the url, method and header expectations of most REST APIs.
 *
 * **Basic Usage**
 *
 * ```ts
 * import { createRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.createRecord('person', { name: 'Ted' });
 * const data = await store.request(createRecord(person));
 * ```
 *
 * **Supplying Options to Modify the Request Behavior**
 *
 * The following options are supported:
 *
 * - `host` - The host to use for the request, defaults to the `host` configured with `setBuildURLConfig`.
 * - `namespace` - The namespace to use for the request, defaults to the `namespace` configured with `setBuildURLConfig`.
 * - `resourcePath` - The resource path to use for the request, defaults to pluralizing the supplied type
 * - `reload` - Whether to forcibly reload the request if it is already in the store, not supplying this
 *      option will delegate to the store's CachePolicy, defaulting to `false` if none is configured.
 * - `backgroundReload` - Whether to reload the request if it is already in the store, but to also resolve the
 *      promise with the cached value, not supplying this option will delegate to the store's CachePolicy,
 *      defaulting to `false` if none is configured.
 * - `urlParamsSetting` - an object containing options for how to serialize the query params (see `buildQueryParams`)
 *
 * ```ts
 * import { createRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.createRecord('person', { name: 'Ted' });
 * const options = createRecord(person, { namespace: 'api/v1' });
 * const data = await store.request(options);
 * ```
 *
 * @public
 * @param record
 * @param options
 */
export function createRecord<T>(record: T, options?: ConstrainedRequestOptions): CreateRequestOptions<T>;
export function createRecord(record: unknown, options?: ConstrainedRequestOptions): CreateRequestOptions;
export function createRecord(record: unknown, options: ConstrainedRequestOptions = {}): CreateRequestOptions {
  const identifier = recordIdentifierFor(record);
  assert(`Expected to be given a record instance`, identifier);

  const urlOptions: CreateRecordUrlOptions = {
    identifier: identifier,
    op: 'createRecord',
    resourcePath: pluralize(camelize(identifier.type)),
  };

  copyForwardUrlOptions(urlOptions, options);

  const url = buildBaseURL(urlOptions);
  const headers = new Headers();
  headers.append('Accept', 'application/json;charset=utf-8');

  return {
    url,
    method: 'POST',
    headers,
    op: 'createRecord',
    data: {
      record: identifier,
    },
    records: [identifier],
  };
}

/**
 * Builds request options to update existing record for resources,
 * configured for the url, method and header expectations of most REST APIs.
 *
 * **Basic Usage**
 *
 * ```ts
 * import { updateRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.peekRecord('person', '1');
 * person.name = 'Chris';
 * const data = await store.request(updateRecord(person));
 * ```
 *
 * **Supplying Options to Modify the Request Behavior**
 *
 * The following options are supported:
 *
 * - `patch` - Allows caller to specify whether to use a PATCH request instead of a PUT request, defaults to `false`.
 * - `host` - The host to use for the request, defaults to the `host` configured with `setBuildURLConfig`.
 * - `namespace` - The namespace to use for the request, defaults to the `namespace` configured with `setBuildURLConfig`.
 * - `resourcePath` - The resource path to use for the request, defaults to pluralizing the supplied type
 * - `reload` - Whether to forcibly reload the request if it is already in the store, not supplying this
 *      option will delegate to the store's CachePolicy, defaulting to `false` if none is configured.
 * - `backgroundReload` - Whether to reload the request if it is already in the store, but to also resolve the
 *      promise with the cached value, not supplying this option will delegate to the store's CachePolicy,
 *      defaulting to `false` if none is configured.
 * - `urlParamsSetting` - an object containing options for how to serialize the query params (see `buildQueryParams`)
 *
 * ```ts
 * import { updateRecord } from '@warp-drive/utilities/rest';
 *
 * const person = store.peekRecord('person', '1');
 * person.name = 'Chris';
 * const options = updateRecord(person, { patch: true });
 * const data = await store.request(options);
 * ```
 *
 * @public
 * @param record
 * @param options
 */
export function updateRecord<T extends TypedRecordInstance, RT extends TypedRecordInstance = T>(
  record: T,
  options?: ConstrainedRequestOptions & { patch?: boolean }
): UpdateRequestOptions<SingleResourceDataDocument<RT>, T>;
export function updateRecord(
  record: unknown,
  options?: ConstrainedRequestOptions & { patch?: boolean }
): UpdateRequestOptions;
export function updateRecord(
  record: unknown,
  options: ConstrainedRequestOptions & { patch?: boolean } = {}
): UpdateRequestOptions {
  const identifier = recordIdentifierFor(record);
  assert(`Expected to be given a record instance`, identifier);
  assert(`Cannot update a record that does not have an associated type and id.`, isExisting(identifier));

  const urlOptions: UpdateRecordUrlOptions = {
    identifier: identifier,
    op: 'updateRecord',
    resourcePath: pluralize(camelize(identifier.type)),
  };

  copyForwardUrlOptions(urlOptions, options);

  const url = buildBaseURL(urlOptions);
  const headers = new Headers();
  headers.append('Accept', 'application/json;charset=utf-8');

  return {
    url,
    method: options.patch ? 'PATCH' : 'PUT',
    headers,
    op: 'updateRecord',
    data: {
      record: identifier,
    },
    records: [identifier],
  };
}
