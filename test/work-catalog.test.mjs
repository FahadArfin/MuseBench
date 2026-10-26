import test from 'node:test';
import assert from 'node:assert/strict';
import { WORK_TEAMS, WORK_KINDS, WORK_TEMPLATES, WORK_EXAMPLES, filterWorkTemplates, createWorkDraft, workExportOptions } from '../src/shared/work-catalog.mjs';

test('every team can start each supported output from an editable, source-aware brief', () => {
  assert.equal(WORK_TEAMS.length, 6);
  assert.equal(WORK_KINDS.length, 4);
  assert.equal(new Set(WORK_TEMPLATES.map(item => item.id)).size, WORK_TEMPLATES.length);
  for (const team of WORK_TEAMS) for (const kind of WORK_KINDS) {
    const template = WORK_TEMPLATES.find(item => item.team === team.id && item.kind === kind.id);
    assert.ok(template, `${team.id} / ${kind.id}`);
    assert.ok(template.brief.length > 80);
    assert.match(template.brief, /source|attach|data|provided/i);
    assert.ok(template.title.length <= 160);
  }
});

test('search combines team, output, and case-insensitive terms without changing the catalog', () => {
  const all = filterWorkTemplates({});
  assert.equal(all.length, WORK_TEMPLATES.length);
  const found = filterWorkTemplates({ team: 'finance', kind: 'dashboard', query: '  CASH  ' });
  assert.equal(found.length, 1);
  assert.equal(found[0].team, 'finance');
  assert.equal(found[0].kind, 'dashboard');
  assert.deepEqual(filterWorkTemplates({ team: 'sales', query: 'absolutely-no-match' }), []);
  all.pop();
  assert.equal(filterWorkTemplates({}).length, WORK_TEMPLATES.length);
});

test('template and sample creation only prepare drafts, preserve options, and label examples', () => {
  const runOptions = { reasoning: 'high', approval: 'ask' };
  const draft = createWorkDraft(WORK_TEMPLATES[0], runOptions);
  assert.equal(draft.type, 'create');
  assert.equal(draft.demo, false);
  assert.equal(draft.brief, WORK_TEMPLATES[0].brief);
  assert.deepEqual(draft.runOptions, runOptions);
  assert.ok(WORK_EXAMPLES.length >= 4);
  for (const sample of WORK_EXAMPLES) {
    assert.equal(sample.sample, true);
    assert.equal(createWorkDraft(sample, runOptions).demo, true);
    assert.match(sample.brief, /sample|illustrative|fictional/i);
  }
});

test('exports require a real artifact and gate CSV and MP4 on content and capability', () => {
  assert.ok(workExportOptions(null, { mp4: true }).every(option => !option.enabled));
  const dashboard = { kind: 'dashboard', table: { columns: ['Month'], rows: [['May']] } };
  const options = workExportOptions(dashboard, { mp4: true });
  assert.equal(options.find(option => option.format === 'csv').enabled, true);
  assert.equal(options.find(option => option.format === 'mp4').enabled, false);
  assert.equal(workExportOptions({ kind: 'motion' }, { mp4: false }).find(option => option.format === 'mp4').enabled, false);
  assert.equal(workExportOptions({ kind: 'motion' }, { mp4: true }).find(option => option.format === 'mp4').enabled, true);
  assert.equal(workExportOptions({ kind: 'document' }, { mp4: true }).find(option => option.format === 'csv').enabled, false);
});
