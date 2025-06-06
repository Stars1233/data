/**
 *
 *
 *This package provides utilities for working with [ActiveRecord](https://guides.rubyonrails.org/active_record_basics.html#convention-over-configuration-in-active-record) APIs.
 *
 * ## Installation
 *
 * Install using your javascript package manager of choice. For instance with [pnpm](https://pnpm.io/)
 *
 * ::: code-group
 *
 * ```sh [pnpm]
 * pnpm add -E @ember-data/active-record
 * ```
 *
 * ```sh [npm]
 * npm add -E @ember-data/active-record
 * ```
 *
 * ```sh [yarn]
 * yarn add -E @ember-data/active-record
 * ```
 *
 * ```sh [bun]
 * bun add --exact @ember-data/active-record
 * ```
 *
 * :::
 *
 * ## Usage
 *
 * Request builders are functions that produce [Fetch Options](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).
 * They take a few contextual inputs about the request you want to make, abstracting away the gnarlier details.
 *
 * For instance, to construct a request that would fetch a resource from your API:
 *
 * ```ts
 * import { findRecord } from '@ember-data/active-record/request';
 *
 * const options = findRecord('ember-developer', '1', { include: ['pets', 'friends'] });
 * ```
 *
 * This would produce the following request object:
 *
 * ```js
 * {
 *   url: 'https://api.example.com/v1/ember_developers/1?include=friends,pets',
 *   method: 'GET',
 *   headers: <Headers>, // 'Accept': 'application/json;charset=utf-8'
 *   op: 'findRecord';
 *   records: [{ type: 'ember-developer', id: '1' }]
 * }
 * ```
 *
 * Request builder output may be used with either `requestManager.request` or `store.request`.
 *
 * ```ts
 * const data = await store.request(options);
 * ```
 *
 * URLs are stable. The same query will produce the same URL every time, even if the order of keys in
 * the query or values in an array changes.
 *
 * URLs follow the most common ActiveRecord format (underscored pluralized resource types).
 *
 * @module
 */
export { findRecord } from './-private/active-record/find-record';
export { query } from './-private/active-record/query';
export { deleteRecord, createRecord, updateRecord } from './-private/active-record/save-record';
