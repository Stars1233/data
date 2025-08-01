import { settled } from '@ember/test-helpers';

import { module, test } from 'qunit';

import { setupTest } from 'ember-qunit';

import Adapter from '@ember-data/adapter';
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';
import JSONSerializer from '@ember-data/serializer/json';
import JSONAPISerializer from '@ember-data/serializer/json-api';
import testInDebug from '@ember-data/unpublished-test-infra/test-support/test-in-debug';

module('unit/store/adapter-interop - Store working with a Adapter', function (hooks) {
  setupTest(hooks);

  test('Calling Store#find invokes its adapter#find', async function (assert) {
    assert.expect(5);

    const currentStore = this.owner.lookup('service:store');

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.ok(true, 'Adapter#find was called');
        assert.strictEqual(store, currentStore, 'Adapter#find was called with the right store');
        assert.strictEqual(
          type,
          store.modelFor('test'),
          'Adapter#find was called with the type passed into Store#find'
        );
        assert.strictEqual(id, '1', 'Adapter#find was called with the id passed into Store#find');
        assert.strictEqual(snapshot.id, '1', 'Adapter#find was called with the record created from Store#find');

        return Promise.resolve({
          data: {
            id: '1',
            type: 'test',
          },
        });
      },
    });

    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('model:test', Model.extend());

    await currentStore.findRecord('test', '1');
  });

  test('Calling Store#findRecord multiple times coalesces the calls into a adapter#findMany call', async function (assert) {
    assert.expect(2);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.ok(false, 'Adapter#findRecord was not called');
      },
      findMany(store, type, ids, snapshots) {
        assert.ok(true, 'Adapter#findMany was called');
        assert.deepEqual(ids, ['1', '2'], 'Correct ids were passed in to findMany');
        return Promise.resolve({
          data: [
            { id: '1', type: 'test' },
            { id: '2', type: 'test' },
          ],
        });
      },
      coalesceFindRequests: true,
    });

    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('model:test', Model.extend());

    const store = this.owner.lookup('service:store');

    await Promise.all([store.findRecord('test', '1'), store.findRecord('test', '2')]);
  });

  test('Coalesced Store#findRecord requests retain the `include` adapter option in the snapshots passed to adapter#findMany and adapter#findRecord', async function (assert) {
    const includedResourcesForIds = {
      1: 'someResource',
      2: 'differentResource',
      3: 'anotherResource',
    };
    const options = {
      1: { aQuery: 'for 1' },
      2: { bQuery: 'for 2' },
      3: { cQuery: 'for 3' },
    };

    const ApplicationAdapter = Adapter.extend({
      groupRecordsForFindMany(store, snapshots) {
        // this ensures that `findRecord` is also called
        // by grouping for all but 1
        return [snapshots.slice(0, -1), snapshots.slice(-1)];
      },

      findMany(store, type, ids, snapshots) {
        snapshots.forEach((snapshot) => {
          assert.strictEqual(
            snapshot.include,
            includedResourcesForIds[snapshot.id],
            `Snapshot #${snapshot.id} retains the 'include' adapter option in #findMany`
          );
          assert.deepEqual(snapshot.adapterOptions, options[snapshot.id], 'we were passed the right adapterOptions');
        });
        assert.deepEqual(ids, ['1', '2'], 'we were passed the expected ids');
        return Promise.resolve({
          data: snapshots.map(({ id }) => ({ id, type: type.modelName })),
        });
      },

      findRecord(store, type, id, snapshot) {
        assert.strictEqual(
          snapshot.include,
          includedResourcesForIds[snapshot.id],
          `Snapshot #${snapshot.id} retains the 'include' adapter option in #findRecord`
        );
        assert.deepEqual(snapshot.adapterOptions, options[snapshot.id], 'we were passed the right adapterOptions');
        assert.strictEqual(id, '3', 'we were passed the expected id');

        return Promise.resolve({
          data: { id, type: type.modelName },
        });
      },

      coalesceFindRequests: true,
    });

    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('model:test', Model.extend());

    const store = this.owner.lookup('service:store');

    await Promise.all(
      Object.keys(includedResourcesForIds).map((id) =>
        store.findRecord('test', id, { include: includedResourcesForIds[id], adapterOptions: options[id] })
      )
    );
  });

  test('Returning a promise from `findRecord` asynchronously loads data', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        return Promise.resolve({ data: { id: '1', type: 'test', attributes: { name: 'Scumbag Dale' } } });
      },
    });

    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('model:test', Model.extend({ name: attr() }));

    const store = this.owner.lookup('service:store');

    await store.findRecord('test', '1').then((object) => {
      assert.strictEqual(object.name, 'Scumbag Dale', 'the data was pushed');
    });
  });

  test('IDs provided as numbers are coerced to strings', async function (assert) {
    assert.expect(5);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(typeof id, 'string', 'id has been normalized to a string');
        return Promise.resolve({ data: { id, type: 'test', attributes: { name: 'Scumbag Sylvain' } } });
      },
    });

    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('model:test', Model.extend({ name: attr() }));

    const store = this.owner.lookup('service:store');

    await store
      .findRecord('test', 1)
      .then((object) => {
        assert.strictEqual(typeof object.id, 'string', 'id was coerced to a string');
        store.push({
          data: {
            type: 'test',
            id: '2',
            attributes: {
              name: 'Scumbag Sam Saffron',
            },
          },
        });

        return store.findRecord('test', '2');
      })
      .then((object) => {
        assert.ok(object, 'object was found');
        assert.strictEqual(
          typeof object.id,
          'string',
          'id is a string despite being supplied and searched for as a number'
        );
      });
  });

  test('can load data for the same record if it is not dirty', async function (assert) {
    assert.expect(3);

    const Person = Model.extend({
      name: attr('string'),
    });

    const ApplicationAdapter = Adapter.extend({
      shouldBackgroundReloadRecord() {
        return false;
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
        attributes: {
          name: 'Tom Dale',
        },
      },
    });

    await store.findRecord('person', '1').then((tom) => {
      assert.false(tom.hasDirtyAttributes, 'precond - record is not dirty');
      assert.strictEqual(tom.name, 'Tom Dale', 'returns the correct name');

      store.push({
        data: {
          type: 'person',
          id: '1',
          attributes: {
            name: 'Captain Underpants',
          },
        },
      });
      assert.strictEqual(tom.name, 'Captain Underpants', 'updated record with new date');
    });
  });

  test('loadMany takes an optional Object and passes it on to the Adapter', async function (assert) {
    assert.expect(2);

    const passedQuery = { page: 1 };

    const Person = Model.extend({
      name: attr('string'),
    });

    const ApplicationAdapter = Adapter.extend({
      query(store, type, query) {
        assert.strictEqual(type, store.modelFor('person'), 'The type was Person');
        assert.strictEqual(query, passedQuery, 'The query was passed in');
        return Promise.resolve({ data: [] });
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.query('person', passedQuery);
  });

  test('Find with query calls the correct normalizeResponse', async function (assert) {
    const passedQuery = { page: 1 };
    let callCount = 0;

    const Person = Model.extend({
      name: attr('string'),
    });

    const ApplicationAdapter = Adapter.extend({
      query(store, type, query) {
        return Promise.resolve([]);
      },
    });

    const ApplicationSerializer = JSONSerializer.extend({
      normalizeQueryResponse() {
        callCount++;
        return this._super(...arguments);
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', ApplicationSerializer);

    const store = this.owner.lookup('service:store');

    await store.query('person', passedQuery);

    assert.strictEqual(callCount, 1, 'normalizeQueryResponse was called');
  });

  test('peekAll(type) returns a record array of all records of a specific type', async function (assert) {
    const Person = Model.extend({
      name: attr('string'),
    });

    this.owner.register('model:person', Person);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
        attributes: {
          name: 'Tom Dale',
        },
      },
    });

    const results = store.peekAll('person');

    assert.strictEqual(results.length, 1, 'record array should have the original object');
    assert.strictEqual(results.at(0).name, 'Tom Dale', 'record has the correct information');

    store.push({
      data: {
        type: 'person',
        id: '2',
        attributes: {
          name: 'Yehuda Katz',
        },
      },
    });

    assert.strictEqual(results.length, 2, 'record array should have the new object');
    assert.strictEqual(results.at(1).name, 'Yehuda Katz', 'record has the correct information');

    assert.strictEqual(results, store.peekAll('person'), 'subsequent calls to peekAll return the same recordArray)');
  });

  test('a new record of a particular type is created via store.createRecord(type)', async function (assert) {
    const Person = Model.extend({
      name: attr('string'),
    });

    this.owner.register('model:person', Person);

    const person = this.owner.lookup('service:store').createRecord('person');

    assert.true(person.isLoaded, 'A newly created record is loaded');
    assert.true(person.isNew, 'A newly created record is new');
    assert.true(person.hasDirtyAttributes, 'A newly created record is dirty');

    person.name = 'Braaahm Dale';

    assert.strictEqual(person.name, 'Braaahm Dale', 'Even if no hash is supplied, `set` still worked');
  });

  testInDebug(
    "a new record with a specific id can't be created if this id is already used in the store",
    function (assert) {
      const Person = Model.extend({
        name: attr('string'),
      });

      this.owner.register('model:person', Person);

      const store = this.owner.lookup('service:store');

      store.createRecord('person', { id: '5' });

      assert.expectAssertion(() => {
        store.createRecord('person', { id: '5' });
      }, /The id 5 has already been used with another 'person' record./);
    }
  );

  test('an initial data hash can be provided via store.createRecord(type, hash)', function (assert) {
    const Person = Model.extend({
      name: attr('string'),
    });

    this.owner.register('model:person', Person);

    const store = this.owner.lookup('service:store');
    const person = store.createRecord('person', { name: 'Brohuda Katz' });

    assert.true(person.isLoaded, 'A newly created record is loaded');
    assert.true(person.isNew, 'A newly created record is new');
    assert.true(person.hasDirtyAttributes, 'A newly created record is dirty');

    assert.strictEqual(person.name, 'Brohuda Katz', 'The initial data hash is provided');
  });

  test('if an id is supplied in the initial data hash, it can be looked up using `store.find`', async function (assert) {
    assert.expect(1);

    const Person = Model.extend({
      name: attr('string'),
    });

    const ApplicationAdapter = Adapter.extend({
      shouldBackgroundReloadRecord: () => false,
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);

    const store = this.owner.lookup('service:store');

    const person = store.createRecord('person', { id: '1', name: 'Brohuda Katz' });

    await store.findRecord('person', '1').then((again) => {
      assert.strictEqual(person, again, 'the store returns the loaded object');
    });
  });

  test('initial values of attributes can be passed in as the third argument to find', async function (assert) {
    assert.expect(1);

    const TestModel = Model.extend({
      name: attr('string'),
    });

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.attr('name'), 'Test', 'Preloaded attribtue set');
        return { data: { id: '1', type: 'test', attributes: { name: 'Test' } } };
      },
    });

    this.owner.register('model:test', TestModel);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('test', '1', { preload: { name: 'Test' } });
  });

  test('initial values of belongsTo can be passed in as the third argument to find as records', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.belongsTo('friend').attr('name'), 'Tom', 'Preloaded belongsTo set');
        return { data: { id, type: 'person' } };
      },
    });

    const Person = Model.extend({
      name: attr('string'),
      friend: belongsTo('person', { inverse: null, async: true }),
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '2',
        attributes: {
          name: 'Tom',
        },
      },
    });

    const tom = store.peekRecord('person', 2);
    await store.findRecord('person', 1, { preload: { friend: tom } });
  });

  test('initial values of belongsTo can be passed in as the third argument to find as ids', async function (assert) {
    assert.expect(1);

    const Person = Model.extend({
      name: attr('string'),
      friend: belongsTo('person', { async: true, inverse: null }),
    });

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        return { data: { id, type: 'person' } };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('person', '1', { preload: { friend: '2' } }).then(() => {
      return store.peekRecord('person', '1').friend.then((friend) => {
        assert.strictEqual(friend.id, '2', 'Preloaded belongsTo set');
      });
    });
  });

  test('initial values of hasMany can be passed in as the third argument to find as records', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.hasMany('friends')[0].attr('name'), 'Tom', 'Preloaded hasMany set');
        return { data: { id, type: 'person' } };
      },
    });

    const Person = Model.extend({
      name: attr('string'),
      friends: hasMany('person', { inverse: null, async: true }),
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '2',
        attributes: {
          name: 'Tom',
        },
      },
    });

    const tom = store.peekRecord('person', '2');
    await store.findRecord('person', '1', { preload: { friends: [tom] } });
  });

  test('initial values of hasMany can be passed in as the third argument to find as ids', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.hasMany('friends')[0].id, '2', 'Preloaded hasMany set');
        return { data: { id, type: 'person' } };
      },
    });

    const Person = Model.extend({
      name: attr('string'),
      friends: hasMany('person', { async: true, inverse: null }),
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('person', '1', { preload: { friends: ['2'] } });
  });

  test('initial empty values of hasMany can be passed in as the third argument to find as records', async function (assert) {
    assert.expect(1);

    const Person = Model.extend({
      name: attr('string'),
      friends: hasMany('person', { inverse: null, async: true }),
    });

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.hasMany('friends').length, 0, 'Preloaded hasMany set');
        return { data: { id, type: 'person' } };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('person', '1', { preload: { friends: [] } });
  });

  test('initial values of hasMany can be passed in as the third argument to find as ids, v2', async function (assert) {
    assert.expect(1);

    const Person = Model.extend({
      name: attr('string'),
      friends: hasMany('person', { async: true, inverse: null }),
    });

    const ApplicationAdapter = Adapter.extend({
      findRecord(store, type, id, snapshot) {
        assert.strictEqual(snapshot.hasMany('friends').length, 0, 'Preloaded hasMany set');
        return { data: { id, type: 'person' } };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('person', '1', { preload: { friends: [] } });
  });

  test('records should have their ids updated when the adapter returns the id data', async function (assert) {
    assert.expect(2);

    const Person = Model.extend({
      name: attr('string'),
    });

    let idCounter = 1;
    const ApplicationAdapter = Adapter.extend({
      createRecord(store, type, snapshot) {
        return {
          data: {
            id: idCounter++,
            type: 'person',
            attributes: {
              name: snapshot.attr('name'),
            },
          },
        };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    const people = store.peekAll('person');
    const tom = store.createRecord('person', { name: 'Tom Dale' });
    const yehuda = store.createRecord('person', { name: 'Yehuda Katz' });

    await Promise.all([tom.save(), yehuda.save()]).then(() => {
      people.forEach((person, index) => {
        assert.strictEqual(person.id, String(index + 1), `The record's id should be correct.`);
      });
    });
  });

  test('the store calls adapter.findMany according to groupings returned by adapter.groupRecordsForFindMany', async function (assert) {
    assert.expect(3);

    const ApplicationAdapter = Adapter.extend({
      groupRecordsForFindMany(store, snapshots) {
        return [[snapshots[0]], [snapshots[1], snapshots[2]]];
      },

      findRecord(store, type, id, snapshot) {
        assert.strictEqual(id, '10', 'The first group is passed to find');
        return { data: { id, type: 'test' } };
      },

      findMany(store, type, ids, snapshots) {
        const records = ids.map((id) => ({ id, type: 'test' }));

        assert.deepEqual(ids, ['20', '21'], 'The second group is passed to findMany');

        return { data: records };
      },
    });

    this.owner.register('model:test', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    const identifiers = [
      store.cacheKeyManager.getOrCreateRecordIdentifier({ type: 'test', id: '10' }),
      store.cacheKeyManager.getOrCreateRecordIdentifier({ type: 'test', id: '20' }),
      store.cacheKeyManager.getOrCreateRecordIdentifier({ type: 'test', id: '21' }),
    ];

    const result = await Promise.all(identifiers.map((id) => store.findRecord(id)));

    const ids = result.map((x) => x.id);
    assert.deepEqual(ids, ['10', '20', '21'], 'The promise fulfills with the identifiers');
  });

  test('the promise returned by `findRecord`, when it resolves, does not depend on the promises returned to other calls to `findRecord` that are in the same run loop, but different groups', async function (assert) {
    assert.expect(2);

    let davidResolved = false;

    const ApplicationAdapter = Adapter.extend({
      groupRecordsForFindMany(store, snapshots) {
        return [[snapshots[0]], [snapshots[1]]];
      },

      findRecord(store, type, id, snapshot) {
        const record = { id, type: 'test' };

        return new Promise(function (resolve, reject) {
          if (id === 'igor') {
            resolve({ data: record });
          } else {
            setTimeout(function () {
              davidResolved = true;
              resolve({ data: record });
            }, 1);
          }
        });
      },
    });

    this.owner.register('model:test', Model.extend());
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('adapter:application', ApplicationAdapter);

    const store = this.owner.lookup('service:store');

    const david = store.findRecord('test', 'david');
    const igor = store.findRecord('test', 'igor');
    const wait = [];

    wait.push(
      igor.then(() => {
        assert.false(davidResolved, 'Igor did not need to wait for David');
      })
    );

    wait.push(
      david.then(() => {
        assert.true(davidResolved, 'David resolved');
      })
    );

    await Promise.all(wait);
  });

  test('the promise returned by `findRecord`, when it rejects, does not depend on the promises returned to other calls to `findRecord` that are in the same run loop, but different groups', async function (assert) {
    assert.expect(2);

    let davidResolved = false;

    const ApplicationAdapter = Adapter.extend({
      groupRecordsForFindMany(store, snapshots) {
        return [[snapshots[0]], [snapshots[1]]];
      },

      findRecord(store, type, id, snapshot) {
        const record = { id, type: 'test' };

        return new Promise((resolve, reject) => {
          if (id === 'igor') {
            reject({ data: record });
          } else {
            setTimeout(() => {
              davidResolved = true;
              resolve({ data: record });
            }, 5);
          }
        });
      },
    });

    this.owner.register('model:test', Model.extend());
    this.owner.register('serializer:application', class extends JSONAPISerializer {});
    this.owner.register('adapter:application', ApplicationAdapter);

    const store = this.owner.lookup('service:store');

    const david = store.findRecord('test', 'david');
    const igor = store.findRecord('test', 'igor');
    const wait = [];

    wait.push(
      igor.catch(() => {
        assert.false(davidResolved, 'Igor did not need to wait for David');
      })
    );

    wait.push(
      david.then(() => {
        assert.true(davidResolved, 'David resolved');
      })
    );

    await Promise.all(wait);
  });

  testInDebug(
    'store.findRecord reject records that were not found, even when those requests were coalesced with records that were found',
    async function (assert) {
      assert.expect(2);

      const ApplicationAdapter = Adapter.extend({
        findMany(store, type, ids, snapshots) {
          const records = ids.map((id) => ({ id, type: 'test' }));
          return { data: [records[0]] };
        },
      });

      this.owner.register('model:test', Model.extend());
      this.owner.register('adapter:application', ApplicationAdapter);
      this.owner.register('serializer:application', class extends JSONAPISerializer {});

      const store = this.owner.lookup('service:store');

      await assert.expectWarning(async () => {
        const david = store.findRecord('test', 'david');
        const igor = store.findRecord('test', 'igor');

        try {
          await Promise.all([david, igor]);
        } catch (e) {
          assert.strictEqual(
            e.message,
            `Expected: '<test:igor>' to be present in the adapter provided payload, but it was not found.`,
            'we erred'
          );
        }
      }, /expected to find records with the following ids/);
    }
  );

  testInDebug('store.findRecord warns when records are missing', async function (assert) {
    assert.expect(3);
    const ApplicationAdapter = Adapter.extend({
      findMany(store, type, ids, snapshots) {
        const records = ids.map((id) => ({ id, type: 'test' })).filter(({ id }) => id === 'david');

        return { data: [records[0]] };
      },
    });

    this.owner.register('model:test', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    let igorDidReject = true;

    await assert.expectWarning(
      async () => {
        const wait = [];
        wait.push(store.findRecord('test', 'david'));
        wait.push(
          store.findRecord('test', 'igor').catch((e) => {
            igorDidReject = true;
            assert.strictEqual(
              e.message,
              `Expected: '<test:igor>' to be present in the adapter provided payload, but it was not found.`
            );
          })
        );

        await Promise.all(wait);
      },
      { id: 'ds.store.missing-records-from-adapter' }
    );

    assert.ok(
      igorDidReject,
      'expected rejection that <test:igor> could not be found in the payload, but no such rejection occured'
    );
  });

  test('store should not call shouldReloadRecord when the record is not in the store', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      shouldReloadRecord(store, type, id, snapshot) {
        assert.ok(false, 'shouldReloadRecord should not be called when the record is not loaded');
        return false;
      },
      findRecord() {
        assert.ok(true, 'find is always called when the record is not in the store');
        return { data: { id: '1', type: 'person' } };
      },
    });

    this.owner.register('model:person', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findRecord('person', '1');
  });

  test('store should not reload record when shouldReloadRecord returns false', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      shouldReloadRecord(store, type, id, snapshot) {
        assert.ok(true, 'shouldReloadRecord should be called when the record is in the store');
        return false;
      },
      shouldBackgroundReloadRecord() {
        return false;
      },
      findRecord() {
        assert.ok(false, 'find should not be called when shouldReloadRecord returns false');
      },
    });

    this.owner.register('model:person', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
      },
    });

    await store.findRecord('person', 1);
  });

  test('store should reload record when shouldReloadRecord returns true', async function (assert) {
    assert.expect(3);

    const ApplicationAdapter = Adapter.extend({
      shouldReloadRecord(store, type, id, snapshot) {
        assert.ok(true, 'shouldReloadRecord should be called when the record is in the store');
        return true;
      },
      findRecord() {
        assert.ok(true, 'find should not be called when shouldReloadRecord returns false');
        return { data: { id: '1', type: 'person', attributes: { name: 'Tom' } } };
      },
    });

    this.owner.register('model:person', Model.extend({ name: attr() }));
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
      },
    });

    await store.findRecord('person', 1).then((record) => {
      assert.strictEqual(record.name, 'Tom');
    });
  });

  test('store should not call shouldBackgroundReloadRecord when the store is already loading the record', async function (assert) {
    assert.expect(2);

    const Person = Model.extend({
      name: attr(),
    });

    const ApplicationAdapter = Adapter.extend({
      shouldReloadRecord(store, type, id, snapshot) {
        return true;
      },
      shouldBackgroundReloadRecord(store, type, id, snapshot) {
        assert.ok(false, 'shouldBackgroundReloadRecord is not called when shouldReloadRecord returns true');
      },
      findRecord() {
        assert.ok(true, 'find should be called');
        return { data: { id: '1', type: 'person', attributes: { name: 'Tom' } } };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
      },
    });

    await store.findRecord('person', 1).then((record) => {
      assert.strictEqual(record.name, 'Tom');
    });
  });

  test('store should not reload a record when `shouldBackgroundReloadRecord` is false', async function (assert) {
    assert.expect(2);

    const ApplicationAdapter = Adapter.extend({
      shouldBackgroundReloadRecord(store, type, id, snapshot) {
        assert.ok(true, 'shouldBackgroundReloadRecord is called when record is loaded form the cache');
        return false;
      },
      findRecord() {
        assert.ok(false, 'find should not be called');
        return { data: { id: '1', type: 'person', attributes: { name: 'Tom' } } };
      },
    });

    this.owner.register('model:person', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({
      data: {
        type: 'person',
        id: '1',
      },
    });

    await store.findRecord('person', '1').then((record) => {
      assert.strictEqual(record.name, undefined);
    });
  });

  test('store should reload the record in the background when `shouldBackgroundReloadRecord` is true', async function (assert) {
    assert.expect(4);

    class ApplicationAdapter extends Adapter {
      shouldBackgroundReloadRecord(store, type, id, snapshot) {
        assert.ok(true, 'shouldBackgroundReloadRecord is called when record is loaded from the cache');
        return true;
      }
      async findRecord() {
        await new Promise((r) => setTimeout(r, 1));
        assert.ok(true, 'adapter.findRecord should be called once for the background request');
        return Promise.resolve({ data: { id: '1', type: 'person', attributes: { name: 'Tom' } } });
      }
    }

    this.owner.register(
      'model:person',
      class extends Model {
        @attr name;
      }
    );
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    const record = store.push({
      data: {
        type: 'person',
        id: '1',
      },
    });

    await store.findRecord('person', '1');
    assert.strictEqual(record.name, undefined, 'Name is undefined after initial find');
    await store._getAllPending();
    assert.strictEqual(store.peekRecord('person', '1').name, 'Tom', 'Name is correct after background reload');
  });

  test('store should not reload record array when shouldReloadAll returns false', async function (assert) {
    assert.expect(1);

    const ApplicationAdapter = Adapter.extend({
      shouldReloadAll(store, snapshot) {
        assert.ok(true, 'shouldReloadAll should be called when the record is in the store');
        return false;
      },
      shouldBackgroundReloadAll(store, snapshot) {
        return false;
      },
      findAll() {
        assert.ok(false, 'findAll should not be called when shouldReloadAll returns false');
      },
    });

    this.owner.register('model:person', class extends Model {});
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findAll('person');
  });

  test('store should reload all records when shouldReloadAll returns true', async function (assert) {
    assert.expect(3);

    class Person extends Model {
      @attr name;
    }

    const ApplicationAdapter = Adapter.extend({
      shouldReloadAll(store, type, id, snapshot) {
        assert.ok(true, 'shouldReloadAll should be called when the record is in the store');
        return true;
      },
      findAll() {
        assert.ok(true, 'findAll should be called when shouldReloadAll returns true');
        return { data: [{ id: '1', type: 'person', attributes: { name: 'Tom' } }] };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findAll('person').then((records) => {
      assert.strictEqual(records.at(0).name, 'Tom');
    });
  });

  test('store should not call shouldBackgroundReloadAll when the store is already loading all records', async function (assert) {
    assert.expect(2);

    const Person = Model.extend({
      name: attr(),
    });

    const ApplicationAdapter = Adapter.extend({
      shouldReloadAll(store, type, id, snapshot) {
        return true;
      },
      shouldBackgroundReloadAll(store, type, id, snapshot) {
        assert.ok(false, 'shouldBackgroundReloadRecord is not called when shouldReloadRecord returns true');
      },
      findAll() {
        assert.ok(true, 'find should be called');
        return { data: [{ id: '1', type: 'person', attributes: { name: 'Tom' } }] };
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findAll('person').then((records) => {
      assert.strictEqual(records[0].name, 'Tom');
    });
  });

  test('store should not reload all records when `shouldBackgroundReloadAll` is false', async function (assert) {
    assert.expect(3);

    const ApplicationAdapter = Adapter.extend({
      shouldReloadAll(store, type, id, snapshot) {
        assert.ok(true, 'shouldReloadAll is called when record is loaded form the cache');
        return false;
      },
      shouldBackgroundReloadAll(store, type, id, snapshot) {
        assert.ok(true, 'shouldBackgroundReloadAll is called when record is loaded form the cache');
        return false;
      },
      findAll() {
        assert.ok(false, 'findAll should not be called');
        return { data: [{ id: '1', type: 'person', attributes: { name: 'Tom' } }] };
      },
    });

    this.owner.register('model:person', Model.extend());
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    await store.findAll('person').then((records) => {
      assert.strictEqual(records.at(0), undefined);
    });
  });

  test('store should reload all records in the background when `shouldBackgroundReloadAll` is true', async function (assert) {
    assert.expect(5);

    const Person = Model.extend({
      name: attr(),
    });

    const ApplicationAdapter = Adapter.extend({
      shouldReloadAll() {
        assert.ok(true, 'shouldReloadAll is called');
        return false;
      },
      shouldBackgroundReloadAll(store, snapshot) {
        assert.ok(true, 'shouldBackgroundReloadAll is called when record is loaded form the cache');
        return true;
      },
      findAll() {
        assert.ok(true, 'findAll should be called');
        return new Promise((resolve) => setTimeout(resolve, 1)).then(() => {
          return {
            data: [{ id: '1', type: 'person', attributes: { name: 'Tom' } }],
          };
        });
      },
    });

    this.owner.register('model:person', Person);
    this.owner.register('adapter:application', ApplicationAdapter);
    this.owner.register('serializer:application', class extends JSONAPISerializer {});

    const store = this.owner.lookup('service:store');

    store.push({ data: [{ id: '1', type: 'person', attributes: { name: 'John' } }] });

    const records = await store.findAll('person');

    assert.strictEqual(records.at(0).name, 'John', 'on initial load name is stale');

    await settled();
    assert.strictEqual(store.peekRecord('person', 1).name, 'Tom', 'after background reload name is loaded');
  });
});
