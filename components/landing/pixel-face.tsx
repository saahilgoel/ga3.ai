/* Original monochrome pixel-art busts for the named agents.
   Hand-authored bitmaps — '#' = ink (hair/features), 'o' = face, '.' = empty.
   Rendered as crisp-edged SVG so it stays sharp at any size. */

export const FACES: Record<string, string[]> = {
  // long hair
  maya: [
    "................",
    ".....######.....",
    "...##########...",
    "..############..",
    "..###oooooo###..",
    "..##oooooooo##..",
    "..##oooooooo##..",
    "..##o##oo##o##..",
    "..##oooooooo##..",
    "..##oo####oo##..",
    "..##oooooooo##..",
    "..##oooooooo##..",
    "...#oooooooo#...",
    "....oooooooo....",
    "..oooooooooooo..",
    ".oooooooooooooo.",
  ],
  // beard
  arjun: [
    "................",
    ".....######.....",
    "...##########...",
    "..############..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..oo##oooo##oo..",
    "..oooooooooooo..",
    ".#oooooooooooo#.",
    ".#oo########oo#.",
    ".#oooooooooooo#.",
    ".##oooooooooo##.",
    "..############..",
    "...oooooooooo...",
    ".oooooooooooooo.",
  ],
  // bob + glasses
  priya: [
    "...##########...",
    "..############..",
    ".##############.",
    ".##oooooooooo##.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#oooooooooooo#.",
    ".#o########o#...",
    ".#oooooooooooo#.",
    ".#ooo####oooo#..",
    ".#oooooooooooo#.",
    "..oooooooooooo..",
    "...oooooooooo...",
    "....oooooooo....",
    "..oooooooooooo..",
    ".oooooooooooooo.",
  ],
  // headphones
  kabir: [
    "....########....",
    "..############..",
    ".##############.",
    "##.##oooooo##.##",
    "##.##oooooo##.##",
    "##.##oooooo##.##",
    "...##oooooo##...",
    "..##o##oo##o##..",
    "..##oooooooo##..",
    "..##oo####oo##..",
    "..##oooooooo##..",
    "...#oooooooo#...",
    "....oooooooo....",
    "..oooooooooooo..",
    ".oooooooooooooo.",
    "oooooooooooooooo",
  ],
  // cap / serious
  raavi: [
    "................",
    "..############..",
    "..############..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..o##oooo##ooo..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "..ooo####ooooo..",
    "..oooooooooooo..",
    "..oooooooooooo..",
    "...oooooooooo...",
    "....oooooooo....",
    "..oooooooooooo..",
    ".oooooooooooooo.",
    "oooooooooooooooo",
  ],
  // top-knot / sleek
  vera: [
    "......####......",
    "....########....",
    "..############..",
    ".##oooooooooo##.",
    ".#oooooooooooo#.",
    ".#o##oooo##oo#..",
    ".#oooooooooooo#.",
    ".#oo####oooo#...",
    ".#oooooooooooo#.",
    "..oooooooooooo..",
    "...oooooooooo...",
    "....oooooooo....",
    "..oooooooooooo..",
    ".oooooooooooooo.",
    "oooooooooooooooo",
    "oooooooooooooooo",
  ],
};

// Per-agent colour palettes — warm skin + the agent's signature colour for
// hair/features. Makes the busts colourful + friendlier while the rest of the
// UI stays monochrome. Keyed by agent id.
export const AGENT_PALETTE: Record<string, { skin: string; ink: string }> = {
  maya: { skin: "#f5cda3", ink: "#8b7bff" }, // violet
  arjun: { skin: "#eab98c", ink: "#9a652f" }, // brown beard
  priya: { skin: "#f3c9aa", ink: "#2f9e6e" }, // emerald
  kabir: { skin: "#ead0ad", ink: "#3f8fc4" }, // sky blue
  raavi: { skin: "#e6b39e", ink: "#d2545f" }, // rose
  vera: { skin: "#f1c79a", ink: "#c79334" }, // ochre/gold
};

export function PixelFace({
  rows,
  size = 34,
  className = "",
  colors,
}: {
  rows: string[];
  size?: number;
  className?: string;
  colors?: { skin?: string; ink?: string };
}) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const ink = colors?.ink ?? "#ededed";
  const skin = colors?.skin ?? "#5f5f5f";
  return (
    <svg
      width={size}
      height={Math.round((size * h) / w)}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) =>
          ch === "." ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={ch === "#" ? ink : skin}
            />
          )
        )
      )}
    </svg>
  );
}
