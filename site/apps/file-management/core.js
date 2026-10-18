/* Pure virtual filesystem and assessment logic. No browser, file, or network API. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PracticeCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function initial(data){return {workspace:clone(data.snapshots.initial),phase:'guided',stepId:data.steps[0].id,history:[],evidence:[],progress:{read:false,guidedPass:false,recoveryPass:false,transferPass:false,conceptPass:false},hints:{},transferAssisted:false,conceptAnswers:{},nextId:1,transferAttemptId:0,nextTransferAttemptId:1};}
function path(ws,id){if(id==='root')return '';let item=ws.items.find(x=>x.id===id);if(!item)return null;let seen=new Set(),names=[];while(item){if(seen.has(item.id))throw Error('순환 경로');seen.add(item.id);names.unshift(item.name);if(item.parentId==='root')break;item=ws.items.find(x=>x.id===item.parentId);if(!item)throw Error('부모 폴더 없음');}return names.join('/');}
function folderAt(ws,fullPath){return ws.items.find(x=>x.type==='folder'&&path(ws,x.id)===fullPath);}
function validName(name){if(typeof name!=='string'||!name.trim())return '이름을 입력하세요.';if(name!==name.trim())return '앞뒤 공백을 지우세요.';if(name.length>80)return '이 연습에서는 80자 이내로 입력하세요.';if(/[\\/:*?"<>|\u0000-\u001f]/.test(name)||name==='.'||name==='..')return '이 연습에서는 / \\ : * ? " < > | 와 제어 문자를 이름에 쓸 수 없습니다. 경로는 폴더 선택으로 정하세요.';return null;}
function checkpoint(s){s.history.push({workspace:clone(s.workspace),evidence:clone(s.evidence),progress:clone(s.progress),phase:s.phase,hints:clone(s.hints),transferAssisted:!!s.transferAssisted,transferAttemptId:s.transferAttemptId});if(s.history.length>30)s.history.shift();}
function invalidate(s){if(s.phase==='guided')s.progress.guidedPass=false;else if(s.phase==='recovery')s.progress.recoveryPass=false;else s.progress.transferPass=false;}
function createFolder(s,name){let error=validName(name);if(error)return{ok:false,message:error};if(s.workspace.items.length>=100)return{ok:false,message:'이 짧은 실습은 가상 항목 100개까지 지원합니다. 초기화 후 다시 연습하세요.'};let p=s.workspace.currentFolderId;if(p!=='root'&&!s.workspace.items.some(x=>x.id===p&&x.type==='folder'))return{ok:false,message:'부모 폴더를 선택하세요.'};if(s.workspace.items.some(x=>x.parentId===p&&x.name===name))return{ok:false,message:'같은 위치에 같은 이름이 있습니다. 덮어쓰지 않았습니다.'};checkpoint(s);let id='user-folder-'+s.nextId++;s.workspace.items.push({id,type:'folder',name,parentId:p});s.evidence.push('folder:'+path(s.workspace,id));invalidate(s);return{ok:true,message:path(s.workspace,id)+' 폴더를 만들었습니다.'};}
function rename(s,name){let error=validName(name);if(error)return{ok:false,message:error};let f=s.workspace.items.find(x=>x.id===s.workspace.selectedId&&x.type==='file');if(!f)return{ok:false,message:'먼저 파일을 선택하세요.'};if(s.workspace.items.some(x=>x.id!==f.id&&x.parentId===f.parentId&&x.name===name))return{ok:false,message:'같은 이름이 이미 있어 바꾸지 않았습니다.'};if(f.name===name)return{ok:false,message:'이름이 같습니다. 변경하지 않았습니다.'};checkpoint(s);f.name=name;if(!s.evidence.includes('rename:'+f.id))s.evidence.push('rename:'+f.id);invalidate(s);return{ok:true,message:'가상 파일의 이름을 바꿨습니다. 파일 내용의 형식은 변환되지 않습니다.'};}
function move(s,target){let f=s.workspace.items.find(x=>x.id===s.workspace.selectedId&&x.type==='file');if(!f)return{ok:false,message:'먼저 파일을 선택하세요.'};if(target!=='root'&&!s.workspace.items.some(x=>x.id===target&&x.type==='folder'))return{ok:false,message:'이동할 폴더를 선택하세요.'};if(target===f.parentId)return{ok:false,message:'이미 그 폴더에 있습니다.'};if(s.workspace.items.some(x=>x.id!==f.id&&x.parentId===target&&x.name===f.name))return{ok:false,message:'같은 이름이 있어 이동하지 않았습니다. 덮어쓰기는 지원하지 않습니다.'};checkpoint(s);f.parentId=target;s.workspace.currentFolderId=target;if(!s.evidence.includes('move:'+f.id))s.evidence.push('move:'+f.id);invalidate(s);return{ok:true,message:(path(s.workspace,target)||'연습공간')+'으로 이동했습니다.'};}
function undo(s){const previous=s.history.pop();if(!previous)return{ok:false,message:'되돌릴 작업이 없습니다.'};const keepAssistance=s.transferAttemptId===previous.transferAttemptId;const currentHints=clone(s.hints),currentAssisted=s.transferAssisted;const independentProgress={read:s.progress.read,conceptPass:s.progress.conceptPass};Object.assign(s,previous);Object.assign(s.progress,independentProgress);if(keepAssistance){s.transferAssisted=s.transferAssisted||currentAssisted;for(const id of Object.keys(currentHints))s.hints[id]=Math.max(s.hints[id]||0,currentHints[id]);}return{ok:true,message:'마지막 가상 작업과 그 작업의 수행 기록을 되돌렸습니다.'};}
function scenarioCheck(s,rule){let f=s.workspace.items.find(x=>x.id===rule.fileId);let checks=[{id:'file',label:'과제 대상',pass:!!f},{id:'name',label:'파일 이름',pass:!!f&&f.name===rule.expectedName},{id:'path',label:'폴더 경로',pass:!!f&&path(s.workspace,f.parentId)===rule.expectedPath}];return{correct:checks.every(x=>x.pass),checks,currentName:f?f.name:'대상 없음',currentPath:f?(path(s.workspace,f.parentId)||'연습공간'):'대상 없음'};}
function assess(s,data){let r=scenarioCheck(s,s.phase==='transfer'?data.scenarios.transfer:data.scenarios.guided);const required=s.phase==='guided'?['folder:원고','folder:원고/초안','rename:travel','move:travel']:s.phase==='recovery'?['recovery:start','rename:travel','move:travel']:['transfer:start','folder:원고/검토','rename:cooking','move:cooking'];let actions=required.every(x=>s.evidence.includes(x));const key=s.phase==='guided'?'guidedPass':s.phase==='recovery'?'recoveryPass':'transferPass';s.progress[key]=r.correct&&actions;return{...r,actions,passed:r.correct&&actions,missingEvidence:required.filter(x=>!s.evidence.includes(x))};}
function startRecovery(s,data){checkpoint(s);s.workspace=clone(data.snapshots.broken);s.phase='recovery';s.evidence=['recovery:start'];s.progress.recoveryPass=false;return{ok:true,message:'두 오류가 있는 가상 사본을 열었습니다. 결과 확인으로 진단하세요.'};}
function startTransfer(s,data){checkpoint(s);s.workspace=clone(data.snapshots.transfer);s.workspace.items=s.workspace.items.filter(x=>x.id!=='review');s.phase='transfer';s.transferAttemptId=s.nextTransferAttemptId++;s.evidence=['transfer:start'];s.progress.transferPass=false;s.transferAssisted=false;delete s.hints['fn-11'];return{ok:true,message:'새 과제입니다. 조건을 읽고 메모.md를 정리하세요.'};}
function prepare(s,data,step){if(step.id==='fn-11'){startTransfer(s,data);return;}checkpoint(s);s.workspace=clone(data.snapshots[step.asset.stateBefore]);s.evidence=[];s.phase=Number(step.id.slice(3))>=11?'transfer':Number(step.id.slice(3))>=7?'recovery':'guided';if(s.phase==='transfer')s.transferAssisted=true;invalidate(s);}
function concepts(s,data,answers){s.conceptAnswers=clone(answers);let correct=data.conceptQuestions.filter(q=>answers[q.id]===q.correctIndex).length;s.progress.conceptPass=correct===data.conceptQuestions.length;return{correct,total:data.conceptQuestions.length};}
function completed(s){return ['guidedPass','recoveryPass','transferPass','conceptPass'].every(k=>s.progress[k]);}
function addHint(s,id){s.hints[id]=Math.min(3,(s.hints[id]||0)+1);if(s.phase==='transfer'||id==='fn-11')s.transferAssisted=true;return s.hints[id];}
function savedProgress(s,data){return{schemaVersion:data.schemaVersion,contentVersion:data.contentVersion,stepId:s.stepId,phase:s.phase,progress:clone(s.progress),hints:clone(s.hints),transferAssisted:!!s.transferAssisted};}
function restore(data,raw){let s=initial(data);if(!raw||raw.schemaVersion!==data.schemaVersion||raw.contentVersion!==data.contentVersion)return s;let step=data.steps.find(x=>x.id===raw.stepId);if(step)s.stepId=step.id;for(let k of Object.keys(s.progress))s.progress[k]=raw.progress?.[k]===true;for(let step of data.steps)s.hints[step.id]=Math.max(0,Math.min(3,Number(raw.hints?.[step.id])||0));s.phase=['guided','recovery','transfer'].includes(raw.phase)?raw.phase:'guided';s.workspace=clone(data.snapshots[s.phase==='transfer'?'transfer':s.phase==='recovery'?'broken':'initial']);s.transferAssisted=raw.transferAssisted===true;s.restored=true;return s;}
function restoreSession(data,raw){
  if(!raw||raw.version!==7||raw.contentVersion!==data.contentVersion)throw Error('저장 버전');
  const clean=value=>{
    if(!value||typeof value!=='object')throw Error('저장 상태');
    const s=initial(data),w=value.workspace;
    if(!w||!Array.isArray(w.items)||w.items.length>100)throw Error('가상 항목');
    const ids=new Set();
    s.workspace.items=w.items.map(x=>{
      if(!x||typeof x.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(x.id)||x.id==='root'||ids.has(x.id)||!['file','folder'].includes(x.type)||validName(x.name)||typeof x.parentId!=='string')throw Error('가상 항목 형식');
      ids.add(x.id);return{id:x.id,type:x.type,name:x.name,parentId:x.parentId};
    });
    for(const x of s.workspace.items){if(x.parentId!=='root'&&!s.workspace.items.some(p=>p.id===x.parentId&&p.type==='folder'))throw Error('부모 폴더');path(s.workspace,x.id);}
    if(w.currentFolderId!=='root'&&!s.workspace.items.some(x=>x.id===w.currentFolderId&&x.type==='folder'))throw Error('현재 폴더');
    if(w.selectedId!==null&&!s.workspace.items.some(x=>x.id===w.selectedId&&x.type==='file'))throw Error('선택 파일');
    s.workspace.currentFolderId=w.currentFolderId;s.workspace.selectedId=w.selectedId;
    if(!['guided','recovery','transfer'].includes(value.phase)||!data.steps.some(x=>x.id===value.stepId))throw Error('미션');
    s.phase=value.phase;s.stepId=value.stepId;
    for(const k of Object.keys(s.progress))s.progress[k]=value.progress?.[k]===true;
    for(const step of data.steps){const n=value.hints?.[step.id]||0;if(!Number.isInteger(n)||n<0||n>3)throw Error('힌트');s.hints[step.id]=n;}
    if(!Array.isArray(value.evidence)||value.evidence.length>500||value.evidence.some(x=>typeof x!=='string'||x.length>10000||! /^(folder:|rename:|move:|recovery:start$|transfer:start$)/.test(x)))throw Error('수행 기록');
    s.evidence=[...value.evidence];s.transferAssisted=value.transferAssisted===true;
    for(const k of ['nextId','transferAttemptId','nextTransferAttemptId']){if(!Number.isSafeInteger(value[k])||value[k]<0||value[k]>1000000)throw Error('시도 번호');s[k]=value[k];}
    for(const q of data.conceptQuestions){const a=value.conceptAnswers?.[q.id];if(Number.isInteger(a)&&a>=0&&a<q.options.length)s.conceptAnswers[q.id]=a;}
    return s;
  };
  const state=clean(raw.state);
  // Restore only bounded snapshots through the same workspace validator.
  if(!Array.isArray(raw.state.history)||raw.state.history.length>30)throw Error('되돌리기 기록');
  state.history=raw.state.history.map(h=>{const v=clean({...raw.state,...h,history:[]});return {workspace:v.workspace,evidence:v.evidence,progress:v.progress,phase:v.phase,hints:v.hints,transferAssisted:v.transferAssisted,transferAttemptId:v.transferAttemptId};});
  state.restored=true;return state;
}
return{clone,initial,path,folderAt,validName,createFolder,rename,move,undo,scenarioCheck,assess,startRecovery,startTransfer,prepare,concepts,completed,addHint,savedProgress,restore,restoreSession};
});
