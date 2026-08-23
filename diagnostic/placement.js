function summarize(results){
 const by={};
 for(const r of results){by[r.skill]??={attempts:0,correct:0,patterns:{}};const s=by[r.skill];s.attempts++;s.correct+=r.correct?1:0;s.patterns[r.pattern]??={attempts:0,correct:0};s.patterns[r.pattern].attempts++;s.patterns[r.pattern].correct+=r.correct?1:0}
 for(const s of Object.values(by)){s.accuracy=s.correct/s.attempts;s.confidence=Math.min(1,s.attempts/4)}
 return by;
}
function place(results,map){
 const skills=summarize(results), ranked=Object.entries(skills).map(([skill,s])=>({skill,...s})).sort((a,b)=>a.accuracy-b.accuracy);
 const mastered=Object.values(skills).filter(s=>s.accuracy>=.75&&s.confidence>=.75).length;
 const weak=ranked.filter(s=>s.accuracy<.5);
 const recommended=weak.length?Math.max(1,Math.min(10,results.reduce((m,r)=>Math.max(m,r.grade),1)-1)):Math.max(1,Math.min(10,results.reduce((m,r)=>Math.max(m,r.grade),1)));
 return {recommendedGrade:recommended,confidence:Math.min(1,results.length/12),masteredSkills:mastered,priorityGaps:weak.slice(0,6),skillEvidence:skills};
}
module.exports={summarize,place};