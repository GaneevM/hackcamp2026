// Screen mapping and gesture gates for the local-only camera air pointer.
function solve3(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) throw new Error('Calibration points are too close together.');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j < 4; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 3; row++) if (row !== column) {
      const factor = rows[row][column];
      for (let j = column; j < 4; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map((row) => row[3]);
}

export function fitPointerMap(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 4) throw new Error('Use at least four calibration points.');
  const matrix = [[0,0,0],[0,0,0],[0,0,0]], rhsX = [0,0,0], rhsY = [0,0,0];
  for (const pair of pairs) {
    const row = [pair.camera.x, pair.camera.y, 1];
    for (let i=0;i<3;i++) {
      for (let j=0;j<3;j++) matrix[i][j] += row[i]*row[j];
      rhsX[i] += row[i]*pair.screen.x; rhsY[i] += row[i]*pair.screen.y;
    }
  }
  return { x: solve3(matrix,rhsX), y: solve3(matrix,rhsY) };
}

function median(values) {
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function summarizePointerSamples(samples) {
  const points=samples.filter(point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y));
  if(points.length<6)return null;
  const center={x:median(points.map(point=>point.x)),y:median(points.map(point=>point.y))};
  const radii=points.map(point=>Math.hypot(point.x-center.x,point.y-center.y));
  const radialMedian=median(radii),radialMad=median(radii.map(radius=>Math.abs(radius-radialMedian)));
  const limit=Math.max(.018,radialMedian+3.5*radialMad);
  const inliers=points.filter(point=>Math.hypot(point.x-center.x,point.y-center.y)<=limit);
  if(inliers.length<6||inliers.length<Math.ceil(points.length*.6))return null;
  const xs=inliers.map(point=>point.x),ys=inliers.map(point=>point.y);
  const percentile=(values,fraction)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.round((sorted.length-1)*fraction)];};
  return {point:{x:median(xs),y:median(ys)},count:inliers.length,
    jitter:Math.max(percentile(xs,.9)-percentile(xs,.1),percentile(ys,.9)-percentile(ys,.1))};
}

export function fitPointerMapReliable(pairs) {
  if(!Array.isArray(pairs)||pairs.length<4)throw new Error('Use at least four calibration points.');
  const candidates=[pairs];
  if(pairs.length>4)for(let omitted=0;omitted<pairs.length;omitted++)candidates.push(pairs.filter((_,index)=>index!==omitted));
  let best=null;
  for(const candidate of candidates){
    try{
      const map=fitPointerMap(candidate);
      const errors=pairs.map(pair=>{const mapped=mapFingerToScreen(map,pair.camera);return Math.hypot(mapped.x-pair.screen.x,mapped.y-pair.screen.y);});
      const inliers=errors.filter(error=>error<=.12).length,meanError=errors.reduce((sum,error)=>sum+error,0)/errors.length;
      if(!best||inliers>best.inliers||(inliers===best.inliers&&meanError<best.meanError))best={map,inliers,meanError};
    }catch{}
  }
  if(!best||best.inliers<4||best.meanError>.2)throw new Error('The tracked points were too inconsistent. Try again with your hand clearly visible.');
  return best;
}

export function mapFingerToScreen(map, point) {
  if (!map || !point) return null;
  const [a,b,c] = map.x, [d,e,f] = map.y;
  const x = a*point.x + b*point.y + c, y = d*point.x + e*point.y + f;
  return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.max(0,Math.min(1,x)), y: Math.max(0,Math.min(1,y)) } : null;
}

function distance3(a,b) {
  if (!a || !b || ![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite)) return 0;
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

export function isIndexPointing(hand) {
  if (!Array.isArray(hand) || hand.length < 21) return false;
  const wrist=hand[0];
  const ratio=(pip,tip)=>distance3(wrist,hand[tip])/Math.max(.0001,distance3(wrist,hand[pip]));
  const index=ratio(6,8),others=[ratio(10,12),ratio(14,16),ratio(18,20)];
  return index>1.08 && index>Math.max(...others)+.025 && others.every(value=>value<1.38);
}
