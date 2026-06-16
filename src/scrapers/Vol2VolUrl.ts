export interface Vol2VolProductParams {
  pid: string;
  pf: string;
}

export interface Vol2VolSessionParams {
  insid: string;
  qsid: string;
}

export const VOL2VOL_WRAPPER_URL =
  'https://www.cmegroup.com/tools-information/quikstrike/vol2vol-expected-range.html';

export function buildVol2VolToolUrl(
  product: Vol2VolProductParams,
  session?: Vol2VolSessionParams,
): string {
  const params = new URLSearchParams({
    viewitemid: 'IntegratedV2VExpectedRange',
    pid: product.pid,
    pf: product.pf,
  });

  if (session) {
    params.set('insid', session.insid);
    params.set('qsid', session.qsid);
  }

  return `https://cmegroup-tools.quikstrike.net/User/QuikStrikeView.aspx?${params.toString()}`;
}
