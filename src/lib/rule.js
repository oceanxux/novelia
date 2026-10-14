'use strict';
// Legado 规则求值引擎 (cheerio 实现), 覆盖本项目适配器所需的子集:
//   sel@op##regex##repl   /   @js:<code> (result 为上游值)
const cheerio = require('cheerio');

function parse(rule) {
  const parts = String(rule).split('##');
  let sel = parts[0];
  const re = parts[1];
  const repl = parts.length > 2 ? parts[2] : '';
  let op = 'text';
  const at = sel.lastIndexOf('@');
  if (at !== -1) { op = sel.slice(at + 1); sel = sel.slice(0, at); }
  return { sel, op, re, repl };
}

const applyRegex = (v, re, repl) =>
  (!re || v == null) ? v : String(v).replace(new RegExp(re, 'g'), repl);

function pick(el, op) {
  switch (op) {
    case 'text': return el.text().trim();
    case 'href': return el.attr('href');
    case 'src': return el.attr('src');
    case 'html': return el.html();
    default: return el.attr(op) ?? el.text().trim();
  }
}

// 支持 :eq(n) (Legado 语义: 第 n 个匹配)
function queryAll($, root, sel) {
  const m = sel.match(/:eq\((\d+)\)\s*$/);
  if (m) return root.find(sel.slice(0, m.index)).eq(parseInt(m[1], 10));
  return root.find(sel);
}

function evalJs(code, result) {
  // 适配器内的规则受信任, 直接求值
  // eslint-disable-next-line no-new-func
  return (function (result) { return eval(code); })(result);
}

function evalRule($, root, rule) {
  rule = String(rule);
  const jsIdx = rule.indexOf('@js:');
  if (jsIdx !== -1) {
    const prefix = rule.slice(0, jsIdx);
    const jsCode = rule.slice(jsIdx + 4);
    const result = prefix ? evalRule($, root, prefix) : null;
    return evalJs(jsCode, result);
  }
  const p = parse(rule);
  return applyRegex(pick(queryAll($, root, p.sel), p.op), p.re, p.repl);
}

// 对一组元素逐个求值, 返回数组
function evalList($, nodes, rule) {
  const out = [];
  nodes.each((_, el) => out.push(evalRule($, $(el), rule)));
  return out;
}

module.exports = { cheerio, evalRule, evalList, parse, pick, queryAll };
