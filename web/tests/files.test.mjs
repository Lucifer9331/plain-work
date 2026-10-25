import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { decodeTxt, encodeTxt, splitText, readDocx, readFile, downloadName } from '../lib/files.mjs';
import { localRewrite } from '../lib/rewrite.mjs';

globalThis.DOMParser = DOMParser; globalThis.XMLSerializer = XMLSerializer;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const pack = xml => zipSync({ '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'), 'word/document.xml': strToU8(xml), 'word/styles.xml': strToU8('<styles/>'), 'word/media/image.png': new Uint8Array([1,2,3,4]) });

test('TXT preserves UTF-8/UTF-16 BOM, Unicode and newline styles', () => {
  const text = '值得注意的是，文字 81.2%。\r\n\r\n不支持 GPU。😀\n尾行';
  for (const encoding of ['utf-8','utf-16le','utf-16be']) for (const bom of [true,false]) {
    if (encoding !== 'utf-8' && !bom) continue;
    const bytes = encodeTxt(text, { encoding, bom });
    const decoded = decodeTxt(bytes); assert.equal(decoded.text, text); assert.equal(decoded.encoding, encoding);
    assert.deepEqual(encodeTxt(decoded.text, decoded), bytes);
    const parts = splitText(decoded.text), results = parts.units.map(s => localRewrite(s).text);
    assert.equal(parts.join(results), '文字 81.2%。\r\n\r\n不支持 GPU。😀\n尾行');
  }
});
test('fenced code is unchanged across text segmentation and all noncode line endings survive', () => {
  const text = '值得注意的是，外部文字。\r\n```python\r\n值得注意的是，代码。\r\n```\r\n\r\n';
  const parts = splitText(text);
  assert.equal(parts.join(parts.units.map(s => localRewrite(s).text)), text.replace('值得注意的是，外部文字。','外部文字。'));
  assert.throws(() => parts.join([]));
});
test('large Unicode segments roundtrip without broken surrogate pairs', () => {
  const text = '😀'.repeat(7000);
  const parts = splitText(text); assert.equal(parts.join(parts.units), text);
  assert.ok(parts.units.every(s => !s.includes('\ufffd')));
});
test('DOCX preserves formatted runs, tables, relationships, images and protected fields', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>值得注意的是，标题。</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>进行详细的分析 81.2%</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:t>值得注意的是，字段。</w:t></w:r></w:p><w:p><w:hyperlink w:anchor="target"><w:r><w:t>值得注意的是，链接。</w:t></w:r></w:hyperlink></w:p><w:sectPr/></w:body></w:document>`;
  const bytes = pack(xml), parsed = readDocx(bytes);
  assert.equal(parsed.skipped, 1); assert.equal(parsed.units.length, 2);
  const rewritten = parsed.units.map(s => localRewrite(s).text), exported = unzipSync(parsed.output(rewritten)), original = unzipSync(bytes);
  assert.deepEqual(exported['word/media/image.png'], original['word/media/image.png']);
  assert.deepEqual(exported['word/styles.xml'], original['word/styles.xml']);
  const doc = new DOMParser().parseFromString(strFromU8(exported['word/document.xml']), 'application/xml');
  assert.equal(doc.getElementsByTagNameNS(W,'b').length, 1); assert.equal(doc.getElementsByTagNameNS(W,'tbl').length, 1);
  assert.equal(doc.getElementsByTagNameNS(W,'t')[0].textContent, '标题。');
  assert.match(strFromU8(exported['word/document.xml']), /值得注意的是，字段/);
  assert.match(strFromU8(exported['word/document.xml']), /值得注意的是，链接/);
  assert.deepEqual(readDocx(parsed.output(parsed.units)).units, parsed.units); // repeated exports do not mutate the source
  assert.throws(() => parsed.output([]));
});
test('DOCX handles alternate namespace prefixes, escaped text and headers', () => {
  const entries = unzipSync(pack(`<x:document xmlns:x="${W}"><x:body><x:p><x:r><x:t>值得注意的是，A &amp; B。</x:t></x:r></x:p></x:body></x:document>`));
  entries['word/header1.xml'] = strToU8(`<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>值得注意的是，页眉。</w:t></w:r></w:p></w:hdr>`);
  const p = readDocx(zipSync(entries)), out = readDocx(p.output(p.units.map(s => localRewrite(s).text)));
  assert.deepEqual(out.units, ['A & B。','页眉。']);
});
test('malformed DOCX, entities, signed documents and expansion bombs are rejected', () => {
  assert.throws(() => readDocx(new Uint8Array([1,2])));
  assert.throws(() => readDocx(pack(`<!DOCTYPE doc [<!ENTITY x "bad">]><w:document xmlns:w="${W}"/>`)));
  const signed = unzipSync(pack(`<w:document xmlns:w="${W}"/>`)); signed['_xmlsignatures/sig1.xml'] = strToU8('signature');
  assert.throws(() => readDocx(zipSync(signed)), /签名/);
  const bomb = zipSync({ 'large.txt': new Uint8Array(31*1024*1024) });
  assert.throws(() => readDocx(bomb), /过大/);
});
test('file pipeline validates types, size, text encodings and produces same format', async () => {
  const file = new File([strToU8('值得注意的是，测试。')], 'sample.TXT');
  const parsed = await readFile(file);
  assert.equal(parsed.type,'txt'); assert.equal(decodeTxt(parsed.output(parsed.units.map(s => localRewrite(s).text))).text, '测试。');
  assert.equal(downloadName(file.name), 'sample-精修.TXT');
  await assert.rejects(readFile(new File(['x'],'sample.doc')), /另存/);
  await assert.rejects(readFile(new File(['x'],'sample.pdf')), /请选择/);
  await assert.rejects(readFile(new File([' '],'sample.txt')), /没有/);
  await assert.rejects(readFile(new File([new Uint8Array([0xff])],'sample.txt')), /编码/);
  await assert.rejects(readFile(new File([new Uint8Array(10*1024*1024+1)],'sample.docx')), /10 MB/);
});
