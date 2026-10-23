import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateQuest, questInputFromNextStep, remainingSeconds, modes, clockText } from '../src/lib/study/model.ts';
import { decodeResult, rpc } from '../src/lib/study/data.ts';
import { createItem, groundPoint } from '../src/lib/room/room.ts';
import { layoutError, replaceEntity } from '../src/lib/room/editing.ts';
const valid = { topic: '  Calculus ', subject: '', mode: 'practice', finishLine: 'Solve five questions', minutes: '25' };
test('Next Step supplies the new editable topic while retaining mode, subject and full finish line', () => {
  const bookmark = { topic:'Physics', study_mode:'understand', subject:'Science', next_step_text:'  Programming  ' };
  const original = structuredClone(bookmark);
  assert.deepEqual(questInputFromNextStep(bookmark), {topic:'Programming',subject:'Science',mode:'understand',finishLine:'  Programming  ',minutes:'25'});
  assert.deepEqual(bookmark, original);
  for (const nextStep of ['x'.repeat(120), '🙂'.repeat(120)]) assert.equal(questInputFromNextStep({...bookmark,next_step_text:nextStep}).topic,nextStep);
});
test('long or blank Next Steps are never truncated or replaced with the previous topic', () => {
  for (const nextStep of ['x'.repeat(121), 'A long free-form next step. '.repeat(8), '  ', null]) {
    const result=questInputFromNextStep({topic:'Physics',study_mode:'__proto__',subject:null,next_step_text:nextStep});
    assert.equal(result.topic,'');assert.equal(result.finishLine,nextStep??'');assert.equal(result.mode,'understand');assert.equal(result.subject,'');
    assert.ok(validateQuest(result).topic);
  }
  assert.deepEqual(questInputFromNextStep(null),{topic:'',subject:'',mode:'understand',finishLine:'',minutes:'25'});
});
test('all four modes and 5–120 whole-minute boundaries are accepted', () => {
  for (const mode of Object.keys(modes)) for (const minutes of ['5','9','10','15','25','45','60','120']) assert.deepEqual(validateQuest({ ...valid, mode, minutes }), {});
});
test('invalid, blank, overlong and fractional inputs cannot start a quest', () => {
  for (const minutes of ['', ' ', '4', '121', '5.5', 'NaN', 'Infinity', '1e2', '-5']) assert.ok(validateQuest({ ...valid, minutes }).minutes);
  for (const topic of ['', '  \n ', 'x'.repeat(121)]) assert.ok(validateQuest({ ...valid, topic }).topic);
  for (const finishLine of ['', '\t', 'x'.repeat(241)]) assert.ok(validateQuest({ ...valid, finishLine }).finishLine);
  assert.ok(validateQuest({ ...valid, subject: 'x'.repeat(81) }).subject);
  assert.ok(validateQuest({ ...valid, mode: '__proto__' }).mode);
  assert.deepEqual(validateQuest({ ...valid, topic: '🙂'.repeat(120) }), {});
});
test('mode prompts preserve the approved exact wording', () => {
  assert.deepEqual(Object.values(modes).map(m => m.prompt), ['Explain the main idea in your own words. What is still unclear?', 'What did you complete? What was difficult or incorrect?', 'Without looking at your notes, write what you remember.', 'What did you review? What needs another review?']);
});
test('timer uses canonical accrued seconds, excludes paused time and never goes negative', () => {
  const result = { session: { status: 'running', planned_minutes: 5, accrued_active_seconds: 50 }, active_seconds: 100 };
  assert.equal(remainingSeconds(result, 12.9), 188);
  assert.equal(remainingSeconds({ ...result, session: { ...result.session, status: 'paused' } }, 900), 200);
  assert.equal(remainingSeconds(result, 900), 0);
  assert.equal(remainingSeconds(result, -20), 200);
  assert.equal(clockText(7200), '120:00');
});
test('HTTP-success business rejection is retained and malformed responses fail closed', async () => {
  assert.equal(decodeResult({ ok: false, code: 'too_early' }).ok, false);
  for (const data of [null, {}, [], { ok: 'yes', code: 'saved' }]) assert.throws(() => decodeResult(data));
  const fake = response => ({ rpc: () => ({ abortSignal: async () => response }) });
  assert.equal((await rpc(fake({ data: { ok: false, code: 'layout_conflict', room_revision: 1, layout: { version: 2, items: [], decorations: [] } }, error: null }), 'save_room_layout')).code, 'layout_conflict');
  await assert.rejects(rpc(fake({ data: null, error: { message: 'secret internal error' } }), 'purchase_shop_item'), error => !error.message.includes('secret'));
});
test('room proposals preserve identity and reject collisions without changing original state', () => {
  const chair = createItem('chair', 'chair', { x: 1, y: 1 });
  const desk = createItem('desk', 'desk', { x: 3, y: 3 });
  const room = { version: 2, items: [chair, desk], decorations: [], wallDecorations: [] };
  const proposal = replaceEntity(room, { ...chair, x: 3, y: 3 });
  assert.match(layoutError(proposal), /overlaps/);
  assert.equal(room.items[0].x, 1);
  assert.equal(proposal.items.length, 2);
  assert.deepEqual(groundPoint(room.items[0]), groundPoint(chair));
});
