interface MoveControlsProps {
  currentIndex: number;
  maxIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  /** When true, hide Previous/Next (e.g. when playing from memory). */
  hideStepButtons?: boolean;
}

export function MoveControls({
  currentIndex,
  maxIndex,
  onPrevious,
  onNext,
  isPlaying = false,
  onPlayPause,
  hideStepButtons = false,
}: MoveControlsProps) {
  const atStart = currentIndex <= 0;
  const atEnd = maxIndex <= 0 || currentIndex >= maxIndex;
  const showAnyButton = !hideStepButtons || onPlayPause;
  if (!showAnyButton) return null;

  return (
    <div className="move-controls">
      {!hideStepButtons && (
        <button
          type="button"
          onClick={onPrevious}
          disabled={atStart}
          aria-label="Previous move"
        >
          Previous
        </button>
      )}
      {onPlayPause && (
        <button
          type="button"
          onClick={onPlayPause}
          disabled={atEnd}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      )}
      {!hideStepButtons && (
        <button
          type="button"
          onClick={onNext}
          disabled={atEnd}
          aria-label="Next move"
        >
          Next
        </button>
      )}
    </div>
  );
}
