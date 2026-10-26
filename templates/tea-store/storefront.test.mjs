import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTeas,teas,filterEnabled} from './app.js';
test('caffeine-free preference excludes every caffeinated tea',()=>{const result=filterTeas('caffeine-free');assert.equal(result.length,2);assert.ok(result.every(tea=>tea.caffeine===false));});
test('all teas restores the complete independent collection',()=>{const result=filterTeas('all');assert.deepEqual(result,teas);result.pop();assert.equal(teas.length,4);});
test('tutorial change exposes the filter in the storefront',()=>{assert.equal(filterEnabled,true,'Apply the tutorial caffeine filter change before running this acceptance check.');});
