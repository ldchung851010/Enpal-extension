import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewLedgerRepository } from '../../storage/review-ledger-repository.js';

test('readAll maps headers to rows without writing review state', async () => {
  let writes = 0;
  const sheets = {
    async getValues() {
      return [
        ['ID', 'Review Item', 'Skill', 'Eligible Again'],
        ['R-1', 'Past tense endings', 'Speaking', '3']
      ];
    },
    async updateValues() {
      writes += 1;
    },
    async batchUpdate() {
      writes += 1;
    }
  };

  const repo = createReviewLedgerRepository({
    sheets,
    spreadsheetId: 'review'
  });

  assert.deepEqual(await repo.readAll(), [{
    ID: 'R-1',
    'Review Item': 'Past tense endings',
    Skill: 'Speaking',
    'Eligible Again': '3'
  }]);
  assert.equal(writes, 0);
});
