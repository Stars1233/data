/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { warn } from '@ember/debug';
import Mixin from '@ember/object/mixin';

import { camelize } from '@warp-drive/utilities/string';

/**
  ## Using Embedded Records

  `EmbeddedRecordsMixin` supports serializing embedded records.

  To set up embedded records, include the mixin when extending a serializer,
  then define and configure embedded (model) relationships.

  Note that embedded records will serialize with the serializer for their model instead of the serializer in which they are defined.

  Note also that this mixin does not work with JSONAPISerializer because the JSON:API specification does not describe how to format embedded resources.

  Below is an example of a per-type serializer (`post` type).

  ```js [app/serializers/post.js]
  import RESTSerializer, { EmbeddedRecordsMixin } from '@ember-data/serializer/rest';

  export default class PostSerializer extends RESTSerializer.extend(EmbeddedRecordsMixin) {
    attrs = {
      author: { embedded: 'always' },
      comments: { serialize: 'ids' }
    }
  }
  ```
  Note that this use of `{ embedded: 'always' }` is unrelated to
  the `{ embedded: 'always' }` that is defined as an option on `attr` as part of
  defining a model while working with the `ActiveModelSerializer`.  Nevertheless,
  using `{ embedded: 'always' }` as an option to `attr` is not a valid way to set up
  embedded records.

  The `attrs` option for a resource `{ embedded: 'always' }` is shorthand for:

  ```js
  {
    serialize: 'records',
    deserialize: 'records'
  }
  ```

  ### Configuring Attrs

  A resource's `attrs` option may be set to use `ids`, `records` or false for the
  `serialize`  and `deserialize` settings.

  The `attrs` property can be set on the `ApplicationSerializer` or a per-type
  serializer.

  In the case where embedded JSON is expected while extracting a payload (reading)
  the setting is `deserialize: 'records'`, there is no need to use `ids` when
  extracting as that is the default behaviour without this mixin if you are using
  the vanilla `EmbeddedRecordsMixin`. Likewise, to embed JSON in the payload while
  serializing `serialize: 'records'` is the setting to use. There is an option of
  not embedding JSON in the serialized payload by using `serialize: 'ids'`. If you
  do not want the relationship sent at all, you can use `serialize: false`.


  ### EmbeddedRecordsMixin defaults
  If you do not overwrite `attrs` for a specific relationship, the `EmbeddedRecordsMixin`
  will behave in the following way:

  BelongsTo: `{ serialize: 'id', deserialize: 'id' }`
  HasMany:   `{ serialize: false, deserialize: 'ids' }`

  ### Model Relationships

  Embedded records must have a model defined to be extracted and serialized. Note that
  when defining any relationships on your model such as `belongsTo` and `hasMany`, you
  should not both specify `async: true` and also indicate through the serializer's
  `attrs` attribute that the related model should be embedded for deserialization.
  If a model is declared embedded for deserialization (`embedded: 'always'` or `deserialize: 'records'`),
  then do not use `async: true`.

  To successfully extract and serialize embedded records the model relationships
  must be set up correctly. See the
  [defining relationships](https://guides.emberjs.com/current/models/relationships)
  section of the **Defining Models** guide page.

  Records without an `id` property are not considered embedded records, model
  instances must have an `id` property to be used with Ember Data.

  ### Example JSON payloads, Models and Serializers

  **When customizing a serializer it is important to grok what the customizations
  are. Please read the docs for the methods this mixin provides, in case you need
  to modify it to fit your specific needs.**

  For example, review the docs for each method of this mixin:
  * [normalize](/ember-data/release/classes/EmbeddedRecordsMixin/methods/normalize?anchor=normalize)
  * [serializeBelongsTo](/ember-data/release/classes/EmbeddedRecordsMixin/methods/serializeBelongsTo?anchor=serializeBelongsTo)
  * [serializeHasMany](/ember-data/release/classes/EmbeddedRecordsMixin/methods/serializeHasMany?anchor=serializeHasMany)

  @class EmbeddedRecordsMixin
  @public
*/
export const EmbeddedRecordsMixin: Mixin = Mixin.create({
  /**
    Normalize the record and recursively normalize/extract all the embedded records
    while pushing them into the store as they are encountered

    A payload with an attr configured for embedded records needs to be extracted:

    ```js
    {
      "post": {
        "id": "1"
        "title": "Rails is omakase",
        "comments": [{
          "id": "1",
          "body": "Rails is unagi"
        }, {
          "id": "2",
          "body": "Omakase O_o"
        }]
      }
    }
    ```
    @public
   @param {Model} typeClass
   @param {Object} hash to be normalized
   @param {String} prop the hash has been referenced by
   @return {Object} the normalized hash
  **/
  normalize(typeClass, hash, prop) {
    const normalizedHash = this._super(typeClass, hash, prop);
    return this._extractEmbeddedRecords(this, this.store, typeClass, normalizedHash);
  },

  keyForRelationship(key, typeClass, method) {
    if (
      (method === 'serialize' && this.hasSerializeRecordsOption(key)) ||
      (method === 'deserialize' && this.hasDeserializeRecordsOption(key))
    ) {
      return this.keyForAttribute(key, method);
    } else {
      return this._super(key, typeClass, method) || key;
    }
  },

  /**
    Serialize `belongsTo` relationship when it is configured as an embedded object.

    This example of an author model belongs to a post model:

    ```js
    import Model, { attr, belongsTo } from '@ember-data/model';

    Post = Model.extend({
      title:    attr('string'),
      body:     attr('string'),
      author:   belongsTo('author')
    });

    Author = Model.extend({
      name:     attr('string'),
      post:     belongsTo('post')
    });
    ```

    Use a custom (type) serializer for the post model to configure embedded author

    ```js [app/serializers/post.js]
    import RESTSerializer, { EmbeddedRecordsMixin } from '@ember-data/serializer/rest';

    export default class PostSerializer extends RESTSerializer.extend(EmbeddedRecordsMixin) {
      attrs = {
        author: { embedded: 'always' }
      }
    }
    ```

    A payload with an attribute configured for embedded records can serialize
    the records together under the root attribute's payload:

    ```js
    {
      "post": {
        "id": "1"
        "title": "Rails is omakase",
        "author": {
          "id": "2"
          "name": "dhh"
        }
      }
    }
    ```

    @public
    @param {Snapshot} snapshot
    @param {Object} json
    @param {Object} relationship
  */
  serializeBelongsTo(snapshot, json, relationship) {
    const attr = relationship.name;
    if (this.noSerializeOptionSpecified(attr)) {
      this._super(snapshot, json, relationship);
      return;
    }
    const includeIds = this.hasSerializeIdsOption(attr);
    const includeRecords = this.hasSerializeRecordsOption(attr);
    const embeddedSnapshot = snapshot.belongsTo(attr);
    if (includeIds) {
      const schema = this.store.modelFor(snapshot.modelName);
      let serializedKey = this._getMappedKey(relationship.name, schema);
      if (serializedKey === relationship.name && this.keyForRelationship) {
        serializedKey = this.keyForRelationship(relationship.name, relationship.kind, 'serialize');
      }

      if (!embeddedSnapshot) {
        json[serializedKey] = null;
      } else {
        json[serializedKey] = embeddedSnapshot.id;

        if (relationship.options.polymorphic) {
          this.serializePolymorphicType(snapshot, json, relationship);
        }
      }
    } else if (includeRecords) {
      this._serializeEmbeddedBelongsTo(snapshot, json, relationship);
    }
  },

  _serializeEmbeddedBelongsTo(snapshot, json, relationship) {
    const embeddedSnapshot = snapshot.belongsTo(relationship.name);
    const schema = this.store.modelFor(snapshot.modelName);
    let serializedKey = this._getMappedKey(relationship.name, schema);
    if (serializedKey === relationship.name && this.keyForRelationship) {
      serializedKey = this.keyForRelationship(relationship.name, relationship.kind, 'serialize');
    }

    if (!embeddedSnapshot) {
      json[serializedKey] = null;
    } else {
      json[serializedKey] = embeddedSnapshot.serialize({ includeId: true });
      this.removeEmbeddedForeignKey(snapshot, embeddedSnapshot, relationship, json[serializedKey]);

      if (relationship.options.polymorphic) {
        this.serializePolymorphicType(snapshot, json, relationship);
      }
    }
  },

  /**
    Serializes `hasMany` relationships when it is configured as embedded objects.

    This example of a post model has many comments:

    ```js
    import Model, { attr, belongsTo, hasMany } from '@ember-data/model';

    Post = Model.extend({
      title:    attr('string'),
      body:     attr('string'),
      comments: hasMany('comment')
    });

    Comment = Model.extend({
      body:     attr('string'),
      post:     belongsTo('post')
    });
    ```

    Use a custom (type) serializer for the post model to configure embedded comments

    ```js [app/serializers/post.js]
    import RESTSerializer, { EmbeddedRecordsMixin } from '@ember-data/serializer/rest';

    export default class PostSerializer extends RESTSerializer.extend(EmbeddedRecordsMixin) {
      attrs = {
        comments: { embedded: 'always' }
      }
    }
    ```

    A payload with an attribute configured for embedded records can serialize
    the records together under the root attribute's payload:

    ```js
    {
      "post": {
        "id": "1"
        "title": "Rails is omakase",
        "body": "I want this for my ORM, I want that for my template language..."
        "comments": [{
          "id": "1",
          "body": "Rails is unagi"
        }, {
          "id": "2",
          "body": "Omakase O_o"
        }]
      }
    }
    ```

    The attrs options object can use more specific instruction for extracting and
    serializing. When serializing, an option to embed `ids`, `ids-and-types` or `records` can be set.
    When extracting the only option is `records`.

    So `{ embedded: 'always' }` is shorthand for:
    `{ serialize: 'records', deserialize: 'records' }`

    To embed the `ids` for a related object (using a hasMany relationship):

    ```js [app/serializers/post.js]
    import RESTSerializer, { EmbeddedRecordsMixin } from '@ember-data/serializer/rest';

    export default class PostSerializer extends RESTSerializer.extend(EmbeddedRecordsMixin) {
      attrs = {
        comments: { serialize: 'ids', deserialize: 'records' }
      }
    }
    ```

    ```js
    {
      "post": {
        "id": "1"
        "title": "Rails is omakase",
        "body": "I want this for my ORM, I want that for my template language..."
        "comments": ["1", "2"]
      }
    }
    ```

    To embed the relationship as a collection of objects with `id` and `type` keys, set
    `ids-and-types` for the related object.

    This is particularly useful for polymorphic relationships where records don't share
    the same table and the `id` is not enough information.

    For example having a user that has many pets:

    ```js
    User = Model.extend({
      name: attr('string'),
      pets: hasMany('pet', { polymorphic: true })
    });

    Pet = Model.extend({
      name: attr('string'),
    });

    Cat = Pet.extend({
      // ...
    });

    Parrot = Pet.extend({
      // ...
    });
    ```

    ```js [app/serializers/user.js]
    import RESTSerializer, { EmbeddedRecordsMixin } from '@ember-data/serializer/rest';

    export default class UserSerializer extends RESTSerializer.extend(EmbeddedRecordsMixin) {
      attrs = {
        pets: { serialize: 'ids-and-types', deserialize: 'records' }
      }
    }
    ```

    ```js
    {
      "user": {
        "id": "1"
        "name": "Bertin Osborne",
        "pets": [
          { "id": "1", "type": "Cat" },
          { "id": "1", "type": "Parrot"}
        ]
      }
    }
    ```

    @public
    @param {Snapshot} snapshot
    @param {Object} json
    @param {Object} relationship
  */
  serializeHasMany(snapshot, json, relationship) {
    const attr = relationship.name;
    if (this.noSerializeOptionSpecified(attr)) {
      this._super(snapshot, json, relationship);
      return;
    }

    if (this.hasSerializeIdsOption(attr)) {
      const schema = this.store.modelFor(snapshot.modelName);
      let serializedKey = this._getMappedKey(relationship.name, schema);
      if (serializedKey === relationship.name && this.keyForRelationship) {
        serializedKey = this.keyForRelationship(relationship.name, relationship.kind, 'serialize');
      }

      json[serializedKey] = snapshot.hasMany(attr, { ids: true });
    } else if (this.hasSerializeRecordsOption(attr)) {
      this._serializeEmbeddedHasMany(snapshot, json, relationship);
    } else {
      if (this.hasSerializeIdsAndTypesOption(attr)) {
        this._serializeHasManyAsIdsAndTypes(snapshot, json, relationship);
      }
    }
  },

  /*
    Serializes a hasMany relationship as an array of objects containing only `id` and `type`
    keys.
    This has its use case on polymorphic hasMany relationships where the server is not storing
    all records in the same table using STI, and therefore the `id` is not enough information

    TODO: Make the default in Ember-data 3.0??
  */
  _serializeHasManyAsIdsAndTypes(snapshot, json, relationship) {
    const serializedKey = this.keyForAttribute(relationship.name, 'serialize');
    const hasMany = snapshot.hasMany(relationship.name) || [];

    json[serializedKey] = hasMany.map(function (recordSnapshot) {
      //
      // I'm sure I'm being utterly naive here. Probably id is a configurable property and
      // type too, and the modelName has to be normalized somehow.
      //
      return { id: recordSnapshot.id, type: recordSnapshot.modelName };
    });
  },

  _serializeEmbeddedHasMany(snapshot, json, relationship) {
    const schema = this.store.modelFor(snapshot.modelName);
    let serializedKey = this._getMappedKey(relationship.name, schema);
    if (serializedKey === relationship.name && this.keyForRelationship) {
      serializedKey = this.keyForRelationship(relationship.name, relationship.kind, 'serialize');
    }

    warn(
      `The embedded relationship '${serializedKey}' is undefined for '${snapshot.modelName}' with id '${snapshot.id}'. Please include it in your original payload.`,
      typeof snapshot.hasMany(relationship.name) !== 'undefined',
      { id: 'ds.serializer.embedded-relationship-undefined' }
    );

    json[serializedKey] = this._generateSerializedHasMany(snapshot, relationship);
  },

  /*
    Returns an array of embedded records serialized to JSON
  */
  _generateSerializedHasMany(snapshot, relationship) {
    const hasMany = snapshot.hasMany(relationship.name) || [];
    const ret = new Array(hasMany.length);

    for (let i = 0; i < hasMany.length; i++) {
      const embeddedSnapshot = hasMany[i];
      const embeddedJson = embeddedSnapshot.serialize({ includeId: true });
      this.removeEmbeddedForeignKey(snapshot, embeddedSnapshot, relationship, embeddedJson);
      ret[i] = embeddedJson;
    }

    return ret;
  },

  /**
    When serializing an embedded record, modify the property (in the `JSON` payload)
    that refers to the parent record (foreign key for the relationship).

    Serializing a `belongsTo` relationship removes the property that refers to the
    parent record

    Serializing a `hasMany` relationship does not remove the property that refers to
    the parent record.

    @public
    @param {Snapshot} snapshot
    @param {Snapshot} embeddedSnapshot
    @param {Object} relationship
    @param {Object} json
  */
  removeEmbeddedForeignKey(snapshot, embeddedSnapshot, relationship, json) {
    if (relationship.kind === 'belongsTo') {
      const schema = this.store.modelFor(snapshot.modelName);
      const parentRecord = schema.inverseFor(relationship.name, this.store);
      if (parentRecord) {
        const name = parentRecord.name;
        const embeddedSerializer = this.store.serializerFor(embeddedSnapshot.modelName);
        const parentKey = embeddedSerializer.keyForRelationship(name, parentRecord.kind, 'deserialize');
        if (parentKey) {
          delete json[parentKey];
        }
      }
    } /*else if (relationship.kind === 'hasMany') {
      return;
    }*/
  },

  // checks config for attrs option to embedded (always) - serialize and deserialize
  hasEmbeddedAlwaysOption(attr) {
    const option = this.attrsOption(attr);
    return option && option.embedded === 'always';
  },

  // checks config for attrs option to serialize ids
  hasSerializeRecordsOption(attr) {
    const alwaysEmbed = this.hasEmbeddedAlwaysOption(attr);
    const option = this.attrsOption(attr);
    return alwaysEmbed || (option && option.serialize === 'records');
  },

  // checks config for attrs option to serialize records
  hasSerializeIdsOption(attr) {
    const option = this.attrsOption(attr);
    return option && (option.serialize === 'ids' || option.serialize === 'id');
  },

  // checks config for attrs option to serialize records as objects containing id and types
  hasSerializeIdsAndTypesOption(attr) {
    const option = this.attrsOption(attr);
    return option && (option.serialize === 'ids-and-types' || option.serialize === 'id-and-type');
  },

  // checks config for attrs option to serialize records
  noSerializeOptionSpecified(attr) {
    const option = this.attrsOption(attr);
    return !(option && (option.serialize || option.embedded));
  },

  // checks config for attrs option to deserialize records
  // a defined option object for a resource is treated the same as
  // `deserialize: 'records'`
  hasDeserializeRecordsOption(attr) {
    const alwaysEmbed = this.hasEmbeddedAlwaysOption(attr);
    const option = this.attrsOption(attr);
    return alwaysEmbed || (option && option.deserialize === 'records');
  },

  attrsOption(attr) {
    const attrs = this.attrs;
    return attrs && (attrs[camelize(attr)] || attrs[attr]);
  },

  /**
   @private
  */
  _extractEmbeddedRecords(serializer, store, typeClass, partial) {
    typeClass.eachRelationship((key, relationship) => {
      if (serializer.hasDeserializeRecordsOption(key)) {
        if (relationship.kind === 'hasMany') {
          this._extractEmbeddedHasMany(store, key, partial, relationship);
        }
        if (relationship.kind === 'belongsTo') {
          this._extractEmbeddedBelongsTo(store, key, partial, relationship);
        }
      }
    });
    return partial;
  },

  /**
   @private
  */
  _extractEmbeddedHasMany(store, key, hash, relationshipMeta) {
    const relationshipHash = hash.data?.relationships?.[key]?.data;

    if (!relationshipHash) {
      return;
    }

    const hasMany = new Array(relationshipHash.length);

    for (let i = 0; i < relationshipHash.length; i++) {
      const item = relationshipHash[i];
      const { data, included } = this._normalizeEmbeddedRelationship(store, relationshipMeta, item);
      hash.included = hash.included || [];
      hash.included.push(data);
      if (included) {
        hash.included = hash.included.concat(included);
      }

      hasMany[i] = { id: data.id, type: data.type };
      if (data.lid) {
        hasMany[i].lid = data.lid;
      }
    }

    const relationship = { data: hasMany };
    hash.data.relationships[key] = relationship;
  },

  /**
   @private
  */
  _extractEmbeddedBelongsTo(store, key, hash, relationshipMeta) {
    const relationshipHash = hash.data?.relationships?.[key]?.data;
    if (!relationshipHash) {
      return;
    }

    const { data, included } = this._normalizeEmbeddedRelationship(store, relationshipMeta, relationshipHash);
    hash.included = hash.included || [];
    hash.included.push(data);
    if (included) {
      hash.included = hash.included.concat(included);
    }

    const belongsTo = { id: data.id, type: data.type };
    const relationship = { data: belongsTo };

    if (data.lid) {
      // @ts-expect-error
      belongsTo.lid = data.lid;
    }

    hash.data.relationships[key] = relationship;
  },

  /**
   @private
  */
  _normalizeEmbeddedRelationship(store, relationshipMeta, relationshipHash) {
    let modelName = relationshipMeta.type;
    if (relationshipMeta.options.polymorphic) {
      modelName = relationshipHash.type;
    }
    const modelClass = store.modelFor(modelName);
    const serializer = store.serializerFor(modelName);

    return serializer.normalize(modelClass, relationshipHash, null);
  },
  isEmbeddedRecordsMixin: true,
});
