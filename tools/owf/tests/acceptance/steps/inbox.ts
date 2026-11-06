import { Given, When, Then, type World } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  initialize,
  captureInbox,
  getInbox,
  setInbox,
  listInbox,
  resolveInbox,
  discardInbox,
  createAction,
  getAction,
  listActions,
} from '../../../src/bootstrap/workspaces.js';
import type { InboxItem } from '../../../src/application/inbox/index.js';

interface InboxWorld extends World {
  root: string;
  inboxItem: InboxItem;
  inboxAction: string;
}
Given('an unresolved captured Inbox thought', function (this: InboxWorld) {
  initialize(this.root);
  this.inboxItem = captureInbox(
    this.root,
    'Compare supplier terms',
  ).result.item;
});
When('its text is clarified', function (this: InboxWorld) {
  setInbox(
    this.root,
    this.inboxItem.id,
    'Compare the new terms with our existing contract',
  );
});
Then(
  'its identity and original capture time are unchanged',
  function (this: InboxWorld) {
    const item = getInbox(this.root, this.inboxItem.id).result.item;
    assert.equal(item.id, this.inboxItem.id);
    assert.equal(item.captured_at, this.inboxItem.captured_at);
    assert.equal(item.text, 'Compare the new terms with our existing contract');
  },
);
When(
  'an Action is successfully created from its meaning',
  function (this: InboxWorld) {
    this.inboxAction = createAction(this.root, {
      title: this.inboxItem.text,
    }).result.action.id;
  },
);
Given(
  'one intended result has been saved successfully',
  function (this: InboxWorld) {
    this.inboxAction = createAction(this.root, {
      title: 'Read new terms',
    }).result.action.id;
  },
);
Then(
  'the Inbox Item remains in the current Inbox',
  function (this: InboxWorld) {
    assert.deepEqual(listInbox(this.root).result.items, [this.inboxItem]);
  },
);
When(
  'the caller explicitly resolves the Inbox Item',
  function (this: InboxWorld) {
    resolveInbox(this.root, this.inboxItem.id);
  },
);
When('the caller explicitly discards it', function (this: InboxWorld) {
  discardInbox(this.root, this.inboxItem.id);
});
Then('it is absent from the current Inbox', function (this: InboxWorld) {
  assert.deepEqual(listInbox(this.root).result.items, []);
  assert.throws(() => getInbox(this.root, this.inboxItem.id), {
    code: 'INBOX_NOT_FOUND',
  });
});
When('a later intended operation fails', function (this: InboxWorld) {
  assert.throws(
    () =>
      createAction(this.root, {
        title: 'Compare contract',
        owner: '/_projects/missing/',
      }),
    { code: 'INVALID_OWNER' },
  );
});
Then('the earlier result remains saved', function (this: InboxWorld) {
  assert.equal(
    getAction(this.root, this.inboxAction).result.action.title,
    'Read new terms',
  );
});
Then('the Inbox Item remains available', function (this: InboxWorld) {
  assert.deepEqual(
    getInbox(this.root, this.inboxItem.id).result.item,
    this.inboxItem,
  );
});
Then('no resulting work object is created', function (this: InboxWorld) {
  assert.deepEqual(listActions(this.root).result.actions, []);
});
