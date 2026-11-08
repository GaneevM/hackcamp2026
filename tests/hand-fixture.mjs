export function makeHand(gesture='fist',x=.5,y=.35,scale=1){
  const hand=Array.from({length:21},()=>({x,y:y+.1*scale,z:0}));
  hand[0]={x,y:y+.18*scale,z:0};
  const opened=gesture==='one'?[true,false,false,false]:gesture==='two'?[true,true,false,false]:gesture==='palm'?[true,true,true,true]:gesture==='three'?[true,true,true,false]:[false,false,false,false];
  [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]].forEach(([mcp,pip,dip,tip],i)=>{
    const px=x+[-.04,-.015,.015,.04][i]*scale;
    hand[mcp]={x:px,y:y+.1*scale,z:0};hand[pip]={x:px,y:y+.065*scale,z:0};
    hand[dip]={x:px,y:y+(opened[i]?.03:.12)*scale,z:0};
    hand[tip]={x:px,y:y+(opened[i]?0:.14)*scale,z:0};
  });
  return hand;
}
