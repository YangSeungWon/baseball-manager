// World-space reference for the current shared athlete rig in its loaded stance.
// Lower edge: below the knees (~.67 m). Upper edge: shoulder/waist midpoint.
// These remain fixed through head turns, swings and recovery; x/y stay over home.
export const BATTING_ZONE=Object.freeze({halfWidth:.216,bottom:.62,top:1.72,center:1.17,halfHeight:.55});

// ±1 is the strike-zone edge; the bat can reach beyond it.
export const BATTING_AIM_LIMIT=2;
