// tests/shutdown.test.js - the soft shutdown, tested with a pretend server and a pretend database.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shutDown } = require('../utils/shutdown');

describe('shutDown', () => {
  it('closes the server first and the database after it', async () => {
    const steps = [];
    const server = {
      close: (callback) => {
        steps.push('server closing');
        setTimeout(() => {
          steps.push('server closed');
          callback();
        }, 10);
      },
    };
    const database = {
      close: async () => {
        steps.push('database closed');
      },
    };

    await shutDown(server, database);
    assert.deepEqual(steps, ['server closing', 'server closed', 'database closed']);
  });

  it('closes the database even if the server has a problem, and then reports the problem', async () => {
    const steps = [];
    const server = {
      close: (callback) => {
        callback(new Error('the server could not close'));
      },
    };
    const database = {
      close: async () => {
        steps.push('database closed');
      },
    };

    await assert.rejects(() => shutDown(server, database), { message: 'the server could not close' });
    assert.deepEqual(steps, ['database closed']);
  });
});