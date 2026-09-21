// Unit tests for the /ask conversation-history rules (shared/utils/askHistory.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASK_MAX_TURNS, checkAskHistory, trimAskHistory } from '../shared/utils/askHistory.ts'

/** A transcript of `pairs` answered exchanges followed by one fresh question: 2·pairs + 1 messages. */
function transcript(pairs) {
  const out = []
  for (let i = 1; i <= pairs; i++) {
    out.push({ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` })
  }
  out.push({ role: 'user', content: `q${pairs + 1}` })
  return out
}

test('the eleventh question no longer opens on an assistant turn', () => {
  // 10 exchanges + the new question = 21 messages; a bare slice(-20) would start at a1.
  const sent = trimAskHistory(transcript(10))
  assert.equal(sent.length, ASK_MAX_TURNS - 1)
  assert.equal(sent[0].role, 'user')
  assert.equal(sent[0].content, 'q2')
  assert.equal(sent.at(-1).content, 'q11')
  assert.equal(checkAskHistory(sent).ok, true)
})

test('short transcripts pass through whole and in order', () => {
  const t = transcript(3)
  assert.deepEqual(trimAskHistory(t), t)
  // The same objects come back, not copies — the page keeps its reactive proxies.
  assert.equal(trimAskHistory(t)[0], t[0])
})

test('the empty streaming placeholder is dropped before counting', () => {
  const t = [...transcript(1), { role: 'assistant', content: '' }]
  assert.deepEqual(trimAskHistory(t), transcript(1))
  assert.deepEqual(trimAskHistory([{ role: 'user', content: 'x' }, { role: 'assistant', content: '   ' }]).length, 1)
})

test('trimming keeps whole pairs when the cap lands mid-exchange', () => {
  // Cap of 4 over q1 a1 q2 a2 q3 → slice gives a1 q2 a2 q3 → advance to q2.
  assert.deepEqual(trimAskHistory(transcript(2), 4).map(m => m.content), ['q2', 'a2', 'q3'])
  // Cap of 5 already opens on a user turn — nothing extra dropped.
  assert.deepEqual(trimAskHistory(transcript(2), 5).map(m => m.content), ['q1', 'a1', 'q2', 'a2', 'q3'])
})

test('checkAskHistory rejects what the API would reject, with the reason', () => {
  const problem = (input) => {
    const r = checkAskHistory(input)
    return r.ok ? null : r.problem
  }
  assert.equal(problem(undefined), 'messages[] required')
  assert.equal(problem([]), 'messages[] required')
  assert.match(problem(transcript(10)), /too long/)
  assert.match(problem(transcript(10).slice(1)), /open with a user turn/)
  assert.match(problem(transcript(1).slice(0, 2)), /end with the question/)
  assert.match(problem([{ role: 'system', content: 'x' }]), /role user\|assistant/)
  assert.match(problem([{ role: 'user', content: '  ' }]), /non-empty/)
  assert.match(problem([{ role: 'user' }]), /non-empty/)
  assert.match(problem([null]), /non-empty/)
  assert.match(problem([{ role: 'user', content: 'x'.repeat(4001) }]), /too long \(max 4000/)
})

test('checkAskHistory returns plain role/content copies', () => {
  const r = checkAskHistory([{ role: 'user', content: 'hi', extra: 1 }])
  assert.equal(r.ok, true)
  assert.deepEqual(r.messages, [{ role: 'user', content: 'hi' }])
})
