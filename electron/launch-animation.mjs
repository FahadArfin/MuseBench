// A process-owned, one-use launch ticket. Keeping this outside the renderer
// makes reload, renderer recovery and a second app activation skip the intro.
export function createLaunchAnimation({ setHeld, timeoutMs = 4000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let claimed = false, finished = false;
  setHeld(true);
  const timer = setTimer(() => complete(), timeoutMs);
  timer?.unref?.();
  function complete() {
    if (finished) return;
    finished = true;
    clearTimer(timer);
    setHeld(false);
  }
  return {
    claim() {
      if (claimed || finished) return false;
      claimed = true;
      return true;
    },
    complete,
    close: complete,
  };
}
