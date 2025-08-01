import { assert } from '@warp-drive/core/build-config/macros';

import type { Store } from '../../index.ts';
import type { ResourceKey } from '../../types.ts';
import { isResourceSchema } from '../../types/schema/fields.ts';
import { ReactiveResource } from './record.ts';
import type { SchemaService } from './schema.ts';
import { Destroy } from './symbols.ts';

export function instantiateRecord(
  store: Store,
  identifier: ResourceKey,
  createArgs?: Record<string, unknown>
): ReactiveResource {
  const schema = store.schema as unknown as SchemaService;
  const resourceSchema = schema.resource(identifier);
  assert(`Expected a resource schema`, isResourceSchema(resourceSchema));
  const legacy = resourceSchema?.legacy ?? false;
  const editable = legacy;
  const record = new ReactiveResource({
    store,
    resourceKey: identifier,
    modeName: legacy ? 'legacy' : 'polaris',
    legacy: legacy,
    editable: editable,
    path: null,
    field: null,
    value: null,
  });

  if (createArgs && editable) {
    Object.assign(record, createArgs);
  }

  return record;
}

function assertReactiveResource(record: unknown): asserts record is ReactiveResource {
  assert('Expected a ReactiveResource', record && typeof record === 'object' && Destroy in record);
}

export function teardownRecord(record: unknown): void {
  assertReactiveResource(record);
  record[Destroy]();
}
