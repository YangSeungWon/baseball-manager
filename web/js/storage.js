// 저장 실패가 원본 삭제로 이어지지 않도록, 교체와 복구를 한곳에서 다룬다.
export const KEY = 'dugout.save.v1';
export const BACKUP = 'dugout.save.recovery';
export function readSlot(storage, key = KEY) {
  try { return storage.getItem(key); } catch { return null; }
}
export function writeSave(storage, text, { replace = false } = {}) {
  const previous = storage.getItem(KEY);
  // 새 구단/가져오기는 이전 구단 보관에 성공해야만 진행한다.
  if (previous && (replace || !storage.getItem(BACKUP))) storage.setItem(BACKUP, previous);
  storage.setItem(KEY, text);
}
export function checkpoint(storage) {
  const current = storage.getItem(KEY);
  if (current) storage.setItem(BACKUP, current);
}
