import { expect, test } from 'vitest';
import { createPerformanceFixture } from '../scripts/performance/fixtures';

test('generates reproducible multi-group fixtures with corrections and guest memberships', () => {
  const first = createPerformanceFixture(100);
  expect(first).toBe(createPerformanceFixture(100));
  expect(first).toContain('superseded');
  expect(first).toContain('consistency_events');
  expect(first).toContain('Performance fixture 2');
  expect(first).not.toMatch(/\b(?:NaN|undefined|Infinity)\b/);
  expect(() => createPerformanceFixture(0)).toThrow('Fixture size');
});
