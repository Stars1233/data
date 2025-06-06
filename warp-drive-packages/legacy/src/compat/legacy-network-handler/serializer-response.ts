import type { Store } from '@warp-drive/core';
import { DEBUG } from '@warp-drive/core/build-config/env';
import { assert } from '@warp-drive/core/build-config/macros';
import type { ModelSchema } from '@warp-drive/core/types';
import type { JsonApiDocument } from '@warp-drive/core/types/spec/json-api-raw';

import type { AdapterPayload } from './minimum-adapter-interface.ts';
import type { MinimumSerializerInterface, RequestType } from './minimum-serializer-interface.ts';

/**
  This is a helper method that validates a JSON API top-level document

  The format of a document is described here:
  http://jsonapi.org/format/#document-top-level

  @internal
*/
function validateDocumentStructure(doc?: AdapterPayload | JsonApiDocument): asserts doc is JsonApiDocument {
  if (DEBUG) {
    const errors: string[] = [];
    if (!doc || typeof doc !== 'object') {
      errors.push('Top level of a JSON API document must be an object');
    } else {
      if (!('data' in doc) && !('errors' in doc) && !('meta' in doc)) {
        errors.push('One or more of the following keys must be present: "data", "errors", "meta".');
      } else {
        if ('data' in doc && 'errors' in doc) {
          errors.push('Top level keys "errors" and "data" cannot both be present in a JSON API document');
        }
      }
      if ('data' in doc) {
        if (!(doc.data === null || Array.isArray(doc.data) || typeof doc.data === 'object')) {
          errors.push('data must be null, an object, or an array');
        }
      }
      if ('meta' in doc) {
        if (typeof doc.meta !== 'object') {
          errors.push('meta must be an object');
        }
      }
      if ('errors' in doc) {
        if (!Array.isArray(doc.errors)) {
          errors.push('errors must be an array');
        }
      }
      if ('links' in doc) {
        if (typeof doc.links !== 'object') {
          errors.push('links must be an object');
        }
      }
      if ('jsonapi' in doc) {
        if (typeof doc.jsonapi !== 'object') {
          errors.push('jsonapi must be an object');
        }
      }
      if ('included' in doc) {
        if (typeof doc.included !== 'object') {
          errors.push('included must be an array');
        }
      }
    }

    assert(
      `Response must be normalized to a valid JSON API document:\n\t* ${errors.join('\n\t* ')}`,
      errors.length === 0
    );
  }
}

export function normalizeResponseHelper(
  serializer: MinimumSerializerInterface | null,
  store: Store,
  modelClass: ModelSchema,
  payload: AdapterPayload,
  id: string | null,
  requestType: RequestType
): JsonApiDocument {
  const normalizedResponse = serializer
    ? serializer.normalizeResponse(store, modelClass, payload, id, requestType)
    : payload;

  validateDocumentStructure(normalizedResponse);

  return normalizedResponse;
}
