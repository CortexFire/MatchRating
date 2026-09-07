import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTestDatabase } from './db-harness.mjs';
import { createPerformanceFixture, FIXTURE_ACTOR, FIXTURE_GROUP } from './fixtures';
import { projectPlayerAnalytics, type AnalyticsFactsPayload } from './reference-analytics-policy';

async function main() {
  const codeRoot = resolve(process.argv[2] ?? '.');
  const load = createRequire(resolve('package.json'));
  const policy = load(resolve(codeRoot, 'src/lib/analytics/analytics-policy.ts'));
  if (typeof policy.projectAggregatedPlayerAnalytics !== 'function') throw new Error('Optimized analytics policy is not implemented in target checkout');
  const reports = [];
  const sizes = process.argv[3] ? [Number(process.argv[3])] : [100,1000,10000];
  for (const count of sizes) {
    const db = await createTestDatabase(codeRoot);
    try {
      await db.exec('begin');
      await db.exec(createPerformanceFixture(count));
      const query = `select public.get_player_analytics_v2('${FIXTURE_GROUP}', '${FIXTURE_ACTOR}') as facts`;
      const start = performance.now();
      const result = await db.query(query);
      const elapsedMs = performance.now()-start;
      const facts = result.rows[0].facts;
      const policyStart = performance.now();
      const model = policy.projectAggregatedPlayerAnalytics(facts);
      const policyMs = performance.now()-policyStart;
      assert.equal(model.status,'ready');
      const saved = JSON.parse(readFileSync(resolve(`output/performance/baseline-${count}-reference.json`),'utf8'));
      const referenceFacts = { ...saved.facts, asOf:model.asOf } as AnalyticsFactsPayload;
      const reference = projectPlayerAnalytics(referenceFacts);
      assert.equal(reference.status,'ready');
      if (reference.status !== 'ready') throw new Error('Reference not ready');
      for (const period of ['all','30d','90d','1y'] as const) {
        for (const field of ['summary','flags','matchups'] as const) {
          assert.deepEqual(model.periods[period][field],reference.periods[period][field],`${count} ${period} ${field}`);
        }
        const ids = model.periods[period].ratingHistoryPointIds as string[];
        assert.ok(ids.length<=200,`${period} sample is bounded`);
        const referencePoints = new Map(reference.periods[period].ratingHistory.map(p=>[p.matchId,p]));
        for(const id of ids) assert.deepEqual(model.historyPoints[id],referencePoints.get(id),`exact sampled point ${id}`);
        const full = reference.periods[period].ratingHistory;
        const bounds = full.length ? [Math.min(...full.map(p=>p.rating-p.performanceSd))-20, Math.max(...full.map(p=>p.rating+p.performanceSd))+20] : [0,1];
        assert.deepEqual(model.periods[period].ratingHistoryBounds,bounds,`${period} full-series bounds`);
        const expected = [...full].reverse();
        const inspected = [];
        let cursorAt: string|null = null;
        let cursorId: string|null = null;
        for (;;) {
          const pageResult = await db.query('select public.get_player_analytics_history_v2($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::bigint,$6::timestamptz,$7::uuid,50) as page', [FIXTURE_GROUP,FIXTURE_ACTOR,period,model.asOf,model.ratingVersion,cursorAt,cursorId]);
          const page = pageResult.rows[0].page;
          assert.ok(page.points.length<=50,'exact page bounded to 50');
          inspected.push(...page.points);
          assert.ok(inspected.length<=expected.length,'pagination does not repeat points');
          if (!page.hasMore) break;
          assert.equal(page.points.length,50,'nonterminal page full');
          const last = page.points.at(-1);
          cursorAt = last.occurredAt;
          cursorId = last.matchId;
        }
        assert.deepEqual(inspected,expected,`${count} ${period} every exact point reachable once`);
      }
      assert.ok(Object.keys(model.historyPoints).length<=800);
      const browserPayloadBytes = Buffer.byteLength(JSON.stringify(model));
      assert.ok(browserPayloadBytes<250000,'bounded initial payload for fixed fixture player count');
      const explain = await db.query(`explain (analyze,buffers,format json) ${query}`);
      reports.push({count,elapsedMs,policyMs,databasePayloadBytes:Buffer.byteLength(JSON.stringify(facts)),browserPayloadBytes,uniquePoints:Object.keys(model.historyPoints).length,parity:'exact summaries/flags/matchups/sampled-points',explain:explain.rows});
      mkdirSync(resolve('output/performance'),{recursive:true});
      writeFileSync(resolve(`output/performance/optimized-${count}-model.json`),JSON.stringify(model));
      console.log(JSON.stringify(reports.at(-1)));
      await db.exec('rollback');
    } finally { await db.close(); }
  }
  writeFileSync(resolve('output/performance/optimized-database.json'),JSON.stringify({engine:'PGlite PostgreSQL18 synthetic; not production latency',reports},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
