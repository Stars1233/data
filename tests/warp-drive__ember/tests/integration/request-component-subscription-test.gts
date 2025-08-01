import { rerender, settled } from '@ember/test-helpers';

import { CacheHandler, Fetch, RequestManager, Store } from '@warp-drive/core';
import {
  instantiateRecord,
  registerDerivations,
  SchemaService,
  teardownRecord,
  withDefaults,
} from '@warp-drive/core/reactive';
import type { Handler, NextFn } from '@warp-drive/core/request';
import { createDeferred } from '@warp-drive/core/request';
import { DefaultCachePolicy } from '@warp-drive/core/store';
import type { CacheCapabilitiesManager } from '@warp-drive/core/types';
import type { ResourceKey } from '@warp-drive/core/types/identifier';
import type { RequestContext } from '@warp-drive/core/types/request';
import type { SingleResourceDataDocument } from '@warp-drive/core/types/spec/document';
import type { Type } from '@warp-drive/core/types/symbols';
import type { Diagnostic } from '@warp-drive/diagnostic/-types';
import type { RenderingTestContext, TestContext } from '@warp-drive/diagnostic/ember';
import { module, setupRenderingTest, test as _test } from '@warp-drive/diagnostic/ember';
import { Request } from '@warp-drive/ember';
import { MockServerHandler } from '@warp-drive/holodeck';
import { GET } from '@warp-drive/holodeck/mock';
import { JSONAPICache } from '@warp-drive/json-api';
import { buildBaseURL } from '@warp-drive/utilities';

type User = {
  id: string;
  name: string;
  [Type]: 'user';
};

class Logger implements Handler {
  assert: Diagnostic;
  deferMode: boolean;
  deferred: ReturnType<typeof createDeferred> | undefined;
  deferredResponse: ReturnType<typeof createDeferred> | undefined;
  deferredRequest: ReturnType<typeof createDeferred>;

  constructor(assert: Diagnostic) {
    this.assert = assert;
    this.deferMode = false;
    this.deferredRequest = createDeferred();
  }

  nextPromise() {
    return this.deferredRequest.promise;
  }

  async release() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!this.deferred) {
      throw new Error('no deferred available to release');
    }
    this.deferred.resolve(this.deferredResponse!.promise);
    await this.deferred.promise;
    this.deferred = undefined;
    this.deferredResponse = undefined;
    await settled();
  }

  async request<T>(context: RequestContext, next: NextFn<T>) {
    if (this.deferMode) {
      if (this.deferred) {
        throw new Error('deferred already exists');
      }
      this.deferred = createDeferred<T>();
      this.deferredResponse = createDeferred<T>();
      this.deferredRequest.resolve(context.request);
      this.deferredRequest = createDeferred();
    }
    this.assert.step(`request: ${context.request.method ?? 'GET'} ${context.request.url}`);
    const result = await next(context.request);

    if (this.deferred) {
      this.deferredResponse!.resolve(result);
      return this.deferred.promise as Promise<T>;
    }

    return result;
  }
}

class TestStore extends Store {
  setupRequestManager(testContext: TestContext, assert: Diagnostic): Logger {
    const logger = new Logger(assert);
    this.requestManager = new RequestManager()
      .use([logger, new MockServerHandler(testContext), Fetch])
      .useCache(CacheHandler);
    return logger;
  }

  lifetimes = new DefaultCachePolicy({
    apiCacheHardExpires: 5000,
    apiCacheSoftExpires: 1000,
  });

  createCache(capabilities: CacheCapabilitiesManager) {
    return new JSONAPICache(capabilities);
  }

  createSchemaService() {
    const schema = new SchemaService();
    registerDerivations(schema);
    schema.registerResource(
      withDefaults({
        type: 'user',
        fields: [{ name: 'name', kind: 'field' }],
      })
    );

    return schema;
  }

  instantiateRecord(identifier: ResourceKey, createRecordArgs: { [key: string]: unknown }): unknown {
    return instantiateRecord(this, identifier, createRecordArgs);
  }

  teardownRecord(record: unknown) {
    teardownRecord(record);
  }
}

// our tests use a rendering test context and add store to it
interface LocalTestContext extends RenderingTestContext {
  store: TestStore;
  logger: Logger;
}
type DiagnosticTest = Parameters<typeof _test<LocalTestContext>>[1];
function test(name: string, callback: DiagnosticTest): void {
  return _test<LocalTestContext>(name, callback);
}

async function mockGETSuccess(context: LocalTestContext, attributes?: { name: string }): Promise<string> {
  const url = buildBaseURL({ resourcePath: 'users/1' });
  await GET(context, 'users/1', () => ({
    data: {
      id: '1',
      type: 'user',
      attributes: Object.assign(
        {
          name: 'Chris Thoburn',
        },
        attributes
      ),
    },
  }));
  return url;
}

module<LocalTestContext>('Integration | <Request /> | Invalidation', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function (assert: Diagnostic) {
    this.owner.register('service:store', TestStore);
    this.store = this.owner.lookup('service:store') as TestStore;
    this.logger = this.store.setupRequestManager(this, assert);
  });

  test('@autorefresh={{true}} refreshes on invalidation events', async function (assert) {
    const url = await mockGETSuccess(this);
    await mockGETSuccess(this, { name: 'James Thoburn' });
    const request = this.store.request<SingleResourceDataDocument<User>>({
      url,
      method: 'GET',
      cacheOptions: { types: ['user'] },
    });

    assert.equal(request.lid?.lid, url, 'lid is set');

    await this.render(
      <template>
        <Request @request={{request}} @autorefresh={{true}} @autorefreshBehavior={{"reload"}}>
          <:content as |result|>{{result.data.name}}</:content>
        </Request>
      </template>
    );
    await request;
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'Chris Thoburn');
    assert.verifySteps([`request: GET ${url}`]);

    // invalidate the cache
    this.store.lifetimes.invalidateRequestsForType('user', this.store);

    await settled();
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'James Thoburn');
    assert.verifySteps([`request: GET ${url}`]);
  });

  test('@autorefresh={{interval}} refreshes on the interval', async function (assert) {
    const url = await mockGETSuccess(this);
    await mockGETSuccess(this, { name: 'Chris Thoburn x2' });
    await mockGETSuccess(this, { name: 'Chris Thoburn x3' });

    this.logger.deferMode = true;
    const request = this.store.request<SingleResourceDataDocument<User>>({
      url,
      method: 'GET',
      cacheOptions: { types: ['user'] },
    });

    assert.equal(request.lid?.lid, url, 'lid is set');

    await this.render(
      <template>
        <Request
          @request={{request}}
          @autorefresh={{"interval"}}
          @autorefreshThreshold={{5}}
          @autorefreshBehavior={{"reload"}}
        >
          <:content as |result|>{{result.data.name}}</:content>
        </Request>
      </template>
    );
    await this.logger.release();
    await request;
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'Chris Thoburn');
    assert.verifySteps([`request: GET ${url}`]);
    await this.logger.nextPromise();
    await this.logger.release();
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'Chris Thoburn x2');
    assert.verifySteps([`request: GET ${url}`]);

    await this.logger.nextPromise();
    await this.logger.release();
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'Chris Thoburn x3');
    assert.verifySteps([`request: GET ${url}`]);
  });

  test('When a request is refreshed the notifications are flushed', async function (assert) {
    const url = await mockGETSuccess(this);
    await mockGETSuccess(this, { name: 'James Thoburn' });
    const request = this.store.request<SingleResourceDataDocument<User>>({
      url,
      method: 'GET',
      cacheOptions: { types: ['user'] },
    });

    assert.equal(request.lid?.lid, url, 'lid is set');

    const outerResult = await request;
    const record = outerResult.content.data;

    await this.render(
      <template>
        {{! intentionally not using the state inside the Request component to ensure "name" was notified }}
        {{record.name}}
        <Request @request={{request}} @autorefresh={{true}} @autorefreshBehavior={{"reload"}}>
          <:content></:content>
        </Request>
      </template>
    );

    assert.equal(this.element.textContent?.trim(), 'Chris Thoburn');
    assert.verifySteps([`request: GET ${url}`]);

    // invalidate the cache
    this.store.lifetimes.invalidateRequestsForType('user', this.store);

    await settled();
    await rerender();

    assert.equal(this.element.textContent?.trim(), 'James Thoburn');
    assert.verifySteps([`request: GET ${url}`]);
  });
});
