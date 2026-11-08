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
  return index>1.16 && others.every(value=>value<1.2);
}
