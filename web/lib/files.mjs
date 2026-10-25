import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { MAX_CHARACTERS } from './rewrite.mjs';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED = 30 * 1024 * 1024;

export function splitText(text) {
  const parts = text.split(/(\r\n|\n|\r)/);
  const units = [], slots = [];
  let fence = '';
  parts.forEach((part, partIndex) => {
    const marker = part.trimStart().match(/^(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (fence === marker[1][0]) fence = ''; return; }
    if (fence) return;
    if (/^(?:\r\n|\n|\r)$/.test(part) || !part.trim()) return;
    const chunks = chunk(part);
    slots.push({ partIndex, start: units.length, count: chunks.length });
    units.push(...chunks);
  });
  return { units, join(rewritten) {
    checkCount(units, rewritten);
    const updated = [...parts];
    for (const s of slots) updated[s.partIndex] = rewritten.slice(s.start, s.start + s.count).join('');
    return updated.join('');
  } };
}

function chunk(text) {
  const points = Array.from(text);
  const result = [];
  while (points.length) {
    let take = Math.min(points.length, 3000);
    if (take < points.length) {
      for (let j = take - 1; j >= take / 2; j--) {
        if (/[。！？.!?；;]/.test(points[j])) { take = j + 1; break; }
      }
    }
    result.push(points.splice(0, take).join(''));
  }
  return result;
}

function checkCount(original, rewritten) {
  if (!Array.isArray(rewritten) || original.length !== rewritten.length || rewritten.some(s => typeof s !== 'string')) {
    throw new Error('文字片段不完整，未生成文件。');
  }
}

export function decodeTxt(bytes) {
  let encoding = 'utf-8', bom = false;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; bom = true; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; bom = true; }
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bom = true;
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw new Error('TXT 含有二进制内容，请另存为 UTF-8 文本。');
  return { text, encoding, bom };
}

export function encodeTxt(text, { encoding, bom }) {
  if (encoding === 'utf-8') {
    const data = strToU8(text);
    if (!bom) return data;
    const result = new Uint8Array(data.length + 3); result.set([0xef, 0xbb, 0xbf]); result.set(data, 3); return result;
  }
  const buffer = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
  let offset = 0;
  const little = encoding === 'utf-16le';
  if (bom) { buffer.set(little ? [0xff, 0xfe] : [0xfe, 0xff]); offset = 2; }
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i); buffer[offset++] = little ? n & 255 : n >> 8; buffer[offset++] = little ? n >> 8 : n & 255;
  }
  return buffer;
}

function parseXml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持含外部实体声明的 Word 文件。');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Word 文档 XML 损坏，无法处理。');
  return document;
}

export function readDocx(bytes) {
  let expanded = 0, count = 0;
  const entries = unzipSync(bytes, { filter(entry) {
    count++; expanded += entry.originalSize;
    if (count > 2000 || expanded > MAX_EXPANDED || entry.originalSize > MAX_EXPANDED) throw new Error('Word 解压后过大，最多支持 30 MB / 2000 项。');
    return true;
  } });
  if (!entries['word/document.xml'] || !entries['[Content_Types].xml']) throw new Error('这个文件不是有效的 .docx 文档。');
  if (Object.keys(entries).some(n => /vbaProject|^_xmlsignatures\//i.test(n))) throw new Error('暂不处理含宏或数字签名的 Word 文件，请导出无宏副本。');
  const units = [], refs = [], docs = new Map();
  let skipped = 0;
  const partNames = Object.keys(entries).filter(n => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(n)).sort((a,b) => a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b));
  for (const name of partNames) {
    const doc = parseXml(strFromU8(entries[name])); docs.set(name, doc);
    for (const p of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'p'))) {
      // Fields, tracked changes, formulas and content controls are preserved verbatim.
      const sensitive = ['fldChar', 'instrText', 'fldSimple', 'ins', 'del', 'sdt', 'drawing', 'pict'];
      if (sensitive.some(tag => p.getElementsByTagNameNS(WORD_NS, tag).length) || hasAncestor(p, ['sdt', 'ins', 'del', 'drawing', 'pict']) || p.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math', 'oMath').length) { skipped++; continue; }
      for (const t of Array.from(p.getElementsByTagNameNS(WORD_NS, 't'))) {
        if (!t.textContent?.trim() || hasAncestor(t, ['hyperlink'])) continue;
        const pieces = chunk(t.textContent);
        refs.push({ node: t, start: units.length, count: pieces.length }); units.push(...pieces);
      }
    }
  }
  const preview = units.join('\n');
  if (preview.length > MAX_CHARACTERS) throw new Error('可改写内容超过 40,000 字符，请拆分文件。');
  if (!units.length) throw new Error('未找到可编辑文字。扫描图片、字段或受保护内容会保持原样。');
  return { units, preview, skipped, type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    output(rewritten) {
      checkCount(units, rewritten);
      const updated = { ...entries };
      for (const [name, doc] of docs) {
        const clone = doc.cloneNode(true);
        const originalNodes = Array.from(doc.getElementsByTagNameNS(WORD_NS, 't'));
        const nodes = Array.from(clone.getElementsByTagNameNS(WORD_NS, 't'));
        for (const ref of refs) {
          if (ref.node.ownerDocument !== doc) continue;
          const node = nodes[originalNodes.indexOf(ref.node)];
          const value = rewritten.slice(ref.start, ref.start + ref.count).join('');
          if (value !== ref.node.textContent) { node.textContent = value; node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); }
        }
        updated[name] = strToU8(new XMLSerializer().serializeToString(clone));
      }
      return zipSync(updated, { level: 6 });
    },
  };
}

function hasAncestor(node, names) {
  let p = node.parentNode;
  while (p) { if (p.namespaceURI === WORD_NS && names.includes(p.localName)) return true; p = p.parentNode; }
  return false;
}

export async function readFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 10 MB，请先拆分。');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'docx'].includes(extension)) throw new Error(extension === 'doc' ? '旧版 .doc 请先用 Word 另存为 .docx，再上传。' : '请选择 .txt 或 .docx 文件。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === 'docx') return { ...readDocx(bytes), name: file.name };
  let decoded;
  try { decoded = decodeTxt(bytes); } catch { throw new Error('无法读取此 TXT 编码。请另存为 UTF-8 或带 BOM 的 UTF-16 文本。'); }
  if (decoded.text.length > MAX_CHARACTERS) throw new Error('文本超过 40,000 字符，请拆分文件。');
  if (!decoded.text.trim()) throw new Error('文件中没有可改写文字。');
  const text = splitText(decoded.text);
  return { type: 'txt', name: file.name, units: text.units, preview: decoded.text, encoding: decoded.encoding, mime: 'text/plain', skipped: 0,
    output(rewritten) { return encodeTxt(text.join(rewritten), decoded); },
    join: text.join,
  };
}

export function downloadName(name) {
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)}-精修${name.slice(dot)}`;
}
