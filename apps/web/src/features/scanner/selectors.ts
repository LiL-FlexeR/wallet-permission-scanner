import type { PermissionRecord } from '@wps/contracts';

export type Filters = {
  token: string;
  spender: string;
  activity: 'all' | PermissionRecord['activity'];
  risk: 'all' | PermissionRecord['risk']['level'];
};
export const defaultFilters: Filters = {
  token: '',
  spender: '',
  activity: 'all',
  risk: 'all',
};
export type Sort = {
  key: 'risk' | 'token' | 'spender';
  direction: 'asc' | 'desc';
};
const riskOrder = { high: 0, medium: 1, low: 2, none: 3, unknown: 4 };
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function selectRecords(
  records: PermissionRecord[],
  filters: Filters,
  sort: Sort,
) {
  return records
    .filter(
      (p) =>
        (!filters.token ||
          p.token.address.toLowerCase() === filters.token.toLowerCase()) &&
        (!filters.spender ||
          p.spender.address.toLowerCase() === filters.spender.toLowerCase()) &&
        (filters.activity === 'all' || p.activity === filters.activity) &&
        (filters.risk === 'all' || p.risk.level === filters.risk),
    )
    .sort((a, b) => {
      const order =
        sort.key === 'risk'
          ? riskOrder[a.risk.level] - riskOrder[b.risk.level]
          : compare(
              a[sort.key].address.toLowerCase(),
              b[sort.key].address.toLowerCase(),
            );
      return (
        ((sort.direction === 'desc' && sort.key !== 'risk') ||
        (sort.direction === 'asc' && sort.key === 'risk')
          ? -order
          : order) || compare(a.id, b.id)
      );
    });
}
