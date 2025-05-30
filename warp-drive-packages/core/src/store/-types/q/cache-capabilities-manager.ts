import type { StableDocumentIdentifier, StableRecordIdentifier } from '../../../types/identifier.ts';
import type { IdentifierCache } from '../../-private/caches/identifier-cache.ts';
import type { NotificationType } from '../../-private/managers/notification-manager.ts';
import type { SchemaService } from './schema-service.ts';

/**
 * CacheCapabilitiesManager provides encapsulated API access to the minimal
 * subset of the Store's functionality that Cache implementations
 * should interact with. It is provided to the Store's `createCache` hook.
 *
 * Cache implementations should not need more than this API provides.
 *
 * This class cannot be directly instantiated.
 *
 * @class CacheCapabilitiesManager
 * @public
 */
export type CacheCapabilitiesManager = {
  /**
   * Provides access to the IdentifierCache instance
   * for this Store instance.
   *
   * The IdentifierCache can be used to peek, generate or
   * retrieve a stable unique identifier for any resource.
   *
   * @property identifierCache
   * @type {IdentifierCache}
   * @public
   */
  identifierCache: IdentifierCache;

  /**
   * DEPRECATED - use the schema property
   *
   * Provides access to the SchemaService instance
   * for this Store instance.
   *
   * The SchemaService can be used to query for
   * information about the schema of a resource.
   *
   * @deprecated
   * @public
   */
  getSchemaDefinitionService(): SchemaService;

  /**
   * Provides access to the SchemaService instance
   * for this Store instance.
   *
   * The SchemaService can be used to query for
   * information about the schema of a resource.
   *
   * @property schema
   * @public
   */
  schema: SchemaService;

  /**
   * Update the `id` for the record corresponding to the identifier
   * This operation can only be done for records whose `id` is `null`.
   *
   * @param {StableRecordIdentifier} identifier;
   * @param {String} id;
   * @public
   */
  setRecordId(identifier: StableRecordIdentifier, id: string): void;

  /**
   * Signal to the store that the specified record may be considered fully
   * removed from the cache. Generally this means that not only does no
   * data exist for the identified resource, no known relationships still
   * point to it either.
   *
   * @param {StableRecordIdentifier} identifier
   * @public
   */
  disconnectRecord(identifier: StableRecordIdentifier): void;

  /**
   * Use this method to determine if the Store has an instantiated record associated
   * with an identifier.
   *
   * @param identifier
   * @return {Boolean}
   * @public
   */
  hasRecord(identifier: StableRecordIdentifier): boolean;

  /**
   * Notify subscribers of the NotificationManager that cache state has changed.
   *
   * `attributes` and `relationships` do not require a key, but if one is specified it
   * is assumed to be the name of the attribute or relationship that has been updated.
   *
   * No other namespaces currently expect the `key` argument.
   *
   * @param {StableRecordIdentifier} identifier
   * @param {'attributes' | 'relationships' | 'identity' | 'errors' | 'meta' | 'state'} namespace
   * @param {string|undefined} key
   * @public
   */
  notifyChange(identifier: StableRecordIdentifier, namespace: 'added' | 'removed', key: null): void;
  notifyChange(identifier: StableDocumentIdentifier, namespace: 'added' | 'updated' | 'removed', key: null): void;
  notifyChange(identifier: StableRecordIdentifier, namespace: NotificationType, key: string | null): void;
  notifyChange(
    identifier: StableRecordIdentifier | StableDocumentIdentifier,
    namespace: NotificationType | 'added' | 'removed' | 'updated',
    key: string | null
  ): void;
};
