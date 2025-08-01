/**
 * # Deprecations
 *
 * This guide is intended to help you understand both how to address an active
 * deprecation and how to eliminate the code that supports the deprecation once
 * it has been resolved.
 *
 * Eliminating the associated code reduces the size of your application, often opts
 * applications into more performant fast-paths, and ensures your application does
 * not revert to using the deprecated behavior in the future.
 *
 * ## Active Deprecation IDs
 *
 * - {@link DEPRECATE_NON_STRICT_TYPES | ember-data:deprecate-non-strict-types}
 * - {@link DEPRECATE_NON_STRICT_ID | ember-data:deprecate-non-strict-id}
 * - {@link DEPRECATE_LEGACY_IMPORTS | ember-data:deprecate-legacy-imports}
 * - {@link DEPRECATE_NON_UNIQUE_PAYLOADS | ember-data:deprecate-non-unique-collection-payloads}
 * - {@link DEPRECATE_RELATIONSHIP_REMOTE_UPDATE_CLEARING_LOCAL_STATE | ember-data:deprecate-relationship-remote-update-clearing-local-state}
 * - {@link DEPRECATE_MANY_ARRAY_DUPLICATES | ember-data:deprecate-many-array-duplicates}
 * - {@link DEPRECATE_STORE_EXTENDS_EMBER_OBJECT | ember-data:deprecate-store-extends-ember-object}
 * - {@link ENABLE_LEGACY_SCHEMA_SERVICE | ember-data:schema-service-updates}
 * - {@link DEPRECATE_EMBER_INFLECTOR | warp-drive.ember-inflector}
 * - {@link DEPRECATE_TRACKING_PACKAGE | warp-drive:deprecate-tracking-package}
 *
 * ## Removing Code for Deprecated Features
 *
 * ***Warp*Drive** enables applications to opt-in to fully eliminating the code
 * for a deprecated feature once the application has taken the necessary steps to
 * ensure that it no longer requires the use of the code which triggers the deprecation.
 *
 * Each deprecation ID is associated to a deprecation flag which is used to instrument
 * the library for build-time removal of the deprecated code. Some flags have multiple
 * deprecation IDs associated to them, in which case to remove the deprecated code all
 * of the deprecation IDs must be resolved.
 *
 *
 * There are two modes for opting into deprecated code removal:
 *
 * - by version
 * - by deprecation flag
 *
 * If your app has resolved all deprecations present in a given version,
 * you may specify that version as your "compatWith" version. This will
 * remove the code for all deprecations that were introduced in or before
 * that version.
 *
 * ::: code-group
 *
 * ```ts [ember-cli-build.js]
 * setConfig(app, __dirname, {
 *   compatWith: '5.0', // [!code highlight]
 * });
 * ```
 *
 * ```ts [babel.config.mjs]
 * setConfig(context, {
 *   compatWith: '5.0', // [!code highlight]
 * });
 * ```
 *
 * :::
 *
 * For instance, if a deprecation was introduced in 5.3, and the app specifies
 * 5.2 as its minimum version compatibility, any deprecations introduced in or
 * before 5.2 will be removed, but any deprecations introduced in 5.3 will remain.
 *
 * You may also specify that specific deprecations are resolved. These approaches
 * may be used together.
 *
 * ::: code-group
 *
 * ```ts [ember-cli-build.js]
 * setConfig(app, __dirname, {
 *  deprecations: {
 *    DEPRECATE_NON_STRICT_TYPES: false, // [!code highlight]
 *    DEPRECATE_NON_STRICT_ID: false, // [!code highlight]
 *  }
 * });
 * ```
 *
 * ```ts [babel.config.mjs]
 * setConfig(context, {
 *   deprecations: {
 *     DEPRECATE_NON_STRICT_TYPES: false, // [!code highlight]
 *     DEPRECATE_NON_STRICT_ID: false, // [!code highlight]
 *   }
 * });
 * ```
 *
 * :::
 *
 *
 * ::: info 💡 Report Bugs if You Find Them
 * ***Warp*Drive** does not test against permutations of deprecations
 * being stripped, our tests run against "all deprecated code included"
 * and "all deprecated code removed". Unspecified behavior may sometimes
 * occur when removing code for only specific deprecations.
 *
 * If this happens, we'd like to know 💜
 * :::
 *
 * @module
 */

/** @internal */
export const DEPRECATE_CATCH_ALL: boolean = true;

/**
 * <Badge type="danger" text="no-id-assigned" />
 *
 * This is a planned deprecation which will trigger when observer or computed
 * chains are used to watch for changes on any WarpDrive LiveArray, CollectionRecordArray,
 * ManyArray or PromiseManyArray.
 *
 * Support for these chains is currently guarded by the deprecation flag
 * listed here, enabling removal of the behavior if desired.
 *
 * The instrumentation was added in 5.0 but the version number
 * is set to 7.0 as we do not want to strip support without
 * adding a deprecation message.
 *
 * Once we've added the deprecation message, we will
 * update this version number to the proper version.
 *
 * @since 5.0
 * @until 8.0
 * @public
 */
export const DEPRECATE_COMPUTED_CHAINS: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-non-strict-types" />
 *
 * Currently, ***Warp*Drive** expects that the `type` property associated with
 * a resource follows several conventions.
 *
 * - The `type` property must be a non-empty string
 * - The `type` property must be singular
 * - The `type` property must be dasherized
 *
 * We are deprecating support for types that do not match this pattern
 * in order to unlock future improvements in which we can support `type`
 * being any string of your choosing.
 *
 * The goal is that in the future, you will be able to use any string
 * so long as it matches what your configured cache, identifier generation,
 * and schemas expect.
 *
 * E.G. It will matter not that your string is in a specific format like
 * singular, dasherized, etc. so long as everywhere you refer to the type
 * you use the same string.
 *
 * If using @warp-drive/legacy/model, there will always be a restriction that the
 * `type` must match the path on disk where the model is defined.
 *
 * e.g. `app/models/foo/bar-bem.js` must have a type of `foo/bar-bem`
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_NON_STRICT_TYPES: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-non-strict-id" />
 *
 * Currently, WarpDrive expects that the `id` property associated with
 * a resource is a string.
 *
 * However, for legacy support in many locations we would accept a number
 * which would then immediately be coerced into a string.
 *
 * We are deprecating this legacy support for numeric IDs.
 *
 * The goal is that in the future, you will be able to use any ID format
 * so long as everywhere you refer to the ID you use the same format.
 *
 * However, for identifiers we will always use string IDs and so any
 * custom identifier configuration should provide a string ID.
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_NON_STRICT_ID: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-legacy-imports" />
 *
 * Deprecates when importing from `ember-data/*` instead of `@ember-data/*`
 * in order to prepare for the eventual removal of the legacy `ember-data/*`
 *
 * All imports from `ember-data/*` should be updated to `@ember-data/*`
 * except for `ember-data/store`. When you are using `ember-data` (as opposed to
 * installing the indivudal packages) you should import from `ember-data/store`
 * instead of `@ember-data/store` in order to receive the appropriate configuration
 * of defaults.
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_LEGACY_IMPORTS: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-non-unique-collection-payloads" />
 *
 * Deprecates when the data for a hasMany relationship contains
 * duplicate identifiers.
 *
 * Previously, relationships would silently de-dupe the data
 * when received, but this behavior is being removed in favor
 * of erroring if the same related record is included multiple
 * times.
 *
 * For instance, in JSON:API the below relationship data would
 * be considered invalid:
 *
 * ```json
 * {
 *  "data": {
 *   "type": "article",
 *    "id": "1",
 *    "relationships": {
 *      "comments": {
 *        "data": [
 *          { "type": "comment", "id": "1" },
 *          { "type": "comment", "id": "2" },
 *          { "type": "comment", "id": "1" } // duplicate
 *        ]
 *     }
 *  }
 * }
 * ```
 *
 * To resolve this deprecation, either update your server to
 * not include duplicate data, or implement normalization logic
 * in either a request handler or serializer which removes
 * duplicate data from relationship payloads.
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_NON_UNIQUE_PAYLOADS: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-relationship-remote-update-clearing-local-state" />
 *
 * Deprecates when a relationship is updated remotely and the local state
 * is cleared of all changes except for "new" records.
 *
 * Instead, any records not present in the new payload will be considered
 * "removed" while any records present in the new payload will be considered "added".
 *
 * This allows us to "commit" local additions and removals, preserving any additions
 * or removals that are not yet reflected in the remote state.
 *
 * For instance, given the following initial state:
 *
 * remote: A, B, C
 * local: add D, E
 *        remove B, C
 * => A, D, E
 *
 *
 * If after an update, the remote state is now A, B, D, F then the new state will be
 *
 * remote: A, B, D, F
 * local: add E
 *        remove B
 * => A, D, E, F
 *
 * Under the old behavior the updated local state would instead have been
 * => A, B, D, F
 *
 * Similarly, if a belongsTo remote State was A while its local state was B,
 * then under the old behavior if the remote state changed to C, the local state
 * would be updated to C. Under the new behavior, the local state would remain B.
 *
 * If the remote state was A while its local state was `null`, then under the old
 * behavior if the remote state changed to C, the local state would be updated to C.
 * Under the new behavior, the local state would remain `null`.
 *
 * Thus the new correct mental model is that the state of the relationship at any point
 * in time is whatever the most recent remote state is, plus any local additions or removals
 * you have made that have not yet been reflected by the remote state.
 *
 * > Note: The old behavior extended to modifying the inverse of a relationship. So if
 * > you had local state not reflected in the new remote state, inverses would be notified
 * > and their state reverted as well when "resetting" the relationship.
 * > Under the new behavior, since the local state is preserved the inverses will also
 * > not be reverted.
 *
 * ### Resolving this deprecation
 *
 * Resolving this deprecation can be done individually for each relationship
 * or globally for all relationships.
 *
 * To resolve it globally, set the `DEPRECATE_RELATIONSHIP_REMOTE_UPDATE_CLEARING_LOCAL_STATE`
 * to `false` in ember-cli-build.js
 *
 * ```js
 * const { setConfig } = await import('@warp-drive/build-config');
 *
 * let app = new EmberApp(defaults, {});
 *
 * setConfig(app, __dirname, {
 *   deprecations: {
 *     // set to false to strip the deprecated code (thereby opting into the new behavior)
 *     DEPRECATE_RELATIONSHIP_REMOTE_UPDATE_CLEARING_LOCAL_STATE: false
 *   }
 * });
 * ```
 *
 * To resolve this deprecation on an individual relationship, adjust the `options` passed to
 * the relationship. For relationships with inverses, both sides MUST be migrated to the new
 * behavior at the same time.
 *
 * ```js
 * class Person extends Model {
 *  @hasMany('person', {
 *    async: false,
 *    inverse: null,
 *    resetOnRemoteUpdate: false
 *  }) children;
 *
 *  @belongsTo('person', {
 *    async: false,
 *    inverse: null,
 *    resetOnRemoteUpdate: false
 *  }) parent;
 * }
 * ```
 *
 * > Note: false is the only valid value here, all other values (including missing)
 * > will be treated as true, where `true` is the legacy behavior that is now deprecated.
 *
 * Once you have migrated all relationships, you can remove the the resetOnRemoteUpdate
 * option and set the deprecation flag to false in ember-cli-build.
 *
 * ### What if I don't want the new behavior?
 *
 * WarpDrive's philosophy is to not make assumptions about your application. Where possible
 * we seek out "100%" solutions – solutions that work for all use cases - and where that is
 * not possible we default to "90%" solutions – solutions that work for the vast majority of use
 * cases. In the case of "90%" solutions we look for primitives that allow you to resolve the
 * 10% case in your application. If no such primitives exist, we provide an escape hatch that
 * ensures you can build the behavior you need without adopting the cost of the default solution.
 *
 * In this case, the old behavior was a "40%" solution. The inability for an application developer
 * to determine what changes were made locally, and thus what changes should be preserved, made
 * it impossible to build certain features easily, or in some cases at all. The proliferation of
 * feature requests, bug reports (from folks surprised by the prior behavior) and addon attempts
 * in this space are all evidence of this.
 *
 * We believe the new behavior is a "90%" solution. It works for the vast majority of use cases,
 * often without noticeable changes to existing application behavior, and provides primitives that
 * allow you to build the behavior you need for the remaining 10%.
 *
 * The great news is that this behavior defaults to trusting your API similar to the old behavior.
 * If your API is correct, you will not need to make any changes to your application to adopt
 * the new behavior.
 *
 * This means the 10% cases are those where you can't trust your API to provide the correct
 * information. In these cases, because you now have cheap access to a diff of the relationship
 * state, there are a few options that weren't available before:
 *
 * - you can adjust returned API payloads to contain the expected changes that it doesn't include
 * - you can modify local state by adding or removing records on the HasMany record array to remove
 *   any local changes that were not returned by the API.
 * - you can use `<Cache>.mutate(mutation)` to directly modify the local cache state of the relationship
 *   to match the expected state.
 *
 * What this version (5.3) does not yet provide is a way to directly modify the cache's remote state
 * for the relationship via public APIs other than via the broader action of upserting a response via
 * `<Cache>.put(document)`. However, such an API was sketched in the Cache 2.1 RFC
 * `<Cache>.patch(operation)` and is likely to be added in a future 5.x release of WarpDrive.
 *
 * This version (5.3) also does not yet provide a way to directly modify the graph (a general purpose
 * subset of cache behaviors specific to relationships) via public APIs. However, during the
 * 5.x release series we will be working on finalizing the Graph API and making it public.
 *
 * If none of these options work for you, you can always opt-out more broadly by implementing
 * a custom Cache with the relationship behaviors you need.
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_RELATIONSHIP_REMOTE_UPDATE_CLEARING_LOCAL_STATE: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-many-array-duplicates" />
 *
 * When the flag is `true` (default), adding duplicate records to a `ManyArray`
 * is deprecated in non-production environments. In production environments,
 * duplicate records added to a `ManyArray` will be deduped and no error will
 * be thrown.
 *
 * When the flag is `false`, an error will be thrown when duplicates are added.
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_MANY_ARRAY_DUPLICATES: boolean = true;

/**
 * <Badge type="warning" text="ember-data:deprecate-store-extends-ember-object" />
 *
 * When the flag is `true` (default), the Store class will extend from `@ember/object`.
 * When the flag is `false` or `ember-source` is not present, the Store will not extend
 * from EmberObject.

 * @since 5.4
 * @until 6.0
 * @public
 */
export const DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: boolean = true;

/**
 * <Badge type="warning" text="ember-data:schema-service-updates" />
 *
 * When the flag is `true` (default), the legacy schema
 * service features will be enabled on the store and
 * the service, and deprecations will be thrown when
 * they are used.
 *
 * Deprecated features include:
 *
 * - `Store.registerSchema` method is deprecated in favor of the `Store.createSchemaService` hook
 * - `Store.registerSchemaDefinitionService` method is deprecated in favor of the `Store.createSchemaService` hook
 * - `Store.getSchemaDefinitionService` method is deprecated in favor of `Store.schema` property
 * - `SchemaService.doesTypeExist` method is deprecated in favor of the `SchemaService.hasResource` method
 * - `SchemaService.attributesDefinitionFor` method is deprecated in favor of the `SchemaService.fields` method
 * - `SchemaService.relationshipsDefinitionFor` method is deprecated in favor of the `SchemaService.fields` method
 *
 * @since 5.4
 * @until 6.0
 * @public
 */
export const ENABLE_LEGACY_SCHEMA_SERVICE: boolean = true;

/**
 * <Badge type="warning" text=" warp-drive.ember-inflector" />
 *
 * Deprecates the use of ember-inflector for pluralization and singularization in favor
 * of the `@ember-data/request-utils` package.
 *
 * Rule configuration methods (singular, plural, uncountable, irregular) and
 * usage methods (singularize, pluralize) are are available as imports from
 * `@ember-data/request-utils/string`
 *
 * Notable differences with ember-inflector:
 * - there cannot be multiple inflector instances with separate rules
 * - pluralization does not support a count argument
 * - string caches now default to 10k entries instead of 1k, and this
 *   size is now configurable. Additionally, the cache is now a LRU cache
 *   instead of a first-N cache.
 *
 * This deprecation can be resolved by removing usage of ember-inflector or by using
 * both ember-inflector and @ember-data/request-utils in parallel and updating your
 * EmberData/WarpDrive build config to mark the deprecation as resolved
 * in ember-cli-build
 *
 * ```js
 * setConfig(app, __dirname, { deprecations: { DEPRECATE_EMBER_INFLECTOR: false }});
 * ```
 *
 * @since 5.3
 * @until 6.0
 * @public
 */
export const DEPRECATE_EMBER_INFLECTOR: boolean = true;

/**
 * <Badge type="warning" text="warp-drive:deprecate-tracking-package" />
 *
 * Deprecates the use of the @ember-data/tracking package which
 * historically provided bindings into Ember's reactivity system.
 *
 * This package is no longer needed as the configuration is now
 * provided by the @warp-drive/ember package.
 *
 * This deprecation can be resolved by removing the
 * @ember-data/tracking package from your project and ensuring
 * that your app.js file has the following import:
 *
 * ```js
 * import '@warp-drive/ember/install';
 * ```
 *
 * Once this import is present, you can remove the deprecation
 * by setting the deprecation to `false` in your build config:
 *
 * ```js
 * // inside of ember-cli-build.js
 *
 * const { setConfig } = await import('@warp-drive/build-config');
 *
 * setConfig(app, __dirname, {
 *   deprecations: {
 *     DEPRECATE_TRACKING_PACKAGE: false
 *   }
 * });
 * ```
 *
 * @since 5.5
 * @until 6.0
 * @public
 */
export const DEPRECATE_TRACKING_PACKAGE: boolean = true;

/**
 * <Badge type="warning" text="warp-drive:deprecate-legacy-request-methods" />
 *
 * Deprecates all the non request-manager mechanisms of making requests.
 *
 * FIXME link the big guide
 *
 * @since 5.6
 * @until 6.0
 * @public
 */
export const ENABLE_LEGACY_REQUEST_METHODS: boolean = true;

/**
 * This is a special flag that can be used to opt-in early to receiving deprecations introduced in 6.x
 * which have had their infra backported to 5.x versions of ***Warp*Drive**.
 *
 * When this flag is not present or set to `true`, the deprecations from the 6.x branch
 * will not print their messages and the deprecation cannot be resolved.
 *
 * When this flag is present and set to `false`, the deprecations from the 6.x branch will
 * print and can be resolved.
 *
 * @since 5.3
 * @until 7.0
 * @public
 */
export const DISABLE_7X_DEPRECATIONS: boolean = true;
