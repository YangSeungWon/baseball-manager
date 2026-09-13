import { BATTING } from './batting-tuning.js';

// A single clock drives the visible pitch and the player's swing.
export const BATTING_FLIGHT_SCALE=BATTING.playerInput.flightScale;
export const BAT_CONTACT_SECONDS=BATTING.playerInput.contactSeconds;
export const BAT_LATE_SECONDS=BATTING.playerInput.lateSeconds;
export function battingFlightSeconds(speed){return 16.8/(speed/3.6)*BATTING_FLIGHT_SCALE;}
export function battingPressTiming(pressedAt,arrival){
  const window=BATTING.swingWindow,center=(window.from+window.to)/2;
  // The standard sweet window spans ±55 ms around barrel arrival.
  const offset=(pressedAt+BAT_CONTACT_SECONDS-arrival)*(window.to-window.from)/(BATTING.playerInput.timingTolerance*2);
  return Math.max(0,Math.min(1,center+offset));
}
