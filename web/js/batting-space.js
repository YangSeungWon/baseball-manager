// Metres. Home's pitcher-facing edge is depth 0; positive depth faces the mound.
// MLB OBR diagram 2: 17-inch plate, 4-by-6-foot boxes, 6-inch plate clearance.
export const HOME_PLATE=Object.freeze({halfWidth:.2159,front:0,corner:-.2159,back:-.4318});
export const BATTERS_BOX=Object.freeze({inner:.3683,outer:1.5875,front:.6985,back:-1.1303});
// Shared athlete asset is authored in metres; this gives a standing adult-sized rig.
export const PLAYER_SCALE=.95;
export const BAT_SCALE=.86/(.813*PLAYER_SCALE); // 86 cm from knob to tip
// A fixed neutral stance, fitted to this rig's reach (not an MLB population average).
export const BATTING_STANCE=Object.freeze({offset:.80,depth:-.27});
export const battingPosition=(hand='R')=>({x:hand==='L'?BATTING_STANCE.offset:-BATTING_STANCE.offset,y:BATTING_STANCE.depth});
// The zone as it is actually called, not as the rulebook defines it: umpires squeeze the
// rulebook's knee-to-shoulder/waist band (this rig: .44~1.20 m) to about 58 cm, and broadcast
// zone graphics follow the called zone. Fixed during a swing.
export const BATTING_ZONE=Object.freeze({halfWidth:HOME_PLATE.halfWidth,bottom:.50,top:1.08,center:.79,halfHeight:.29});
export const BATTING_AIM_LIMIT=2;
