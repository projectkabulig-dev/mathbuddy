require("dotenv").config();
const {sheetsAddLearner,sheetsSaveAttempt}=require("./sheets-sync");
const express=require("express"),path=require("path"),crypto=require("crypto"),sqlite3=require("sqlite3").verbose();
const app=express(),PORT=process.env.PORT||3000;
const db=new sqlite3.Database(process.env.DB_PATH||path.join(__dirname,"mathbuddy.db"));
const AI_URL=process.env.AI_URL||"https://api.groq.com/openai/v1/chat/completions",AI_KEY=process.env.AI_KEY||"",AI_MODEL=process.env.AI_MODEL||"llama-3.3-70b-versatile";
app.use(express.json({limit:"2mb"}));app.use(express.static(path.join(__dirname,"public")));
db.serialize(()=>{db.run(`CREATE TABLE IF NOT EXISTS learners(id TEXT PRIMARY KEY,name TEXT,grade INTEGER,section TEXT,school TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,learner_id TEXT,competency TEXT,question TEXT,expected TEXT,answer TEXT,correct INTEGER,difficulty INTEGER,mastery REAL,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS interventions(id INTEGER PRIMARY KEY AUTOINCREMENT,learner_id TEXT,competency TEXT,message TEXT,misconception TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS sync_receipts(client_id TEXT PRIMARY KEY,received_at TEXT)`);


db.run(`CREATE TABLE IF NOT EXISTS divisions(id TEXT PRIMARY KEY,name TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS schools(id TEXT PRIMARY KEY,division_id TEXT,name TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS teacher_schools(username TEXT,school_id TEXT,role TEXT,PRIMARY KEY(username,school_id))`);
db.run(`CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,name TEXT,grade INTEGER,section TEXT,teacher_username TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS enrollments(class_id TEXT,learner_id TEXT,enrolled_at TEXT,PRIMARY KEY(class_id,learner_id))`);
db.run(`CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,role TEXT,action TEXT,target TEXT,details TEXT,created_at TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS data_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,requester TEXT,request_type TEXT,target TEXT,status TEXT,created_at TEXT)`);});

const PATTERNS=g=>g===1?["1x1"]:g===2?["1x1","2x1","2x2"]:["1x1","2x1","2x2","3x1","3x2","3x3"];
const COMP={1:["addition_1x1","subtraction_1x1","multiplication_1x1","division_1x1"],2:["addition_2x1","subtraction_2x1","multiplication_2x1","division_2x1","addition_2x2","subtraction_2x2","multiplication_2x2","division_2x2"],3:["addition_3x1","subtraction_3x1","multiplication_3x1","division_3x1","addition_3x2","subtraction_3x2","multiplication_3x2","division_3x2","addition_3x3","subtraction_3x3","multiplication_3x3","division_3x3"],4:["multi_digit_operations","factors_multiples","equivalent_fractions","compare_fractions","fraction_operations"],5:["multi_digit_operations","factors_multiples","patterns","fraction_operations","decimal_fractions"],6:["integers","ratio_intro","operations","fraction_operations","decimals"],7:["rational_numbers","algebraic_expressions","rational_operations","linear_equations"],8:["exponents","linear_equations","algebraic_reasoning"],9:["polynomials","quadratic_intro","rational_expressions"],10:["quadratic_equations","functions","statistics"]};
const LABEL={addition:"Addition",subtraction:"Subtraction",multiplication:"Multiplication",division:"Division",multi_digit_operations:"Multi-Digit Operations",factors_multiples:"Factors & Multiples",equivalent_fractions:"Equivalent Fractions",compare_fractions:"Compare Fractions",fraction_operations:"Fraction Operations",decimal_fractions:"Fractions & Decimals",patterns:"Number Patterns",integers:"Integers",ratio_intro:"Ratio",operations:"Operations",decimals:"Decimals",rational_numbers:"Rational Numbers",rational_operations:"Rational Operations",algebraic_expressions:"Algebraic Expressions",linear_equations:"Linear Equations",exponents:"Exponents",algebraic_reasoning:"Algebraic Reasoning",polynomials:"Polynomials",quadratic_intro:"Quadratic Introduction",rational_expressions:"Rational Expressions",quadratic_equations:"Quadratic Equations",functions:"Functions",statistics:"Statistics"};
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const CURRICULUM=JSON.parse(require("fs").readFileSync(path.join(__dirname,"curriculum","curriculum_map.json"),"utf8"));
const DIAG_BANK=JSON.parse(require("fs").readFileSync(path.join(__dirname,"diagnostic","diagnostic_bank_seed.json"),"utf8"));
const {place}=require("./diagnostic/placement");
const nd=d=>d===1?Math.floor(Math.random()*9)+1:d===2?Math.floor(Math.random()*90)+10:Math.floor(Math.random()*900)+100;
function make(op,pat){let [a,b]=pat.split("x").map(Number),x=nd(a),y=nd(b),q,ans;if(op==="addition"){q=`${x} + ${y}`;ans=x+y}if(op==="subtraction"){if(x<y)[x,y]=[y,x];q=`${x} − ${y}`;ans=x-y}if(op==="multiplication"){q=`${x} × ${y}`;ans=x*y}if(op==="division"){let d=nd(b),z=nd(Math.max(1,a));q=`${d*z} ÷ ${d}`;ans=z}return{q,a:ans,pattern:pat,operation:op}}

const WP_NAMES=["Maria","Juan","Liza","Carlo","Ana","Miguel","Sofia","Marco","Rosa","Luis","Bea","Jose","Ella","Rico","Nina"];
const WP_OBJECTS={addition:["mangoes","candies","books","pencils","stickers","stars","shells","marbles","coins","flowers"],subtraction:["mangoes","candies","books","pencils","apples","cookies","stamps","crayons","balloons","ribbons"],multiplication:["bags","boxes","packs","rows","groups","plates","trays","bundles","sets","baskets"],division:["friends","groups","bags","boxes","plates","students","teams","baskets","jars","envelopes"]};
const WP_PLACES=["the sari-sari store","school","the park","the market","the barangay hall","the library","home","the playground"];

function makeWordProblem(op,pat){
 const [da,db]=pat.split("x").map(Number);
 const daCap=Math.min(da,2),dbCap=Math.min(db,1);
 let a=nd(daCap),b=nd(dbCap);
 const name1=WP_NAMES[Math.floor(Math.random()*WP_NAMES.length)];
 let name2=WP_NAMES[Math.floor(Math.random()*WP_NAMES.length)];
 while(name2===name1)name2=WP_NAMES[Math.floor(Math.random()*WP_NAMES.length)];
 const objs=(WP_OBJECTS[op]||WP_OBJECTS.addition);
 const obj=objs[Math.floor(Math.random()*objs.length)];
 const place=WP_PLACES[Math.floor(Math.random()*WP_PLACES.length)];
 let q,ans;

 if(op==="addition"){
  const templates=[
   `${name1} has ${a} ${obj}. ${name2} gives ${name1} ${b} more. How many ${obj} does ${name1} have now?`,
   `There are ${a} ${obj} on the table at ${place}. ${name1} puts ${b} more. How many ${obj} are there in all?`,
   `${name1} picked ${a} ${obj} in the morning and ${b} ${obj} in the afternoon. How many ${obj} did ${name1} pick altogether?`
  ];
  q=templates[Math.floor(Math.random()*templates.length)];
  ans=a+b;
 }
 else if(op==="subtraction"){
  if(a<b)[a,b]=[b,a];
  const templates=[
   `${name1} has ${a} ${obj}. ${name1} gives ${b} to ${name2}. How many ${obj} does ${name1} have left?`,
   `There are ${a} ${obj} at ${place}. ${b} are taken away. How many ${obj} are left?`,
   `${name1} had ${a} ${obj} but lost ${b} on the way to ${place}. How many ${obj} does ${name1} have now?`
  ];
  q=templates[Math.floor(Math.random()*templates.length)];
  ans=a-b;
 }
 else if(op==="multiplication"){
  a=Math.floor(Math.random()*8)+2; b=Math.floor(Math.random()*8)+2;
  const templates=[
   `${name1} has ${a} ${obj} of ${obj==="bags"?"mangoes":"candies"}. Each ${obj.slice(0,-1)} has ${b} inside. How many are there in all?`,
   `There are ${a} ${obj} at ${place}. Each one has ${b} items. How many items are there in total?`,
   `${name1} arranged ${obj} in ${a} rows with ${b} in each row. How many are there altogether?`
  ];
  q=templates[Math.floor(Math.random()*templates.length)];
  ans=a*b;
 }
 else if(op==="division"){
  b=Math.floor(Math.random()*8)+2; const whole=Math.floor(Math.random()*8)+2; a=b*whole;
  const templates=[
   `${name1} has ${a} ${obj==="friends"?"candies":obj} to share equally among ${b} friends. How many does each friend get?`,
   `There are ${a} items at ${place}. They need to be packed equally into ${b} ${obj}. How many items go in each?`,
   `${name1} divides ${a} stickers equally among ${b} ${obj}. How many stickers are in each?`
  ];
  q=templates[Math.floor(Math.random()*templates.length)];
  ans=whole;
 }
 return{q,a:ans,pattern:pat,operation:op,isWordProblem:true}
}
function update(s,c){s.attempts=(s.attempts||0)+1;s.correct=(s.correct||0)+(c?1:0);s.recent=s.recent||[];s.recent.push(c?1:0);if(s.recent.length>12)s.recent.shift();let raw=s.recent.reduce((a,b)=>a+b,0)/s.recent.length;let prior=s.mastery==null?.5:s.mastery;s.mastery=Math.max(0,Math.min(1,prior*.75+raw*.25));return s}

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function randomizeDiagItem(item){
 const x={...item};
 if(x.pattern&&/^\d+x\d+$/.test(x.pattern)){
  const [da,db]=x.pattern.split("x").map(Number);
  const daCap=Math.min(da,2),dbCap=Math.min(db,1);
  let a=nd(daCap),b=nd(dbCap);
  if(x.skill&&x.skill.includes("subtraction")&&a<b)[a,b]=[b,a];
  if(x.skill&&x.skill.includes("division")){b=Math.floor(Math.random()*8)+2;a=b*(Math.floor(Math.random()*10)+2)}
  if(x.skill&&x.skill.includes("multiplication")){a=nd(1);b=nd(1)}
  const ops={addition:{sym:"+",ans:a+b},subtraction:{sym:"−",ans:a-b},multiplication:{sym:"×",ans:a*b},division:{sym:"÷",ans:a/b}};
  const op=Object.keys(ops).find(k=>x.skill&&x.skill.includes(k));
  if(op){x.question=`${a} ${ops[op].sym} ${b}`;x.answer=ops[op].ans}
 }
 return x;
}
app.get("/api/diagnostic/items",(req,res)=>{
 let g=Math.max(1,Math.min(10,+req.query.grade||1));
 let bank=shuffle(DIAG_BANK.items.filter(x=>x.grade<=g));
 const seen=new Set(),out=[];
 for(const x of bank){if(!seen.has(x.skill)){out.push(x);seen.add(x.skill)}}
 for(const x of bank){if(out.length>=12)break;if(!out.includes(x))out.push(x)}
 const compItems=shuffle(out.slice(0,12)).map(randomizeDiagItem);
 const ops=["addition","subtraction","multiplication","division"];
 const pat=g===1?"1x1":g===2?"2x1":"2x2";
 const wpItems=[0,1,2].map(()=>{const op=ops[Math.floor(Math.random()*ops.length)];const wp=makeWordProblem(op,pat);return{...wp,grade:g,skill:`${op}_wp`}});
 const items=[];
 for(let i=0;i<15;i++){
  if(i===4||i===9||i===14){items.push(wpItems.shift())}
  else if(compItems.length){items.push(compItems.shift())}
 }
 res.json({grade:g,count:items.length,items});
});
app.post("/api/diagnostic/placement",(req,res)=>{
 const b=req.body||{},results=Array.isArray(b.results)?b.results:[];
 res.json(place(results,CURRICULUM));
});

function interventionFor(skill,accuracy){
 if(accuracy<.35)return {priority:"HIGH",action:"Intensive scaffold",steps:["Use concrete/visual representation","Model one worked example","Ask learner to explain each step","Retry with a simpler item"],duration:"10-15 min"};
 if(accuracy<.6)return {priority:"MEDIUM",action:"Targeted practice",steps:["Review prerequisite","Solve a guided example","Complete 3-5 focused items","Recheck independently"],duration:"8-10 min"};
 return {priority:"LOW",action:"Maintenance",steps:["One retrieval item","One application problem","Monitor next session"],duration:"3-5 min"};
}
app.get("/api/teacher/learner/:id",auth,requireRole("teacher","admin"),(req,res)=>{
 db.all("SELECT competency,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery,MAX(created_at) last_seen FROM attempts WHERE learner_id=? GROUP BY competency",[req.params.id],(e,rows)=>{
   if(e)return res.status(500).json({error:e.message});
   const skills=(rows||[]).map(x=>({...x,accuracy:x.attempts?x.correct/x.attempts:0,recommendation:interventionFor(x.competency,x.attempts?x.correct/x.attempts:0)})).sort((a,b)=>a.mastery-b.mastery);
   db.get("SELECT * FROM learners WHERE id=?",[req.params.id],(e2,learner)=>res.json({learner,skills,priority:skills.filter(x=>x.accuracy<.6).slice(0,5)}));
 });
});
app.get("/api/teacher/class",auth,requireRole("teacher","admin"),(req,res)=>{
 db.all(`SELECT l.id,l.name,l.grade,l.section,
   COUNT(a.id) attempts,COALESCE(SUM(a.correct),0) correct,COALESCE(AVG(a.mastery),0) mastery
   FROM learners l LEFT JOIN attempts a ON a.learner_id=l.id
   GROUP BY l.id ORDER BY mastery ASC`,(e,rows)=>{
    if(e)return res.status(500).json({error:e.message});
    res.json((rows||[]).map(x=>({...x,accuracy:x.attempts?x.correct/x.attempts:0,status:x.attempts===0?"NO DATA":x.mastery<.45?"AT RISK":x.mastery<.7?"DEVELOPING":"ON TRACK"})));
 });
});
app.get("/api/teacher/interventions",auth,requireRole("teacher","admin"),(req,res)=>{
 db.all(`SELECT competency,COUNT(*) count,AVG(CASE WHEN correct=0 THEN 1.0 ELSE 0.0 END) error_rate,AVG(mastery) mastery
 FROM attempts GROUP BY competency ORDER BY error_rate DESC LIMIT 12`,(e,rows)=>{
   if(e)return res.status(500).json({error:e.message});
   res.json((rows||[]).map(x=>({...x,recommendation:interventionFor(x.competency,1-x.error_rate)})));
 });
});

app.post("/api/conversation",async(req,res)=>{
 const b=req.body||{};
 function smartFallback(){
  const msg=(b.message||"").toLowerCase().trim();
  const q=b.question||"",exp=b.expected||"";
  // Try to detect and compute math expressions in the message
  const mathMatch=msg.match(/(?:what(?:'s| is)\s+)?(\d+)\s*([+\-×x*÷/])\s*(\d+)/);
  if(mathMatch){
   const a=+mathMatch[1],op=mathMatch[2],c=+mathMatch[3];
   let ans,opName;
   if(op==="+"){ ans=a+c; opName="plus" }
   else if(op==="-"||op==="−"){ ans=a-c; opName="minus" }
   else if(op==="×"||op==="x"||op==="*"){ ans=a*c; opName="times" }
   else if(op==="÷"||op==="/"){ ans=c!==0?a/c:"undefined"; opName="divided by" }
   if(ans!==undefined){
    const isWhole=Number.isInteger(ans);
    return {reply:`${a} ${opName} ${c} equals ${isWhole?ans:ans.toFixed(2)}!`,emotion:"happy",speech:`${a} ${opName} ${c} equals ${isWhole?ans:ans.toFixed(2)}.`,hint:"",nextQuestion:"Try another problem!"}
   }
  }
  // Detect "how to" teaching requests
  if(msg.includes("how")&&msg.includes("add")||msg.includes("teach")&&msg.includes("add")||msg.includes("addition")){
   return {reply:"To add numbers, you combine them together. For example, 3 + 2: start with 3, then count up 2 more — four, five. The answer is 5! Try it with the problem on the right.",emotion:"encourage",speech:"To add numbers, combine them together. Start with the bigger number and count up!",hint:"Start with the bigger number and count up.",nextQuestion:"Try the problem on the right!"}
  }
  if(msg.includes("how")&&msg.includes("subtract")||msg.includes("teach")&&msg.includes("subtract")||msg.includes("subtraction")){
   return {reply:"To subtract, you take away from the bigger number. For example, 8 - 3: start with 8, then count down 3 — seven, six, five. The answer is 5!",emotion:"encourage",speech:"To subtract, start with the bigger number and count down.",hint:"Start with the bigger number and count down.",nextQuestion:"Try the problem!"}
  }
  if(msg.includes("how")&&msg.includes("multipl")||msg.includes("teach")&&msg.includes("multipl")||msg.includes("multiplication")){
   return {reply:"Multiplication is adding the same number many times. For example, 3 × 4 means 3 groups of 4: 4 + 4 + 4 = 12!",emotion:"encourage",speech:"Multiplication means adding the same number many times. 3 times 4 means three groups of four.",hint:"Think of it as groups.",nextQuestion:"Try the problem!"}
  }
  if(msg.includes("how")&&msg.includes("divid")||msg.includes("teach")&&msg.includes("divid")||msg.includes("division")){
   return {reply:"Division means sharing equally. For example, 12 ÷ 3: if you share 12 apples among 3 friends, each friend gets 4 apples!",emotion:"encourage",speech:"Division means sharing equally. 12 divided by 3 means sharing 12 things among 3 groups.",hint:"Think about sharing equally.",nextQuestion:"Try the problem!"}
  }
  // Check if learner gave a number — might be answering the current question
  const numMatch=msg.match(/\b(\d+)\b/);
  if(numMatch&&exp){
   const gave=+numMatch[1],expected=+exp;
   if(gave===expected){
    return {reply:`Yes! ${gave} is correct! Great job! Try the next problem.`,emotion:"celebrate",speech:`Yes, ${gave} is correct! Great job!`,hint:"",nextQuestion:"Try the next problem!"}
   } else {
    return {reply:`Not quite — the answer to ${q} is ${exp}. Let's try the next one!`,emotion:"encourage",speech:`The answer is ${exp}. Don't worry, let's try the next one!`,hint:`The answer is ${exp}.`,nextQuestion:"Try again!"}
   }
  }
  // Generic encouraging fallback
  const tips=["Try breaking the problem into smaller steps!","Start with what you know, then work from there.","Use your fingers or draw circles to help count.","Think about it like sharing objects with friends.","You're doing great — keep practicing!"];
  const tip=tips[Math.floor(Math.random()*tips.length)];
  return {reply:`${tip} Try answering the problem on the right, or ask me something like "What is 5 + 3?"`,emotion:"encourage",speech:tip,hint:"Try the problem on the right side!",nextQuestion:"What would you like to learn?"}
 }

 const fallback=smartFallback();
 if(!AI_KEY){console.log("[MathBuddy] AI_KEY is empty — using smart fallback");return res.json(fallback)}
 console.log("[MathBuddy] Calling AI...",AI_MODEL,"key:",AI_KEY.slice(0,8)+"...");
 const prompt=`You are MathBuddy, a kind and encouraging math tutor for Filipino elementary and junior high students.

LANGUAGE RULES:
- ALWAYS reply in simple, clear English — no Tagalog, no Taglish.
- Use warm, child-friendly English: "Great job!", "Nice try!", "Let's figure this out together!"
- Even if the learner writes in Tagalog or Taglish, always reply in English.
- Your replies will be read aloud by text-to-speech, so use natural spoken English.

TEACHING RULES:
- DIRECT QUESTIONS like "What is 3+4?", "What's 10-6?", "5 times 3?" → give the answer directly and briefly explain: "3 + 4 = 7. You can count up from 3: four, five, six, seven!"
- HOW-TO QUESTIONS like "How do I add?", "How does multiplication work?", "Teach me division" → guide step by step using scaffolding with simple examples. Do NOT give the answer right away.
- WRONG ANSWER on the practice problem → encourage, then ask what they tried first, and guide from there. Do not just say the correct answer immediately.
- CORRECT ANSWER → celebrate briefly: "Great job! That's correct!" Do not keep asking follow-up questions — let them move on.
- Use concrete examples a child can imagine: "If you have 5 apples and someone gives you 3 more, how many do you have?"
- Keep replies SHORT — 1-2 sentences for direct answers, 2-3 sentences for teaching.

CONTEXT:
Grade: ${b.grade}. Competency: ${b.competency}. Question: ${b.question}. Expected answer: ${b.expected}.
Learner answer: ${b.answer}. Learner message: ${b.message||""}.
Mastery: ${b.mastery}. Recent evidence: ${JSON.stringify(b.recent||[])}.
${b.learnerProfile?`
LEARNER PROFILE (adapt your teaching based on this):
- Name: ${b.learnerProfile.name}
- Overall accuracy: ${Math.round((b.learnerProfile.overallAccuracy||0)*100)}%
- Average mastery: ${Math.round((b.learnerProfile.avgMastery||0.5)*100)}%
- Total attempts: ${b.learnerProfile.totalAttempts||0}
- Weak skills (needs more practice): ${(b.learnerProfile.weakSkills||[]).join(", ")||"none identified yet"}
- Strong skills: ${(b.learnerProfile.strongSkills||[]).join(", ")||"none yet"}
- Recent mistakes: ${(b.learnerProfile.recentMistakes||[]).map(m=>`${m.question}=${m.answer}(wrong, correct:${m.expected})`).join("; ")||"none"}
ADAPTATION RULES:
- If accuracy is below 50%, use simpler examples and more encouragement.
- If the learner keeps making the same type of mistake, address that specific misconception.
- If mastery is high, challenge them with slightly harder thinking questions.
- Reference their progress positively: "You're getting better at addition!"
`:""}
CONVERSATION FLOW RULES:
- You will receive the recent chat history. READ IT CAREFULLY — do not repeat questions you already asked.
- If the learner already answered your question correctly, acknowledge it, praise them, and MOVE ON to a new topic or say "Great! Try the next problem on the right side."
- Do NOT keep asking "how did you get that?" more than once. If they explained, accept it.
- After 2-3 back-and-forth exchanges on the same topic, WRAP UP with encouragement and suggest trying the next problem.
- If the learner gives the correct final answer, say something like: "Perfect! You understand this well. Try the next question!"
- Never loop. Always move the conversation forward.

Return JSON only with keys: reply, emotion (happy|think|encourage|celebrate), nextQuestion, hint, speech.`;
 const chatMsgs=Array.isArray(b.chatHistory)?b.chatHistory.slice(-10).map(m=>({role:m.role==="user"?"user":"assistant",content:m.content})):[];
 const messages=[{role:"system",content:prompt},...chatMsgs,{role:"user",content:b.message||"Respond naturally to the learner."}];
 try{
  const r=await fetch(AI_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${AI_KEY}`},
   body:JSON.stringify({model:AI_MODEL,temperature:.35,response_format:{type:"json_object"},messages})});
  if(!r.ok){const err=await r.text();console.log("[MathBuddy] AI error:",r.status,err);throw Error(r.status)}
  const d=await r.json();console.log("[MathBuddy] AI responded OK");res.json(JSON.parse(d.choices?.[0]?.message?.content||"{}"));
 }catch(e){console.log("[MathBuddy] AI failed:",e.message);res.json(smartFallback())}
});

app.get("/api/progress/:id",auth,requireRole("teacher","admin"),(req,res)=>{
 db.all(`SELECT DATE(created_at) day,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery
 FROM attempts WHERE learner_id=? GROUP BY DATE(created_at) ORDER BY day ASC`,[req.params.id],(e,rows)=>{
  if(e)return res.status(500).json({error:e.message});
  const out=(rows||[]).map(x=>({...x,accuracy:x.attempts?x.correct/x.attempts:0}));
  res.json({learnerId:req.params.id,days:out});
 });
});
app.get("/api/report/:id",auth,requireRole("teacher","admin"),(req,res)=>{
 db.get("SELECT * FROM learners WHERE id=?",[req.params.id],(e,learner)=>{
  if(e)return res.status(500).json({error:e.message});
  if(!learner)return res.status(404).json({error:"Learner not found"});
  db.all(`SELECT competency,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery,MAX(created_at) last_seen
   FROM attempts WHERE learner_id=? GROUP BY competency ORDER BY mastery ASC`,[req.params.id],(e2,skills)=>{
   if(e2)return res.status(500).json({error:e2.message});
   const data=(skills||[]).map(x=>({...x,accuracy:x.attempts?x.correct/x.attempts:0,status:x.mastery<.45?"AT RISK":x.mastery<.7?"DEVELOPING":"ON TRACK"}));
   res.json({generatedAt:now(),learner,skills:data});
  });
 });
});
app.get("/api/report/:id.csv",auth,requireRole("teacher","admin"),(req,res)=>{
 db.get("SELECT * FROM learners WHERE id=?",[req.params.id],(e,learner)=>{
  if(e||!learner)return res.status(404).send("Learner not found");
  db.all(`SELECT competency,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery,MAX(created_at) last_seen
   FROM attempts WHERE learner_id=? GROUP BY competency ORDER BY mastery ASC`,[req.params.id],(e2,rows)=>{
    if(e2)return res.status(500).send(e2.message);
    let csv="Learner,Grade,Competency,Attempts,Accuracy,Mastery,Status,Last Seen\n";
    for(const x of rows||[]){let acc=x.attempts?x.correct/x.attempts:0;let status=x.mastery<.45?"AT RISK":x.mastery<.7?"DEVELOPING":"ON TRACK";
      csv += [learner.name,learner.grade,x.competency,x.attempts,Math.round(acc*100)+"%",Math.round(x.mastery*100)+"%",status,x.last_seen].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")+"\n";}
    res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",`attachment; filename="MathBuddy_${learner.name.replace(/[^a-z0-9]/gi,"_")}_report.csv"`);res.send(csv);
   });
 });
});

const SESSION_TTL=8*60*60*1000;
const sessions=new Map();
function hashPassword(p,salt){return crypto.scryptSync(String(p),salt,64).toString("hex")}
function makeToken(){return crypto.randomBytes(32).toString("hex")}
function auth(req,res,next){
 const h=req.headers.authorization||"",token=h.startsWith("Bearer ")?h.slice(7):"";
 const s=sessions.get(token);
 if(!s||Date.now()-s.created>SESSION_TTL)return res.status(401).json({error:"Unauthorized"});
 req.user=s.user;req.sessionToken=token;next();
}
function requireRole(...roles){return (req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next()}}
function audit(req,action,target,details=""){
 db.run("INSERT INTO audit_log(actor,role,action,target,details,created_at) VALUES(?,?,?,?,?,?)",
 [req.user?.username||"system",req.user?.role||"system",action,target,String(details).slice(0,500),now()]);
}
const LOGIN_MAX_ATTEMPTS=5,LOGIN_LOCKOUT_MS=15*60*1000,loginAttempts=new Map();
function loginRateLimited(key){
 const rec=loginAttempts.get(key);
 if(!rec)return false;
 if(rec.count>=LOGIN_MAX_ATTEMPTS && Date.now()-rec.first<LOGIN_LOCKOUT_MS)return true;
 if(Date.now()-rec.first>=LOGIN_LOCKOUT_MS)loginAttempts.delete(key);
 return false;
}
function recordLoginFailure(key){
 const rec=loginAttempts.get(key);
 if(!rec||Date.now()-rec.first>=LOGIN_LOCKOUT_MS)loginAttempts.set(key,{count:1,first:Date.now()});
 else rec.count++;
}
app.post("/api/auth/login",(req,res)=>{
 const {username,password,role="teacher"}=req.body||{};
 const rateKey=(req.ip||"unknown")+":"+String(username||"");
 if(loginRateLimited(rateKey))return res.status(429).json({error:"Too many attempts. Try again later."});
 // Pilot credentials can be provisioned through environment variables.
 const expectedUser=process.env.MATHBUDDY_USER||"teacher";
 const expectedHash=process.env.MATHBUDDY_PASSWORD_HASH;
 const salt=process.env.MATHBUDDY_PASSWORD_SALT;
 if(!expectedHash||!salt||username!==expectedUser||hashPassword(password,salt)!==expectedHash){
   recordLoginFailure(rateKey);
   return res.status(401).json({error:"Invalid credentials"});
 }
 loginAttempts.delete(rateKey);
 const token=makeToken();sessions.set(token,{created:Date.now(),user:{username,role}});
 db.run("INSERT INTO audit_log(actor,role,action,target,details,created_at) VALUES(?,?,?,?,?,?)",
 [username,role,"LOGIN","AUTH","successful login",now()]);
 res.json({token,expiresIn:SESSION_TTL});
});
app.post("/api/auth/logout",(req,res)=>{
 const h=req.headers.authorization||"",token=h.startsWith("Bearer ")?h.slice(7):"";sessions.delete(token);if(token) db.run("INSERT INTO audit_log(actor,role,action,target,details,created_at) VALUES(?,?,?,?,?,?)",
 [req.user?.username||"unknown",req.user?.role||"unknown","LOGOUT","AUTH","logout",now()]);res.json({ok:true});
});

app.post("/api/privacy/request",auth,requireRole("teacher","admin"),(req,res)=>{
 const {type,target}=req.body||{};
 const allowed=["access","export","delete"];
 if(!allowed.includes(type))return res.status(400).json({error:"Unsupported request type"});
 db.run("INSERT INTO data_requests(requester,request_type,target,status,created_at) VALUES(?,?,?,?,?)",
 [req.user.username,type,String(target||""),"PENDING",now()],e=>{
   if(e)return res.status(500).json({error:e.message});
   audit(req,"PRIVACY_REQUEST",String(target||""),type);res.json({ok:true,status:"PENDING"});
 });
});
app.get("/api/audit",auth,requireRole("admin"),(req,res)=>{
 db.all("SELECT actor,role,action,target,details,created_at FROM audit_log ORDER BY id DESC LIMIT 200",(e,rows)=>{
  if(e)return res.status(500).json({error:e.message});res.json(rows||[]);
 });
});
app.get("/api/privacy/requests",auth,requireRole("admin"),(req,res)=>{
 db.all("SELECT * FROM data_requests ORDER BY id DESC LIMIT 200",(e,rows)=>{
  if(e)return res.status(500).json({error:e.message});res.json(rows||[]);
 });
});

app.post("/api/classes",auth,requireRole("teacher","admin"),(req,res)=>{
 const b=req.body||{},id="C-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
 db.run("INSERT INTO classes(id,name,grade,section,teacher_username,created_at) VALUES(?,?,?,?,?,?)",
 [id,b.name||"New Class",+b.grade||1,b.section||"",req.user.username,now()],e=>{
  if(e)return res.status(500).json({error:e.message});audit(req,"CREATE_CLASS",id,b.name||"");res.json({id});
 });
});
app.get("/api/classes",auth,requireRole("teacher","admin"),(req,res)=>{
 const q=req.user.role==="admin"?"SELECT * FROM classes ORDER BY grade,name":"SELECT * FROM classes WHERE teacher_username=? ORDER BY grade,name";
 db.all(q,req.user.role==="admin"?[]:[req.user.username],(e,rows)=>e?res.status(500).json({error:e.message}):res.json(rows||[]));
});
app.post("/api/classes/:id/enroll",auth,requireRole("teacher","admin"),(req,res)=>{
 const id=req.params.id, learnerId=String(req.body?.learnerId||"");
 if(!learnerId)return res.status(400).json({error:"learnerId required"});
 db.get("SELECT * FROM classes WHERE id=?",[id],(e,c)=>{
  if(e||!c)return res.status(404).json({error:"Class not found"});
  if(req.user.role!=="admin"&&c.teacher_username!==req.user.username)return res.status(403).json({error:"Forbidden"});
  db.run("INSERT OR IGNORE INTO enrollments(class_id,learner_id,enrolled_at) VALUES(?,?,?)",[id,learnerId,now()],e2=>{
   if(e2)return res.status(500).json({error:e2.message});audit(req,"ENROLL",learnerId,`class=${id}`);res.json({ok:true});
  });
 });
});
app.get("/api/classes/:id/roster",auth,requireRole("teacher","admin"),(req,res)=>{
 db.get("SELECT * FROM classes WHERE id=?",[req.params.id],(e,c)=>{
  if(e||!c)return res.status(404).json({error:"Class not found"});
  if(req.user.role!=="admin"&&c.teacher_username!==req.user.username)return res.status(403).json({error:"Forbidden"});
  db.all(`SELECT l.id,l.name,l.grade,l.section,COUNT(a.id) attempts,COALESCE(AVG(a.mastery),0) mastery,
   COALESCE(SUM(a.correct)*1.0/NULLIF(COUNT(a.id),0),0) accuracy
   FROM enrollments en JOIN learners l ON l.id=en.learner_id
   LEFT JOIN attempts a ON a.learner_id=l.id WHERE en.class_id=? GROUP BY l.id ORDER BY l.name`,[req.params.id],
   (e2,rows)=>e2?res.status(500).json({error:e2.message}):res.json(rows||[]));
 });
});

app.post("/api/divisions",auth,requireRole("admin"),(req,res)=>{
 const id="D-"+Date.now().toString(36);db.run("INSERT INTO divisions(id,name,created_at) VALUES(?,?,?)",[id,req.body?.name||"Division",now()],e=>{if(e)return res.status(500).json({error:e.message});audit(req,"CREATE_DIVISION",id,req.body?.name||"");res.json({id})});
});
app.post("/api/schools",auth,requireRole("admin"),(req,res)=>{
 const id="S-"+Date.now().toString(36);db.run("INSERT INTO schools(id,division_id,name,created_at) VALUES(?,?,?,?)",[id,req.body?.divisionId,req.body?.name||"School",now()],e=>{if(e)return res.status(500).json({error:e.message});audit(req,"CREATE_SCHOOL",id,req.body?.name||"");res.json({id})});
});
app.post("/api/learners/bulk",auth,requireRole("teacher","admin"),(req,res)=>{
 const rows=Array.isArray(req.body?.learners)?req.body.learners:[];
 if(!rows.length)return res.status(400).json({error:"No learners supplied"});
 let added=0,skipped=0,errors=[];
 let pending=rows.length;
 rows.forEach((x,i)=>{
   const id=String(x.id||"L-"+Date.now().toString(36)+"-"+i+"-"+Math.random().toString(36).slice(2,6));
   db.run("INSERT OR IGNORE INTO learners(id,name,grade,section) VALUES(?,?,?,?)",[id,String(x.name||"Learner"),+x.grade||1,String(x.section||"")],function(e){
    if(e)errors.push({row:i,error:e.message}); else if(this.changes===0)skipped++; else added++;
    if(--pending===0){audit(req,"BULK_IMPORT","LEARNERS",`added=${added},skipped=${skipped}`);res.json({added,skipped,errors})}
   });
 });
});
app.post("/api/classes/:id/enroll-bulk",auth,requireRole("teacher","admin"),(req,res)=>{
 const classId=req.params.id,ids=Array.isArray(req.body?.learnerIds)?req.body.learnerIds:[];
 db.get("SELECT * FROM classes WHERE id=?",[classId],(e,c)=>{
  if(e||!c)return res.status(404).json({error:"Class not found"});
  if(req.user.role!=="admin"&&c.teacher_username!==req.user.username)return res.status(403).json({error:"Forbidden"});
  let added=0,pending=ids.length;if(!pending)return res.json({added:0});
  ids.forEach(id=>db.run("INSERT OR IGNORE INTO enrollments(class_id,learner_id,enrolled_at) VALUES(?,?,?)",[classId,id,now()],()=>{added++;if(--pending===0){audit(req,"BULK_ENROLL",classId,`count=${added}`);res.json({added})}}));
 });
});
app.get("/api/schools",auth,requireRole("admin"),(req,res)=>db.all("SELECT * FROM schools ORDER BY name",(e,r)=>e?res.status(500).json({error:e.message}):res.json(r||[])));

app.get("/api/analytics/summary",auth,requireRole("teacher","admin"),(req,res)=>{
 const where=req.user.role==="admin"?"":" WHERE c.teacher_username=?";
 const params=req.user.role==="admin"?[]:[req.user.username];
 const q=`SELECT c.grade,COUNT(DISTINCT en.learner_id) learners,COUNT(a.id) attempts,
  COALESCE(AVG(a.correct)*100,0) accuracy,COALESCE(AVG(a.mastery)*100,0) mastery
  FROM classes c LEFT JOIN enrollments en ON en.class_id=c.id
  LEFT JOIN attempts a ON a.learner_id=en.learner_id${where} GROUP BY c.grade ORDER BY c.grade`;
 db.all(q,params,(e,rows)=>e?res.status(500).json({error:e.message}):res.json(rows||[]));
});
app.get("/api/analytics/competencies",auth,requireRole("teacher","admin"),(req,res)=>{
 const where=req.user.role==="admin"?"":" AND c.teacher_username=?";
 const params=req.user.role==="admin"?[]:[req.user.username];
 const q=`SELECT a.competency,COUNT(a.id) attempts,COALESCE(AVG(a.correct)*100,0) accuracy,
  COALESCE(AVG(a.mastery)*100,0) mastery
  FROM attempts a JOIN enrollments en ON en.learner_id=a.learner_id
  JOIN classes c ON c.id=en.class_id WHERE 1=1${where}
  GROUP BY a.competency ORDER BY mastery ASC`;
 db.all(q,params,(e,rows)=>e?res.status(500).json({error:e.message}):res.json(rows||[]));
});

app.get("/api/intervention/:learnerId",auth,requireRole("teacher","admin"),(req,res)=>{
 db.all(`SELECT competency,COUNT(*) attempts,COALESCE(AVG(correct)*100,0) accuracy,COALESCE(AVG(mastery)*100,0) mastery
 FROM attempts WHERE learner_id=? GROUP BY competency ORDER BY mastery ASC`,[req.params.learnerId],(e,rows)=>{
  if(e)return res.status(500).json({error:e.message});
  const rec=(rows||[]).map(x=>{
   const m=x.mastery;
   let level="ENRICHMENT",action="Move to mixed application and challenge items.";
   if(m<45){level="INTENSIVE";action="Return to prerequisite skill, use worked examples, manipulatives/visuals, then guided practice."}
   else if(m<70){level="DEVELOPING";action="Use short targeted practice with immediate feedback and gradually increase complexity."}
   return {...x,level,action};
  });
  res.json({learnerId:req.params.learnerId,recommendations:rec});
 });
});

function gradeRules(grade){
 grade=Number(grade)||1;
 if(grade<=1)return {maxDigits:1,pairs:["1x1"],operations:["addition","subtraction","multiplication","division"]};
 if(grade===2)return {maxDigits:2,pairs:["1x1","2x1","2x2"],operations:["addition","subtraction","multiplication","division"]};
 return {maxDigits:3,pairs:["1x1","2x1","2x2","3x1","3x2","3x3"],operations:["addition","subtraction","multiplication","division"]};
}
function makeAdaptiveItem(grade,operation,mastery,streak=0){
 const r=gradeRules(grade), m=Number(mastery)||0;
 let pair=m<45?"1x1":m<70?(r.pairs[Math.max(0,r.pairs.length-2)]||"2x2"):(r.pairs[r.pairs.length-1]||"3x3");
 if(streak>=2 && r.pairs.length>1) pair=r.pairs[Math.min(r.pairs.indexOf(pair)+1,r.pairs.length-1)];
 const [aDigits,bDigits]=pair.split("x").map(Number);
 const rand=n=>Math.floor(Math.random()*Math.pow(10,n-1))+Math.pow(10,n-1);
 let a=rand(aDigits),b=rand(bDigits),answer=0;
 if(operation==="addition"){answer=a+b}
 else if(operation==="subtraction"){if(a<b)[a,b]=[b,a];answer=a-b}
 else if(operation==="multiplication"){answer=a*b}
 else {b=Math.max(1,b);a=b*rand(Math.max(1,aDigits));answer=a/b}
 return {grade,operation,pair,a,b,answer,masteryBand:m<45?"intensive":m<70?"developing":"enrichment"};
}
app.get("/api/curriculum/:grade",auth,requireRole("teacher","admin"),(req,res)=>res.json(gradeRules(req.params.grade)));
app.post("/api/adaptive-item",auth,requireRole("teacher","admin"),(req,res)=>{
 const b=req.body||{},item=makeAdaptiveItem(b.grade,b.operation||"addition",b.mastery,b.streak||0);res.json(item);
});

function analyzeMisconception(op,a,b,answer){
 const n=Number(answer);
 const correct=op==="addition"?a+b:op==="subtraction"?a-b:op==="multiplication"?a*b:a/b;
 const out=[];
 if(op==="addition" && n===a-b) out.push("operation_confusion");
 if(op==="subtraction" && n===a+b) out.push("subtraction_as_addition");
 if(op==="multiplication" && n===a+b) out.push("multiplication_as_addition");
 if(op==="division" && n===a*b) out.push("division_as_multiplication");
 if(Number.isFinite(n) && Math.abs(n-Math.round(n))<1e-9 && n!==correct){
   if(op==="subtraction" && Math.abs(n)===Math.abs(a-b)) out.push("sign_or_order_error");
   else if(op==="multiplication" && String(n).includes("0")) out.push("place_value_error");
   else out.push("calculation_error");
 }
 return {correct,misconceptions:[...new Set(out)]};
}
function scaffoldingFor(m){
 const map={
  operation_confusion:"Let's identify the operation first. Ask: Are we combining, taking away, making equal groups, or sharing?",
  subtraction_as_addition:"Use a take-away model and compare the starting number with the amount removed.",
  multiplication_as_addition:"Build equal groups and count the groups before writing the multiplication sentence.",
  division_as_multiplication:"Use sharing/grouping: determine how many equal groups fit in the total.",
  sign_or_order_error:"Rewrite the subtraction with the larger starting number first and check the direction.",
  place_value_error:"Align digits by place value before calculating.",
  calculation_error:"Use a worked example, then solve one similar item with immediate feedback."
 };
 return map[m]||"Use a short worked example followed by one guided practice item.";
}
app.post("/api/analyze-response",auth,requireRole("teacher","admin"),(req,res)=>{
 const b=req.body||{},x=analyzeMisconception(b.operation||"addition",+b.a,+b.b,b.answer);
 res.json({...x,scaffolds:x.misconceptions.map(scaffoldingFor)});
});

app.post("/api/tutor/dialogue",auth,requireRole("teacher","admin"),(req,res)=>{
 const b=req.body||{},grade=+b.grade||1,problem=b.problem||"",student=b.studentResponse||"";
 const correct=String(b.correctAnswer??"");
 const answer=String(b.answer??"");
 let intent="practice",reply="",nextAction="probe";
 if(!answer && !student){reply=`Let's solve ${problem} together. What do you think we should do first?`;nextAction="ask-first-step";}
 else if(answer && correct && answer===correct){reply="Nice work. Tell me how you got your answer.";nextAction="ask-reasoning";}
 else if(student){reply="I see your idea. Let's check one step at a time. What did you do first, and why?";nextAction="probe-reasoning";}
 else {reply="That's okay. Let's use a smaller step. Can you show me what you tried?";nextAction="scaffold";}
 res.json({grade,problem,intent,reply,nextAction,studentResponse:student});
});

app.post("/api/voice/session",auth,requireRole("teacher","admin"),(req,res)=>{
 const b=req.body||{};
 res.json({
  supported:true,
  mode:"browser_voice",
  language:b.language||"en-PH",
  input:"speech-to-text",
  output:"text-to-speech",
  note:"Audio is processed client-side in this foundation; persistent audio storage is disabled."
 });
});
app.get("/api/health",(req,res)=>res.json({status:"ok",version:"11.0",database:"sqlite",time:now()}));
app.get("/api/curriculum-map",(req,res)=>{let g=Math.max(1,Math.min(10,+req.query.grade||1));res.json(CURRICULUM[`grade_${g}`]||{})});
app.get("/api/curriculum",(req,res)=>{let g=Math.max(1,Math.min(10,+req.query.grade||1));res.json({grade:g,patterns:PATTERNS(g),competencies:COMP[g],labels:LABEL})});
app.post("/api/learners",(req,res)=>{let b=req.body||{},learner={id:id(),name:b.name||"Learner",grade:+b.grade||1,section:b.section||"",school:b.school||"",created_at:now()};db.run("INSERT INTO learners VALUES(?,?,?,?,?,?)",Object.values(learner),e=>{if(e)return res.status(500).json({error:e.message});sheetsAddLearner(learner);res.json(learner)})});
// Unauthenticated by design (same trade-off as POST /api/learners above): students look themselves up
// by name to resume on a new device without a login system. Matches are case-insensitive/trimmed.
app.get("/api/learners/find",(req,res)=>{
 const nameQ=String(req.query.name||"").trim();
 if(!nameQ)return res.json([]);
 db.all("SELECT * FROM learners WHERE LOWER(TRIM(name))=LOWER(?) ORDER BY created_at DESC LIMIT 10",[nameQ],(e,rows)=>e?res.status(500).json({error:e.message}):res.json(rows||[]));
});
app.get("/api/learners",auth,requireRole("teacher","admin"),(req,res)=>db.all("SELECT * FROM learners ORDER BY created_at DESC",(e,r)=>e?res.status(500).json({error:e.message}):res.json(r)));
app.get("/api/learners/:id/summary",(req,res)=>db.all("SELECT competency,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery,MAX(created_at) last_seen FROM attempts WHERE learner_id=? GROUP BY competency",[req.params.id],(e,r)=>e?res.status(500).json({error:e.message}):res.json(r)));
app.get("/api/learners/:id/profile",(req,res)=>{
 db.get("SELECT * FROM learners WHERE id=?",[req.params.id],(e,learner)=>{
  if(e||!learner)return res.status(404).json({error:"Learner not found"});
  db.all("SELECT competency,COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery,MAX(difficulty) level FROM attempts WHERE learner_id=? GROUP BY competency ORDER BY mastery ASC",[req.params.id],(e2,skills)=>{
   db.all("SELECT competency,question,expected,answer,correct,mastery,created_at FROM attempts WHERE learner_id=? ORDER BY created_at DESC LIMIT 20",[req.params.id],(e3,recent)=>{
    const weakSkills=(skills||[]).filter(s=>s.mastery<0.45).map(s=>s.competency);
    const strongSkills=(skills||[]).filter(s=>s.mastery>=0.85).map(s=>s.competency);
    const totalAttempts=(skills||[]).reduce((a,s)=>a+s.attempts,0);
    const totalCorrect=(skills||[]).reduce((a,s)=>a+s.correct,0);
    const overallAccuracy=totalAttempts?totalCorrect/totalAttempts:0;
    const avgMastery=(skills||[]).length?(skills||[]).reduce((a,s)=>a+s.mastery,0)/skills.length:0.5;
    const recentMistakes=(recent||[]).filter(r=>!r.correct).slice(0,5);
    res.json({learner,skills:skills||[],weakSkills,strongSkills,totalAttempts,overallAccuracy,avgMastery,recentMistakes,recentActivity:recent||[]});
   });
  });
 });
});
// Groq Cloud TTS (natural voice)
app.post("/api/speak",async(req,res)=>{
 const {text,voice}=req.body||{};
 if(!text)return res.status(400).json({error:"No text"});
 if(!AI_KEY){return res.status(503).json({error:"No API key"})}
 const validVoices=["tara","leah","jess","leo","dan","mia","zac","zoe"];
 const useVoice=validVoices.includes(voice)?voice:"tara";
 try{
  console.log("[TTS] Requesting voice:",useVoice,"text:",text.substring(0,50)+"...");
  const r=await fetch("https://api.groq.com/openai/v1/audio/speech",{
   method:"POST",
   headers:{"Content-Type":"application/json","Authorization":`Bearer ${AI_KEY}`},
   body:JSON.stringify({model:"canopylabs/orpheus-v1-english",input:text,voice:useVoice,response_format:"wav"})
  });
  if(!r.ok){const err=await r.text();console.log("[TTS] Error:",r.status,err);return res.status(502).json({error:"TTS error: "+r.status})}
  res.set({"Content-Type":"audio/wav","Cache-Control":"no-cache"});
  const buf=Buffer.from(await r.arrayBuffer());
  console.log("[TTS] Success, size:",buf.length);
  res.send(buf);
 }catch(e){console.log("[TTS] Failed:",e.message);res.status(502).json({error:"TTS failed"})}
});

app.post("/api/question",(req,res)=>{let b=req.body||{},g=Math.max(1,Math.min(10,+b.grade||1)),op=b.operation||"addition",s=b.skillState||{},p=PATTERNS(g),maxLvl=p.length,idx=Math.max(0,Math.min(p.length-1,(s.level||1)-1)),pat=p[idx];
 const itemNum=+b.itemNumber||1;
 const isWP=(itemNum===5||itemNum===10||itemNum===15);
 let q=isWP?makeWordProblem(op,pat):make(op,pat);
 q.competency=b.competency||`${op}_${pat}`;q.competencyLabel=LABEL[q.competency]||LABEL[op]||q.competency;q.difficulty=s.level||1;q.maxLevel=maxLvl;q.itemNumber=itemNum;res.json(q)});
app.post("/api/attempt",(req,res)=>{let b=req.body||{},clientId=b.clientId||null,s=update(b.skillState||{},!!b.correct);
 if(clientId){db.get("SELECT client_id FROM sync_receipts WHERE client_id=?",[clientId],(x,hit)=>{if(hit)return res.json({skillState:s,duplicate:true});
  db.run("INSERT INTO sync_receipts(client_id,received_at) VALUES(?,?)",[clientId,now()],()=>saveAttempt())});}else saveAttempt();
 function saveAttempt(){let a=[b.learnerId,b.competency,b.question,String(b.expected),String(b.answer),b.correct?1:0,b.difficulty||1,s.mastery,now()];
 db.run("INSERT INTO attempts(learner_id,competency,question,expected,answer,correct,difficulty,mastery,created_at) VALUES(?,?,?,?,?,?,?,?,?)",a,e=>{if(e)return res.status(500).json({error:e.message});sheetsSaveAttempt({learnerId:b.learnerId,learnerName:b.learnerName||"",competency:b.competency,question:b.question,expected:String(b.expected),answer:String(b.answer),correct:!!b.correct,difficulty:b.difficulty||1,mastery:s.mastery,created_at:now()});res.json({skillState:s,duplicate:false})})}
});
app.post("/api/intervention",(req,res)=>{let b=req.body||{};db.run("INSERT INTO interventions(learner_id,competency,message,misconception,created_at) VALUES(?,?,?,?,?)",[b.learnerId,b.competency,b.message||"",b.misconception||"",now()],e=>e?res.status(500).json({error:e.message}):res.json({ok:true}))});
app.get("/api/dashboard",(req,res)=>{db.get("SELECT COUNT(*) learners FROM learners",(e,l)=>db.get("SELECT COUNT(*) attempts,SUM(correct) correct,AVG(mastery) mastery FROM attempts",(e2,a)=>db.all("SELECT competency,AVG(mastery) mastery,COUNT(*) attempts FROM attempts GROUP BY competency ORDER BY mastery ASC LIMIT 8",(e3,p)=>res.json({learners:l?.learners||0,attempts:a?.attempts||0,accuracy:a?.attempts?((a.correct||0)/a.attempts):0,averageMastery:a?.mastery||0,prioritySkills:p||[]}))))});
app.listen(PORT,()=>console.log(`MathBuddy V11 running on ${PORT}`));
