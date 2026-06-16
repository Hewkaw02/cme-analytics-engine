import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Scheduler } from '../scheduler.js';

describe('Scheduler job definitions', () => {
  it('runs GC intraday every 3 minutes around the clock using Thai scheduler time', () => {
    const scheduler = new Scheduler({} as never);
    const jobs = scheduler.getJobs();
    const gcIntraday = jobs.find((job) => job.name === 'intraday_1m_gc');

    assert.ok(gcIntraday);
    assert.equal(gcIntraday.expression, '*/3 * * * *');
    assert.equal(gcIntraday.timezone, 'Asia/Bangkok');
  });

  it('runs Vol2Vol every 15 minutes around the clock using Thai scheduler time', () => {
    const scheduler = new Scheduler({} as never);
    const jobs = scheduler.getJobs();
    const vol2vol = jobs.find((job) => job.name === 'vol2vol_intraday');

    assert.ok(vol2vol);
    assert.equal(vol2vol.expression, '*/15 * * * *');
    assert.equal(vol2vol.timezone, 'Asia/Bangkok');
  });
});
