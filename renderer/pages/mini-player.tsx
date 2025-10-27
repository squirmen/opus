import React, { useEffect, useState, useRef } from "react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconX,
  IconList,
  IconChevronDown,
  IconGripVertical,
} from "@tabler/icons-react";
import Image from "next/image";

interface Song {
  id: number;
  name: string;
  artist: string;
  album?: {
    cover?: string;
  };
  duration: number;
}

export default function MiniPlayer() {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [hoveredQueueIndex, setHoveredQueueIndex] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Prevent scrollbars
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    // Listen for playback updates from main window
    const updateListener = window.ipc.on(
      "mini-player-update",
      (data: { song: Song; isPlaying: boolean; currentTime: number; queue?: Song[] }) => {
        setCurrentSong(data.song);
        setIsPlaying(data.isPlaying);
        setCurrentTime(data.currentTime);
        if (data.queue) {
          setQueue(data.queue);
        }
      }
    );

    // Request initial state
    window.ipc.send("mini-player-request-state", null);

    return () => {
      updateListener();
    };
  }, []);

  // Handle window resize when queue is toggled or queue length changes
  useEffect(() => {
    const BASE_HEIGHT = 110; // Player controls height
    const QUEUE_HEADER_HEIGHT = 30; // "Up Next" header
    const QUEUE_ITEM_HEIGHT = 54; // Each song item height
    const QUEUE_PADDING = 24; // Top and bottom padding
    const PROGRESS_BAR_HEIGHT = 4; // Progress bar at bottom (increased from 1)
    const EMPTY_QUEUE_HEIGHT = 60; // Height for empty queue message

    let targetHeight = BASE_HEIGHT + PROGRESS_BAR_HEIGHT;

    if (showQueue) {
      if (queue.length > 0) {
        // Calculate height based on number of items (max 10 shown)
        const itemsToShow = Math.min(queue.length, 10);
        targetHeight = BASE_HEIGHT + QUEUE_HEADER_HEIGHT + (itemsToShow * QUEUE_ITEM_HEIGHT) + QUEUE_PADDING + PROGRESS_BAR_HEIGHT;
      } else {
        // Show empty queue message
        targetHeight = BASE_HEIGHT + EMPTY_QUEUE_HEIGHT + PROGRESS_BAR_HEIGHT;
      }
    }

    // Send resize command to main process
    window.ipc.send("mini-player-resize", targetHeight);
  }, [showQueue, queue.length]);

  const handlePlayPause = () => {
    window.ipc.send("mini-player-play-pause", null);
  };

  const handleNext = () => {
    window.ipc.send("mini-player-next", null);
  };

  const handlePrevious = () => {
    window.ipc.send("mini-player-previous", null);
  };

  const handleClose = () => {
    console.log("Close button clicked!");
    window.ipc.send("mini-player-close", null);
  };

  const handleSongClick = (queueIndex: number) => {
    // Send the queue index directly (already relative to the sliced queue)
    window.ipc.send("mini-player-play-song", queueIndex);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentSong?.duration || !progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const seekTime = percentage * currentSong.duration;

    window.ipc.send("mini-player-seek", seekTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = currentSong?.duration
    ? (currentTime / currentSong.duration) * 100
    : 0;

  return (
    <div
      className="relative h-screen w-screen select-none overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(15, 15, 25, 0.98) 0%, rgba(25, 15, 35, 0.98) 100%)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        borderRadius: "16px",
        overflow: "hidden",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Close button - semi-transparent by default, full opacity on hover */}
      <button
        onClick={handleClose}
        className="absolute right-3 top-3 z-50 rounded-full bg-white/5 p-1.5 text-white/40 opacity-60 transition-all duration-300 hover:bg-red-500/20 hover:text-red-400 hover:opacity-100 cursor-pointer"
        aria-label="Close mini-player"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <IconX size={14} stroke={2.5} />
      </button>

      {/* Drag handle indicator - centered at top */}
      <div
        className="absolute left-0 right-0 top-1 z-10 flex justify-center pointer-events-none"
      >
        <div className="text-white/20">
          <IconGripVertical size={16} stroke={2} />
        </div>
      </div>

      {/* Main player area - fixed height */}
      <div className="flex flex-col">
        {/* Main player controls area */}
        <div className="flex h-[110px] items-center gap-3 px-4">
          {/* Album Art */}
          <div
            className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {currentSong?.album?.cover ? (
              <Image
                src={`wora://${currentSong.album.cover}`}
                alt={currentSong.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/80 via-pink-500/80 to-purple-600/80">
                <span className="text-3xl text-white/90">♪</span>
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-semibold text-white">
              {currentSong?.name || "No track playing"}
            </div>
            <div className="truncate text-xs text-white/70">
              {currentSong?.artist || "Unknown Artist"}
            </div>
            <div className="mt-1 text-xs font-medium text-white/50">
              {formatTime(currentTime)} / {currentSong ? formatTime(currentSong.duration) : "0:00"}
            </div>
          </div>

          {/* Controls */}
          <div
            className="flex items-center gap-1.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              onClick={handlePrevious}
              className="rounded-full p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!currentSong}
              aria-label="Previous track"
            >
              <IconPlayerTrackPrevFilled size={18} />
            </button>

            <button
              onClick={handlePlayPause}
              className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2.5 text-white shadow-lg transition-all hover:shadow-purple-500/50 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!currentSong}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <IconPlayerPauseFilled size={20} />
              ) : (
                <IconPlayerPlayFilled size={20} />
              )}
            </button>

            <button
              onClick={handleNext}
              className="rounded-full p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!currentSong}
              aria-label="Next track"
            >
              <IconPlayerTrackNextFilled size={18} />
            </button>

            {/* Queue toggle button with badge */}
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`relative rounded-full p-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                showQueue ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
              disabled={!currentSong}
              aria-label="Toggle queue"
            >
              {showQueue ? <IconChevronDown size={18} /> : <IconList size={18} />}
              {queue.length > 0 && (
                <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-purple-500 rounded-full text-[9px] font-bold text-white">
                  {queue.length > 99 ? "99+" : queue.length}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Queue display - shown when expanded */}
        {showQueue && (
          <div
            className="max-h-[380px] overflow-y-auto bg-black/40 backdrop-blur-md"
            style={{ WebkitAppRegion: "no-drag", borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px" } as React.CSSProperties}
          >
            <div className="p-3">
              <div className="mb-2 text-xs font-semibold text-white/70 px-2 flex items-center justify-between">
                <span>Up Next</span>
                {queue.length > 0 && (
                  <span className="text-white/50 font-normal">
                    {queue.length} song{queue.length !== 1 ? 's' : ''}
                    {queue.length > 10 && ' (showing 10)'}
                  </span>
                )}
              </div>

              {queue.length > 0 ? (
                queue.slice(0, 10).map((song, index) => (
                  <div
                    key={`${song.id}-${index}`}
                    className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer transition-all duration-150 ${
                      hoveredQueueIndex === index
                        ? 'bg-white/10 scale-[0.98] shadow-lg'
                        : 'hover:bg-white/5'
                    }`}
                    onClick={() => handleSongClick(index)}
                    onMouseEnter={() => setHoveredQueueIndex(index)}
                    onMouseLeave={() => setHoveredQueueIndex(null)}
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
                      {song.album?.cover ? (
                        <Image
                          src={`wora://${song.album.cover}`}
                          alt={song.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/60 to-pink-500/60">
                          <span className="text-xs text-white/90">♪</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-xs font-medium text-white">{song.name}</div>
                      <div className="truncate text-xs text-white/60">{song.artist}</div>
                    </div>
                    <div className="text-[10px] text-white/50 font-medium">
                      {formatTime(song.duration)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="text-white/30 mb-2">
                    <IconList size={32} stroke={1.5} />
                  </div>
                  <div className="text-xs text-white/50">Queue is empty</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Progress bar */}
      <div
        ref={progressBarRef}
        className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 cursor-pointer hover:h-1.5 transition-all group"
        onClick={handleProgressBarClick}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div
          className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-600 transition-all duration-100 shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50"
          style={{ width: `${progress}%` }}
        />
        {/* Hover indicator */}
        <div className="absolute top-0 right-0 left-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-0.5 bg-white/10" />
        </div>
      </div>
    </div>
  );
}
