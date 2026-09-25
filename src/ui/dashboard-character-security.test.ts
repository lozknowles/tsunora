import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

test('crew card treats activity class metadata as text rather than HTML attributes', () => {
  const source = fs.readFileSync(new URL('../../assets/dashboard/dashboard-bots.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('dashboard-bots.js', source, ts.ScriptTarget.Latest, true);
  let cardSource = '';
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'characterCard') cardSource = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(cardSource);
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const card = vm.runInNewContext(`(${cardSource})`, {
    esc, identities: {'quality-inspector': {name:'Quality',role:'Inspect',area:'Jobs'}},
    states:['working'], labels:{working:'Working'},icons:{working:'*'},
    idleDisposition:()=>null,animationExpression:()=> 'ACTIVE',botSvg:()=>'<svg></svg>',signals:()=>'',facts:()=>'',
  });
  for (const kind of ['READ"><img src=x onerror="globalThis.injected=true">', "READ' onmouseover='globalThis.injected=true", 'READ & <tag>']) {
    const markup = card({id:'quality-inspector',state:'working',activity:{kind},summary:'test',reason:'test',nextAction:'test'});
    assert.doesNotMatch(markup, /<img|<tag>/i);
    assert.doesNotMatch(markup, /class="[^">]*"\s+(?:on\w+|src)=/i);
    assert.ok(markup.includes(esc(kind.toLowerCase().replaceAll('_','-'))));
  }
  assert.match(card({id:'quality-inspector',state:'working',activity:{kind:'TOOL_READ'}}), /bot-activity-tool-read/);
});

test('cache state class cannot introduce HTML attributes or elements', () => {
  const source = fs.readFileSync(new URL('../../assets/dashboard/dashboard-cache-experts.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('cache.js', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'cacheStateClass');
  assert.ok(fn);
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const stateClass = vm.runInNewContext(`(${fn.getText(ast)})`, {esc});
  assert.equal(stateClass('WARM'), 'warm');
  assert.equal(stateClass('INVALID STATE'), 'invalid-state');
  for (const input of ['WARM"><img/src=x/onerror=globalThis.injected=true>', "WARM'", '<tag>']) {
    assert.doesNotMatch(stateClass(input), /[<>"']/);
    assert.equal(stateClass(input), esc(input.toLowerCase().replaceAll(' ', '-')));
  }
});
