import React, { useEffect, useState } from "react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconX,
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
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Listen for playback updates from main window
    const updateListener = window.ipc.on(
      "mini-player-update",
      (data: { song: Song; isPlaying: boolean; currentTime: number }) => {
        setCurrentSong(data.song);
        setIsPlaying(data.isPlaying);
        setCurrentTime(data.currentTime);
      }
    );

    // Request initial state
    window.ipc.send("mini-player-request-state", null);

    return () => {
      window.ipc.off("mini-player-update", updateListener);
    };
  }, []);

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
    window.ipc.send("mini-player-close", null);
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
      className="relative h-screen w-screen select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Close button - only visible on hover */}
      <button
        onClick={handleClose}
        className={`absolute right-2 top-2 z-10 rounded-full p-1 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <IconX size={16} stroke={2} />
      </button>

      <div className="flex h-full items-center gap-3 px-4">
        {/* Album Art */}
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg shadow-lg">
          {currentSong?.album?.cover ? (
            <Image
              src={`wora://${currentSong.album.cover}`}
              alt={currentSong.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
              <span className="text-2xl text-white/90">♪</span>
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 overflow-hidden">
          <div className="truncate text-sm font-medium text-white">
            {currentSong?.name || "No track playing"}
          </div>
          <div className="truncate text-xs text-white/60">
            {currentSong?.artist || "Unknown Artist"}
          </div>
          <div className="mt-1 text-xs text-white/40">
            {formatTime(currentTime)} /{" "}
            {currentSong ? formatTime(currentSong.duration) : "0:00"}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevious}
            className="rounded-full p-2 text-white/70 transition-all hover:bg-white/10 hover:text-white"
            disabled={!currentSong}
          >
            <IconPlayerTrackPrevFilled size={18} />
          </button>

          <button
            onClick={handlePlayPause}
            className="rounded-full bg-white/10 p-2 text-white transition-all hover:bg-white/20"
            disabled={!currentSong}
          >
            {isPlaying ? (
              <IconPlayerPauseFilled size={20} />
            ) : (
              <IconPlayerPlayFilled size={20} />
            )}
          </button>

          <button
            onClick={handleNext}
            className="rounded-full p-2 text-white/70 transition-all hover:bg-white/10 hover:text-white"
            disabled={!currentSong}
          >
            <IconPlayerTrackNextFilled size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
