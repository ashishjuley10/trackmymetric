"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clipboard, Dumbbell, Flame, Footprints, LayoutGrid, LoaderCircle, Moon, Plus, RefreshCw, Scale, Settings2, Share, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Utensils, X, Droplets, BriefcaseBusiness, Trophy, Archive, RotateCcw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { METRICS, NUTRIENTS, DEFAULT_SETTINGS, EMPTY_DAY, dateKey, shiftDate, prettyDate, numberText, hasEntry, habitStreak, seriesFor, type MetricKey, type Day, type Entry, type Data, type Settings, type Meal, type Exercise, type Values } from "@/lib/metrics";
import { effectiveEntry, weeklySummary, reviewCards, coachPrompt, volume, exerciseKey, maxWeight } from "@/lib/analysis";
import { commandSchema, dateSchema } from "@/lib/validation";

const ICONS: Record<string, typeof Activity> = {study:BookOpen,weight:Scale,sleep:Moon,protein:Utensils,calories:Flame,steps:Footprints,practice:Target,applications:BriefcaseBusiness,water:Droplets};
const DAY_KEYS: MetricKey[] = ["study","weight","sleep","steps","practice","applications","water"];
const MAIN_KEYS: MetricKey[] = ["study","weight","sleep","protein","calories","steps","practice","applications"];
const GROUPS = ["Chest","Back","Shoulders","Biceps","Triceps","Legs","Core","Full body","Other"];
const SECTIONS = [{id:"today",name:"Today",icon:LayoutGrid},{id:"train",name:"Train",icon:Dumbbell},{id:"fuel",name:"Fuel",icon:Utensils},{id:"progress",name:"Progress",icon:TrendingUp},{id:"coach",name:"Coach",icon:Sparkles}];
type FormKind = "day"|"meal"|"exercise"|"goals"|"habit"|"install"|"export"|null;
type FormState = {kind:FormKind; item?:Meal|Exercise; date:string; day:Day; revision:number; settings:Settings; settingsRevision:number};
const styleColor = (color: string) => ({"--metric-color":color} as CSSProperties);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

async function requestData(body?: unknown) {
  const response=await fetch("/api/data",body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"}:{cache:"no-store"});
  let result: any;
  try {result=await response.json();} catch {throw new Error("Unable to reach your tracker. Reconnect and try again.");}
  if(!response.ok) throw new Error(result.error||"Unable to save your entry.");
  return result;
}

function Picker({value,onChange,options,label}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string}) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="picker" aria-label={label}><SelectValue /></SelectTrigger><SelectContent position="popper">{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
function Blank({title,description,children}:{title:string;description:string;children?:React.ReactNode}) {
  return <Empty className="empty-state"><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription>{children}</Empty>;
}
function MetricCard({metric,value,target,onClick}:{metric:typeof METRICS[number];value?:number;target?:number;onClick:()=>void}) {
  const Icon=ICONS[metric.key]||Activity;
  const showBar=target && !["weight","calories","sodium","sugar"].includes(metric.key);
  const reached=showBar&&value!==undefined&&value>=target;
  return <button type="button" className="metric-card" style={styleColor(metric.color)} onClick={onClick}>
    <span className="metric-top"><span className="metric-label"><Icon size={17}/>{metric.label}</span><Plus size={15} className="metric-add"/></span>
    <span className="metric-number">{numberText(value,metric.key)}<small>{metric.key==="study"&&value!==undefined&&value>=60?"":metric.unit}</small></span>
    <span className="metric-bottom">{target?<><span>{metric.key==="weight"?"Goal":reached?"Target reached":"Target"} {numberText(target,metric.key)} {metric.key==="study"&&target>=60?"":metric.unit}</span>{reached&&<Check size={15}/>}</>:<span>{value===undefined?"Tap to log":"Logged for this day"}</span>}</span>
    {showBar?<Progress className="metric-progress" aria-label={metric.label+" target"} value={Math.min(100,(value??0)/target*100)}/>:<span className="metric-rule"/>}
  </button>;
}

export default function Tracker() {
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(""),[busy,setBusy]=useState(false);
  const [today,setToday]=useState(dateKey),[selected,setSelected]=useState(dateKey),[tab,setTab]=useState("today");
  const [form,setForm]=useState<FormState|null>(null),[formError,setFormError]=useState("");
  const [confirm,setConfirm]=useState<{title:string;detail:string;run:()=>Promise<void>}|null>(null);
  const [chartKey,setChartKey]=useState<MetricKey>("weight"),[range,setRange]=useState("30");
  const [showArchived,setShowArchived]=useState(false),[lift,setLift]=useState("");
  const saveLock=useRef(false),dataEpoch=useRef(0);
  const refresh=useCallback(async()=>{
    setLoading(true);setLoadError("");
    try{setData(await requestData());}catch(e){setLoadError(errorMessage(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const update=()=>{setToday(dateKey());};
    const id=setInterval(update,60000);window.addEventListener("focus",update);
    return ()=>{clearInterval(id);window.removeEventListener("focus",update);};
  },[]);
  useEffect(()=>{
    let active=true;
    const sync=async()=>{
      if(document.visibilityState!=="visible"||saveLock.current)return;
      const epoch=dataEpoch.current;
      try{const latest=await requestData();if(active&&!saveLock.current&&dataEpoch.current===epoch)setData(latest);}catch{/* Keep the current view; Refresh reports connection errors. */}
    };
    window.addEventListener("focus",sync);document.addEventListener("visibilitychange",sync);
    return()=>{active=false;window.removeEventListener("focus",sync);document.removeEventListener("visibilitychange",sync);};
  },[]);
  const settings=data?.settings??DEFAULT_SETTINGS;
  const stored=data?.entries.find(e=>e.date===selected);
  const day:Day={...EMPTY_DAY,...stored};
  const visible=effectiveEntry({...day,date:selected,revision:stored?.revision??0});
  const entries=data?.entries.map(effectiveEntry)??[];
  const activeHabits=data?.habits.filter(h=>!h.archived)??[];
  const currentHabits=activeHabits.filter(h=>h.created<=selected);
  const weekStart=shiftDate(selected,-((new Date(selected+"T12:00:00Z").getUTCDay()+6)%7));
  const week=Array.from({length:7},(_,i)=>shiftDate(weekStart,i));
  const recent=weeklySummary(data??{entries:[],settings,settingsRevision:0,habits:[],habitLogs:[]},selected);
  const examDays=settings.examDate?Math.round((Date.parse(settings.examDate+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000):null;
  const loggedDays=new Set(data?.entries.filter(hasEntry).map(e=>e.date)??[]);
  let loggingStreak=0,cursor=loggedDays.has(today)?today:shiftDate(today,-1);
  while(loggedDays.has(cursor)){loggingStreak++;cursor=shiftDate(cursor,-1);}
  const openForm=(kind:FormKind,item?:Meal|Exercise)=>{
    if(!data && !["install","export"].includes(kind??"")) return;
    setFormError("");
    setForm({kind,item,date:selected,day:structuredClone(day),revision:stored?.revision??0,settings:structuredClone(settings),settingsRevision:data?.settingsRevision??0});
  };
  const mutate=async(body:unknown,onResult:(value:any)=>void)=>{
    if(saveLock.current) throw new Error("Please wait for the current save.");
    const parsed=commandSchema.safeParse(body);
    if(!parsed.success) throw new Error(parsed.error.issues[0]?.message||"Check your entry.");
    saveLock.current=true;dataEpoch.current++;setBusy(true);
    try{const result=await requestData(parsed.data);onResult(result);return result;}
    finally{saveLock.current=false;setBusy(false);}
  };
  const saveDay=async(next:Day,date=selected,revision=stored?.revision??0)=>{
    return mutate({action:"saveDay",date,revision,...next},(entry:Entry)=>setData(d=>d?{...d,entries:[entry,...d.entries.filter(e=>e.date!==entry.date)]}:d));
  };
  const saveForm=async(next:Day|Settings|string)=>{
    if(!form)return;
    setFormError("");
    try{
      if(form.kind==="goals") await mutate({action:"saveSettings",revision:form.settingsRevision,settings:next},r=>setData(d=>d?{...d,...r}:d));
      else if(form.kind==="habit") await mutate({action:"addHabit",id:crypto.randomUUID(),name:next,date:form.date},r=>setData(d=>d?{...d,habits:[...d.habits,r]}:d));
      else await saveDay(next as Day,form.date,form.revision);
      setForm(null);toast.success("Saved to your tracker");
    }catch(e){setFormError(errorMessage(e));}
  };
  const toggleHabit=async(id:string,completed:boolean)=>{
    try{await mutate({action:"toggleHabit",id,date:selected,completed},r=>setData(d=>d?{...d,habitLogs:[...d.habitLogs.filter(l=>!(l.habitId===id&&l.date===r.date)),...(completed?[{habitId:id,date:r.date}]:[])]}:d));}
    catch(e){toast.error(errorMessage(e));}
  };
  const archiveHabit=async(id:string,archived:boolean)=>{
    await mutate({action:"archiveHabit",id,archived},()=>setData(d=>d?{...d,habits:d.habits.map(h=>h.id===id?{...h,archived}:h)}:d));
  };
  const deleteHabit=async(id:string)=>{
    await mutate({action:"deleteHabit",id},()=>setData(d=>d?{...d,habits:d.habits.filter(h=>h.id!==id),habitLogs:d.habitLogs.filter(l=>l.habitId!==id)}:d));
  };
  useEffect(()=>{
    const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options?:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    Promise.resolve(context.registerTool({name:"read_metric_week",title:"Read weekly metrics",description:"Read a seven-day summary of the signed-in user's recorded metrics. Does not modify records.",inputSchema:{type:"object",properties:{endDate:{type:"string",description:"Week ending date in YYYY-MM-DD; default today in UK time."}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{
      const args=input as {endDate?:unknown};
      if(!args||typeof args!=="object"||Object.keys(args).some(k=>k!=="endDate"))throw new Error("Invalid input");
      const end=args.endDate===undefined?dateKey():dateSchema.parse(args.endDate);
      const latest=await requestData() as Data;setData(latest);
      const s=weeklySummary(latest,end);return {from:s.start,to:s.end,metrics:s.stats,trainingDays:s.workouts,restDays:s.rests};
    }},{signal:lifecycle.signal})).catch(()=>{});
    return()=>lifecycle.abort();
  },[]);
  const openMetric=(key:MetricKey)=>{
    if(NUTRIENTS.includes(key as typeof NUTRIENTS[number]))openForm("meal");
    else openForm("day");
  };
  const selectedMetric=METRICS.find(m=>m.key===chartKey)!;
  const series=seriesFor(entries,chartKey,selected,Number(range));
  const samples=series.filter(p=>p.value!==null);
  const average=samples.length?samples.reduce((s,p)=>s+p.value!,0)/samples.length:undefined;
  const diff=samples.length>1?samples.at(-1)!.value!-samples[0].value!:undefined;
  const allExercises=(data?.entries??[]).flatMap(d=>(d.exercises??[]).map(e=>({...e,date:d.date}))).sort((a,b)=>a.date.localeCompare(b.date));
  const liftNames=Array.from(new Map(allExercises.map(e=>[exerciseKey(e.name),e.name])).entries());
  const chosenLift=lift||liftNames[0]?.[0]||"";
  const liftHistory=allExercises.filter(e=>exerciseKey(e.name)===chosenLift);
  const liftPoints=Array.from(new Set(liftHistory.map(e=>e.date))).map(date=>({date,weight:Math.max(...liftHistory.filter(e=>e.date===date).map(maxWeight))}));
  const recentFoodKeys=new Set<string>();
  const recentFoods=(data?.entries??[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).flatMap(e=>e.meals??[]).filter(m=>{const key=m.name.toLowerCase()+m.portion.toLowerCase();if(recentFoodKeys.has(key))return false;recentFoodKeys.add(key);return true;}).slice(0,15);
  const priorSession=(data?.entries??[]).filter(e=>e.date<selected&&e.exercises?.length).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const exportJson=()=>{
    if(!data)return;
    const blob=new Blob([JSON.stringify({app:"TrackMyMetric",version:1,exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="TrackMyMetric-"+today+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const copyReview=async()=>{
    if(!data)return;
    try{await navigator.clipboard.writeText(coachPrompt(data,selected));toast.success("Review copied. Paste it into ChatGPT.");}
    catch{toast.error("Clipboard unavailable. Select and copy the review below.");}
  };

  return <div className="app-shell">
    <Toaster position="top-center" theme="dark" richColors/>
    <header className="topbar">
      <a href="/" className="brand" aria-label="TrackMyMetric home"><img src="/favicon.svg" alt="" width="35" height="35"/><span>Track<span className="brand-soft">My</span>Metric</span></a>
      <div className="top-actions"><span className="private-badge"><ShieldCheck size={14}/>Just for you</span>
        <button className="icon-button" aria-label="Install on iPhone" onClick={()=>openForm("install")}><Share size={19}/></button>
        <button className="icon-button" aria-label="Goals and settings" onClick={()=>openForm("goals")} disabled={!data||loading||busy}><Settings2 size={20}/></button>
      </div>
    </header>
    <Tabs value={tab} onValueChange={setTab} className="app-tabs">
      <TabsList className="main-nav" aria-label="Tracker sections">{SECTIONS.map(s=><TabsTrigger value={s.id} key={s.id} className="nav-item"><s.icon size={20}/><span>{s.name}</span></TabsTrigger>)}</TabsList>
      <main className="workspace">
        <div className="page-heading">
          <div><p className="eyebrow">{prettyDate(selected,{weekday:"long",day:"numeric",month:"long"})}</p><h1>{tab==="today"?(selected===today?"Your day, at a glance.":"Your day, recorded."):tab==="train"?"Your training log.":tab==="fuel"?"Fuel your progress.":tab==="progress"?"See the bigger picture.":"Your ChatGPT coach."}</h1></div>
          <div className="heading-actions"><button className="icon-button refresh-button" aria-label="Refresh saved records" disabled={loading||busy} onClick={()=>void refresh()}><RefreshCw size={18} className={loading?"spin":""}/></button><label className="date-picker"><CalendarDays size={17}/><input type="date" aria-label="Select log date, UK time" value={selected} min="2000-01-01" max={today} onChange={e=>{if(dateSchema.safeParse(e.target.value).success&&e.target.value<=today)setSelected(e.target.value);}}/></label></div>
        </div>
        <div className="date-rail"><button className="rail-arrow" aria-label="Previous week" disabled={selected<"2000-01-08"} onClick={()=>setSelected(shiftDate(selected,-7))}><ChevronLeft size={19}/></button>
          <div className="week-days">{week.map(d=><button key={d} className={"day-chip "+(d===selected?"selected":"")} aria-label={prettyDate(d)+(loggedDays.has(d)?", has entries":"")} aria-pressed={d===selected} disabled={d>today||d<"2000-01-01"} onClick={()=>setSelected(d)}><span>{prettyDate(d,{weekday:"short"})}</span><strong>{prettyDate(d,{day:"numeric"})}</strong><i className={loggedDays.has(d)?"has-log":""}/></button>)}</div>
          <button className="rail-arrow" aria-label="Next week" disabled={selected>=today} onClick={()=>setSelected(shiftDate(selected,7)>today?today:shiftDate(selected,7))}><ChevronRight size={19}/></button>
          {selected!==today&&<button className="text-button jump-today" onClick={()=>setSelected(today)}>Today</button>}
        </div>
        {loadError&&<div className="error-banner" role="alert"><span>{loadError}</span><button onClick={()=>void refresh()}>Try again</button><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a></div>}
        {loading&&!data&&<div className="loading-banner" role="status"><LoaderCircle size={18} className="spin"/>Loading your private tracker…</div>}
        <TabsContent value="today">
          <a className="health-entry-link" href="/health"><span><strong>Apple Health</strong><span>Set up a shortcut, then review and import your readings.</span></span><span className="secondary-button">Health sync <ArrowUpRight size={16}/></span></a>
          <div className="overview-strip">
            <div className="focus-block"><span className="focus-icon"><BookOpen size={24}/></span><div><p className="eyebrow">STUDY FOCUS</p><h2>{settings.examName||"Your next goal"}</h2><p>{settings.examDate?(examDays!>0?examDays+" days until "+prettyDate(settings.examDate):examDays===0?"Your deadline is today":"Update your next deadline in Goals"):"Set a deadline in Goals"}</p></div><span className="focus-number">{numberText(visible.values.study,"study")}<small>{visible.values.study===undefined?"not logged":visible.values.study<60?"min logged":"logged"}</small></span></div>
            <div className="streak-block"><Flame size={24}/><strong>{loggingStreak}<span>day{loggingStreak===1?"":"s"}</span></strong><p>Logging streak</p></div>
          </div>
          <div className="section-title"><h2>Your metrics <span>{Object.keys(visible.values).length} logged</span></h2><button className="primary-button" disabled={!data||loading||busy} onClick={()=>openForm("day")}><Plus size={18}/>Log day</button></div>
          <div className="metrics-grid">{MAIN_KEYS.map(key=><MetricCard key={key} metric={METRICS.find(m=>m.key===key)!} value={visible.values[key]} target={settings.goals[key]} onClick={()=>openMetric(key)}/>)}</div>
          <div className="two-column">
            <section className="panel habit-panel"><div className="section-title"><h2>Daily habits <span>{currentHabits.filter(h=>data?.habitLogs.some(l=>l.habitId===h.id&&l.date===selected)).length}/{currentHabits.length}</span></h2><button className="icon-button" aria-label="Add a habit" disabled={!data||loading||busy} onClick={()=>openForm("habit")}><Plus size={19}/></button></div>
              {currentHabits.length?currentHabits.map(h=>{const done=data!.habitLogs.some(l=>l.habitId===h.id&&l.date===selected);const streak=habitStreak(data!.habitLogs,h.id,today);return <div className={"habit-row "+(done?"completed":"")} key={h.id}><Checkbox id={"habit-"+h.id} checked={done} disabled={busy} onCheckedChange={c=>void toggleHabit(h.id,c===true)} className="habit-check"/><label htmlFor={"habit-"+h.id}>{h.name}<small>{streak?streak+" day streak":"Daily habit"}</small></label><button className="subtle-icon" aria-label={"Archive "+h.name} disabled={busy} onClick={()=>setConfirm({title:"Archive this habit?",detail:"It will leave your daily list. Your history stays saved, and you can restore it.",run:()=>archiveHabit(h.id,true)})}><Archive size={16}/></button></div>;}):<Blank title={activeHabits.length?"No habits on this date":"Make consistency visible."} description={activeHabits.length?"Your active habits were created after this date.":"Add a small daily action you want to keep doing."}><button className="secondary-button" disabled={!data||loading||busy} onClick={()=>openForm("habit")}><Plus size={17}/>Add your first habit</button></Blank>}
              {!!data?.habits.some(h=>h.archived)&&<><button className="text-button archived-toggle" onClick={()=>setShowArchived(!showArchived)}>{showArchived?"Hide":"Show"} archived habits</button>{showArchived&&data.habits.filter(h=>h.archived).map(h=><div className="habit-row" key={h.id}><Archive size={18}/><span className="grow">{h.name}</span><button className="text-button" disabled={busy} onClick={()=>void archiveHabit(h.id,false).catch(e=>toast.error(errorMessage(e)))}>Restore</button><button className="subtle-icon" aria-label={"Delete "+h.name+" permanently"} disabled={busy} onClick={()=>setConfirm({title:"Permanently delete this habit?",detail:"Its name and all completion history will be removed. This cannot be undone.",run:()=>deleteHabit(h.id)})}><Trash2 size={16}/></button></div>)}</>}
            </section>
            <section className="panel recovery-panel"><div className="section-title"><h2>Recovery & training</h2><button className="text-button" disabled={!data||loading||busy} onClick={()=>openForm("day")}>Edit <ArrowUpRight size={15}/></button></div><div className="recovery-status"><span className="round-icon"><Dumbbell size={22}/></span><div><strong>{day.exercises.length?day.exercises.length+" exercises logged":day.workout==="trained"?"Workout complete":day.workout==="rest"?"Planned rest day":"No training status yet"}</strong><p>{day.workout==="rest"?"Rest is part of your training plan.":"Log your session in the Train tab."}</p></div></div><div className="recovery-stats"><span>Fatigue<strong>{day.fatigue?day.fatigue+"/5":"—"}</strong></span><span>Soreness<strong>{day.soreness?day.soreness+"/5":"—"}</strong></span><span>Water<strong>{visible.values.water!==undefined?(visible.values.water/1000).toLocaleString("en-GB")+" L":"—"}</strong></span></div>{day.note?<p className="journal-note">{day.note}</p>:<button className="journal-prompt" disabled={!data||loading||busy} onClick={()=>openForm("day")}>How did today feel? Add a note <Plus size={16}/></button>}</section>
          </div>
        </TabsContent>
        <TabsContent value="train">
          <div className="section-title"><div><h2>Workout logbook</h2><p className="muted">Log each set. Compare the same exercise over time.</p></div><button className="primary-button" disabled={!data||loading||busy} onClick={()=>openForm("exercise")}><Plus size={18}/>Exercise</button></div>
          <div className="stat-strip"><div><span>Exercises</span><strong>{day.exercises.length}</strong></div><div><span>Working sets</span><strong>{day.exercises.reduce((n,e)=>n+e.sets.length,0)}</strong></div><div><span>Load volume</span><strong>{numberText(day.exercises.reduce((n,e)=>n+volume(e),0))}<small>kg</small></strong></div><div><span>Status</span><strong className="status-value">{day.workout==="rest"?"Rest":day.workout==="trained"||day.exercises.length?"Trained":"Unlogged"}</strong></div></div>
          {!day.exercises.length?<section className="panel"><Blank title={day.workout==="rest"?"A planned day to recover.":"Your next session starts here."} description="Add an exercise, then record weight, reps and optional RPE for every set."><div className="button-row"><button className="primary-button" disabled={!data||loading||busy} onClick={()=>openForm("exercise")}><Plus size={17}/>Add exercise</button>{day.workout!=="rest"&&<button className="secondary-button" disabled={!data||busy} onClick={()=>void saveDay({...day,workout:"rest"}).then(()=>toast.success("Rest day saved")).catch(e=>toast.error(errorMessage(e)))}>Mark rest day</button>}</div>{priorSession&&<button className="text-button" disabled={busy} onClick={()=>setConfirm({title:"Repeat your last session?",detail:"Copy exercises and recorded sets from "+prettyDate(priorSession.date)+". Review the weights and reps for today before training.",run:async()=>{await saveDay({...day,workout:"trained",exercises:priorSession.exercises.map(e=>({...e,id:crypto.randomUUID()}))});}})}><RotateCcw size={16}/>Copy last session</button>}</Blank></section>:<div className="exercise-list">{day.exercises.map(ex=>{
            const past=allExercises.filter(e=>e.date<selected&&exerciseKey(e.name)===exerciseKey(ex.name));
            const best=past.length?Math.max(...past.map(maxWeight)):null;
            const newBest=best!==null&&maxWeight(ex)>best;
            return <section className="panel exercise-card" key={ex.id}><div className="exercise-heading"><span className="round-icon"><Dumbbell size={20}/></span><div className="grow"><h3>{ex.name}</h3><p className="muted">{ex.muscle} · {ex.sets.length} sets{newBest&&<span className="pr-badge"><Trophy size={13}/>Heaviest logged</span>}</p></div><button className="text-button" onClick={()=>openForm("exercise",ex)}>Edit</button><button className="subtle-icon" aria-label={"Delete "+ex.name} onClick={()=>setConfirm({title:"Delete this exercise?",detail:ex.name+" and its sets will be removed from "+prettyDate(selected)+".",run:async()=>{await saveDay({...day,exercises:day.exercises.filter(e=>e.id!==ex.id)});}})}><Trash2 size={16}/></button></div><div className="set-table"><div className="set-table-header"><span>Set</span><span>Weight</span><span>Reps</span><span>RPE</span></div>{ex.sets.map((s,i)=><div className="set-table-row" key={i}><span>{i+1}</span><strong>{s.weight} <small>kg</small></strong><strong>{s.reps}</strong><span>{s.rpe??"—"}</span></div>)}</div>{ex.note&&<p className="journal-note">{ex.note}</p>}{best!==null&&<p className="exercise-foot">Previous heaviest: {best} kg · Today’s load volume: {numberText(volume(ex))} kg</p>}</section>;
          })}</div>}
          {liftNames.length>0&&<section className="panel lift-chart"><div className="section-title"><h2>Lift history</h2><Picker label="Exercise history" value={chosenLift} onChange={setLift} options={liftNames.map(([value,label])=>({value,label}))}/></div><div className="chart-summary"><strong>{Math.max(...liftHistory.map(maxWeight))}<small>kg</small></strong><span>Heaviest recorded load · {liftPoints.length} session days</span></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><LineChart data={liftPoints} margin={{top:15,right:15,left:-18,bottom:5}}><CartesianGrid vertical={false} stroke="#2a302a" strokeDasharray="3 5"/><XAxis dataKey="date" tickFormatter={d=>prettyDate(d,{day:"numeric",month:"short"})} stroke="#9aab9b" fontSize={12} tickLine={false}/><YAxis domain={["auto","auto"]} stroke="#9aab9b" fontSize={12} tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:"#20251f",borderColor:"#384335",borderRadius:12}} labelFormatter={d=>prettyDate(String(d))}/><Line type="linear" dataKey="weight" name="Heaviest load (kg)" stroke="#b9f66b" strokeWidth={2.5} dot={{r:4}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><p className="muted">Compare matching equipment and technique. Bodyweight is not included in load volume.</p></section>}
        </TabsContent>
        <TabsContent value="fuel">
          <div className="section-title"><div><h2>Nutrition diary</h2><p className="muted">Use the nutrition values for the portion you ate.</p></div><button className="primary-button" disabled={!data||loading||busy} onClick={()=>openForm("meal")}><Plus size={18}/>Food</button></div>
          <div className="nutrition-summary"><div className="calorie-display"><Flame size={23}/><span>Calories logged</span><strong>{numberText(visible.values.calories)}<small>kcal</small></strong><p>{settings.goals.calories?"Your target: "+settings.goals.calories+" kcal":"Set your own calorie target in Goals"}</p></div><div className="macro-bars">{(["protein","carbs","fat"] as const).map(k=>{const m=METRICS.find(m=>m.key===k)!;const target=settings.goals[k];return <div className="macro" key={k} style={styleColor(m.color)}><div><span>{m.label}</span><strong>{numberText(visible.values[k])} g{target&&<small> / {target} g</small>}</strong></div>{target?<Progress value={Math.min(100,(visible.values[k]??0)/target*100)} aria-label={m.label+" target"} className="metric-progress"/>:<div className="macro-line"/>}</div>;})}</div></div>
          <div className="micro-strip">{(["sugar","fibre","sodium","water"] as const).map(k=><button key={k} onClick={()=>openMetric(k)}><span>{METRICS.find(m=>m.key===k)!.label}</span><strong>{numberText(visible.values[k])}<small>{k==="water"?"ml":k==="sodium"?"mg":"g"}</small></strong></button>)}</div>
          <p className="small-note">A dash means not logged or incomplete. Optional nutrients total only when every food includes a value.</p>
          <section className="panel"><div className="section-title"><h2>Meals <span>{day.meals.length} foods</span></h2><button className="text-button" disabled={!data||loading||busy} onClick={()=>openForm("day")}><Droplets size={16}/>Log water</button></div>{day.meals.length?["Breakfast","Lunch","Dinner","Snack"].map(type=>{const meals=day.meals.filter(m=>m.type===type);return meals.length?<div className="meal-group" key={type}><h3>{type}</h3>{meals.map(meal=><div className="meal-row" key={meal.id}><span className="meal-dot"/><div className="grow"><strong>{meal.name}</strong><p>{meal.portion} · {meal.nutrients.protein} g protein</p></div><span className="food-kcal">{meal.nutrients.calories}<small>kcal</small></span><button className="text-button" onClick={()=>openForm("meal",meal)}>Edit</button><button className="subtle-icon" aria-label={"Delete "+meal.name} onClick={()=>setConfirm({title:"Delete this food?",detail:meal.name+" will be removed from this day’s totals.",run:async()=>{await saveDay({...day,meals:day.meals.filter(m=>m.id!==meal.id)});}})}><Trash2 size={15}/></button></div>)}</div>:null;}):<Blank title="What’s on the menu?" description="Add a food, a meal-prep portion or your full-day totals. Enter the values from your label or recipe."><button className="primary-button" disabled={!data||loading||busy} onClick={()=>openForm("meal")}><Plus size={17}/>Log your first food</button></Blank>}</section>
        </TabsContent>
        <TabsContent value="progress">
          <section className="panel trend-panel"><div className="section-title"><Picker label="Metric to chart" value={chartKey} onChange={k=>setChartKey(k as MetricKey)} options={METRICS.map(m=>({value:m.key,label:m.label}))}/><Tabs value={range} onValueChange={setRange}><TabsList className="range-tabs">{["7","30","90"].map(r=><TabsTrigger key={r} value={r}>{r}D</TabsTrigger>)}</TabsList></Tabs></div><div className="chart-summary"><strong style={{color:selectedMetric.color}}>{numberText(average,chartKey)}<small>{chartKey==="study"&&average!==undefined&&average>=60?"":selectedMetric.unit}</small></strong><span>Average across {samples.length} logged days</span>{diff!==undefined&&<p className="trend-change">{diff>0?"+":""}{numberText(diff)} {selectedMetric.unit} from first to latest log</p>}</div>{samples.length?<div className="chart-container"><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{top:15,right:15,left:-15,bottom:5}}><CartesianGrid vertical={false} stroke="#2a302a" strokeDasharray="3 5"/><XAxis dataKey="date" tickFormatter={d=>prettyDate(d,{day:"numeric",month:"short"})} stroke="#9aab9b" fontSize={12} minTickGap={35} tickLine={false}/><YAxis domain={["auto","auto"]} stroke="#9aab9b" fontSize={12} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#20251f",borderColor:"#384335",borderRadius:12}} labelFormatter={d=>prettyDate(String(d))}/>{settings.goals[chartKey]!==undefined&&<ReferenceLine y={settings.goals[chartKey]} stroke="#7a8576" strokeDasharray="4 4"/>}<Line type="linear" dataKey="value" name={selectedMetric.label+" ("+selectedMetric.unit+")"} stroke={selectedMetric.color} strokeWidth={2.5} dot={{r:3.5,fill:selectedMetric.color}} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>:<Blank title="Your progress will appear here." description={"Log "+selectedMetric.label.toLowerCase()+" to start a real history."}><button className="secondary-button" disabled={!data||loading||busy} onClick={()=>openMetric(chartKey)}>Add a log</button></Blank>}<p className="small-note">Window ends {prettyDate(selected)}. Gaps are unlogged days, not zeros. Dashed line is your current target.</p></section>
          <div className="section-title"><h2>Last seven days</h2><button className="text-button" disabled={!data||loading||busy} onClick={()=>openForm("goals")}>Edit goals <ArrowUpRight size={15}/></button></div>
          <div className="weekly-grid">{(["study","sleep","protein","steps"] as const).map(k=>{const s=recent.stats[k],m=METRICS.find(m=>m.key===k)!;const target=settings.goals[k];const hit=recent.days.filter(e=>target&&e.values[k]!==undefined&&e.values[k]!>=target).length;return <div className="panel weekly-card" key={k} style={styleColor(m.color)}><span>{m.label}</span><strong>{numberText(s.average??undefined,k)}<small>{k==="study"&&(s.average??0)>=60?"":m.unit}</small></strong><p>{s.count}/7 days logged{target?" · "+hit+" hit target":""}</p></div>;})}</div>
          <section className="panel"><div className="section-title"><h2>Recent entries</h2><button className="text-button" disabled={!data||loading||busy} onClick={()=>openForm("export")}><ArrowDownToLine size={16}/>Export</button></div>{entries.filter(hasEntry).length?<div className="history-list">{entries.filter(hasEntry).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30).map(e=><button key={e.date} onClick={()=>{setSelected(e.date);setTab("today");}}><span><strong>{prettyDate(e.date,{weekday:"short",day:"numeric",month:"short"})}</strong><small>{Object.keys(e.values).length} metrics · {e.exercises.length} exercises · {e.meals.length} foods</small></span><ChevronRight size={18}/></button>)}</div>:<Blank title="No recorded days yet." description="Your saved daily entries will appear here."/ >}</section>
        </TabsContent>
        <TabsContent value="coach">
          <section className="panel chatgpt-panel coach-connect"><div><span className="eyebrow">YOUR CHATGPT ACCOUNT</span><h2>Your coach is in ChatGPT.</h2><p>Review your week with your usual ChatGPT account. Copy your summary below, paste it into this chat, and ask what to focus on next.</p></div><button className="primary-button" disabled={!data||loading||busy} onClick={()=>void copyReview()}><Clipboard size={17}/>Copy review</button><div className="coach-examples"><p className="connection-status"><strong>Direct connection is not active.</strong><br/>The connection tools are built, but this account does not currently have Sites-to-ChatGPT connections enabled. ChatGPT cannot automatically read or update your tracker yet.</p><a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT <ArrowUpRight size={16}/></a></div><p className="small-note">No OpenAI API key or model API credits are needed for copy and chat. Your journal notes stay out of the copied review. Recommendations must be entered into the tracker manually while the direct connection is unavailable.</p><details><summary>Preview your review</summary><textarea readOnly aria-label="Weekly review for ChatGPT" value={data?coachPrompt(data,selected):""} rows={8}/></details><details><summary>Prepared for the direct connection</summary><p>Once account support is enabled and connected, the tools can read daily and weekly logs, save workouts and meals, update daily metrics, manage habit completions and change the targets you request. They use your private records and guard against duplicate saves.</p></details></section>
          <div className="review-heading"><div className="review-icon"><Sparkles size={27}/></div><div><h2>{prettyDate(shiftDate(selected,-6),{day:"numeric",month:"short"})} – {prettyDate(selected,{day:"numeric",month:"short"})}</h2><p>Calculated from your logs. Missing data stays visible.</p></div><span className="calculated-badge">Calculated insights</span></div>
          <div className="review-grid">{data?reviewCards(data,selected).map((card,i)=><article className={"panel insight-card "+card.tone} key={i}><span className="insight-index">0{i+1}</span><h3>{card.title}</h3><p>{card.detail}</p></article>):<Blank title="Load your tracker to see a review." description="Your records are required to calculate this summary."/ >}</div>

        </TabsContent>
        <footer className="workspace-footer"><span><ShieldCheck size={13}/>Private account · UK dates</span><a href="/health">Apple Health</a><button onClick={()=>openForm("install")}>Add to iPhone <ArrowUpRight size={13}/></button></footer>
      </main>
    </Tabs>
    <Dialog open={!!form} onOpenChange={open=>{if(!open&&!busy)setForm(null);}}>
      <DialogContent className="tracker-dialog" onInteractOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} showCloseButton={!busy}>
        <DialogHeader><DialogTitle>{form?.kind==="day"?"Log your day":form?.kind==="meal"?(form.item?"Edit food":"Log food"):form?.kind==="exercise"?(form.item?"Edit exercise":"Log exercise"):form?.kind==="goals"?"Your goals":form?.kind==="habit"?"Add a daily habit":form?.kind==="export"?"Your data":"Add to your iPhone"}</DialogTitle><DialogDescription>{["day","meal","exercise"].includes(form?.kind??"")?prettyDate(form!.date)+" · UK time":form?.kind==="goals"?"Your targets stay under your control. Leave a target blank to remove it.":form?.kind==="habit"?"Choose a small action you want to do every day.":"TrackMyMetric"}</DialogDescription></DialogHeader>
        {formError&&<p className="form-error" role="alert">{formError}</p>}
        {form?.kind==="day"&&<DayForm initial={form.day} busy={busy} onSave={d=>void saveForm(d)}/>}
        {form?.kind==="meal"&&<MealForm initial={form.day} recentFoods={recentFoods} item={form.item as Meal|undefined} busy={busy} onSave={d=>void saveForm(d)}/>}
        {form?.kind==="exercise"&&<ExerciseForm initial={form.day} item={form.item as Exercise|undefined} busy={busy} onSave={d=>void saveForm(d)}/>}
        {form?.kind==="goals"&&<GoalsForm initial={form.settings} busy={busy} onSave={s=>void saveForm(s)} onExport={()=>{setForm({...form,kind:"export"});setFormError("");}}/>}
        {form?.kind==="habit"&&<HabitForm busy={busy} onSave={n=>void saveForm(n)}/>}
        {form?.kind==="install"&&<div className="install-content"><div className="app-icon-preview"><img src="/favicon.svg" width="76" height="76" alt="TrackMyMetric icon"/><strong>MyMetric</strong></div><ol><li>Open this app’s link in <strong>Safari</strong> on your iPhone and sign in.</li><li>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li><li>If shown, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</li></ol><p className="small-note">An internet connection is required to load and save. <a href="/health">Apple Health imports</a> use a shortcut you set up on your iPhone and a review before saving. Background Health sync, direct WHOOP sync and push reminders are not connected.</p></div>}
        {form?.kind==="export"&&<div className="export-content"><ShieldCheck size={32}/><h3>Your logs belong to you.</h3><p>Download your entries, meals, workouts, habits and goals as a JSON backup. Keep it somewhere private; it includes your journal notes.</p><button className="primary-button" disabled={!data||loading||busy} onClick={exportJson}><ArrowDownToLine size={17}/>Download all my data</button><p className="small-note">Your records are stored privately with this app and tied to your signed-in account. This export is a readable file. Restore from a file is not available in this version.</p><a className="text-button" href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a></div>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!confirm} onOpenChange={v=>{if(!v&&!busy)setConfirm(null);}}><AlertDialogContent className="confirm-dialog"><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.detail}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();if(confirm)void confirm.run().then(()=>{setConfirm(null);toast.success("Updated");}).catch(e=>toast.error(errorMessage(e)));}}>{busy?"Saving…":"Confirm"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Submit({busy,label="Save entry"}:{busy:boolean;label?:string}) {
  return <button className="primary-button submit-button" type="submit" disabled={busy}>{busy?<><LoaderCircle size={17} className="spin"/>Saving…</>:<><Check size={17}/>{label}</>}</button>;
}
function NumericField({metric,value,onChange,label,required=false}:{metric:typeof METRICS[number];value:string;onChange:(s:string)=>void;label?:string;required?:boolean}) {
  return <label className="field"><span>{label||metric.label}<small>{metric.unit}</small></span><input type="number" inputMode={metric.step===1?"numeric":"decimal"} min={metric.key==="weight"?0.1:0} max={metric.max} step={metric.step} value={value} onChange={e=>onChange(e.target.value)} placeholder="Not logged" required={required}/></label>;
}
function DayForm({initial,busy,onSave}:{initial:Day;busy:boolean;onSave:(day:Day)=>void}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(DAY_KEYS.map(k=>[k,initial.values[k]?.toString()??""])));
  const [workout,setWorkout]=useState(initial.exercises.length?"trained":initial.workout),[note,setNote]=useState(initial.note);
  const [fatigue,setFatigue]=useState(initial.fatigue?.toString()??"none"),[soreness,setSoreness]=useState(initial.soreness?.toString()??"none");
  const submit=(e:FormEvent)=>{e.preventDefault();onSave({...initial,values:Object.fromEntries(Object.entries(values).filter(([,v])=>v!=="").map(([k,v])=>[k,Number(v)])),workout:workout as Day["workout"],note,fatigue:fatigue==="none"?undefined:Number(fatigue),soreness:soreness==="none"?undefined:Number(soreness)});};
  return <form onSubmit={submit} className="edit-form"><fieldset disabled={busy}><div className="form-grid">{DAY_KEYS.map(k=><NumericField key={k} metric={METRICS.find(m=>m.key===k)!} value={values[k]} onChange={v=>setValues({...values,[k]:v})}/>)}</div><p className="small-note">Study time is in minutes. Log sleep against the day you woke up. Food totals come from your Nutrition diary.</p><label className="field"><span>Training status</span><Picker value={workout} onChange={v=>setWorkout(v as Day["workout"])} label="Training status" options={initial.exercises.length?[{value:"trained",label:"Workout logged"}]:[{value:"none",label:"Not recorded"},{value:"trained",label:"Trained today"},{value:"rest",label:"Planned rest day"}]}/></label><div className="form-grid">{[{key:"Fatigue",value:fatigue,set:setFatigue},{key:"Soreness",value:soreness,set:setSoreness}].map(f=><label key={f.key} className="field"><span>{f.key}</span><Picker label={f.key} value={f.value} onChange={f.set} options={[{value:"none",label:"Not recorded"},...[1,2,3,4,5].map(n=>({value:String(n),label:n+" / 5"+(n===1?" · Very low":n===5?" · Very high":"")}))]}/></label>)}</div><label className="field"><span>Daily note</span><textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Energy, training, study or anything worth remembering."/></label></fieldset><Submit busy={busy}/></form>;
}
function MealForm({initial,item,busy,onSave,recentFoods}:{initial:Day;item?:Meal;busy:boolean;onSave:(d:Day)=>void;recentFoods:Meal[]}) {
  const [name,setName]=useState(item?.name??""),[portion,setPortion]=useState(item?.portion??""),[type,setType]=useState(item?.type??"Lunch");
  const [numbers,setNumbers]=useState<Record<string,string>>(()=>Object.fromEntries(NUTRIENTS.map(k=>[k,item?.nutrients[k]?.toString()??""])));
  const submit=(e:FormEvent)=>{e.preventDefault();const meal:Meal={id:item?.id??crypto.randomUUID(),name:name.trim(),portion:portion.trim(),type,nutrients:Object.fromEntries(Object.entries(numbers).filter(([,v])=>v!=="").map(([k,v])=>[k,Number(v)]))};onSave({...initial,meals:item?initial.meals.map(m=>m.id===item.id?meal:m):[...initial.meals,meal]});};
  return <form className="edit-form" onSubmit={submit}><fieldset disabled={busy}>{!item&&recentFoods.length>0&&<label className="field"><span>Reuse a previous entry</span><Picker label="Reuse a previous food" value="choose" onChange={id=>{const m=recentFoods.find(m=>m.id===id);if(m){setName(m.name);setPortion(m.portion);setType(m.type);setNumbers(Object.fromEntries(NUTRIENTS.map(k=>[k,m.nutrients[k]?.toString()??""])));}}} options={[{value:"choose",label:"Choose a saved meal or food"},...recentFoods.map(m=>({value:m.id,label:m.name+" · "+m.portion}))]}/><small className="muted">Copies the portion and nutrition for you to review.</small></label>}<label className="field"><span>Food or meal</span><input required autoComplete="off" maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Chicken noodle meal prep"/></label><div className="form-grid"><label className="field"><span>Portion eaten</span><input required maxLength={80} value={portion} onChange={e=>setPortion(e.target.value)} placeholder="e.g. 1 prepared container"/></label><label className="field"><span>Meal</span><Picker label="Meal type" value={type} onChange={v=>setType(v as Meal["type"])} options={["Breakfast","Lunch","Dinner","Snack"].map(v=>({value:v,label:v}))}/></label></div><div className="form-callout"><CircleHelp size={17}/><p>Enter nutrition <strong>for the entire portion above</strong>. Values are not multiplied by the portion text.</p></div><div className="form-grid">{NUTRIENTS.map(k=><NumericField key={k} required={["calories","protein","carbs","fat"].includes(k)} metric={METRICS.find(m=>m.key===k)!} value={numbers[k]} onChange={v=>setNumbers({...numbers,[k]:v})}/>)}</div><p className="small-note">Sugar, fibre and sodium are optional. Leave unknown values blank; enter 0 only if the portion contains none.</p></fieldset><Submit busy={busy} label={item?"Save food":"Add food"}/></form>;
}
function ExerciseForm({initial,item,busy,onSave}:{initial:Day;item?:Exercise;busy:boolean;onSave:(d:Day)=>void}) {
  const [name,setName]=useState(item?.name??""),[muscle,setMuscle]=useState(item?.muscle??"Full body"),[note,setNote]=useState(item?.note??"");
  const [sets,setSets]=useState(()=>item?item.sets.map(s=>({weight:String(s.weight),reps:String(s.reps),rpe:s.rpe?.toString()??""})):[{weight:"",reps:"",rpe:""}]);
  const [quick,setQuick]=useState(""),[quickError,setQuickError]=useState("");
  const parseQuick=()=>{
    const match=quick.trim().match(/^(.*?)\s+(\d{1,2})\s*[x×]\s*(\d{1,3})\s*(?:@|at)\s*(\d+(?:\.\d+)?)\s*kg$/i);
    if(!match||!match[1].trim()||Number(match[2])<1||Number(match[2])>40){setQuickError("Use: Squat 3x10 @ 100kg");return;}
    setName(match[1].trim());setSets(Array.from({length:Number(match[2])},()=>({weight:match[4],reps:match[3],rpe:""})));setQuickError("");
  };
  const submit=(e:FormEvent)=>{e.preventDefault();const ex:Exercise={id:item?.id??crypto.randomUUID(),name:name.trim(),muscle,note,sets:sets.map(s=>({weight:Number(s.weight),reps:Number(s.reps),...(s.rpe!==""?{rpe:Number(s.rpe)}:{})}))};onSave({...initial,workout:"trained",exercises:item?initial.exercises.map(e=>e.id===item.id?ex:e):[...initial.exercises,ex]});};
  return <form className="edit-form" onSubmit={submit}><fieldset disabled={busy}>{!item&&<details className="quick-entry"><summary>Quick entry shortcut</summary><div className="quick-row"><input aria-label="Quick exercise entry" value={quick} onChange={e=>setQuick(e.target.value)} placeholder="Squat 3x10 @ 100kg"/><button type="button" className="secondary-button" onClick={parseQuick}>Fill</button></div><p className="small-note">A fixed text shortcut. Review the fields before saving.</p>{quickError&&<p className="form-error">{quickError}</p>}</details>}<label className="field"><span>Exercise name</span><input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Chest-supported row"/></label><label className="field"><span>Muscle group</span><Picker label="Muscle group" value={muscle} onChange={setMuscle} options={GROUPS.map(v=>({value:v,label:v}))}/></label><div className="set-editor"><div className="set-editor-heading"><span>Set</span><span>kg</span><span>Reps</span><span>RPE</span><span/></div>{sets.map((s,i)=><div className="set-editor-row" key={i}><span>{i+1}</span>{(["weight","reps","rpe"] as const).map(key=><input key={key} aria-label={"Set "+(i+1)+" "+key} type="number" inputMode={key==="reps"?"numeric":"decimal"} required={key!=="rpe"} min={key==="weight"?0:1} max={key==="weight"?2000:key==="reps"?500:10} step={key==="reps"?1:key==="rpe"?0.5:0.25} value={s[key]} placeholder="—" onChange={e=>setSets(sets.map((set,j)=>i===j?{...set,[key]:e.target.value}:set))}/>)}<button type="button" className="subtle-icon" disabled={sets.length===1} aria-label={"Remove set "+(i+1)} onClick={()=>setSets(sets.filter((_,j)=>i!==j))}><X size={15}/></button></div>)}</div><button type="button" className="secondary-button add-set" disabled={sets.length>=40} onClick={()=>setSets([...sets,{...sets.at(-1)!}])}><Plus size={16}/>Add set</button><p className="small-note">RPE is effort from 1 to 10; leave it blank if unsure. Use consistent load conventions. Enter 0 kg for unweighted exercises.</p><label className="field"><span>Session note</span><textarea value={note} maxLength={500} rows={2} onChange={e=>setNote(e.target.value)} placeholder="Technique, equipment, discomfort or a cue for next time."/></label></fieldset><Submit busy={busy} label={item?"Save exercise":"Add exercise"}/></form>;
}
function GoalsForm({initial,busy,onSave,onExport}:{initial:Settings;busy:boolean;onSave:(s:Settings)=>void;onExport:()=>void}) {
  const [goals,setGoals]=useState<Record<string,string>>(()=>Object.fromEntries(METRICS.map(m=>[m.key,initial.goals[m.key]?.toString()??""])));
  const [examName,setExamName]=useState(initial.examName),[examDate,setExamDate]=useState(initial.examDate);
  const submit=(e:FormEvent)=>{e.preventDefault();onSave({goals:Object.fromEntries(Object.entries(goals).filter(([,v])=>v!=="").map(([k,v])=>[k,Number(v)])),examName,examDate});};
  return <form className="edit-form" onSubmit={submit}><fieldset disabled={busy}><div className="form-grid"><label className="field"><span>Study goal or exam</span><input maxLength={60} value={examName} onChange={e=>setExamName(e.target.value)}/></label><label className="field"><span>Deadline</span><input type="date" min="2000-01-01" max="2100-12-31" value={examDate} onChange={e=>setExamDate(e.target.value)}/></label></div><div className="form-grid">{METRICS.map(m=><NumericField key={m.key} metric={m} label={m.key==="weight"?"Goal weight":m.label} value={goals[m.key]} onChange={v=>setGoals({...goals,[m.key]:v})}/>)}</div><p className="small-note">Daily targets, except goal weight. Current targets are used across all trend views. Targets are chosen by you; the app does not calculate medical or calorie prescriptions.</p></fieldset><Submit busy={busy} label="Save goals"/><button type="button" className="text-button" disabled={busy} onClick={onExport}><ArrowDownToLine size={16}/>Export & account</button></form>;
}
function HabitForm({busy,onSave}:{busy:boolean;onSave:(name:string)=>void}) {
  const [name,setName]=useState("");
  return <form className="edit-form" onSubmit={e=>{e.preventDefault();onSave(name.trim());}}><label className="field"><span>Daily action</span><input required maxLength={70} disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Review 10 Security+ flashcards"/></label><p className="small-note">Streaks count consecutive completed days. An unlogged today leaves yesterday’s streak intact until the day ends. Track scheduled workouts in Train, so rest days need not interrupt a daily habit.</p><Submit busy={busy} label="Create habit"/></form>;
}
