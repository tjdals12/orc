type InterruptWatch = {
  wasInterrupted: () => boolean;
  stop: () => void;
};

export function watchInterrupt(): InterruptWatch {
  let interrupted = false;
  const onInterrupt = () => {
    interrupted = true;
  };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);

  const interruptWatch: InterruptWatch = {
    wasInterrupted: () => interrupted,
    stop: () => {
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onInterrupt);
    },
  };
  return interruptWatch;
}
