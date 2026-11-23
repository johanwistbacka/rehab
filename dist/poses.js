// Each generated sheet contains equally sized square frames in one row.
// Keep paths shared by the UI, offline cache and publishing package.
export const poseAssets=Array.from({length:8},(_,i)=>`assets/poses/exercise-${i}.webp`);
export function exercisePose(exercise,phase='ready',nextPhase){
  const active=phase==='transition'?nextPhase:phase;
  const base={src:poseAssets[exercise.img],columns:exercise.kind==='heel'?3:2};
  if(exercise.kind==='heel'){
    const index=active==='up'?1:active==='down'?2:0;
    return {...base,frames:[index],label:['Grundläge','Upp på tå','Sänk hälarna'][index]};
  }
  if(exercise.kind==='squat'){
    return {...base,frames:active==='manual'?[0,1]:[0],label:active==='manual'?'Stå → sänk → res dig i eget tempo':'Stående startläge'};
  }
  const hold=active==='hold';
  return {...base,frames:[hold?1:0],label:hold?'Håll stretchpositionen':'Utgångsläge'};
}

export function poseOptions(exercise){
  const base=exercisePose(exercise);
  const labels=exercise.kind==='heel'?['Grundläge','Upp på tå','Sänk hälarna']:exercise.kind==='squat'?['Stående','Nedsänkt']:['Utgångsläge','Stretchposition'];
  return labels.map((label,frame)=>({...base,frames:[frame],label}));
}
export function allPoses(exercise){
  const options=poseOptions(exercise);
  return {...options[0],frames:options.map((_,i)=>i),label:options.map(p=>p.label).join(' → ')};
}
