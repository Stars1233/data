import type { RecordIdentifier, StableRecordIdentifier } from '../../../types/identifier.ts';
import type { ObjectValue } from '../../../types/json/raw.ts';
import type { Derivation, HashFn, Transformation } from '../../../types/schema/concepts.ts';
import type {
  ArrayField,
  DerivedField,
  FieldSchema,
  GenericField,
  HashField,
  LegacyAttributeField,
  LegacyRelationshipField,
  ObjectField,
  Schema,
} from '../../../types/schema/fields.ts';

export type AttributesSchema = Record<string, LegacyAttributeField>;
export type RelationshipsSchema = Record<string, LegacyRelationshipField>;

interface ObjectWithStringTypeProperty {
  type: string;
}
/**
 * The SchemaService provides the ability to query for information about the structure
 * of any resource type.
 *
 * Applications can provide any implementation of the SchemaService they please so long
 * as it conforms to this interface.
 *
 * The design of the service means that schema information could be lazily populated,
 * derived-on-demand, or progressively enhanced during the course of an application's runtime.
 * The primary requirement is merely that any information the service needs to correctly
 * respond to an inquest is available by the time it is asked.
 *
 * The `@ember-data/model` package provides an implementation of this service which
 * makes use of your model classes as the source of information to respond to queries
 * about resource schema. While this is useful, this may not be ideal for your application.
 * For instance, Schema information could be sideloaded or pre-flighted for API calls,
 * resulting in no need to bundle and ship potentially large and expensive JSON
 * or large Javascript based Models to pull information from.
 *
 * To register a custom schema implementation, implement the store's `createSchemaService`
 * hook to return an instance of your service.
 *
 * ```ts
 * import Store from '@ember-data/store';
 * import CustomSchemas from './custom-schemas';
 *
 * export default class extends Store {
 *   createSchemaService() {
 *     return new CustomSchemas();
 *   }
 * }
 * ```
 *
 * At runtime, both the `Store` and the `CacheCapabilitiesManager` provide
 * access to this service via the `schema` property.
 *
 * ```ts
 * export default class extends Component {
 *  @service store;
 *
 *  get fields() {
 *    return this.store
 *      .schema
 *      .fields(this.args.dataType);
 *  }
 * }
 * ```
 *
 * @class (Interface) SchemaService
 * @public
 */
export interface SchemaService {
  /**
   * DEPRECATED - use `hasResource` instead
   *
   * Queries whether the SchemaService recognizes `type` as a resource type
   *
   * @public
   * @deprecated
   * @param {String} type
   * @return {Boolean}
   */
  doesTypeExist?(type: string): boolean;

  /**
   * Queries whether the SchemaService recognizes `type` as a resource type
   *
   * @public
   * @param {StableRecordIdentifier|ObjectWithStringTypeProperty} resource
   * @return {Boolean}
   */
  hasResource(resource: ObjectWithStringTypeProperty | StableRecordIdentifier): boolean;

  /**
   * Queries whether the SchemaService recognizes `type` as a resource trait
   *
   * @public
   * @param {String} type
   * @return {Boolean}
   */
  hasTrait(type: string): boolean;

  /**
   * Queries whether the given resource has the given trait
   *
   * @public
   * @param {StableRecordIdentifier|ObjectWithStringTypeProperty} resource
   * @param {String} trait
   * @return {Boolean}
   */
  resourceHasTrait(resource: ObjectWithStringTypeProperty | StableRecordIdentifier, trait: string): boolean;

  /**
   * Queries for the fields of a given resource type or resource identity.
   *
   * Should error if the resource type is not recognized.
   *
   * @public
   * @param {StableRecordIdentifier|ObjectWithStringTypeProperty} resource
   * @return {Map<string, FieldSchema>}
   */
  fields(resource: ObjectWithStringTypeProperty | StableRecordIdentifier): Map<string, FieldSchema>;

  /**
   * Returns the transformation registered with the name provided
   * by `field.type`. Validates that the field is a valid transformable.
   *
   * @public
   * @param {TransformableField|ObjectWithStringTypeProperty} field
   * @return {Transformation}
   */
  transformation(field: GenericField | ObjectField | ArrayField | ObjectWithStringTypeProperty): Transformation;

  /**
   * Returns the hash function registered with the name provided
   * by `field.type`. Validates that the field is a valid HashField.
   *
   * @public
   * @param {HashField|ObjectWithStringTypeProperty} field
   * @return {HashFn}
   */
  hashFn(field: HashField | ObjectWithStringTypeProperty): HashFn;

  /**
   * Returns the derivation registered with the name provided
   * by `field.type`. Validates that the field is a valid DerivedField.
   *
   * @public
   * @param {DerivedField|ObjectWithStringTypeProperty} field
   * @return {Derivation}
   */
  derivation(field: DerivedField | ObjectWithStringTypeProperty): Derivation;

  /**
   * Returns the schema for the provided resource type.
   *
   * @public
   * @param {StableRecordIdentifier|ObjectWithStringTypeProperty} resource
   * @return {ResourceSchema}
   */
  resource(resource: ObjectWithStringTypeProperty | StableRecordIdentifier): Schema;

  /**
   * Enables registration of multiple Schemas at once.
   *
   * This can be useful for either pre-loading schema information
   * or for registering schema information delivered by API calls
   * or other sources just-in-time.
   *
   * @public
   * @param {Schema[]} schemas
   */
  registerResources(schemas: Schema[]): void;

  /**
   * Enables registration of a single Schema representing either
   * a resource in PolarisMode or LegacyMode or an ObjectSchema
   * representing an embedded structure in other schemas.
   *
   * This can be useful for either pre-loading schema information
   * or for registering schema information delivered by API calls
   * or other sources just-in-time.
   *
   * @public
   * @param {Schema} schema
   */
  registerResource(schema: Schema): void;

  /**
   * Enables registration of a transformation.
   *
   * The transformation can later be retrieved by the name
   * attached to it's `[Type]` property.
   *
   * @public
   * @param {Transformation} transform
   */
  registerTransformation(transform: Transformation): void;

  /**
   * Enables registration of a derivation.
   *
   * The derivation can later be retrieved by the name
   * attached to it's `[Type]` property.
   *
   * @public
   * @param {Derivation} derivation
   */
  registerDerivation<R, T, FM extends ObjectValue | null>(derivation: Derivation<R, T, FM>): void;

  /**
   * Enables registration of a hashing function
   *
   * The hashing function can later be retrieved by the name
   * attached to it's `[Type]` property.
   *
   * @public
   * @param {HashFn} hashfn
   */
  registerHashFn(hashFn: HashFn): void;

  /**
   * DEPRECATED - use `fields` instead
   *
   * Returns definitions for all properties of the specified resource
   * that are considered "attributes". Generally these are properties
   * that are not related to book-keeping state on the client and do
   * not represent a linkage to another resource.
   *
   * The return value should be a dictionary of key:value pairs
   * where the `key` is the attribute or property's name and `value`
   * is an object with at least the property `name` which should also
   * match `key`.
   *
   * Optionally, this object may also specify `type`, which should
   * be a string reference to a `transform`, and `options` which
   * should be dictionary in which any key:value pairs are permissable.
   *
   * For instance, when using `@ember-data/model`, the following attribute
   * definition:
   *
   * ```ts
   * class extends Model {
   *   @attr('string', { defaultValue: 'hello' }) greeting;
   *   @attr('date') birthday;
   *   @attr firstName;
   * }
   * ```
   *
   * Would be returned as:
   *
   * ```js
   * {
   *   greeting: { name: 'greeting', type: 'string', options: { defaultValue: 'hello' } },
   *   birthday: { name: 'birthday', type: 'date' },
   *   firstName: { name: 'firstName' }
   * }
   * ```
   *
   * @public
   * @deprecated
   * @param {RecordIdentifier|ObjectWithStringTypeProperty} identifier
   * @return {AttributesSchema}
   */
  attributesDefinitionFor?(identifier: RecordIdentifier | ObjectWithStringTypeProperty): AttributesSchema;

  /**
   * DEPRECATED - use `fields` instead
   *
   * Returns definitions for all properties of the specified resource
   * that are considered "relationships". Generally these are properties
   * that represent a linkage to another resource.
   *
   * The return value should be a dictionary of key:value pairs
   * where the `key` is the relationship or property's name and `value`
   * is an object with at least the following properties:
   *
   * - `name` which should also match the `key` used in the dictionary.
   * - `kind` which should be either `belongsTo` or `hasMany`
   * - `type` which should be the related resource's string "type"
   * - `options` which should be a dictionary allowing any key but with
   *    at least the below keys present.
   *
   * - `options.async` a boolean representing whether data for this relationship is
   *      typically loaded on-demand.
   * - `options.inverse` a string or null representing the field name / key of the
   *       corresponding relationship on the inverse resource.
   *
   * Additionally the following options properties are optional. See [Polymorphic Relationships](https://rfcs.emberjs.com/id/0793-polymporphic-relations-without-inheritance)
   *
   * - `options.polymorphic` a boolean representing whether multiple resource types
   *    can be used to satisfy this relationship.
   * - `options.as` a string representing the abstract type that the concrete side of
   *    a relationship must specify when fulfilling a polymorphic inverse.
   *
   * For example, the following Model using @ember-data/model would generate this relationships
   * definition by default:
   *
   * ```js
   * class User extends Model {
   *   @belongsTo('user', { async: false, inverse: null }) bestFriend;
   *   @hasMany('user', { async: true, inverse: 'friends' }) friends;
   *   @hasMany('pet', { async: false, polymorphic: true, inverse: 'owner' }) pets;
   * }
   * ```
   *
   * Which would be returned as
   *
   * ```js
   * {
   *   bestFriend: {
   *     name: 'bestFriend',
   *     kind: 'belongsTo',
   *     type: 'user',
   *     options: {
   *       async: false,
   *       inverse: null
   *     }
   *   },
   *   friends: {
   *     name: 'friends',
   *     kind: 'hasMany',
   *     type: 'user',
   *     options: {
   *       async: true,
   *       inverse: 'friends'
   *     }
   *   },
   *   pets: {
   *     name: 'pets',
   *     kind: 'hasMany',
   *     type: 'pet',
   *     options: {
   *       async: false,
   *       polymorphic: true,
   *       inverse: 'owner'
   *     }
   *   },
   * }
   * ```
   *
   * @public
   * @deprecated
   * @param {RecordIdentifier|ObjectWithStringTypeProperty} identifier
   * @return {RelationshipsSchema}
   */
  relationshipsDefinitionFor?(identifier: RecordIdentifier | ObjectWithStringTypeProperty): RelationshipsSchema;

  /**
   * Returns all known resource types
   *
   * @public
   * @return {String[]}
   */
  resourceTypes(): Readonly<string[]>;
}
