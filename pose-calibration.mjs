function median(values) {
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function summarizePoseAngles(samples) {
  const values=samples.filter(value=>Number.isFinite(value)&&value>=0&&value<=180);
  if(values.length<10)return null;
  const center=median(values),deviations=values.map(value=>Math.abs(value-center)),mad=median(deviations);
  const limit=Math.max(8,mad*3.5),inliers=values.filter(value=>Math.abs(value-center)<=limit);
  if(inliers.length<10||inliers.length<Math.ceil(values.length*.6))return null;
  const spread=median(inliers.map(value=>value));
  const sorted=[...inliers].sort((a,b)=>a-b),p10=sorted[Math.round((sorted.length-1)*.1)],p90=sorted[Math.round((sorted.length-1)*.9)];
  return {angle:Math.round(spread),count:inliers.length,spread:p90-p10,stable:p90-p10<=32};
}
