import type { StoreRequestContext } from '@warp-drive/core';
import { assert } from '@warp-drive/core/build-config/macros';
import type { PersistedResourceKey } from '@warp-drive/core/types/identifier';
import type { RequestInfo, ResponseInfo, StructuredDocument } from '@warp-drive/core/types/request';
import type { ResourceDataDocument, ResourceDocument } from '@warp-drive/core/types/spec/document';
import type { ExistingResourceObject } from '@warp-drive/core/types/spec/json-api-raw';

export const WARP_DRIVE_STORAGE_FILE_NAME = 'warp-drive_document-storage';
export const WARP_DRIVE_STORAGE_VERSION = 1;

export type DocumentStorageOptions = {
  /**
   * The scope of the storage. This is used to enable multiple distinct
   * storage areas within the same origin.
   *
   * One use case for this is to have a separate storage area for each
   * user credential. So for instance, in applications that allow a single
   * user to have multiple accounts, each account can have its own storage!
   */
  scope: string;
  /**
   * When set to true, if other instances of the storage are created with
   * the same scope, they will not share the same in-memory cache and BroadcastChannel.
   *
   * This is mostly useful for testing purposes to replicate the behavior of
   * multiple tabs or workers.
   */
  isolated: boolean;
};
/**
 * DocumentStorage is specifically designed around WarpDrive Cache and Request concepts.
 *
 * CacheFileDocument is a StructuredDocument (request response) whose `content` is
 * the ResourceDocument returned by inserting the request into a Store's Cache.
 */
type CacheFileDocument = StructuredDocument<ResourceDocument>;
/**
 * A CacheDocument is a reconstructed request response that rehydrates ResourceDocument
 * with the associated resources based on their identifiers.
 */
type CacheDocument = StructuredDocument<ResourceDocument<ExistingResourceObject>>;
type CacheResourceEntry = [string, ExistingResourceObject];
type CacheFile = {
  documents: [string, CacheFileDocument][];
  resources: CacheResourceEntry[];
};
type DocumentIdentifier = { lid: string };

type MemCache = {
  documents: Map<string, CacheFileDocument>;
  resources: Map<string, ExistingResourceObject>;
};

class InternalDocumentStorage {
  declare readonly options: DocumentStorageOptions;
  declare _fileHandle: Promise<FileSystemFileHandle>;
  declare _channel: BroadcastChannel;
  declare _invalidated: boolean;
  declare _lastModified: number;
  declare _cache: MemCache | null;
  declare _filePromise: Promise<MemCache> | null;

  constructor(options: DocumentStorageOptions) {
    this.options = options;

    this._lastModified = 0;
    this._invalidated = true;
    this._fileHandle = this._open(options.scope);
    this._channel = Object.assign(new BroadcastChannel(options.scope), {
      onmessage: this._onMessage.bind(this),
    });
  }

  _onMessage(_event: MessageEvent): void {
    this._invalidated = true;
  }

  async _open(scope: string): Promise<FileSystemFileHandle> {
    const directoryHandle = await navigator.storage.getDirectory();
    const fileHandle = await directoryHandle.getFileHandle(scope, { create: true });
    return fileHandle;
  }

  async _read(): Promise<MemCache> {
    if (this._filePromise) {
      return this._filePromise;
    }

    if (this._invalidated) {
      const updateFile = async () => {
        const fileHandle = await this._fileHandle;
        const file = await fileHandle.getFile();

        const lastModified = file.lastModified;
        if (lastModified === this._lastModified && this._cache) {
          return this._cache;
        }

        const contents = await file.text();
        const cache = contents ? (JSON.parse(contents) as CacheFile) : ({ documents: [], resources: [] } as CacheFile);

        const documents = new Map(cache.documents);
        const resources = new Map(cache.resources);

        const cacheMap = { documents, resources };
        this._cache = cacheMap;
        this._invalidated = false;
        this._lastModified = lastModified;
        return cacheMap;
      };
      this._filePromise = updateFile();
      await this._filePromise;
      this._filePromise = null;
    }

    return this._cache!;
  }

  async _patch(
    documentKey: string,
    document: CacheFileDocument,
    updatedResources: Map<string, ExistingResourceObject>
  ): Promise<void> {
    const fileHandle = await this._fileHandle;
    // secure a lock before getting latest state
    const writable = await fileHandle.createWritable();

    const cache = await this._read();
    cache.documents.set(documentKey, document);
    updatedResources.forEach((resource, key) => {
      cache.resources.set(key, resource);
    });

    const documents = [...cache.documents.entries()];
    const resources = [...cache.resources.entries()];
    const cacheFile: CacheFile = {
      documents,
      resources,
    };

    await writable.write(JSON.stringify(cacheFile));
    await writable.close();
    this._channel.postMessage({ type: 'patch', key: documentKey, resources: [...updatedResources.keys()] });
  }

  async getDocument(key: DocumentIdentifier): Promise<CacheDocument | null> {
    const cache = await this._read();
    // clone the document to avoid leaking the internal cache
    const document = safeDocumentHydrate(cache.documents.get(key.lid));

    if (!document) {
      return null;
    }

    // expand the document with the resources
    if (document.content) {
      if (docHasData(document.content)) {
        let data: ExistingResourceObject | ExistingResourceObject[] | null = null;
        if (Array.isArray(document.content.data)) {
          data = document.content.data.map((resourceIdentifier) => {
            const resource = cache.resources.get(resourceIdentifier.lid);
            if (!resource) {
              throw new Error(`Resource not found for ${resourceIdentifier.lid}`);
            }

            // clone the resource to avoid leaking the internal cache
            return structuredClone(resource);
          });
        } else if (document.content.data) {
          const resource = cache.resources.get(document.content.data.lid);
          if (!resource) {
            throw new Error(`Resource not found for ${document.content.data.lid}`);
          }

          // clone the resource to avoid leaking the internal cache
          data = structuredClone(resource);
        }

        if (document.content.included) {
          const included = document.content.included.map((resourceIdentifier) => {
            const resource = cache.resources.get(resourceIdentifier.lid);
            if (!resource) {
              throw new Error(`Resource not found for ${resourceIdentifier.lid}`);
            }

            // clone the resource to avoid leaking the internal cache
            return structuredClone(resource);
          });
          document.content.included = included as PersistedResourceKey[];
        }

        document.content.data = data as unknown as ResourceDataDocument['data'];
      }
    }

    return document as CacheDocument;
  }

  async putDocument(
    document: CacheFileDocument,
    resourceCollector: (resourceIdentifier: PersistedResourceKey) => ExistingResourceObject
  ): Promise<void> {
    const resources = new Map<string, ExistingResourceObject>();

    if (!document.content) {
      throw new Error(`Document content is missing, only finalized documents can be stored`);
    }

    if (!document.content.lid) {
      throw new Error(`Document content is missing a lid, only documents with a cache-key can be stored`);
    }

    if (docHasData(document.content)) {
      this._getResources(document.content, resourceCollector, resources);
    }

    await this._patch(document.content.lid, safeDocumentSerialize(document), resources);
  }

  _getResources(
    document: ResourceDataDocument,
    resourceCollector: (resourceIdentifier: PersistedResourceKey) => ExistingResourceObject,
    resources: Map<string, ExistingResourceObject> = new Map<string, ExistingResourceObject>()
  ): Map<string, ExistingResourceObject> {
    if (Array.isArray(document.data)) {
      document.data.forEach((resourceIdentifier) => {
        const resource = resourceCollector(resourceIdentifier);
        resources.set(resourceIdentifier.lid, structuredClone(resource));
      });
    } else if (document.data) {
      const resource = resourceCollector(document.data);
      resources.set(document.data.lid, structuredClone(resource));
    }

    if (document.included) {
      document.included.forEach((resourceIdentifier) => {
        const resource = resourceCollector(resourceIdentifier);
        resources.set(resourceIdentifier.lid, structuredClone(resource));
      });
    }

    return resources;
  }

  async putResources(
    document: ResourceDataDocument,
    resourceCollector: (resourceIdentifier: PersistedResourceKey) => ExistingResourceObject
  ): Promise<void> {
    const fileHandle = await this._fileHandle;
    // secure a lock before getting latest state
    const writable = await fileHandle.createWritable();

    const cache = await this._read();
    const updatedResources = this._getResources(document, resourceCollector);

    updatedResources.forEach((resource, key) => {
      cache.resources.set(key, resource);
    });

    const documents = [...cache.documents.entries()];
    const resources = [...cache.resources.entries()];
    const cacheFile: CacheFile = {
      documents,
      resources,
    };

    await writable.write(JSON.stringify(cacheFile));
    await writable.close();
    this._channel.postMessage({ type: 'patch', key: null, resources: [...updatedResources.keys()] });
  }

  async clear(reset?: boolean): Promise<void> {
    const fileHandle = await this._fileHandle;
    const writable = await fileHandle.createWritable();
    await writable.write('');
    await writable.close();

    this._invalidated = true;
    this._lastModified = 0;
    this._cache = null;
    this._filePromise = null;
    this._channel.postMessage({ type: 'clear' });

    if (!reset) {
      this._channel.close();
      this._channel = null as unknown as BroadcastChannel;

      if (!this.options.isolated) {
        Storages.delete(this.options.scope);
      }
    }
  }
}

function safeDocumentSerialize<T>(document: T): T {
  assert(`Expected to receive a document`, document && typeof document === 'object');
  const doc = document as unknown as {
    request?: StoreRequestContext['request'];
    response?: Response;
    content?: unknown;
  };
  const newDoc: { request?: unknown; response?: unknown; content?: unknown } = {};
  if ('request' in doc) {
    newDoc.request = prepareRequest(doc.request!);
  }
  if ('response' in doc) {
    newDoc.response = prepareResponse(doc.response!);
  }

  if ('content' in doc) {
    newDoc.content = structuredClone(doc.content);
  }

  return newDoc as T;
}

function prepareRequest(request: StoreRequestContext['request']): RequestInfo {
  const { signal, headers } = request;
  const requestCopy = Object.assign({}, request) as RequestInfo;

  delete requestCopy.store;

  if (signal instanceof AbortSignal) {
    delete requestCopy.signal;
  }

  if (headers instanceof Headers) {
    requestCopy.headers = Array.from(headers as unknown as Iterable<[string, string][]>) as unknown as Headers;
  }

  return requestCopy;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function prepareResponse(response: Response | ResponseInfo | null) {
  if (!response) return null;

  const clone: Partial<Mutable<Response>> = {};

  if (response.headers) {
    clone.headers = Array.from(response.headers as unknown as Iterable<[string, string][]>) as unknown as Headers;
  }

  clone.ok = response.ok;
  clone.redirected = response.redirected;
  clone.status = response.status;
  clone.statusText = response.statusText;
  clone.type = response.type;
  clone.url = response.url;

  return clone;
}

function safeDocumentHydrate<T>(document: T): T {
  assert(`Expected to receive a document`, document && typeof document === 'object');
  const doc = document as unknown as {
    request?: Request | StoreRequestContext['request'];
    response?: Response;
    content?: unknown;
  };
  const newDoc: { request?: StoreRequestContext['request'] | Request; response?: Response; content?: unknown } = {};

  if ('request' in doc) {
    const headers = new Headers(doc.request!.headers);
    const req = Object.assign({}, doc.request, { headers });
    newDoc.request = new Request(doc.request!.url ?? '', req);
  }

  if ('response' in doc) {
    const headers = new Headers(doc.response!.headers);
    const resp = Object.assign({}, doc.response, { headers });
    newDoc.response = new Response(null, resp);
  }

  if ('content' in doc) {
    newDoc.content = structuredClone(doc.content);
  }

  return newDoc as T;
}

function docHasData<T>(doc: ResourceDocument<T>): doc is ResourceDataDocument<T> {
  return 'data' in doc;
}

const Storages = new Map<string, WeakRef<InternalDocumentStorage>>();

/**
 * DocumentStorage is a wrapper around the StorageManager API that provides
 * a simple interface for reading and updating documents and requests.
 *
 * Some goals for this experiment:
 *
 * - optimize for storing requests/documents
 * - optimize for storing resources
 * - optimize for looking up resources associated to a document
 * - optimize for notifying cross-tab when data is updated
 *
 * optional features:
 *
 * - support for offline mode
 * - ?? support for relationship based cache traversal
 * - a way to index records by type + another field (e.g updatedAt/createAt/name)
 *   such that simple queries can be done without having to scan all records
 */
export class DocumentStorage {
  declare readonly _storage: InternalDocumentStorage;

  constructor(options: Partial<DocumentStorageOptions> = {}) {
    options.isolated = options.isolated ?? false;
    options.scope = options.scope ?? 'default';

    const fileName = `${WARP_DRIVE_STORAGE_FILE_NAME}@version_${WARP_DRIVE_STORAGE_VERSION}:${options.scope}`;
    if (!options.isolated && Storages.has(fileName)) {
      const storage = Storages.get(fileName);
      if (storage) {
        this._storage = storage.deref()!;
        return;
      }
    }

    const storage = new InternalDocumentStorage({ scope: fileName, isolated: options.isolated });
    this._storage = storage;
    if (!options.isolated) {
      Storages.set(fileName, new WeakRef(storage));
    }
  }

  getDocument(key: DocumentIdentifier): Promise<CacheDocument | null> {
    return this._storage.getDocument(key);
  }

  putDocument(
    document: CacheFileDocument,
    resourceCollector: (resourceIdentifier: PersistedResourceKey) => ExistingResourceObject
  ): Promise<void> {
    return this._storage.putDocument(document, resourceCollector);
  }

  putResources(
    document: ResourceDataDocument,
    resourceCollector: (resourceIdentifier: PersistedResourceKey) => ExistingResourceObject
  ): Promise<void> {
    return this._storage.putResources(document, resourceCollector);
  }

  clear(reset?: boolean): Promise<void> {
    return this._storage.clear(reset);
  }
}
