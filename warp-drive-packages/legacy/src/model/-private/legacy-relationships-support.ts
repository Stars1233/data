import type { Document, Store } from '@warp-drive/core';
import { DEBUG } from '@warp-drive/core/build-config/env';
import { assert } from '@warp-drive/core/build-config/macros';
import type { CollectionEdge, Graph, GraphEdge, ResourceEdge, UpgradedMeta } from '@warp-drive/core/graph/-private';
import { Context } from '@warp-drive/core/reactive/-private';
import type { LegacyManyArray } from '@warp-drive/core/store/-private';
import {
  createLegacyManyArray,
  fastPush,
  isResourceKey,
  notifyInternalSignal,
  recordIdentifierFor,
  storeFor,
} from '@warp-drive/core/store/-private';
import type { BaseFinderOptions, ResourceKey } from '@warp-drive/core/types';
import { getOrSetGlobal } from '@warp-drive/core/types/-private';
import type { Cache } from '@warp-drive/core/types/cache';
import type { CollectionRelationship } from '@warp-drive/core/types/cache/relationship';
import type { LocalRelationshipOperation } from '@warp-drive/core/types/graph';
import type { OpaqueRecordInstance, TypeFromInstanceOrString } from '@warp-drive/core/types/record';
import { EnableHydration } from '@warp-drive/core/types/request';
import type { LegacyHasManyField } from '@warp-drive/core/types/schema/fields';
import type {
  CollectionResourceRelationship,
  InnerRelationshipDocument,
  SingleResourceRelationship,
} from '@warp-drive/core/types/spec/json-api-raw';

import { upgradeStore } from '../../compat/-private.ts';
import type { MinimalLegacyRecord } from './model-methods.ts';
import type { BelongsToProxyCreateArgs, BelongsToProxyMeta } from './promise-belongs-to.ts';
import { PromiseBelongsTo } from './promise-belongs-to.ts';
import type { HasManyProxyCreateArgs } from './promise-many-array.ts';
import { PromiseManyArray } from './promise-many-array.ts';
import BelongsToReference from './references/belongs-to.ts';
import HasManyReference from './references/has-many.ts';

type PromiseBelongsToFactory<T = unknown> = { create(args: BelongsToProxyCreateArgs<T>): PromiseBelongsTo<T> };

export const LEGACY_SUPPORT: Map<ResourceKey | MinimalLegacyRecord, LegacySupport> = getOrSetGlobal(
  'LEGACY_SUPPORT',
  new Map<ResourceKey | MinimalLegacyRecord, LegacySupport>()
);

export function lookupLegacySupport(record: MinimalLegacyRecord): LegacySupport {
  const identifier = recordIdentifierFor(record);
  assert(`Expected a record`, identifier);
  let support = LEGACY_SUPPORT.get(identifier);

  if (!support) {
    assert(`Memory Leak Detected`, !record.isDestroyed && !record.isDestroying);
    support = new LegacySupport(record, identifier);
    LEGACY_SUPPORT.set(identifier, support);
  }

  return support;
}

export class LegacySupport {
  declare record: MinimalLegacyRecord;
  declare store: Store;
  declare graph: Graph;
  declare cache: Cache;
  declare references: Record<string, BelongsToReference | HasManyReference>;
  declare identifier: ResourceKey;
  declare _manyArrayCache: Record<string, LegacyManyArray>;
  declare _relationshipPromisesCache: Record<string, Promise<LegacyManyArray | OpaqueRecordInstance>>;
  declare _relationshipProxyCache: Record<string, PromiseManyArray | PromiseBelongsTo | undefined>;
  declare _pending: Record<string, Promise<ResourceKey | null> | undefined>;

  declare isDestroying: boolean;
  declare isDestroyed: boolean;

  constructor(record: MinimalLegacyRecord, identifier: ResourceKey) {
    this.record = record;
    this.store = storeFor(record, false)!;
    this.identifier = identifier;
    this.cache = this.store.cache;

    if (this.store._graph) {
      this.graph = this.store._graph;
    }

    this._manyArrayCache = Object.create(null) as Record<string, LegacyManyArray>;
    this._relationshipPromisesCache = Object.create(null) as Record<
      string,
      Promise<LegacyManyArray | OpaqueRecordInstance>
    >;
    this._relationshipProxyCache = Object.create(null) as Record<string, PromiseManyArray | PromiseBelongsTo>;
    this._pending = Object.create(null) as Record<string, Promise<ResourceKey | null>>;
    this.references = Object.create(null) as Record<string, BelongsToReference>;
  }

  _syncArray(array: LegacyManyArray): void {
    // It’s possible the parent side of the relationship may have been destroyed by this point
    if (this.isDestroyed || this.isDestroying) {
      return;
    }
    const currentState = array[Context].source;
    const identifier = this.identifier;

    const [identifiers, jsonApi] = this._getCurrentState(identifier, array.key);

    if (jsonApi.meta) {
      array.meta = jsonApi.meta;
    }

    if (jsonApi.links) {
      array.links = jsonApi.links;
    }

    currentState.length = 0;
    fastPush(currentState, identifiers);
  }

  mutate(mutation: LocalRelationshipOperation): void {
    this.cache.mutate(mutation);
  }

  _findBelongsTo(
    key: string,
    resource: SingleResourceRelationship,
    relationship: ResourceEdge,
    options?: BaseFinderOptions
  ): Promise<OpaqueRecordInstance | null> {
    // TODO @runspired follow up if parent isNew then we should not be attempting load here
    // TODO @runspired follow up on whether this should be in the relationship requests cache
    return this._findBelongsToByJsonApiResource(resource, this.identifier, relationship, options).then(
      (identifier: ResourceKey | null) => handleCompletedRelationshipRequest(this, key, relationship, identifier),
      (e: Error) => handleCompletedRelationshipRequest(this, key, relationship, null, e)
    );
  }

  reloadBelongsTo(key: string, options?: BaseFinderOptions): Promise<OpaqueRecordInstance | null> {
    const loadingPromise = this._relationshipPromisesCache[key] as Promise<OpaqueRecordInstance | null> | undefined;
    if (loadingPromise) {
      return loadingPromise;
    }

    const relationship = this.graph.get(this.identifier, key);
    assert(`Expected ${key} to be a belongs-to relationship`, isBelongsTo(relationship));

    const resource = this.cache.getRelationship(this.identifier, key) as SingleResourceRelationship;
    relationship.state.hasFailedLoadAttempt = false;
    relationship.state.shouldForceReload = true;
    const promise = this._findBelongsTo(key, resource, relationship, options);
    if (this._relationshipProxyCache[key]) {
      // @ts-expect-error
      return this._updatePromiseProxyFor('belongsTo', key, { promise });
    }
    return promise;
  }

  getBelongsTo(key: string, options?: BaseFinderOptions): PromiseBelongsTo | OpaqueRecordInstance | null {
    const { identifier, cache } = this;
    const resource = cache.getRelationship(this.identifier, key) as SingleResourceRelationship;
    const relatedIdentifier = resource && resource.data ? resource.data : null;
    assert(`Expected a stable identifier`, !relatedIdentifier || isResourceKey(relatedIdentifier));

    const store = this.store;
    const relationship = this.graph.get(this.identifier, key);
    assert(`Expected ${key} to be a belongs-to relationship`, isBelongsTo(relationship));

    const isAsync = relationship.definition.isAsync;
    const _belongsToState: BelongsToProxyMeta = {
      key,
      store,
      legacySupport: this,
      modelName: relationship.definition.type,
    };

    if (isAsync) {
      if (relationship.state.hasFailedLoadAttempt) {
        return this._relationshipProxyCache[key] as PromiseBelongsTo;
      }

      const promise = this._findBelongsTo(key, resource, relationship, options);
      const isLoaded = relatedIdentifier && store._instanceCache.recordIsLoaded(relatedIdentifier);

      return this._updatePromiseProxyFor('belongsTo', key, {
        promise,
        content: isLoaded ? store._instanceCache.getRecord(relatedIdentifier) : null,
        _belongsToState,
      });
    } else {
      if (relatedIdentifier === null) {
        return null;
      } else {
        assert(
          `You looked up the '${key}' relationship on a '${identifier.type}' with id ${
            identifier.id || 'null'
          } but some of the associated records were not loaded. Either make sure they are all loaded together with the parent record, or specify that the relationship is async (\`belongsTo(<type>, { async: true, inverse: <inverse> })\`)`,
          store._instanceCache.recordIsLoaded(relatedIdentifier, true)
        );
        return store._instanceCache.getRecord(relatedIdentifier);
      }
    }
  }

  setDirtyBelongsTo(key: string, value: OpaqueRecordInstance | null): void {
    return this.cache.mutate(
      {
        op: 'replaceRelatedRecord',
        record: this.identifier,
        field: key,
        value: extractIdentifierFromRecord(value),
      },
      // @ts-expect-error
      true
    );
  }

  _getCurrentState<T>(
    identifier: ResourceKey,
    field: string
  ): [ResourceKey<TypeFromInstanceOrString<T>>[], CollectionRelationship] {
    const jsonApi = this.cache.getRelationship(identifier, field) as CollectionRelationship;
    const cache = this.store._instanceCache;
    const identifiers: ResourceKey<TypeFromInstanceOrString<T>>[] = [];
    if (jsonApi.data) {
      for (let i = 0; i < jsonApi.data.length; i++) {
        const relatedIdentifier = jsonApi.data[i] as ResourceKey<TypeFromInstanceOrString<T>>;
        assert(`Expected a stable identifier`, isResourceKey(relatedIdentifier));
        if (cache.recordIsLoaded(relatedIdentifier, true)) {
          identifiers.push(relatedIdentifier);
        }
      }
    }

    return [identifiers, jsonApi];
  }

  getManyArray<T>(key: string, definition?: UpgradedMeta): LegacyManyArray<T> {
    if (this.graph) {
      let manyArray: LegacyManyArray<T> | undefined = this._manyArrayCache[key] as LegacyManyArray<T> | undefined;
      if (!definition) {
        definition = this.graph.get(this.identifier, key).definition;
      }

      if (!manyArray) {
        const [identifiers, doc] = this._getCurrentState<T>(this.identifier, key);

        manyArray = createLegacyManyArray({
          store: this.store,
          // @ts-expect-error Typescript doesn't have a way for us to thread the generic backwards so it infers unknown instead of T
          manager: this,
          source: identifiers,
          type: definition.type,
          isLoaded: !definition.isAsync,
          editable: true,
          isAsync: definition.isAsync,
          isPolymorphic: definition.isPolymorphic,
          field: this.store.schema.fields(this.identifier).get(key) as LegacyHasManyField,
          identifier: this.identifier,
          links: doc.links || null,
          meta: doc.meta || null,
        });

        this._manyArrayCache[key] = manyArray;
      }

      return manyArray;
    }
    assert('hasMany only works with the @ember-data/json-api package');
  }

  fetchAsyncHasMany(
    key: string,
    relationship: CollectionEdge,
    manyArray: LegacyManyArray,
    options?: BaseFinderOptions
  ): Promise<LegacyManyArray> {
    if (this.graph) {
      let loadingPromise = this._relationshipPromisesCache[key] as Promise<LegacyManyArray> | undefined;
      if (loadingPromise) {
        return loadingPromise;
      }

      const jsonApi = this.cache.getRelationship(this.identifier, key) as CollectionRelationship;
      const promise = this._findHasManyByJsonApiResource(jsonApi, this.identifier, relationship, options);

      if (!promise) {
        manyArray.isLoaded = true;
        return Promise.resolve(manyArray);
      }

      loadingPromise = promise.then(
        () => handleCompletedRelationshipRequest(this, key, relationship, manyArray),
        (e: Error) => handleCompletedRelationshipRequest(this, key, relationship, manyArray, e)
      );
      this._relationshipPromisesCache[key] = loadingPromise;
      return loadingPromise;
    }
    assert('hasMany only works with the @ember-data/json-api package');
  }

  reloadHasMany<T>(key: string, options?: BaseFinderOptions): Promise<LegacyManyArray<T>> | PromiseManyArray<T> {
    if (this.graph) {
      const loadingPromise = this._relationshipPromisesCache[key];
      if (loadingPromise) {
        return loadingPromise as Promise<LegacyManyArray<T>>;
      }
      const relationship = this.graph.get(this.identifier, key) as CollectionEdge;
      const { definition, state } = relationship;

      state.hasFailedLoadAttempt = false;
      state.shouldForceReload = true;
      const manyArray = this.getManyArray(key, definition);
      const promise = this.fetchAsyncHasMany(key, relationship, manyArray, options);

      if (this._relationshipProxyCache[key]) {
        return this._updatePromiseProxyFor('hasMany', key, { promise }) as PromiseManyArray<T>;
      }

      return promise as Promise<LegacyManyArray<T>>;
    }
    assert(`hasMany only works with the @ember-data/json-api package`);
  }

  getHasMany(key: string, options?: BaseFinderOptions): PromiseManyArray | LegacyManyArray {
    if (this.graph) {
      const relationship = this.graph.get(this.identifier, key) as CollectionEdge;
      const { definition, state } = relationship;
      const manyArray = this.getManyArray(key, definition);

      if (definition.isAsync) {
        if (state.hasFailedLoadAttempt) {
          return this._relationshipProxyCache[key] as PromiseManyArray;
        }

        const promise = this.fetchAsyncHasMany(key, relationship, manyArray, options);

        return this._updatePromiseProxyFor('hasMany', key, { promise, content: manyArray });
      } else {
        assert(
          `You looked up the '${key}' relationship on a '${this.identifier.type}' with id ${
            this.identifier.id || 'null'
          } but some of the associated records were not loaded. Either make sure they are all loaded together with the parent record, or specify that the relationship is async ('hasMany(<type>, { async: true, inverse: <inverse> })')`,
          !anyUnloaded(this.store, relationship)
        );

        return manyArray;
      }
    }
    assert(`hasMany only works with the @ember-data/json-api package`);
  }

  _updatePromiseProxyFor(kind: 'hasMany', key: string, args: HasManyProxyCreateArgs): PromiseManyArray;
  _updatePromiseProxyFor(kind: 'belongsTo', key: string, args: BelongsToProxyCreateArgs): PromiseBelongsTo;
  _updatePromiseProxyFor(
    kind: 'belongsTo',
    key: string,
    args: { promise: Promise<OpaqueRecordInstance | null> }
  ): PromiseBelongsTo;
  _updatePromiseProxyFor(
    kind: 'hasMany' | 'belongsTo',
    key: string,
    args: BelongsToProxyCreateArgs | HasManyProxyCreateArgs | { promise: Promise<OpaqueRecordInstance | null> }
  ): PromiseBelongsTo | PromiseManyArray {
    let promiseProxy = this._relationshipProxyCache[key];
    if (kind === 'hasMany') {
      const { promise, content } = args as HasManyProxyCreateArgs;
      if (promiseProxy) {
        assert(`Expected a PromiseManyArray`, '_update' in promiseProxy);
        promiseProxy._update(promise, content);
      } else {
        promiseProxy = this._relationshipProxyCache[key] = new PromiseManyArray(promise, content);
      }
      return promiseProxy;
    }
    if (promiseProxy) {
      const { promise, content } = args as BelongsToProxyCreateArgs;
      assert(`Expected a PromiseBelongsTo`, '_belongsToState' in promiseProxy);

      if (content !== undefined) {
        promiseProxy.set('content', content);
      }
      void promiseProxy.set('promise', promise);
    } else {
      promiseProxy = (PromiseBelongsTo as unknown as PromiseBelongsToFactory).create(args as BelongsToProxyCreateArgs);
      this._relationshipProxyCache[key] = promiseProxy;
    }

    return promiseProxy;
  }

  referenceFor(kind: 'belongsTo', name: string): BelongsToReference;
  referenceFor(kind: 'hasMany', name: string): HasManyReference;
  referenceFor(kind: 'belongsTo' | 'hasMany', name: string) {
    let reference = this.references[name];

    if (!reference) {
      if (!this.graph) {
        // TODO @runspired while this feels odd, it is not a regression in capability because we do
        // not today support references pulling from RecordDatas other than our own
        // because of the intimate API access involved. This is something we will need to redesign.
        assert(`snapshot.belongsTo only supported for @ember-data/json-api`);
      }
      const { graph, identifier } = this;
      const relationship = graph.get(identifier, name);

      if (DEBUG) {
        if (kind) {
          const modelName = identifier.type;
          const actualRelationshipKind = relationship.definition.kind;
          assert(
            `You tried to get the '${name}' relationship on a '${modelName}' via record.${kind}('${name}'), but the relationship is of kind '${actualRelationshipKind}'. Use record.${actualRelationshipKind}('${name}') instead.`,
            actualRelationshipKind === kind
          );
        }
      }

      const relationshipKind = relationship.definition.kind;

      if (relationshipKind === 'belongsTo') {
        reference = new BelongsToReference(this.store, graph, identifier, relationship as ResourceEdge, name);
      } else if (relationshipKind === 'hasMany') {
        reference = new HasManyReference(this.store, graph, identifier, relationship as CollectionEdge, name);
      }

      this.references[name] = reference;
    }

    return reference;
  }

  _findHasManyByJsonApiResource(
    resource: CollectionResourceRelationship,
    parentIdentifier: ResourceKey,
    relationship: CollectionEdge,
    options: BaseFinderOptions = {}
  ): Promise<void | unknown[]> | void {
    if (this.graph) {
      if (!resource) {
        return;
      }
      const { definition, state } = relationship;
      upgradeStore(this.store);
      const adapter = this.store.adapterFor?.(definition.type);
      const { isStale, hasDematerializedInverse, hasReceivedData, isEmpty, shouldForceReload } = state;
      const allInverseRecordsAreLoaded = areAllInverseRecordsLoaded(this.store, resource);
      const identifiers = resource.data;
      const shouldFindViaLink =
        resource.links &&
        resource.links.related &&
        (typeof adapter?.findHasMany === 'function' || typeof identifiers === 'undefined') &&
        (shouldForceReload || hasDematerializedInverse || isStale || (!allInverseRecordsAreLoaded && !isEmpty));

      const field = this.store.schema.fields({ type: definition.inverseType }).get(definition.key);
      assert(
        `Expected a hasMany field definition for ${definition.inverseType}.${definition.key}`,
        field && field.kind === 'hasMany'
      );

      const request = {
        useLink: shouldFindViaLink,
        field,
        links: resource.links,
        meta: resource.meta,
        options,
        record: parentIdentifier,
      };

      // fetch via link
      if (shouldFindViaLink) {
        assert(`Expected collection to be an array`, !identifiers || Array.isArray(identifiers));
        assert(`Expected stable identifiers`, !identifiers || identifiers.every(isResourceKey));

        const req = field.options.linksMode
          ? {
              url: getRelatedLink(resource),
              op: 'findHasMany',
              method: 'GET' as const,
              records: identifiers || [],
              data: request,
              [EnableHydration]: false,
            }
          : {
              op: 'findHasMany',
              records: identifiers || [],
              data: request,
              cacheOptions: { [Symbol.for('wd:skip-cache')]: true },
            };
        return this.store.request(req) as unknown as Promise<void>;
      }

      const preferLocalCache = hasReceivedData && !isEmpty;
      const hasLocalPartialData =
        hasDematerializedInverse || (isEmpty && Array.isArray(identifiers) && identifiers.length > 0);
      const attemptLocalCache = !shouldForceReload && !isStale && (preferLocalCache || hasLocalPartialData);

      if (attemptLocalCache && allInverseRecordsAreLoaded) {
        return;
      }

      const hasData = hasReceivedData && !isEmpty;
      if (attemptLocalCache || hasData || hasLocalPartialData) {
        assert(`Expected collection to be an array`, Array.isArray(identifiers));
        assert(`Expected stable identifiers`, identifiers.every(isResourceKey));

        options.reload = options.reload || !attemptLocalCache || undefined;
        return this.store.request({
          op: 'findHasMany',
          records: identifiers,
          data: request,
          cacheOptions: { [Symbol.for('wd:skip-cache')]: true },
        }) as unknown as Promise<void>;
      }

      // we were explicitly told we have no data and no links.
      //   TODO if the relationshipIsStale, should we hit the adapter anyway?
      return;
    }
    assert(`hasMany only works with the @ember-data/json-api package`);
  }

  _findBelongsToByJsonApiResource(
    resource: SingleResourceRelationship,
    parentIdentifier: ResourceKey,
    relationship: ResourceEdge,
    options: BaseFinderOptions = {}
  ): Promise<ResourceKey | null> {
    if (!resource) {
      return Promise.resolve(null);
    }
    const key = relationship.definition.key;

    // interleaved promises mean that we MUST cache this here
    // in order to prevent infinite re-render if the request
    // fails.
    if (this._pending[key]) {
      return this._pending[key];
    }

    const identifier = resource.data ? resource.data : null;
    assert(`Expected a stable identifier`, !identifier || isResourceKey(identifier));

    const { isStale, hasDematerializedInverse, hasReceivedData, isEmpty, shouldForceReload } = relationship.state;

    const allInverseRecordsAreLoaded = areAllInverseRecordsLoaded(this.store, resource);
    const shouldFindViaLink =
      resource.links?.related &&
      (shouldForceReload || hasDematerializedInverse || isStale || (!allInverseRecordsAreLoaded && !isEmpty));

    const field = this.store.schema.fields(this.identifier).get(relationship.definition.key);
    assert(
      `Attempted to access a belongsTo relationship but no definition exists for it`,
      field && field.kind === 'belongsTo'
    );
    const request = {
      useLink: shouldFindViaLink,
      field,
      links: resource.links,
      meta: resource.meta,
      options,
      record: parentIdentifier,
    };

    // fetch via link
    if (shouldFindViaLink) {
      const req = field.options.linksMode
        ? {
            url: getRelatedLink(resource),
            op: 'findBelongsTo',
            method: 'GET' as const,
            records: identifier ? [identifier] : [],
            data: request,
            [EnableHydration]: false,
          }
        : {
            op: 'findBelongsTo',
            records: identifier ? [identifier] : [],
            data: request,
            cacheOptions: { [Symbol.for('wd:skip-cache')]: true },
          };
      const future = this.store.request<ResourceKey | null>(req);
      this._pending[key] = future
        .then((doc) =>
          field.options.linksMode ? (doc.content as unknown as Document<ResourceKey | null>).data! : doc.content
        )
        .finally(() => {
          this._pending[key] = undefined;
        });
      return this._pending[key];
    }

    const preferLocalCache = hasReceivedData && allInverseRecordsAreLoaded && !isEmpty;
    const hasLocalPartialData = hasDematerializedInverse || (isEmpty && resource.data);
    // null is explicit empty, undefined is "we don't know anything"
    const localDataIsEmpty = !identifier;
    const attemptLocalCache = !shouldForceReload && !isStale && (preferLocalCache || hasLocalPartialData);

    // we dont need to fetch and are empty
    if (attemptLocalCache && localDataIsEmpty) {
      return Promise.resolve(null);
    }

    // we dont need to fetch because we are local state
    const resourceIsLocal = identifier?.id === null;
    if ((attemptLocalCache && allInverseRecordsAreLoaded) || resourceIsLocal) {
      return Promise.resolve(identifier);
    }

    // we may need to fetch
    if (identifier) {
      assert(`Cannot fetch belongs-to relationship with no information`, identifier);
      options.reload = options.reload || !attemptLocalCache || undefined;

      this._pending[key] = this.store
        .request<ResourceKey | null>({
          op: 'findBelongsTo',
          records: [identifier],
          data: request,
          cacheOptions: { [Symbol.for('wd:skip-cache')]: true },
        })
        .then((doc) => doc.content)
        .finally(() => {
          this._pending[key] = undefined;
        });
      return this._pending[key];
    }

    // we were explicitly told we have no data and no links.
    //   TODO if the relationshipIsStale, should we hit the adapter anyway?
    return Promise.resolve(null);
  }

  destroy(): void {
    this.isDestroying = true;

    let cache: Record<string, { destroy(): void } | undefined> = this._manyArrayCache;
    this._manyArrayCache = Object.create(null) as Record<string, LegacyManyArray>;
    Object.keys(cache).forEach((key) => {
      cache[key]!.destroy();
    });

    cache = this._relationshipProxyCache;
    this._relationshipProxyCache = Object.create(null) as Record<string, PromiseManyArray | PromiseBelongsTo>;
    Object.keys(cache).forEach((key) => {
      const proxy = cache[key]!;
      if (proxy.destroy) {
        proxy.destroy();
      }
    });

    cache = this.references;
    this.references = Object.create(null) as Record<string, BelongsToReference | HasManyReference>;
    Object.keys(cache).forEach((key) => {
      cache[key]!.destroy();
    });
    this.isDestroyed = true;
  }
}

function getRelatedLink(resource: SingleResourceRelationship | CollectionResourceRelationship): string {
  const related = resource.links?.related;
  assert(`Expected a related link`, related);

  return typeof related === 'object' ? related.href : related;
}

function handleCompletedRelationshipRequest(
  recordExt: LegacySupport,
  key: string,
  relationship: ResourceEdge,
  value: ResourceKey | null
): OpaqueRecordInstance | null;
function handleCompletedRelationshipRequest(
  recordExt: LegacySupport,
  key: string,
  relationship: CollectionEdge,
  value: LegacyManyArray
): LegacyManyArray;
function handleCompletedRelationshipRequest(
  recordExt: LegacySupport,
  key: string,
  relationship: ResourceEdge,
  value: null,
  error: Error
): never;
function handleCompletedRelationshipRequest(
  recordExt: LegacySupport,
  key: string,
  relationship: CollectionEdge,
  value: LegacyManyArray,
  error: Error
): never;
function handleCompletedRelationshipRequest(
  recordExt: LegacySupport,
  key: string,
  relationship: ResourceEdge | CollectionEdge,
  value: LegacyManyArray | ResourceKey | null,
  error?: Error
): LegacyManyArray | OpaqueRecordInstance | null {
  delete recordExt._relationshipPromisesCache[key];
  relationship.state.shouldForceReload = false;
  const isHasMany = relationship.definition.kind === 'hasMany';

  if (isHasMany) {
    // we don't notify the record property here to avoid refetch
    // only the many array
    notifyInternalSignal((value as LegacyManyArray)[Context].signal);
  }

  if (error) {
    relationship.state.hasFailedLoadAttempt = true;
    const proxy = recordExt._relationshipProxyCache[key];
    // belongsTo relationships are sometimes unloaded
    // when a load fails, in this case we need
    // to make sure that we aren't proxying
    // to destroyed content
    // for the sync belongsTo reload case there will be no proxy
    // for the async reload case there will be no proxy if the ui
    // has never been accessed
    if (proxy && !isHasMany) {
      // @ts-expect-error unsure why this is not resolving the boolean but async belongsTo is weird
      if (proxy.content && proxy.content.isDestroying) {
        (proxy as PromiseBelongsTo).set('content', null);
      }
      recordExt.store.notifications._flush();
    }

    throw error;
  }

  if (isHasMany) {
    (value as LegacyManyArray).isLoaded = true;
  } else {
    recordExt.store.notifications._flush();
  }

  relationship.state.hasFailedLoadAttempt = false;
  // only set to not stale if no error is thrown
  relationship.state.isStale = false;

  return isHasMany || !value ? value : recordExt.store.peekRecord(value as ResourceKey);
}

type PromiseProxyRecord = { then(): void; content: OpaqueRecordInstance | null | undefined };

function extractIdentifierFromRecord(record: PromiseProxyRecord | OpaqueRecordInstance | null) {
  if (!record) {
    return null;
  }

  return recordIdentifierFor(record);
}

function anyUnloaded(store: Store, relationship: CollectionEdge) {
  const graph = store._graph;
  assert(`Expected a Graph instance to be available`, graph);
  const relationshipData = graph.getData(
    relationship.identifier,
    relationship.definition.key
  ) as CollectionRelationship;
  const state = relationshipData.data;
  const cache = store._instanceCache;
  const unloaded = state?.find((s) => {
    const isLoaded = cache.recordIsLoaded(s, true);
    return !isLoaded;
  });

  return unloaded || false;
}

export function areAllInverseRecordsLoaded(store: Store, resource: InnerRelationshipDocument): boolean {
  const instanceCache = store._instanceCache;
  const identifiers = resource.data;

  if (Array.isArray(identifiers)) {
    assert(`Expected stable identifiers`, identifiers.every(isResourceKey));
    // treat as collection
    // check for unloaded records
    return identifiers.every((identifier: ResourceKey) => instanceCache.recordIsLoaded(identifier));
  }

  // treat as single resource
  if (!identifiers) return true;

  assert(`Expected stable identifiers`, isResourceKey(identifiers));
  return instanceCache.recordIsLoaded(identifiers);
}

function isBelongsTo(relationship: GraphEdge): relationship is ResourceEdge {
  return relationship.definition.kind === 'belongsTo';
}
