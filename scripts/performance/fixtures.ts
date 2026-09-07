import { rebuildGroupRatingsFromMatches, type HistoricalMatch } from '../../src/lib/ratings/glicko2';

export const FIXTURE_AS_OF = '2026-09-07T12:00:00.000Z';
export const fixtureId = (kind: number, value: number) => `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
export const FIXTURE_ACTOR = fixtureId(1, 1);
export const FIXTURE_GROUP = fixtureId(2, 1);
const sqlValue = (value: unknown): string => value === null ? 'null' : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);

function insert(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  return `insert into public.${table} (${columns.join(',')}) values\n${rows.map(row => `(${columns.map(key => sqlValue(row[key])).join(',')})`).join(',\n')};`;
}

/** Deterministic, isolated data. Caller owns BEGIN/ROLLBACK; no remote execution here. */
export function createPerformanceFixture(matchCount: number): string {
  if (![100, 1000, 10000].includes(matchCount)) throw new Error('Fixture size must be 100, 1000 or 10000');
  const players = Array.from({ length: 12 }, (_, i) => fixtureId(1, i + 1));
  const groupIds = [FIXTURE_GROUP, fixtureId(2, 2)];
  const statements = [
    insert('profiles', players.map((id, i) => ({ id, display_name: `Fixture Player ${String(i+1).padStart(2,'0')}`, first_name: 'Fixture', last_name: String(i+1), is_guest: i >= 9, active_until: '2099-01-01T00:00:00Z' }))),
    insert('groups', groupIds.map((id, i) => ({ id, owner_user_id: FIXTURE_ACTOR, name: `Performance fixture ${i+1}`, rating_input_version: 1, rating_applied_version: 1, analytics_applied_version: 1 }))),
    insert('group_memberships', groupIds.flatMap(group_id => players.map((user_id, i) => ({ group_id, user_id, role: i === 0 ? 'owner' : 'member', status: 'active' })))),
  ];
  for (const [groupIndex, groupId] of groupIds.entries()) {
    const count = groupIndex === 0 ? matchCount : 10;
    const matches: HistoricalMatch[] = Array.from({ length: count }, (_, i) => {
      const index = i + 1 + groupIndex * 100000;
      const doubles = i % 3 !== 0;
      const opponent = 1 + (i % 9);
      const partner = 1 + ((i + 3) % 9);
      let other = 1 + ((i + 6) % 9);
      if (other === opponent || other === partner) other = 10;
      const won = i % 7 < 4;
      return {
        id: fixtureId(3, index), revisionId: fixtureId(4, index),
        submittedAt: new Date(Date.parse(FIXTURE_AS_OF) - (count - 1 - Math.floor(i/2)*2) * (400*86400000/count)).toISOString(),
        format: doubles ? 'doubles' : 'singles',
        teamAUserIds: doubles ? [players[0], players[partner]] : [players[0]],
        teamBUserIds: doubles ? [players[opponent], players[other]] : [players[opponent]],
        games: [{ gameId: fixtureId(5,index), gameNumber:1, teamAScore: won ? 21 : 17, teamBScore: won ? 17 : 21, winnerTeam: won ? 'A' : 'B' }],
      };
    });
    const projection = rebuildGroupRatingsFromMatches(matches);
    statements.push(insert('matches', matches.map(m => ({ id:m.id, group_id:groupId, created_by_user_id:FIXTURE_ACTOR, status:'confirmed', submitted_at:m.submittedAt, review_started_at:m.submittedAt }))));
    const revisions = matches.map((m,i) => ({ id:m.revisionId, match_id:m.id, version:i%10===0?2:1, submitted_by_user_id:FIXTURE_ACTOR, format:m.format, status:'active' }));
    const old = matches.filter((_,i)=>i%10===0).map(m=>({ id:fixtureId(6,parseInt(m.id.slice(-12),16)),match_id:m.id,version:1,submitted_by_user_id:FIXTURE_ACTOR,format:m.format,status:'superseded' }));
    statements.push(insert('match_revisions',[...revisions,...old]));
    statements.push(insert('match_participants',matches.flatMap(m=>[
      ...m.teamAUserIds.map((user_id,i)=>({revision_id:m.revisionId,user_id,team:'A',slot:i+1})),
      ...m.teamBUserIds.map((user_id,i)=>({revision_id:m.revisionId,user_id,team:'B',slot:i+1})),
    ])));
    statements.push(insert('match_games',matches.flatMap(m=>m.games.map(g=>({id:g.gameId,revision_id:m.revisionId,game_number:g.gameNumber,team_a_score:g.teamAScore,team_b_score:g.teamBScore,winner_team:g.winnerTeam})))));
    statements.push(`update public.matches m set active_revision_id=r.id from public.match_revisions r where r.match_id=m.id and r.status='active' and m.group_id='${groupId}';`);
    statements.push(insert('rating_events',projection.events.map(e=>({
      group_id:groupId,match_id:e.matchId,revision_id:e.revisionId,game_id:e.gameId,user_id:e.userId,sequence:e.sequence,
      before_rating:e.before.rating,before_rd:e.before.rd,before_volatility:e.before.volatility,before_games_played:e.before.gamesPlayed,
      after_rating:e.after.rating,after_rd:e.after.rd,after_volatility:e.after.volatility,after_games_played:e.after.gamesPlayed,
      game_number:e.gameNumber,occurred_at:e.occurredAt,format:e.format,team:e.team,expected_score:e.expectedScore,actual_score:e.actualScore,points_for:e.pointsFor,points_against:e.pointsAgainst,
    }))));
    statements.push(insert('consistency_events',projection.consistencyEvents.map(e=>({
      group_id:groupId,match_id:e.matchId,revision_id:e.revisionId,user_id:e.userId,sequence:e.sequence,occurred_at:e.occurredAt,format:e.format,team:e.team,
      expected_score:e.expectedScore,actual_score:e.actualScore,before_log_mean:e.before.logKappaMean,before_log_variance:e.before.logKappaVariance,before_matches_played:e.before.matchesPlayed,
      after_log_mean:e.after.logKappaMean,after_log_variance:e.after.logKappaVariance,after_matches_played:e.after.matchesPlayed,config_fingerprint:'consistency-v1:200:0.35:0.02',
    }))));
    statements.push(insert('group_rating_states',[...projection.ratings].map(([user_id,r],i)=>({group_id:groupId,user_id,rating:r.rating,rd:r.rd,volatility:r.volatility,games_played:r.gamesPlayed,rank:i+1}))));
  }
  statements.push(`analyze; select set_config('request.jwt.claim.sub','${FIXTURE_ACTOR}',true);`);
  return statements.join('\n');
}
