'use client';

import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronDown, Code2, Copy, FileText, Leaf, LoaderCircle, LockKeyhole, Paperclip, RotateCcw, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { localRewrite, MAX_CHARACTERS, modelRewrite, SCENARIOS } from '../lib/rewrite.mjs';
import { downloadName, readFile, splitText } from '../lib/files.mjs';

type LoadedFile = Awaited<ReturnType<typeof readFile>>;
const SAMPLE = '值得注意的是，清晰的表达有助于读者理解内容。我们可以对现有文档进行详细的分析，并对修改效果进行全面的评估。\n\n综上所述，修改时应保留事实、数字和必要的限制。例如，当前版本不支持 GPU，这一说明需要保留。';

export default function Home() {
  const [tab, setTab] = useState('text'), [text, setText] = useState(''), [output, setOutput] = useState('');
  const [scenario, setScenario] = useState('general'), [level, setLevel] = useState('light');
  const [engine, setEngine] = useState('local'), [key, setKey] = useState(''), [settings, setSettings] = useState(false);
  const [file, setFile] = useState<LoadedFile | null>(null), [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false), [loadingFile, setLoadingFile] = useState(false), [progress, setProgress] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [copied, setCopied] = useState(false), [dragging, setDragging] = useState(false);
  const [resultInfo, setResultInfo] = useState<{ changed: number, total: number, engine: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null), currentFileRequest = useRef(0);
  const inputText = tab === 'file' ? file?.preview ?? '' : text;
  const invalidate = () => { setOutput(''); setResultBytes(null); setResultInfo(null); setError(''); setNotice(''); setCopied(false); };
  const switchTab = (value: string) => { if (busy || loadingFile) return; setTab(value); invalidate(); };

  async function loadFile(selected?: File) {
    if (!selected || busy) return;
    const id = ++currentFileRequest.current;
    invalidate(); setLoadingFile(true); setFile(null); setTab('file');
    try { const parsed = await readFile(selected); if (id === currentFileRequest.current) setFile(parsed); }
    catch (e) { if (id === currentFileRequest.current) setError(e instanceof Error ? e.message : '文件读取失败。'); }
    finally { if (id === currentFileRequest.current) setLoadingFile(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function rewrite() {
    setError(''); setNotice('');
    if (!inputText.trim()) { setError('请先输入文字或上传文件。'); return; }
    if (inputText.length > MAX_CHARACTERS) { setError('内容超过 40,000 字符，请拆分后再试。'); return; }
    if (engine === 'model' && !key.trim()) { setSettings(true); setError('请在改写设置中填写自己的 DeepSeek API Key。'); return; }
    setBusy(true); setOutput(''); setResultBytes(null); setResultInfo(null); setCopied(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const parsed = tab === 'text' ? splitText(text) : file!;
      const units: string[] = parsed.units;
      let results: string[];
      if (engine === 'local') {
        setProgress('正在精修文字…');
        await new Promise(resolve => setTimeout(resolve, 100));
        if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        results = units.map((s: string) => localRewrite(s).text);
      } else {
        results = await modelRewrite({ segments: units, apiKey: key.trim(), scenario, level, signal: abort.signal, onProgress: (done: number, total: number) => setProgress(`深度改写 ${done} / ${total} 批`) });
      }
      if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const finalText = tab === 'text' ? (parsed as ReturnType<typeof splitText>).join(results) : file!.type === 'txt' ? file!.join!(results) : results.join('\n');
      const bytes = tab === 'file' ? file!.output(results) : null;
      const changed = results.reduce((sum: number, s: string, i: number) => sum + (s !== units[i] ? 1 : 0), 0);
      setOutput(finalText); setResultBytes(bytes); setResultInfo({ changed, total: units.length, engine });
      if (!changed) setNotice(engine === 'local' ? '未发现规则可安全精简的内容，已保留原文。可切换深度改写获得更多调整。' : '模型保留了原文，没有需要修改的片段。');
    } catch (e) { setError(e instanceof Error && e.name === 'AbortError' ? '已停止改写，原文仍保留。' : e instanceof Error ? e.message : '改写失败，请稍后重试。'); }
    finally { setBusy(false); controller.current = null; setProgress(''); }
  }

  function save() {
    if (!output || !resultInfo) return;
    const data = tab === 'file' ? resultBytes : new TextEncoder().encode(output);
    if (!data) return;
    const blob = new Blob([new Uint8Array(data)], { type: tab === 'file' ? file!.mime : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = tab === 'file' ? downloadName(file!.name) : 'plain-work-精修.txt';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('浏览器未允许复制，请在结果框中手动选择文字。'); }
  }

  return <div className="app-shell">
    <header className="site-header"><a href="/" className="wordmark" aria-label="plain-work 首页"><span className="brand-symbol">p<span>·</span></span>plain-work<span className="brand-tag">文字工具集</span></a><nav><a href="https://github.com/Lucifer9331/plain-work#skills" target="_blank" rel="noreferrer">Agent Skills <ArrowRight size={13}/></a><a href="https://github.com/Lucifer9331/plain-work" target="_blank" rel="noreferrer" className="github-link"><Code2 size={17}/><span>GitHub</span></a></nav></header>
    <main>
      <section className="intro"><div className="eyebrow"><span className="small-line"/>PLAIN WORDS, CLEAR IDEAS</div><div className="intro-row"><div><h1>把话说清楚，<span>写得更自然。</span></h1><p>减少套话与重复，留下你真正想表达的内容。</p></div><div className="intro-note"><Leaf size={21} strokeWidth={1.4}/><span>保留本意<br/><b>给表达一点呼吸</b></span></div></div></section>
      <section className="workspace" aria-label="文字改写工作台">
        <div className="workspace-top"><div className="tabs" role="tablist" aria-label="输入方式"><button role="tab" aria-selected={tab === 'text'} disabled={busy || loadingFile} onClick={() => switchTab('text')} className={tab === 'text' ? 'active' : ''}><FileText size={16}/>文本改写</button><button role="tab" aria-selected={tab === 'file'} disabled={busy || loadingFile} onClick={() => switchTab('file')} className={tab === 'file' ? 'active' : ''}><Paperclip size={16}/>文件处理</button></div><span className="engine-indicator"><span/>{engine === 'local' ? '本地规则精修' : 'DeepSeek 深度改写'}</span></div>
        <div className="options-row"><span className="control-label" title="场景用于 DeepSeek 深度改写，规则精修采用相同的保守规则">写作场景</span><div className="scenario-options" role="group" aria-label="写作场景">{Object.entries(SCENARIOS).map(([id, s]) => <button disabled={busy || engine === 'local'} key={id} onClick={() => { setScenario(id); invalidate(); }} className={scenario === id ? 'selected' : ''}>{s.label}</button>)}</div><div className="strength"><label htmlFor="level">修改程度</label><select id="level" value={level} disabled={busy || engine === 'local'} onChange={e => { setLevel(e.target.value); invalidate(); }}><option value="light">轻度精修</option><option value="balanced">适度改写</option></select><ChevronDown size={12}/></div></div>
        <div className="editors"><section className="editor-panel input-panel"><div className="panel-heading"><h2><span className="step-number">01</span>原始内容</h2><div className="panel-tools">{tab === 'text' && <><button disabled={busy} onClick={() => { setText(SAMPLE); invalidate(); }}>试用示例</button><span className="tool-divider"/><button aria-label="清空原文" title="清空原文" disabled={busy || !text} onClick={() => { setText(''); invalidate(); }}><RotateCcw size={14}/></button></>}{tab === 'file' && file && <button disabled={busy} onClick={() => inputRef.current?.click()}>更换文件</button>}</div></div>
          {tab === 'text' ? <textarea className="editor-text" aria-label="原始文本" placeholder={'在这里粘贴或输入文字…\n\n可以是一段说明、一封邮件，或一份待润色的文稿。'} value={text} disabled={busy} onChange={e => { setText(e.target.value); invalidate(); }} spellCheck={false}/> : <div className="file-input-area">
            {!file ? <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void loadFile(e.dataTransfer.files[0]); }}><span className="upload-icon">{loadingFile ? <LoaderCircle className="spin" size={25}/> : <Upload size={25} strokeWidth={1.5}/>}</span><h3>{loadingFile ? '正在读取文件' : '把文稿放在这里'}</h3><p>拖拽文件，或从设备中选择</p><button className="select-file" disabled={loadingFile || busy} onClick={() => inputRef.current?.click()}>选择文件 <ArrowRight size={14}/></button><small>TXT / DOCX · 最大 10 MB</small></div> : <><div className="file-badge"><FileText size={20}/><div><strong>{file.name}</strong><span>{file.type.toUpperCase()} · {file.units.length} 个文字片段</span></div><button aria-label="移除文件" disabled={busy} onClick={() => { setFile(null); invalidate(); }}><X size={15}/></button></div><textarea className="editor-text file-preview" readOnly aria-label="文件原文预览" value={file.preview}/></>}
          </div>}
          <input ref={inputRef} type="file" accept=".txt,.docx" hidden onChange={e => void loadFile(e.target.files?.[0])}/><div className="panel-footer"><span>{Array.from(inputText).length.toLocaleString()} 字符 <span className="muted">/ 40,000</span></span><button disabled={busy || loadingFile} className="attachment-link" onClick={() => inputRef.current?.click()}><Paperclip size={13}/>{tab === 'text' ? '上传文档' : '支持 TXT、DOCX'}</button></div></section>
          <section className="editor-panel output-panel"><div className="panel-heading"><h2><span className="step-number">02</span>精修结果</h2><span className="result-badge">{busy ? <><LoaderCircle size={12} className="spin"/>处理中</> : resultInfo ? <><Check size={12}/>已完成</> : '等待改写'}</span></div>{output ? <textarea className="editor-text output-text" aria-label="改写结果" value={output} readOnly spellCheck={false}/> : <div className="empty-output"><span className={`result-art ${busy ? 'working' : ''}`}><span className="art-page"><i/><i/><i/><i/></span><Sparkles size={21}/></span><h3>{busy ? progress : '更自然的表达，从这里开始'}</h3><p>{busy ? '正在处理内容，完成后会显示在这里。' : '输入文字或上传文档，再点击「开始精修」。'}</p></div>}<div className="panel-footer"><span>{resultInfo ? `${resultInfo.changed} / ${resultInfo.total} 个片段已修改` : '结果会保留必要的事实与限制'}</span><div className="result-actions"><button aria-label="复制结果" disabled={!output || busy} onClick={() => void copy()}>{copied ? <CheckCheck size={14}/> : <Copy size={14}/>}{copied ? '已复制' : '复制'}</button><button disabled={!output || busy} onClick={save}><ArrowDownToLine size={14}/>下载{tab === 'file' && file ? ` ${file.type.toUpperCase()}` : ''}</button></div></div></section></div>
        <div className="action-bar"><button className={`settings-toggle ${settings ? 'on' : ''}`} onClick={() => setSettings(!settings)} aria-expanded={settings}><Settings2 size={16}/>改写设置<ChevronDown size={13}/></button><span className="action-note">{engine === 'local' ? '轻度删繁就简，所有文字留在浏览器中' : '深度改写将通过本站转发至 DeepSeek'}</span>{busy ? <button className="primary-button cancel" onClick={() => controller.current?.abort()}><X size={16}/>停止改写</button> : <button className="primary-button" disabled={!inputText.trim() || loadingFile} onClick={() => void rewrite()}><Sparkles size={16}/>开始精修<ArrowRight size={16}/></button>}</div>
        {settings && <div className="settings-panel"><div><h3>选择改写方式</h3><p>规则精修轻度删繁；深度改写会结合所选场景调整表达。</p></div><div className="engine-choices"><button disabled={busy} onClick={() => { setEngine('local'); invalidate(); }} className={engine === 'local' ? 'chosen' : ''}><Leaf size={17}/><span><b>规则精修</b><small>无需密钥 · 在浏览器中处理</small></span>{engine === 'local' && <Check size={15}/>}</button><button disabled={busy} onClick={() => { setEngine('model'); invalidate(); }} className={engine === 'model' ? 'chosen' : ''}><Sparkles size={17}/><span><b>DeepSeek 深度改写</b><small>使用你自己的 API 额度</small></span>{engine === 'model' && <Check size={15}/>}</button></div>{engine === 'model' && <div className="key-settings"><label htmlFor="api-key">DeepSeek API Key</label><div className="key-row"><input id="api-key" type="password" value={key} disabled={busy} placeholder="填写你的密钥，仅本次页面使用" onChange={e => setKey(e.target.value)} autoComplete="off" spellCheck={false}/><button disabled={busy || !key} onClick={() => setKey('')}>清除</button></div><p><LockKeyhole size={12}/>密钥仅在页面内存及请求处理中使用，刷新后清除。本站会将密钥和待改写文字转发给 DeepSeek，不写入数据库或浏览器存储。<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">获取密钥 ↗</a></p></div>}</div>}
        <div className="messages" aria-live="polite">{error && <p className="error-message" role="alert"><X size={15}/>{error}</p>}{notice && <p className="notice-message"><Check size={15}/>{notice}</p>}{tab === 'file' && file?.type === 'docx' && <p className="format-message">Word 按原有文字片段处理，保留段落、表格、图片与样式。{file.skipped ? `已跳过 ${file.skipped} 个含字段、修订或特殊对象的段落。` : ''}长度变化可能影响分页，下载后请复核。</p>}</div>
      </section>
      <section className="principles" aria-label="改写原则"><article><span><ShieldCheck size={18}/></span><div><h3>保留意思，减少修饰</h3><p>数字、事实、必要的否定，都应留在原位。</p></div></article><article><span><FileText size={18}/></span><div><h3>文稿进来，文稿出去</h3><p>TXT、Word 上传后，下载同格式精修文件。</p></div></article><article><span><Leaf size={18}/></span><div><h3>自然表达，有所取舍</h3><p>专业术语与得体的礼貌，也可以很自然。</p></div></article></section>
    </main><footer className="site-footer"><span>plain-work <i>/</i> 写得清楚，也写得像自己。</span><div><a href="https://github.com/Lucifer9331/plain-work/blob/main/docs/research.md" target="_blank" rel="noreferrer">方法与调研 ↗</a><span>不提供 AI 检测分数；改写结果请复核。</span></div></footer>
  </div>;
}
