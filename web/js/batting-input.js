import { BATTING } from './batting-tuning.js';

// A single clock drives the visible pitch and the player's swing.
export const PITCH_RELEASE_DISTANCE=16.8;
export const CATCHER_DEPTH=1.2;
export const BAT_CONTACT_SECONDS=BATTING.playerInput.contactSeconds;
export function battingCatchSeconds(speed){return CATCHER_DEPTH/(speed/3.6);}
export function battingFlightSeconds(speed){return PITCH_RELEASE_DISTANCE/(speed/3.6);}
export const battingSwing=kind=>BATTING.playerInput.swings[kind==='power'?'power':'contact'];
// How far a loaded bat had already come forward when the batter held up (0 = clean take, 1 = at the ball).
export function battingCheckDepth(checkedAt,arrival){
  const span=BATTING.playerInput.check.span;
  return Math.max(0,Math.min(1,(checkedAt-(arrival-span))/span));
}
export function battingPressTiming(pressedAt,arrival,seconds=BAT_CONTACT_SECONDS){
  const window=BATTING.swingWindow,center=(window.from+window.to)/2;
  // The standard sweet window spans ±55 ms around barrel arrival.
  const offset=(pressedAt+seconds-arrival)*(window.to-window.from)/(BATTING.playerInput.timingTolerance*2);
  return Math.max(0,Math.min(1,center+offset));
}
