"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, Check, Clipboard, HeartPulse, LoaderCircle, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HEALTH_METRICS, healthValues, parseHealthTransfer, shortcutTemplate, type HealthImportResult, type HealthMetric, type HealthPreview, type HealthTransfer } from "@/lib/health";
import { numberText, prettyDate } from "@/lib/metrics";

const shortName = "TrackMyMetric Health";
// The origin is stable for the lifetime of this document. Defer reading it
// until hydration so the guide works on any deployment without an owner URL.
const subscribeToOrigin = () => () => {};
const message = (e: unknown) => {
  if (e && typeof e === "object" && "issues" in e && Array.isArray(e.issues)) return e.issues[0]?.message || "Check the date, unit and value.";
  return e instanceof Error ? e.message : "Please try again.";
};
class HealthRequestError extends Error { constructor(text: string, public status: number) { super(text); } }
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body), cache:"no-store" } : { cache:"no-store" });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("Your session or connection needs attention. Open TrackMyMetric in Safari, sign in and retry."); }
  if (!response.ok) throw new HealthRequestError(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Unable to reach your tracker.", response.status);
  return data as T;
}

export default function HealthSync() {
  const [text, setText] = useState("");
  const [transfer, setTransfer] = useState<HealthTransfer | null>(null);
  const [preview, setPreview] = useState<HealthPreview | null>(null);
  const [selected, setSelected] = useState<HealthMetric[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [imports, setImports] = useState<HealthImportResult[]>([]), [historyError, setHistoryError] = useState(""), [historyLoading, setHistoryLoading] = useState(true);
  const [saved, setSaved] = useState<HealthImportResult | null>(null);
  const [retry, setRetry] = useState(false);
  const lock = useRef(false), pending = useRef<unknown>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  async function loadHistory() {
    setHistoryLoading(true);
    try { setImports((await request<{imports:HealthImportResult[]}>("/api/health")).imports); setHistoryError(""); }
    catch { setHistoryError("Recent imports could not be loaded. Your readings are still safe to preview."); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, []);
  async function previewText() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice(""); setSaved(null); setPreview(null); setRetry(false); pending.current = null;
    try {
      const parsed = parseHealthTransfer(text);
      const day = await request<HealthPreview>("/api/health?date=" + encodeURIComponent(parsed.date));
      setTransfer(parsed); setPreview(day);
      // Existing values are unselected; overwriting requires a deliberate choice.
      setSelected(parsed.readings.filter(r => day.values[r.metric] === undefined).map(r => r.metric));
    } catch (e) { setTransfer(null); setError(message(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function paste() {
    setNotice(""); setError("");
    try { setText(await navigator.clipboard.readText()); setPreview(null); setTransfer(null); setSaved(null); }
    catch { input.current?.focus(); setNotice("Touch and hold inside the text box, then choose Paste."); }
  }
  async function save() {
    if (lock.current || !preview || !transfer || (!selected.length && !retry)) return;
    lock.current = true; setBusy(true); setError("");
    const body = pending.current ?? { requestId:crypto.randomUUID(), expectedRevision:preview.revision, transfer:{...transfer,readings:transfer.readings.filter(r => selected.includes(r.metric))} };
    pending.current = body;
    try {
      const result = await request<HealthImportResult>("/api/health", body);
      setSaved(result); setTransfer(null); setPreview(null); setText(""); setSelected([]); setRetry(false); pending.current = null;
      await loadHistory();
    } catch (e) {
      setError(message(e));
      if (e instanceof HealthRequestError && [400,409,413,415].includes(e.status)) { pending.current = null; setRetry(false); setPreview(null); }
      else setRetry(true); // Retry the identical receipt after an uncertain response.
    } finally { lock.current = false; setBusy(false); }
  }
  const importedValues = transfer ? healthValues(transfer.readings) : {};
  return <div className="app-shell health-shell">
    <header className="topbar"><a className="brand" href="/"><img src="/favicon.svg" width="35" height="35" alt=""/>Track<span className="brand-soft">MyMetric</span></a><a className="secondary-button" href="/"><ArrowLeft size={16}/>Tracker</a></header>
    <main className="health-workspace">
      <div className="health-heading"><div className="round-icon"><HeartPulse size={25}/></div><div><h1>Apple Health</h1><p>Read on your iPhone. Review and save here.</p></div></div>
      <p className="health-status"><Smartphone size={18}/><span><strong>Shortcut setup required on your iPhone.</strong> This is a manual sync. Your browser does not read Health directly.</span></p>
      <div className="health-layout">
        <div>
          <section className="panel health-panel" aria-labelledby="import-title">
            <div className="section-title"><h2 id="import-title">Bring in a reading</h2><a className="text-button" href="#iphone-setup">Set up first <ArrowUpRight size={15}/></a></div>
            <p>Run your shortcut, paste its result below, then choose what to save. Steps, weight, sleep and water are supported.</p>
            <div className="health-actions"><a className="secondary-button" href={"shortcuts://run-shortcut?name=" + encodeURIComponent(shortName)}>Run my shortcut <ArrowUpRight size={16}/></a><button className="secondary-button" disabled={busy || retry} onClick={() => void paste()}><Clipboard size={16}/>Paste reading</button></div>
            <label className="field"><span>Shortcut output</span><textarea ref={input} rows={7} maxLength={16000} disabled={busy || retry} value={text} onChange={e => {setText(e.target.value);setPreview(null);setTransfer(null);setSaved(null);setError("");}} placeholder="Paste your TrackMyMetric Health shortcut output here." autoCapitalize="off" autoCorrect="off" spellCheck={false}/></label>
            {notice && <p className="health-notice" role="status">{notice}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {!preview && <button className="primary-button" disabled={busy || !text.trim()} onClick={() => void previewText()}>{busy?<LoaderCircle className="spin" size={17}/>:<HeartPulse size={17}/>}Preview readings</button>}
            {preview && transfer && <div className="health-preview">
              <h3>{prettyDate(transfer.date, {weekday:"short",day:"numeric",month:"long",year:"numeric"})}</h3>
              <p className="muted">Check the UK date and values. Existing readings are kept unless you select their replacement.</p>
              {transfer.readings.map(r => {
                const m = HEALTH_METRICS.find(m => m.key === r.metric)!, old = preview.values[r.metric], value = importedValues[r.metric];
                const same = old === value;
                return <label className="health-reading" key={r.metric}><Checkbox checked={selected.includes(r.metric)} disabled={busy || retry || same} onCheckedChange={v => setSelected(s => v === true ? [...s,r.metric] : s.filter(k => k !== r.metric))}/><span><strong>{m.label}</strong><span className="health-value">{numberText(value)} <small>{m.displayUnit}</small></span><span className="health-source">{r.source}</span><span className="health-change">{same?"Already matches your tracker":old === undefined?"No value saved for this date":"Replace " + numberText(old) + " " + m.displayUnit + " currently saved"}</span></span></label>;
              })}
              <p className="health-fineprint">Only selected daily values are saved. Re-running the shortcut replaces a selected total; it never adds it to the old total. Study, food, workouts and notes stay as you logged them.</p>
              <div className="health-actions"><button className="primary-button" disabled={busy || (!selected.length && !retry)} onClick={() => void save()}>{busy?<LoaderCircle className="spin" size={17}/>:<Check size={17}/>} {retry?"Retry this save":"Save selected readings"}</button><button className="text-button" disabled={busy} onClick={() => void previewText()}><RefreshCw size={15}/>Refresh preview</button></div>
              {retry && <p className="health-notice">The response was interrupted. Retry this save to check its receipt before starting a different import.</p>}
            </div>}
            {saved && <div className="health-success" role="status"><Check size={23}/><div><strong>Saved for {prettyDate(saved.date)}.</strong><p>{saved.readings.map(r => HEALTH_METRICS.find(m => m.key === r.metric)!.label).join(", ")} updated. <a href="/">Return to your tracker</a>.</p></div></div>}
          </section>
          <section className="panel health-panel"><div className="section-title"><h2>Recent Health imports</h2><button className="text-button" onClick={() => void loadHistory()} aria-label="Refresh recent Health imports"><RefreshCw size={16}/></button></div>
            {historyLoading?<p className="muted" role="status">Loading recent imports…</p>:historyError?<p className="health-notice">{historyError}</p>:imports.length?imports.map((r,i) => <div className="health-history-row" key={r.importedAt+i}><strong>{prettyDate(r.date)}</strong><span>{r.readings.map(v => HEALTH_METRICS.find(m => m.key === v.metric)!.label).join(", ")}</span><small>Imported {new Date(r.importedAt).toLocaleString("en-GB", {timeZone:"Europe/London",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} UK time</small></div>):<p className="muted">No Health readings have been imported yet.</p>}
          </section>
        </div>
        <ShortcutGuide onNotice={setNotice}/>
      </div>
      <footer className="workspace-footer"><span><ShieldCheck size={14}/>Private account · no OpenAI API credits</span><a href="/">Back to tracker</a></footer>
    </main>
  </div>;
}

function ShortcutGuide({onNotice}:{onNotice:(value:string)=>void}) {
  const pageUrl = useSyncExternalStore(subscribeToOrigin, () => new URL("/health", window.location.origin).href, () => "/health");
  const [metric,setMetric] = useState<HealthMetric>("steps"), [copied,setCopied] = useState("");
  const m = HEALTH_METRICS.find(m => m.key === metric)!;
  const template = metric === "sleep" ? "TMM_SLEEP_V1\ndate=[Wake Date]\nsource=[Your sleep source]\n[Combined Text]" : shortcutTemplate(metric);
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label + " copied"); }
    catch { onNotice("Select and copy the displayed text manually."); setCopied("Select and copy the text below."); }
  }
  return <section className="panel health-panel health-guide" id="iphone-setup" aria-labelledby="setup-title">
    <div className="section-title"><h2 id="setup-title">Set up on your iPhone</h2><Smartphone size={20}/></div>
    <p>Build this once in Apple’s <strong>Shortcuts</strong> app. Start with Steps, test one import, then make copies for the other readings you want. No Mac or paid developer account is needed.</p>
    <p className="health-notice">This setup still needs testing on your iPhone. If an action looks different, send a screenshot of that action before saving a reading.</p>
    <label className="field"><span>Reading to connect</span><Select value={metric} onValueChange={v => {setMetric(v as HealthMetric);setCopied("");}}><SelectTrigger className="picker"><SelectValue/></SelectTrigger><SelectContent>{HEALTH_METRICS.map(m => <SelectItem value={m.key} key={m.key}>{m.label}</SelectItem>)}</SelectContent></Select></label>
    <ol className="health-steps">
      <li><strong>Create a shortcut.</strong> Open Shortcuts, tap + and name it <strong>{shortName}</strong>. The Run button on this page opens a shortcut with that exact name.</li>
      {metric !== "sleep" ? <>
        <li><strong>Choose the day.</strong> Add <strong>Date</strong>, choose Specified Date and enter <strong>Yesterday</strong>. Add <strong>Format Date</strong>, choose Custom, and use <code>yyyy-MM-dd</code>. Use UK time on the phone for this setup.</li>
        <li><strong>Find the reading.</strong> Add <strong>Find Health Samples</strong>: Type = <strong>{metric === "weight"?"Weight":metric === "water"?"Water":"Steps"}</strong>, Start Date = <strong>Yesterday</strong>. Add a <strong>Source</strong> filter and choose one device or app you use for that metric.{metric === "weight"?" Sort by Start Date, Latest First, and limit to 1. Use kg.":" Turn off Limit so you get the full day. Use " + (metric === "water"?"ml":"count") + "."}</li>
        <li><strong>Handle missing data.</strong> Add <strong>If</strong> Health Samples has any value. Put the remaining actions inside this branch. In Otherwise, use <strong>Show Alert</strong>: “No Health readings for yesterday.” Do not turn missing readings into 0.</li>
        <li><strong>Get the number.</strong> Inside If, add <strong>Get Details of Health Samples</strong>, choosing <strong>Value</strong>.{metric === "weight"?" Use that latest reading as Health Value.":" Add Calculate Statistics, choose Sum and use that result as Health Value."} If needed, use <strong>Format Number</strong> with grouping off and a decimal point.</li>
      </> : <>
        <li><strong>Choose the wake date.</strong> Add <strong>Current Date</strong>, then <strong>Format Date</strong> with Custom format <code>yyyy-MM-dd</code>. This is Wake Date. Keep the phone on UK time for this setup.</li>
        <li><strong>Find sleep samples.</strong> Add <strong>Find Health Samples</strong>, Type = Sleep, Start Date in the last 2 days. Choose <strong>one Source</strong>, such as your Watch or WHOOP, and turn Limit off.</li>
        <li><strong>Keep the intervals.</strong> Add <strong>Repeat with Each</strong> Health Sample. Inside the loop, get its <strong>Start Date</strong> and <strong>End Date</strong>, formatting each as <strong>ISO 8601</strong> with timezone. Get its <strong>Value</strong> (sleep stage).</li>
        <li><strong>Make one line per interval.</strong> Add Text inside Repeat with <code>[Start Date]|[End Date]|[Value]</code>, replacing each bracketed label with its variable. After End Repeat, add <strong>Combine Text</strong> from Repeat Results, separated by New Lines.</li>
      </>}
      <li><strong>Create the transfer.</strong> Add <strong>Text</strong> and paste the template below. Replace each bracketed label with the relevant Shortcuts variable. Replace the source label with the device or app selected above.</li>
      <li><strong>Return here.</strong> Add <strong>Copy to Clipboard</strong> using that Text. Then add <strong>URL</strong> with the address below, followed by <strong>Open URLs</strong>. Keep these actions inside If when using the missing-data branch.</li>
      <li><strong>Test one day.</strong> Run the shortcut and allow Health access for the selected data. Paste here, compare the preview with your chosen Health source, then save. If it differs, stop and check the date, unit and source.</li>
    </ol>
    <div className="health-template"><div><strong>Text template</strong><button className="text-button" onClick={() => void copy(template,"Template")}><Clipboard size={15}/>Copy</button></div><pre>{template}</pre></div>
    <div className="health-template"><div><strong>Return address</strong><button className="text-button" onClick={() => void copy(pageUrl,"Address")}><Clipboard size={15}/>Copy</button></div><code>{pageUrl}</code></div>
    {copied && <p className="health-notice" role="status">{copied}</p>}
    {metric === "steps" && <p className="health-fineprint"><strong>One source matters.</strong> Adding raw samples from both an iPhone and Watch can count the same steps twice. This shortcut totals one chosen source, which may differ from Health’s combined total. Import it only if that source covers your day.</p>}
    {metric === "weight" && <p className="health-fineprint">Weight is saved on its measurement date. A day with no weigh-in stays blank. If your source returns pounds, change <code>unit=kg</code> to <code>unit=lb</code>; the tracker converts it.</p>}
    {metric === "water" && <p className="health-fineprint">Use one app that records your complete intake. Water replaces the daily total already in TrackMyMetric. If your source returns litres, use <code>unit=L</code>.</p>}
    {metric === "sleep" && <p className="health-fineprint">The tracker merges overlapping Asleep/Core/Deep/REM intervals and excludes Awake/In Bed. It counts sleep from noon before the wake date to noon on the wake date, in UK time. This includes naps in that window and can differ from Apple Health’s display. Interval details stay in this browser; only the reviewed total is saved.</p>}
    <details className="health-help"><summary>Permissions and daily use</summary><p>Health → profile → Apps and Services → Shortcuts lets you review the categories Shortcuts can read. Labels may vary by iOS version. Each sync requires running your shortcut and saving the preview. You can duplicate the shortcut for other metrics; rename your preferred one {shortName} for this page’s Run button.</p><p>No Health data is sent to an OpenAI model API. Your selected readings are stored in your private tracker. This setup does not activate the separate ChatGPT connection.</p><a className="text-button" href="https://support.apple.com/guide/shortcuts/intro-to-find-and-filter-actions-apd3c845e881/ios" target="_blank" rel="noopener noreferrer">Apple’s guide to Find Health Samples <ArrowUpRight size={14}/></a></details>
  </section>;
}
