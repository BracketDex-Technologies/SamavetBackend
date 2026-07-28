import { slugify } from './slugify';

describe('slugify', () => {
  it('normalizes user labels into stable short keys', () => {
    expect(slugify('  Donor GSTIN / Shop No.  ')).toBe('donor-gstin-shop-no');
  });

  it('keeps generated values bounded for database keys', () => {
    expect(slugify('A'.repeat(120))).toHaveLength(80);
  });
});
