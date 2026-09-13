import { BATTING } from './batting-tuning.js';

// A single clock drives the visible pitch and the player's swing.
export const PITCH_RELEASE_DISTANCE=16.8;
export const CATCHER_DEPTH=1.2;
export const BAT_CONTACT_SECONDS=BATTING.playerInput.contactSeconds;
export function battingCatchSeconds(speed){return CATCHER_DEPTH/(speed/3.6);}
export function battingFlightSeconds(speed){return PITCH_RELEASE_DISTANCE/(speed/3.6);}
export function battingPressTiming(pressedAt,arrival){
  const window=BATTING.swingWindow,center=(window.from+window.to)/2;
  // The standard sweet window spans ±55 ms around barrel arrival.
  const offset=(pressedAt+BAT_CONTACT_SECONDS-arrival)*(window.to-window.from)/(BATTING.playerInput.timingTolerance*2);
  return Math.max(0,Math.min(1,center+offset));
}
