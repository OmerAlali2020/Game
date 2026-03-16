"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "idle" | "running" | "win" | "gameover";
type ObjectKind = "good" | "bad";

interface FallingObject {
  id: number;
  x: number;
  y: number;
  size: number;
  kind: ObjectKind;
  speed: number;
  glyph: string;
}

const PLAYER_SIZE = 80;
const PLAYER_BOTTOM_OFFSET = 12;
const OBJECT_SIZE = 42;
const PLAYER_SPEED = 320; // px / second
const BASE_FALL_SPEED = 135; // px / second (gentle for kids)
const SPAWN_INTERVAL_MS = 850;
const WIN_SCORE = 5;

const BRIGHT_BG_COLORS = [
  "#FDE047", // yellow
  "#86EFAC", // green
  "#93C5FD", // blue
  "#F9A8D4", // pink
  "#FDBA74", // orange
  "#C4B5FD", // purple
  "#67E8F9", // cyan
  "#FCA5A5", // red
];

function randomFrom<T,>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function DodgeTheFallingObjects() {
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const spawnAccumulatorRef = useRef<number>(0);
  const nextObjectIdRef = useRef<number>(1);

  // Refs used by the loop so we can read/write without stale closures.
  const playerXRef = useRef<number>(0);
  const targetXRef = useRef<number>(0);
  const moveDirRef = useRef<-1 | 0 | 1>(0);
  const scoreRef = useRef<number>(0);
  const statusRef = useRef<GameStatus>("idle");

  const [gameSize, setGameSize] = useState({ width: 360, height: 640 });
  const [playerX, setPlayerX] = useState(0);
  const [objects, setObjects] = useState<FallingObject[]>([]);
  const [score, setScore] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState("#A7F3D0");
  const [status, setStatus] = useState<GameStatus>("idle");

  const maxPlayerX = useMemo(
    () => Math.max(0, gameSize.width - PLAYER_SIZE),
    [gameSize.width],
  );

  const syncStatus = useCallback((next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const syncScore = useCallback((next: number) => {
    scoreRef.current = next;
    setScore(next);
  }, []);

  const resetGame = useCallback(() => {
    const centerX = Math.max(0, (gameSize.width - PLAYER_SIZE) / 2);
    playerXRef.current = centerX;
    targetXRef.current = centerX;
    moveDirRef.current = 0;
    spawnAccumulatorRef.current = 0;
    nextObjectIdRef.current = 1;
    syncScore(0);
    setObjects([]);
    setBackgroundColor("#A7F3D0");
    setPlayerX(centerX);
    syncStatus("idle");
  }, [gameSize.width, syncScore, syncStatus]);

  const startGame = useCallback(() => {
    // Re-center each run so it feels fair after rotations/resizing.
    const centerX = Math.max(0, (gameSize.width - PLAYER_SIZE) / 2);
    playerXRef.current = centerX;
    targetXRef.current = centerX;
    moveDirRef.current = 0;
    spawnAccumulatorRef.current = 0;
    nextObjectIdRef.current = 1;
    syncScore(0);
    setObjects([]);
    setPlayerX(centerX);
    setBackgroundColor("#A7F3D0");
    syncStatus("running");
  }, [gameSize.width, syncScore, syncStatus]);

  // Keep refs in sync with React state values.
  useEffect(() => {
    playerXRef.current = playerX;
  }, [playerX]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Measure game container and respond to resizing.
  useEffect(() => {
    const element = gameAreaRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setGameSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Clamp player after any size changes.
  useEffect(() => {
    setPlayerX((prev) => {
      const clamped = Math.min(maxPlayerX, Math.max(0, prev));
      playerXRef.current = clamped;
      targetXRef.current = Math.min(maxPlayerX, Math.max(0, targetXRef.current));
      return clamped;
    });
  }, [maxPlayerX]);

  // Keyboard support (left/right arrows).
  useEffect(() => {
    const down = new Set<string>();

    const updateDirection = () => {
      const left = down.has("ArrowLeft");
      const right = down.has("ArrowRight");

      if (left && !right) moveDirRef.current = -1;
      else if (right && !left) moveDirRef.current = 1;
      else moveDirRef.current = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      down.add(event.key);
      updateDirection();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      down.delete(event.key);
      updateDirection();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const runGameLoop = useCallback(
    (time: number) => {
      if (statusRef.current !== "running") return;

      const last = lastFrameTimeRef.current || time;
      const deltaSeconds = Math.min((time - last) / 1000, 0.05); // prevents giant jumps
      lastFrameTimeRef.current = time;

      // 1) Update player movement from keyboard.
      let nextPlayerX = playerXRef.current;
      if (moveDirRef.current !== 0) {
        nextPlayerX += moveDirRef.current * PLAYER_SPEED * deltaSeconds;
        nextPlayerX = Math.min(maxPlayerX, Math.max(0, nextPlayerX));
        targetXRef.current = nextPlayerX;
      }

      // 2) Smoothly glide toward target for touch/mouse controls.
      const toTarget = targetXRef.current - nextPlayerX;
      const easingStep = Math.sign(toTarget) * Math.min(Math.abs(toTarget), PLAYER_SPEED * deltaSeconds);
      nextPlayerX += easingStep;
      nextPlayerX = Math.min(maxPlayerX, Math.max(0, nextPlayerX));
      playerXRef.current = nextPlayerX;
      setPlayerX(nextPlayerX);

      // 3) Spawn new falling objects over time.
      spawnAccumulatorRef.current += deltaSeconds * 1000;
      const newObjects: FallingObject[] = [];

      while (spawnAccumulatorRef.current >= SPAWN_INTERVAL_MS) {
        spawnAccumulatorRef.current -= SPAWN_INTERVAL_MS;
        const kind: ObjectKind = Math.random() < 0.65 ? "good" : "bad";
        newObjects.push({
          id: nextObjectIdRef.current++,
          x: Math.random() * Math.max(1, gameSize.width - OBJECT_SIZE),
          y: -OBJECT_SIZE,
          size: OBJECT_SIZE,
          kind,
          speed: BASE_FALL_SPEED + Math.random() * 35,
          glyph: kind === "good" ? "⭐" : Math.random() < 0.5 ? "🌧️" : "💩",
        });
      }

      // 4) Move objects + collision checks.
      setObjects((prev) => {
        const playerBox = {
          left: nextPlayerX,
          right: nextPlayerX + PLAYER_SIZE,
          top: gameSize.height - PLAYER_BOTTOM_OFFSET - PLAYER_SIZE,
          bottom: gameSize.height - PLAYER_BOTTOM_OFFSET,
        };

        let scored = 0;
        let hitBad = false;

        const moved = [...prev, ...newObjects]
          .map((obj) => ({ ...obj, y: obj.y + obj.speed * deltaSeconds }))
          .filter((obj) => obj.y < gameSize.height + obj.size)
          .filter((obj) => {
            const objectBox = {
              left: obj.x,
              right: obj.x + obj.size,
              top: obj.y,
              bottom: obj.y + obj.size,
            };

            const collides =
              playerBox.left < objectBox.right &&
              playerBox.right > objectBox.left &&
              playerBox.top < objectBox.bottom &&
              playerBox.bottom > objectBox.top;

            if (!collides) return true;

            if (obj.kind === "good") {
              scored += 1;
              return false;
            }

            hitBad = true;
            return false;
          });

        if (hitBad) {
          syncStatus("gameover");
        } else if (scored > 0) {
          const nextScore = scoreRef.current + scored;
          syncScore(nextScore);
          setBackgroundColor(randomFrom(BRIGHT_BG_COLORS));
          if (nextScore >= WIN_SCORE) {
            syncStatus("win");
          }
        }

        return moved;
      });

      animationFrameRef.current = requestAnimationFrame(runGameLoop);
    },
    [gameSize.height, gameSize.width, maxPlayerX, syncScore, syncStatus],
  );

  // Start/stop animation loop depending on status.
  useEffect(() => {
    if (status !== "running") {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      return;
    }

    lastFrameTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(runGameLoop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [runGameLoop, status]);

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (statusRef.current !== "running") return;
      const rect = gameAreaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const localX = clientX - rect.left;
      const center = rect.width / 2;
      const step = Math.max(36, rect.width * 0.16);
      const direction = localX < center ? -1 : 1;

      moveDirRef.current = 0; // pointer controls target gliding
      targetXRef.current = Math.min(
        maxPlayerX,
        Math.max(0, playerXRef.current + direction * step),
      );
    },
    [maxPlayerX],
  );

  return (
    <section className="mx-auto w-full max-w-md px-3 py-4">
      <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg">
        <h2 className="text-lg font-extrabold tracking-wide">Dodge the Falling Objects</h2>
        <div className="text-2xl font-black">⭐ {score}</div>
      </div>

      <div
        ref={gameAreaRef}
        className="relative h-[72vh] min-h-[460px] overflow-hidden rounded-2xl border-4 border-white/70 shadow-2xl"
        style={{ backgroundColor }}
        onMouseDown={(event) => handlePointerMove(event.clientX)}
        onTouchStart={(event) => {
          handlePointerMove(event.touches[0]?.clientX ?? 0);
        }}
      >
        {/* Player */}
        <img
          src="/player.png"
          alt="Player"
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
            left: playerX,
            bottom: PLAYER_BOTTOM_OFFSET,
          }}
        />

        {/* Falling objects */}
        {objects.map((obj) => (
          <div
            key={obj.id}
            className="pointer-events-none absolute select-none text-3xl"
            style={{ left: obj.x, top: obj.y, width: obj.size, height: obj.size }}
            aria-label={obj.kind === "good" ? "Star" : "Bad object"}
          >
            {obj.glyph}
          </div>
        ))}

        {/* Idle/start overlay */}
        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 p-6 text-center text-white">
            <p className="mb-5 text-xl font-extrabold">Ready to play?</p>
            <button
              type="button"
              onClick={startGame}
              className="rounded-full bg-pink-500 px-8 py-4 text-2xl font-black shadow-lg transition hover:scale-105 active:scale-95"
            >
              Start Game
            </button>
            <p className="mt-5 text-sm font-semibold">Use ⬅️ ➡️ or tap left/right side!</p>
          </div>
        )}

        {/* Lose overlay */}
        {status === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-6 text-center text-white">
            <p className="text-5xl">💖</p>
            <p className="mt-3 text-3xl font-black">Oops! Try Again!</p>
            <button
              type="button"
              onClick={startGame}
              className="mt-6 rounded-full bg-amber-400 px-7 py-3 text-xl font-black text-slate-900 shadow-lg transition hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}

        {/* Win overlay */}
        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-900/80 p-6 text-center text-white">
            <p className="text-5xl">🎆 🎉 🎆</p>
            <p className="mt-3 text-5xl font-black">You Win!</p>
            <p className="mt-2 text-lg font-semibold">Amazing job, superstar! ⭐</p>
            <button
              type="button"
              onClick={startGame}
              className="mt-7 rounded-full bg-lime-400 px-8 py-3 text-2xl font-black text-slate-900 shadow-lg transition hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Safety net reset for external consumers / hot reload. */}
      <button
        type="button"
        onClick={resetGame}
        className="mt-3 w-full rounded-lg bg-white/70 py-2 text-sm font-bold text-slate-700"
      >
        Reset to Start Screen
      </button>
    </section>
  );
}
