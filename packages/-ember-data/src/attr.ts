import { deprecate } from '@ember/debug';

export { attr as default } from '@ember-data/model';

deprecate('Importing from `ember-data/attr` is deprecated. Please import from `@ember-data/model` instead.', false, {
  id: 'ember-data:deprecate-legacy-imports',
  for: 'ember-data',
  until: '6.0',
  since: {
    enabled: '5.2',
    available: '4.13',
  },
});
