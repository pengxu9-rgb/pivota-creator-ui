'use strict';
require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'..'),FACADE='src/lib/pokemon/catalogAdapter.cjs';
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):/\.(?:cjs|ts|tsx)$/.test(entry.name)?[path.join(directory,entry.name)]:[]);}
function violations(relative,text){
  const source=ts.createSourceFile(relative,text,ts.ScriptTarget.Latest,true,/\.tsx$/.test(relative)?ts.ScriptKind.TSX:ts.ScriptKind.JS),bad=[];
  const workspaceNames=new Set(['workspace','rawWorkspace','privateWorkspace']);
  const callNames=new Set();
  const mark=(node,reason)=>bad.push({file:relative,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,reason});
  function discover(node){
    if(ts.isVariableDeclaration(node)&&node.initializer){
      const target=node.initializer.getText(source);
      if(workspaceNames.has(target)){
        if(ts.isIdentifier(node.name))workspaceNames.add(node.name.text);
        if(ts.isObjectBindingPattern(node.name))for(const element of node.name.elements){const property=(element.propertyName||element.name).getText(source);if(['start','advance'].includes(property)&&ts.isIdentifier(element.name))callNames.add(element.name.text);}
      }
    }
    ts.forEachChild(node,discover);
  }
  discover(source);
  function walk(node){
    if(ts.isCallExpression(node)){
      const expression=node.expression;
      const method=ts.isPropertyAccessExpression(expression)?expression.name.text:ts.isElementAccessExpression(expression)&&ts.isStringLiteral(expression.argumentExpression)?expression.argumentExpression.text:null;
      const receiver=method?expression.expression.getText(source):null;
      if(relative!==FACADE&&((['start','advance'].includes(method)&&([...workspaceNames].includes(receiver)||/(?:^|\.)workspace$/.test(receiver)))||ts.isIdentifier(expression)&&callNames.has(expression.text)))mark(node,'catalog workspace invocation outside facade');
      const imported=ts.isIdentifier(expression)&&expression.text==='require'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])?node.arguments[0].text:null;
      if(imported&&/collectorClient\.cjs$/.test(imported)&&relative!==FACADE){
        mark(node,'catalog transport capability import outside facade');
      }
    }
    if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&/collectorClient\.cjs$/.test(node.moduleSpecifier.text)&&relative!==FACADE){
      mark(node,'catalog transport import outside facade');
    }
    ts.forEachChild(node,walk);
  }
  walk(source);return bad;
}
test('architecture: catalog transport construction and workspace writes have one production facade',()=>{
  const bad=files(path.join(ROOT,'src')).flatMap(file=>violations(path.relative(ROOT,file).replaceAll(path.sep,'/'),fs.readFileSync(file,'utf8')));
  assert.deepEqual(bad,[],'admission bypass locations: '+JSON.stringify(bad));
  const facade=fs.readFileSync(path.join(ROOT,FACADE),'utf8');
  assert.match(facade,/validatePlan\s*\(/,'the only capability facade must check a plan');
  assert.match(facade,/nativeEcho\s*\(/,'the only capability facade must verify native echo');
});
test('architecture scanner rejects direct, bracket, alias, destructured and import bypasses',()=>{
  const sources=[
    "workspace.advance(ctx,payload)","workspace['start'](ctx,payload)","const w=workspace; w.advance(ctx,payload)",
    "const {advance: run}=workspace; run(ctx,payload)","const {createCollectorClient}=require('./vendor/collectorClient.cjs')",
    "const client=require('./vendor/collectorClient.cjs'); client.createCollectorClient({})",
    "import * as client from './vendor/collectorClient.cjs'; client.createCollectorClient({})",
  ];
  for(const source of sources)assert.ok(violations('src/bypass.cjs',source).length,'scanner missed '+source);
  assert.equal(violations('src/shared-error.cjs',"const {CollectorCallError}=require('./vendor/collectorClient.cjs')").length,1);
  assert.deepEqual(violations('src/shared-error.cjs',"const {CollectorCallError}=require('./collectorError.cjs')"),[]);
});
