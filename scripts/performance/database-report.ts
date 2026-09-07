import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTestDatabase, freezeBenchmarkClock } from './db-harness.mjs';
import { createPerformanceFixture, FIXTURE_ACTOR, FIXTURE_GROUP, FIXTURE_AS_OF } from './fixtures';
import { projectPlayerAnalytics, type AnalyticsFactsPayload } from './reference-analytics-policy';

async function main() {
  const label = process.argv[2] ?? 'baseline';
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid report label');
  const sizes = process.argv[3] ? [Number(process.argv[3])] : [100,1000,10000];
  const reports = [];
  for (const count of sizes) {
    const db = await createTestDatabase(process.cwd());
    try {
      await db.exec('begin');
      await freezeBenchmarkClock(db,FIXTURE_AS_OF);
      await db.exec(createPerformanceFixture(count));
      const query = `select public.get_player_analytics_facts('${FIXTURE_GROUP}', '${FIXTURE_ACTOR}') as facts`;
      const start = performance.now();
      const result = await db.query(query);
      const elapsedMs = performance.now()-start;
      const facts = result.rows[0].facts as AnalyticsFactsPayload;
      const policyStart = performance.now();
      const model = projectPlayerAnalytics(facts);
      const policyMs = performance.now()-policyStart;
      const explain = await db.query(`explain (analyze,buffers,format json) ${query}`);
      reports.push({ count, asOf:facts.asOf, elapsedMs, policyMs, databasePayloadBytes:Buffer.byteLength(JSON.stringify(facts)), browserPayloadBytes:Buffer.byteLength(JSON.stringify(model)), explain:explain.rows });
      mkdirSync(resolve('output/performance'),{recursive:true});
      writeFileSync(resolve(`output/performance/${label}-${count}-reference.json`),JSON.stringify({facts,model}));
      console.log(JSON.stringify(reports.at(-1)));
      await db.exec('rollback');
    } finally { await db.close(); }
  }
  writeFileSync(resolve(`output/performance/${label}-database.json`),JSON.stringify({engine:'PGlite PostgreSQL 18, local synthetic data; timings are not production PostgreSQL 15 latency',reports},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
