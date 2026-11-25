[![make.fun · news-image-20261125](https://make.fun/badge/news-image-20261125.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![rank](https://make.fun/badge/news-image-20261125/jamete21/news-image-20261125/rank.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![reward](https://make.fun/badge/news-image-20261125/jamete21/news-image-20261125/reward.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)

# The World Today — Wednesday 25 November 2026

A one-image newspaper front page summing up the world's news of
Wednesday 25 November 2026, drawn entirely by `main.ts`.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024 PNG, under 1 MiB).
The program is deterministic: two runs produce identical bytes.

## How it is drawn

`main.ts` (Node 22, standard library only, no network) contains everything
it needs: a hand-built stroke font, a small 2D rasteriser (rectangles,
circles, polygons, thick lines) and a PNG encoder written from scratch
(scanline filters, fixed-Huffman DEFLATE, CRC32 and Adler32).

## Layout

A classic broadsheet front page: masthead with the date, one big lead
story with a hand-drawn rocket illustration of the Shenzhou-24 launch,
six news cards across trade, the Middle East, China, Europe, Africa and
the markets, plus a markets ticker and a source line at the foot.

- **Lead — Space / China:** Shenzhou-24 launches from Jiuquan carrying
  Pakistani astronaut Muhammad Zeeshan Ali, the first foreign astronaut
  to visit the Tiangong space station (Reuters, Xinhua).
- **Trade / United States:** new US tariffs loom after a Section 301
  probe into factory overcapacity in 16 trading partners; Asian stocks
  slide (Reuters).
- **Middle East:** a Houthi drone hits Riyadh's PIF Tower for the second
  time in days, wounding 11 people (Reuters, WSJ).
- **China:** Politburo member Chen Jining, Shanghai's party chief, is
  under investigation (Xinhua, Reuters).
- **Europe / War in Ukraine:** Zelenskyy confirms Ukraine's drone strike
  on the Russian cargo ship Sparta II in the Gulf of Finland
  (Reuters, Bloomberg).
- **Africa / Health:** WHO staff are evacuated from a hospital in Ituri,
  DR Congo, after three days sheltering amid fighting in the Ebola
  outbreak zone (UN News, WHO).
- **Markets:** US October PCE inflation and Q3 GDP data due today ahead
  of the December Fed meeting (Reuters).

All stories were reported on 24–25 November 2026.

## Verification

Two consecutive runs of `main.ts` produce byte-identical PNGs
(sha256 `0d00b46677afed07e48e126e4a537ac633f58c102f7b73f3d3e823587b583935`,
81,976 bytes, 1024×1024 RGB PNG).
