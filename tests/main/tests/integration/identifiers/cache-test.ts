import { module, test } from 'qunit';

import { setupTest } from 'ember-qunit';

import type Store from '@ember-data/store';
import { test as testInDebug } from '@ember-data/unpublished-test-infra/test-support/test-in-debug';

module('Integration | Identifiers - cache', function (hooks) {
  setupTest(hooks);

  module('getOrCreateRecordIdentifier()', function () {
    test('creates a new resource identifier if forgetRecordIdentifier() has been called on the existing identifier', function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.getOrCreateRecordIdentifier(runspiredHash);

      cache.forgetRecordIdentifier(identifier);

      const regeneratedIdentifier = cache.getOrCreateRecordIdentifier(runspiredHash);

      assert.notStrictEqual(
        identifier,
        regeneratedIdentifier,
        'a record get a new identifier if identifier get forgotten'
      );
    });

    test('returns the existing identifier when called with an identifier', function (assert) {
      const houseHash = {
        type: 'house',
        id: '1',
        attributes: {
          name: 'Moomin',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.getOrCreateRecordIdentifier(houseHash);

      assert.strictEqual(
        identifier,
        cache.getOrCreateRecordIdentifier(identifier),
        'getOrCreateRecordIdentifier() return identifier'
      );
    });

    test('identifiers are cached by lid and can be looked up by lid', function (assert) {
      const houseHash = {
        type: 'house',
        id: '1',
        attributes: {
          name: 'Moomin',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.getOrCreateRecordIdentifier(houseHash);

      assert.strictEqual(
        identifier,
        cache.getOrCreateRecordIdentifier({ lid: identifier.lid }),
        'getOrCreateRecordIdentifier() return identifier'
      );

      assert.strictEqual(
        identifier,
        cache.getOrCreateRecordIdentifier({ type: 'not house', lid: identifier.lid }),
        'getOrCreateRecordIdentifier() return identifier'
      );
    });
  });

  module('createIdentifierForNewRecord()', function () {
    test('returns new identifier', function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.createIdentifierForNewRecord(runspiredHash);

      assert.strictEqual(identifier.id, '1', 'identifier has id');
      assert.strictEqual(identifier.type, 'person', 'identifier has type');
      assert.ok(identifier.lid, 'identifier has lid');
    });
  });

  module('updateRecordIdentifier()', function () {
    test('returns same identifier', function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.createIdentifierForNewRecord(runspiredHash);

      const mergedIdentifier = cache.updateRecordIdentifier(identifier, { type: 'person', id: '1' });

      assert.strictEqual(mergedIdentifier.id, identifier.id, 'merged identifier has same id');
      assert.strictEqual(mergedIdentifier.type, identifier.type, 'merged identifier has same type');
    });

    test('returns new identifier with different id', function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.createIdentifierForNewRecord(runspiredHash);

      const mergedIdentifier = cache.updateRecordIdentifier(identifier, { type: 'person', id: '2' });

      assert.strictEqual(mergedIdentifier.id, '2', 'merged identifier has new id');
      assert.strictEqual(mergedIdentifier.type, 'person', 'merged identifier has same type');
    });

    testInDebug('cannot create an existing identifier', async function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      cache.createIdentifierForNewRecord(runspiredHash);
      await assert.expectAssertion(() => {
        cache.createIdentifierForNewRecord(runspiredHash);
      }, 'The lid generated for the new record is not unique as it matches an existing identifier');
    });

    test('id is null', function (assert) {
      const runspiredHash = {
        type: 'person',
        id: '1',
        attributes: {
          name: 'runspired',
        },
      };
      const store = this.owner.lookup('service:store') as Store;
      const cache = store.cacheKeyManager;
      const identifier = cache.createIdentifierForNewRecord(runspiredHash);

      const mergedIdentifier = cache.updateRecordIdentifier(identifier, { type: 'person', id: null });

      assert.strictEqual(mergedIdentifier.id, null, 'merged identifier has null id');
      assert.strictEqual(mergedIdentifier.type, identifier.type, 'merged identifier has same type');
    });
  });
});
