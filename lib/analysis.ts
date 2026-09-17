import { EMPTY_DAY, NUTRIENTS, METRICS, dateKey, shiftDate, type Day, type Data, type Entry, type MetricKey, type Values, type Exercise, type LiftSet } from "./metrics";
export function effectiveEntry(entry: Entry): Entry {
  const safe = {...EMPTY_DAY, ...entry};
  const values: Values = {...safe.values};
  for (const key of NUTRIENTS) {
    delete values[key];
    if (safe.meals.length && safe.meals.every(m => m.nutrients[key] !== undefined)) values[key] = Math.round(safe.meals.reduce((s,m) => s + (m.nutrients[key] ?? 0),0)*10)/10;
  }
  return {...safe, values};
}
export function mealTotal(day: Day, key: MetricKey): number | undefined {
  return effectiveEntry({...day,date:"2000-01-01",revision:0}).values[key];
}
export function volume(exercise: Exercise) { return exercise.sets.reduce((s,x) => s+x.weight*x.reps,0); }
export function exerciseKey(name: string) { return name.trim().toLowerCase().replace(/\s+/g," "); }
export function maxWeight(exercise: Exercise) { return Math.max(...exercise.sets.map(s=>s.weight)); }
export function estimate1RM(set: LiftSet): number | null {
  return set.reps <= 10 && set.weight > 0 ? Math.round(set.weight*(1+set.reps/30)*10)/10 : null;
}
export function weeklySummary(data: Data, end = dateKey()) {
  const start = shiftDate(end,-6);
  const days = data.entries.filter(e=>e.date>=start&&e.date<=end).map(effectiveEntry);
  const stats = Object.fromEntries(METRICS.map(m=>{
    const values=days.map(e=>e.values[m.key]).filter((v): v is number=>v!==undefined);
    return [m.key,{count:values.length,total:values.reduce((a,b)=>a+b,0),average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null}];
  })) as Record<MetricKey,{count:number;total:number;average:number|null}>;
  return { start,end,days,stats,workouts:days.filter(e=>e.workout==="trained"||e.exercises.length>0).length,rests:days.filter(e=>e.workout==="rest").length };
}
export function reviewCards(data: Data, end = dateKey()) {
  const s=weeklySummary(data,end);
  const cards: {title:string;detail:string;tone:"neutral"|"green"|"amber"}[]=[];
  if (!s.days.length) return [{title:"Your first week starts with one entry.",detail:"Log your study, a meal or a workout. Your review will use those records, with missing days kept separate.",tone:"neutral" as const}];
  const study=s.stats.study;
  cards.push({title:Math.round(study.total/60*10)/10+" hours of study logged",detail:study.count+" of 7 days logged. Choose your next weak topic and record the minutes you actually spend on it.",tone:"green"});
  const sleep=s.stats.sleep;
  if(sleep.average!==null) {
    const target=data.settings.goals.sleep;
    cards.push({title:sleep.average.toFixed(1)+" hours average sleep",detail:sleep.count+" recorded nights."+(target?" Your target is "+target+" hours; "+(sleep.average<target?"protect enough time in bed before adding more tasks.":"keep the schedule consistent."):" Set a sleep target in Goals if useful."),tone:target&&sleep.average<target?"amber":"neutral"});
  }
  const protein=s.stats.protein, target=data.settings.goals.protein;
  if(protein.average!==null) cards.push({title:Math.round(protein.average)+" g protein per logged day",detail:protein.count+" days with meal records."+(target?" Compared with your "+target+" g target. ":" ")+"Partial food logs can understate your intake; finish logging before changing your plan.",tone:"neutral"});
  cards.push({title:s.workouts+" training days · "+s.rests+" rest days",detail:"Based on recorded sessions and planned rest. Logged weight × reps is a workload measure; it does not diagnose recovery or overtraining.",tone:"neutral"});
  const weight=s.days.filter(d=>d.values.weight!==undefined);
  if(weight.length>=3) cards.push({title:s.stats.weight.average!.toFixed(1)+" kg average body weight",detail:weight.length+" weigh-ins this week. Compare weekly averages using similar weigh-in conditions; one change does not establish a trend.",tone:"neutral"});
  return cards;
}
export function coachPrompt(data: Data, end = dateKey()) {
  const s=weeklySummary(data,end);
  const stats=Object.entries(s.stats).filter(([,v])=>v.count).map(([k,v])=>k+": average "+v.average!.toFixed(1)+", total "+v.total.toFixed(1)+", days logged "+v.count+"/7").join("\n");
  return "Review my TrackMyMetric week ("+s.start+" to "+s.end+"). Be precise and practical. Distinguish missing or partial logs from true zeros. Give at most 3 actions. Do not diagnose conditions or adjust medication. Ask for context before recommending calorie or training changes.\n\n"+stats+"\nTraining days: "+s.workouts+"; planned rest days: "+s.rests+"\nMy editable targets: "+JSON.stringify(data.settings.goals)+"\nStudy deadline: "+data.settings.examName+" "+data.settings.examDate+"\nNo private journal notes are included.";
}
