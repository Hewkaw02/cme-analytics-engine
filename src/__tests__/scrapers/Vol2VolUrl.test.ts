import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVol2VolToolUrl } from '../../scrapers/Vol2VolUrl.js';

describe('Vol2VolUrl', () => {
  it('builds a direct QuikStrike URL without stale wrapper session identifiers', () => {
    const url = buildVol2VolToolUrl({ pid: '40', pf: '6' });

    assert.equal(
      url,
      'https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedV2VExpectedRange&pid=40&pf=6',
    );
    assert.equal(url.includes('insid='), false);
    assert.equal(url.includes('qsid='), false);
  });

  it('includes wrapper session identifiers when the wrapper provides them', () => {
    const url = buildVol2VolToolUrl(
      { pid: '40', pf: '6' },
      { insid: '123', qsid: 'abc-def' },
    );

    assert.equal(
      url,
      'https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?viewitemid=IntegratedV2VExpectedRange&pid=40&pf=6&insid=123&qsid=abc-def',
    );
  });
});
