// Campaign save/load tests. Run with: node test/campaign.test.js
const assert = require('node:assert/strict');
const Campaign = require('../src/campaign.js');

Campaign.reset();
assert.equal(Campaign.total(), 0);
Campaign.save({ stars: { m1: 3 }, m1: { fuel: 80, stability: 90 } });
Campaign.save({ stars: { m2: 2 }, tutorial: { dock: true } });
Campaign.save({ tutorial: { steer: true } });
const c = Campaign.get();
assert.deepEqual(c.stars, { m1: 3, m2: 2, m3: 0, m4: 0 });
assert.equal(c.m1.fuel, 80); assert.deepEqual(c.tutorial, { dock: true, steer: true });
assert.equal(Campaign.total(), 5);
// A copy: changing what get() returns never changes the saved trip.
c.stars.m4 = 3; assert.equal(Campaign.total(), 5);
// Storage that throws (blocked cookies) still works from memory.
global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
Campaign.save({ stars: { m3: 1 } }); assert.equal(Campaign.get().stars.m3, 1);
Campaign.reset(); assert.equal(Campaign.total(), 0);
console.log('All campaign tests passed.');
