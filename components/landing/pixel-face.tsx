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

export function PixelFace({
  rows,
  size = 34,
  className = "",
}: {
  rows: string[];
  size?: number;
  className?: string;
}) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
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
              fill={ch === "#" ? "#ededed" : "#5f5f5f"}
            />
          )
        )
      )}
    </svg>
  );
}
