// Preserve at least one render pixel per CSS pixel, including fullscreen/4K.
// Spend extra pixels on high-density screens without unbounded supersampling.
export function renderPixelRatio(width,height,dpr=1){
 return Math.max(1,Math.min(dpr||1,2,Math.sqrt(4000000/Math.max(1,width*height))));
}
