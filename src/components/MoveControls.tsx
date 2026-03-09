interface MoveControlsProps {
  currentIndex: number;
  maxIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

export function MoveControls({
  currentIndex,
  maxIndex,
  onPrevious,
  onNext,
  isPlaying = false,
  onPlayPause,
}: MoveControlsProps) {
  const atStart = currentIndex <= 0;
  const atEnd = maxIndex <= 0 || currentIndex >= maxIndex;

  return (
    <div className="move-controls">
      <button
        type="button"
        onClick={onPrevious}
        disabled={atStart}
        aria-label="Previous move"
      >
        Previous
      </button>
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
      <button
        type="button"
        onClick={onNext}
        disabled={atEnd}
        aria-label="Next move"
      >
        Next
      </button>
    </div>
  );
}
