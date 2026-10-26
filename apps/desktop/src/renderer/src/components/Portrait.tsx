import { getPalette } from "@iwakura/content";
import type { CharacterAppearance } from "@iwakura/contracts";
import { hashString } from "@iwakura/engine";

function Sigil({ id, color }: { id: string; color: string }) {
  const common = { stroke: color, fill: "none", strokeWidth: 4, strokeLinecap: "round" as const };
  switch (id) {
    case "flame":
      return (
        <path
          d="M100 34 C116 58 128 68 128 86 C128 104 116 116 100 116 C84 116 72 104 72 86 C72 72 80 64 88 56 C88 72 94 78 100 78 C106 78 110 70 100 34 Z"
          fill={color}
          opacity="0.9"
        />
      );
    case "leaf":
      return <path d="M74 108 C74 66 96 42 128 40 C128 78 112 108 74 108 Z" fill={color} opacity="0.9" />;
    case "eye":
      return (
        <g>
          <path d="M58 84 Q100 46 142 84 Q100 122 58 84 Z" {...common} />
          <circle cx="100" cy="84" r="12" fill={color} />
        </g>
      );
    case "sword":
      return (
        <g {...common}>
          <path d="M100 32 V124" />
          <path d="M80 56 H120" />
          <path d="M88 124 H112 L100 142 Z" fill={color} stroke="none" />
        </g>
      );
    case "moon":
      return (
        <path
          d="M116 38 C90 44 74 64 74 88 C74 112 92 130 116 134 C98 122 90 108 90 88 C90 68 100 50 116 38 Z"
          fill={color}
          opacity="0.9"
        />
      );
    default:
      return <path d="M100 38 L138 60 V104 L100 126 L62 104 V60 Z" {...common} />;
  }
}

export function Portrait({
  appearance,
  className,
  ancestryId,
  heritageId,
}: {
  appearance: CharacterAppearance;
  className?: string;
  ancestryId?: string;
  heritageId?: string;
}) {
  const palette = getPalette(appearance.palette);
  const hash = hashString(`${appearance.seed}:${appearance.palette}:${appearance.sigil}`);
  const hood = hash % 3;
  const face = Math.floor(hash / 3) % 3;
  const hair = Math.floor(hash / 9) % 3;
  const id = `portrait-${hash.toString(16)}`;
  const ancestry = (ancestryId ?? "").toLowerCase();
  const heritage = (heritageId ?? "").toLowerCase();
  const isElf = ancestry.includes("elf");
  const isDwarf = ancestry.includes("dwarf");
  const isOrc = ancestry.includes("orc");
  const isBeastkin = ancestry.includes("beastkin");
  const isHalfling = ancestry.includes("halfling");

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Character portrait">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.28" />
          <stop offset="60%" stopColor={palette.ink} stopOpacity="0.96" />
          <stop offset="100%" stopColor="#080706" />
        </radialGradient>
        <linearGradient id={`${id}-cloak`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.cloak} />
          <stop offset="100%" stopColor={palette.ink} />
        </linearGradient>
      </defs>

      <rect width="200" height="200" rx="8" fill={`url(#${id}-bg)`} />
      <circle
        cx="100"
        cy="94"
        r="66"
        fill="none"
        stroke={palette.trim}
        strokeOpacity="0.12"
        strokeWidth="1"
      />
      <circle
        cx="100"
        cy="94"
        r="78"
        fill="none"
        stroke={palette.trim}
        strokeOpacity="0.06"
        strokeWidth="1"
      />

      {/* shoulders and cloak */}
      <path
        d={
          hood === 0
            ? "M24 200 C30 156 58 136 100 136 C142 136 170 156 176 200 Z"
            : hood === 1
              ? "M16 200 C28 154 60 132 100 132 C140 132 172 154 184 200 Z"
              : "M32 200 C38 162 64 140 100 140 C136 140 162 162 168 200 Z"
        }
        fill={`url(#${id}-cloak)`}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="M56 200 C60 172 76 158 100 158 C124 158 140 172 144 200"
        fill="none"
        stroke={palette.trim}
        strokeOpacity="0.5"
        strokeWidth="2"
      />

      {/* ancestry features behind the hood */}
      {isElf ? (
        <g fill={palette.skin} stroke={palette.ink} strokeWidth="1.5">
          <path d="M62 92 C42 78 36 86 40 104 C46 112 56 110 64 102 Z" />
          <path d="M138 92 C158 78 164 86 160 104 C154 112 144 110 136 102 Z" />
        </g>
      ) : isBeastkin ? (
        <g fill={palette.cloak} stroke={palette.ink} strokeWidth="2">
          <path d="M66 74 C54 46 62 36 76 52 L84 70 Z" />
          <path d="M134 74 C146 46 138 36 124 52 L116 70 Z" />
          <path
            d="M68 70 C62 52 66 46 74 56 L80 68 Z"
            fill={heritage.includes("fox") ? palette.trim : palette.cloak}
            opacity="0.7"
          />
          <path
            d="M132 70 C138 52 134 46 126 56 L120 68 Z"
            fill={heritage.includes("fox") ? palette.trim : palette.cloak}
            opacity="0.7"
          />
        </g>
      ) : isHalfling ? (
        <g fill={palette.skin} stroke={palette.ink} strokeWidth="1.2">
          <ellipse cx="64" cy="96" rx="8" ry="12" />
          <ellipse cx="136" cy="96" rx="8" ry="12" />
        </g>
      ) : (
        <g fill={palette.skin} stroke={palette.ink} strokeWidth="1">
          <ellipse cx="66" cy="94" rx="5" ry="9" />
          <ellipse cx="134" cy="94" rx="5" ry="9" />
        </g>
      )}

      {/* hood */}
      <path
        d={
          hood === 0
            ? "M58 96 C58 54 78 34 100 34 C122 34 142 54 142 96 C142 116 126 128 100 128 C74 128 58 116 58 96 Z"
            : hood === 1
              ? "M52 100 C52 50 76 28 100 28 C124 28 148 50 148 100 C148 122 128 134 100 134 C72 134 52 122 52 100 Z"
              : "M64 92 C64 58 80 40 100 40 C120 40 136 58 136 92 C136 112 120 124 100 124 C80 124 64 112 64 92 Z"
        }
        fill={palette.cloak}
        stroke={palette.ink}
        strokeWidth="3"
      />
      <path
        d={
          hood === 0
            ? "M66 94 C66 62 82 46 100 46 C118 46 134 62 134 94 C134 110 120 120 100 120 C80 120 66 110 66 94 Z"
            : hood === 1
              ? "M62 96 C62 60 80 42 100 42 C120 42 138 60 138 96 C138 114 122 126 100 126 C78 126 62 114 62 96 Z"
              : "M70 92 C70 64 84 50 100 50 C116 50 130 64 130 92 C130 108 116 118 100 118 C84 118 70 108 70 92 Z"
        }
        fill={palette.skin}
        opacity="0.95"
      />

      {/* hair */}
      {hair === 0 ? (
        <path
          d="M68 88 C64 58 82 46 100 46 C118 46 136 58 132 88 C126 68 114 62 100 62 C86 62 74 68 68 88 Z"
          fill={palette.ink}
          opacity="0.92"
        />
      ) : hair === 1 ? (
        <g fill={palette.ink} opacity="0.92">
          <path d="M66 90 C62 56 84 44 100 44 C116 44 138 56 134 90 C128 68 114 60 100 60 C86 60 72 68 66 90 Z" />
          <path d="M62 88 C56 118 62 142 72 148 C70 124 74 104 80 92 Z" />
          <path d="M138 88 C144 118 138 142 128 148 C130 124 126 104 120 92 Z" />
        </g>
      ) : (
        <path
          d="M68 90 C62 58 84 44 100 44 C116 44 138 58 132 90 C128 70 128 58 100 58 C72 58 72 70 68 90 Z"
          fill={palette.ink}
          opacity="0.92"
        />
      )}

      {/* eyes and mouth */}
      <g fill={palette.ink}>
        <ellipse cx={face === 0 ? 88 : 90} cy="86" rx="3.2" ry="2.4" />
        <ellipse cx={face === 0 ? 112 : 110} cy="86" rx="3.2" ry="2.4" />
      </g>
      <path
        d={face === 2 ? "M94 102 Q100 106 106 102" : "M95 103 Q100 105 105 103"}
        fill="none"
        stroke={palette.ink}
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {isOrc ? (
        <g fill={palette.trim} stroke={palette.ink} strokeWidth="1.2">
          <path d="M91 106 L94 118 L97 107 Z" />
          <path d="M103 107 L106 118 L109 106 Z" />
        </g>
      ) : null}
      {isDwarf && hash % 2 === 0 ? (
        <path
          d="M78 110 C84 136 94 142 100 142 C106 142 116 136 122 110 C112 120 88 120 78 110 Z"
          fill={palette.ink}
          opacity="0.72"
        />
      ) : null}
      {isBeastkin ? (
        <g fill={palette.trim} opacity="0.8">
          <path d="M74 108 L82 112 L74 116 Z" />
          <path d="M126 108 L118 112 L126 116 Z" />
        </g>
      ) : null}

      {/* cloak clasp / sigil */}
      <circle cx="100" cy="148" r="19" fill={palette.ink} stroke={palette.trim} strokeWidth="2" />
      <g transform="translate(100 148) scale(0.22) translate(-100 -84)">
        <Sigil id={appearance.sigil} color={palette.glow} />
      </g>

      <rect width="200" height="200" rx="8" fill="none" stroke={palette.trim} strokeOpacity="0.25" />
    </svg>
  );
}
