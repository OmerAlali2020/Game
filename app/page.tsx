"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "idle" | "running" | "win" | "gameover";
type ObjectKind = "good" | "bad";

type FallingObject = {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  kind: ObjectKind;
  glyph: string;
};

const PLAYER_SIZE = 80;
const PLAYER_BOTTOM = 14;
const OBJECT_SIZE = 42;
const PLAYER_SPEED = 320;
const FALL_SPEED = 130;
const SPAWN_EVERY_MS = 900;
const WIN_SCORE = 5;

const BG_COLORS = [
  "#FDE68A",
  "#A7F3D0",
  "#BFDBFE",
  "#F9A8D4",
  "#FCD34D",
  "#C4B5FD",
  "#FDBA74",
  "#99F6E4",
];

const randomColor = () => BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];

export default function Page() {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const nextIdRef = useRef<number>(1);

  const playerXRef = useRef<number>(0);
  const targetXRef = useRef<number>(0);
  const keyDirectionRef = useRef<-1 | 0 | 1>(0);
  const statusRef = useRef<GameStatus>("idle");
  const scoreRef = useRef<number>(0);

  const [size, setSize] = useState({ width: 390, height: 680 });
  const [playerX, setPlayerX] = useState(0);
  const [objects, setObjects] = useState<FallingObject[]>([]);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [bgColor, setBgColor] = useState("#A7F3D0");
  const [playerImageMissing, setPlayerImageMissing] = useState(false);

  const maxX = useMemo(() => Math.max(0, size.width - PLAYER_SIZE), [size.width]);

  const setGameStatus = useCallback((next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const setGameScore = useCallback((next: number) => {
    scoreRef.current = next;
    setScore(next);
  }, []);

  const startGame = useCallback(() => {
    const center = Math.max(0, (size.width - PLAYER_SIZE) / 2);
    playerXRef.current = center;
    targetXRef.current = center;
    keyDirectionRef.current = 0;
    spawnTimerRef.current = 0;
    nextIdRef.current = 1;
    setObjects([]);
    setPlayerX(center);
    setGameScore(0);
    setBgColor("#A7F3D0");
    setPlayerImageMissing(false);
    setGameStatus("running");
  }, [setGameScore, setGameStatus, size.width]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    setPlayerX((prev) => {
      const clamped = Math.max(0, Math.min(maxX, prev));
      playerXRef.current = clamped;
      targetXRef.current = Math.max(0, Math.min(maxX, targetXRef.current));
      return clamped;
    });
  }, [maxX]);

  useEffect(() => {
    const pressed = new Set<string>();

    const updateDirection = () => {
      const left = pressed.has("ArrowLeft");
      const right = pressed.has("ArrowRight");
      if (left && !right) keyDirectionRef.current = -1;
      else if (right && !left) keyDirectionRef.current = 1;
      else keyDirectionRef.current = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      pressed.add(event.key);
      updateDirection();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      pressed.delete(event.key);
      updateDirection();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const loop = useCallback(
    (now: number) => {
      if (statusRef.current !== "running") return;

      const previous = lastTimeRef.current || now;
      const dt = Math.min((now - previous) / 1000, 0.05);
      lastTimeRef.current = now;

      let nextPlayerX = playerXRef.current;

      if (keyDirectionRef.current !== 0) {
        nextPlayerX += keyDirectionRef.current * PLAYER_SPEED * dt;
        nextPlayerX = Math.max(0, Math.min(maxX, nextPlayerX));
        targetXRef.current = nextPlayerX;
      }

      const toTarget = targetXRef.current - nextPlayerX;
      if (Math.abs(toTarget) > 0) {
        const step = Math.sign(toTarget) * Math.min(Math.abs(toTarget), PLAYER_SPEED * dt);
        nextPlayerX = Math.max(0, Math.min(maxX, nextPlayerX + step));
      }

      playerXRef.current = nextPlayerX;
      setPlayerX(nextPlayerX);

      spawnTimerRef.current += dt * 1000;
      const spawned: FallingObject[] = [];
      while (spawnTimerRef.current >= SPAWN_EVERY_MS) {
        spawnTimerRef.current -= SPAWN_EVERY_MS;
        const kind: ObjectKind = Math.random() < 0.72 ? "good" : "bad";
        spawned.push({
          id: nextIdRef.current++,
          x: Math.random() * Math.max(1, size.width - OBJECT_SIZE),
          y: -OBJECT_SIZE,
          size: OBJECT_SIZE,
          speed: FALL_SPEED + Math.random() * 35,
          kind,
          glyph: kind === "good" ? "⭐" : "💩",
        });
      }

      setObjects((prev) => {
        let gained = 0;
        let crashed = false;

        const playerBox = {
          left: nextPlayerX,
          right: nextPlayerX + PLAYER_SIZE,
          top: size.height - PLAYER_BOTTOM - PLAYER_SIZE,
          bottom: size.height - PLAYER_BOTTOM,
        };

        const alive = [...prev, ...spawned]
          .map((obj) => ({ ...obj, y: obj.y + obj.speed * dt }))
          .filter((obj) => obj.y < size.height + obj.size)
          .filter((obj) => {
            const hit =
              playerBox.left < obj.x + obj.size &&
              playerBox.right > obj.x &&
              playerBox.top < obj.y + obj.size &&
              playerBox.bottom > obj.y;

            if (!hit) return true;
            if (obj.kind === "good") {
              gained += 1;
              return false;
            }
            crashed = true;
            return false;
          });

        if (crashed) {
          setGameStatus("gameover");
        } else if (gained > 0) {
          const next = scoreRef.current + gained;
          setGameScore(next);
          setBgColor(randomColor());
          if (next >= WIN_SCORE) setGameStatus("win");
        }

        return alive;
      });

      rafRef.current = requestAnimationFrame(loop);
    },
    [maxX, setGameScore, setGameStatus, size.height, size.width],
  );

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== "running") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [loop, status]);

  const handleTap = useCallback(
    (clientX: number) => {
      if (statusRef.current !== "running") return;
      const rect = areaRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeX = clientX - rect.left;
      const goLeft = relativeX < rect.width / 2;
      const step = Math.max(36, rect.width * 0.2);

      keyDirectionRef.current = 0;
      targetXRef.current = Math.max(
        0,
        Math.min(maxX, playerXRef.current + (goLeft ? -step : step)),
      );
    },
    [maxX],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-3 py-4">
      <header className="mb-3 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white shadow-lg">
        <h1 className="text-lg font-extrabold">Dodge the Falling Objects</h1>
        <p className="text-3xl font-black">⭐ {score}</p>
      </header>

      <div
        ref={areaRef}
        className="relative h-[74vh] min-h-[480px] overflow-hidden rounded-2xl border-4 border-white/70 shadow-2xl"
        style={{ backgroundColor: bgColor }}
        onMouseDown={(event) => handleTap(event.clientX)}
        onTouchStart={(event) => handleTap(event.touches[0]?.clientX ?? 0)}
      >
        {!playerImageMissing ? (
          <img
            src="/player.png"
            alt="Player"
            draggable={false}
            onError={() => setPlayerImageMissing(true)}
            className="pointer-events-none absolute select-none"
            style={{
              left: playerX,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
              bottom: PLAYER_BOTTOM,
            }}
          />
        ) : (
          <div
            aria-label="Player fallback"
            className="pointer-events-none absolute flex select-none items-center justify-center text-5xl"
            style={{
              left: playerX,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
              bottom: PLAYER_BOTTOM,
            }}
          >
            🧒
          </div>
        )}

        {objects.map((obj) => (
          <div
            key={obj.id}
            className="pointer-events-none absolute text-3xl"
            style={{ left: obj.x, top: obj.y, width: obj.size, height: obj.size }}
          >
            {obj.glyph}
          </div>
        ))}

        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 p-6 text-center text-white">
            <p className="mb-4 text-2xl font-black">Ready?</p>
            <button
              type="button"
              onClick={startGame}
              className="rounded-full bg-pink-500 px-8 py-4 text-2xl font-black shadow-lg"
            >
              Start Game
            </button>
            <p className="mt-4 text-sm font-semibold">Use ⬅️ ➡️ or tap left/right side</p>
          </div>
        )}

        {status === "gameover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 p-6 text-center text-white">
            <p className="text-5xl">🫶</p>
            <p className="mt-3 text-3xl font-black">Try Again!</p>
            <button
              type="button"
              onClick={startGame}
              className="mt-6 rounded-full bg-amber-300 px-7 py-3 text-xl font-black text-slate-900"
            >
              Play Again
            </button>
          </div>
        )}

        {status === "win" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-900/80 p-6 text-center text-white">
            <p className="text-6xl">🎆🎆🎆</p>
            <p className="mt-2 text-5xl font-black">You Win!</p>
            <button
              type="button"
              onClick={startGame}
              className="mt-6 rounded-full bg-lime-400 px-8 py-3 text-2xl font-black text-slate-900"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
