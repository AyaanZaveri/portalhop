"use client"

import { LOGOS, ROSTER } from "./logos"
import {
  After,
  Beat,
  Before,
  Figure,
  Figures,
  Pair,
  Stat,
  Stats,
  Swatch,
  pct,
  two,
} from "./parts"
import { usePass } from "./use-pass"

/** The whole argument, twelve times over, before anything is explained. */
export function Roster() {
  return (
    <div className="t-roster-grid">
      {ROSTER.map((entry) => (
        <Pair key={entry.name} {...entry} />
      ))}
    </div>
  )
}

/* 1. what the pass sees */
export function Classes() {
  const pass = usePass(LOGOS.tsn)
  const t = pass.trace
  return (
    <>
      <Figures>
        <Figure src={pass.before} caption="TSN 1, straight from the source." />
        <Figure
          src={pass.classes}
          caption="A map of the three piles, not the logo. White is mark, grey is light, blank is transparent."
        />
      </Figures>
      <Stats>
        <Stat label="Image size, after downscaling" value={t ? `${t.width} × ${t.height}` : "–"} />
        <Stat label="In the transparent pile" value={pct(t?.transparent)} />
        <Stat label="Carrying a hue, so counted as mark" value={pct(t?.colorful)} />
      </Stats>
    </>
  )
}

/* 2. walking the perimeter */
export function Perimeter() {
  const filled = usePass(LOGOS.cityNews)
  const wordmark = usePass(LOGOS.cp24)
  const t = filled.trace
  const w = wordmark.trace
  return (
    <>
      <Figures>
        <Figure
          src={filled.ring}
          caption="CityNews. The sampled band is lit up, drawn thicker than the two pixels it reads. It is black almost all the way round."
        />
        <Figure
          src={wordmark.ring}
          caption="CP24. The same band, but the logo is transparent out there, so there is nothing to sample."
        />
      </Figures>
      <Stats>
        <Stat
          label="CityNews, share of the image that is transparent"
          value={pct(t?.transparent)}
          verdict={t && t.transparent < 0.12 ? "pass" : "fail"}
        />
        <Stat
          label="CityNews, share of the band within 28 of the winning colour"
          value={t?.border ? pct(t.border.share) : "–"}
          verdict={t?.border && t.border.share >= 0.6 ? "pass" : "fail"}
        />
        <Stat
          label="CityNews, the winning colour, which the tile takes"
          value={t?.border ? <Swatch color={t.border.color} /> : "–"}
        />
        <Stat
          label="CP24, share of the image that is transparent"
          value={pct(w?.transparent)}
          verdict={w && w.transparent < 0.12 ? "pass" : "fail"}
        />
      </Stats>
      <div className="t-demo">
        <Pair url={LOGOS.cityNews} scale={2.4} />
      </div>
    </>
  )
}

/* 3. counting hues as angles */
export function Hues() {
  const many = usePass(LOGOS.gameShow)
  const one = usePass(LOGOS.espn)
  return (
    <>
      <Stats>
        <Stat
          label="Game Show Network, hue spread (0 is one colour, 1 is every colour)"
          value={two(many.trace?.hueSpread)}
          verdict={many.trace && many.trace.hueSpread > 0.25 ? "fail" : "pass"}
        />
        <Stat
          label="ESPN, hue spread (0 is one colour, 1 is every colour)"
          value={two(one.trace?.hueSpread)}
          verdict={one.trace && one.trace.hueSpread > 0.25 ? "fail" : "pass"}
        />
      </Stats>
      <div className="t-demo t-demo-stack">
        <Pair url={LOGOS.gameShow} scale={2.4} />
        <Pair url={LOGOS.espn} scale={2.4} />
      </div>
    </>
  )
}

/* 4. the light tile */
export function Paper() {
  const pass = usePass(LOGOS.kfor)
  const t = pass.trace
  return (
    <>
      <Stats>
        <Stat
          label="Hue spread, above 0.25, so the mark keeps its colours"
          value={two(t?.hueSpread)}
          verdict={t && t.hueSpread > 0.25 ? "pass" : "fail"}
        />
        <Stat
          label="Share of the logo that is colourless"
          value={pct(t?.achromatic)}
          verdict={t && t.achromatic >= 0.15 ? "pass" : "fail"}
        />
        <Stat
          label="How much of that colourless part is dark"
          value={pct(t?.achromaticDark)}
          verdict={t && t.achromaticDark >= 0.4 ? "pass" : "fail"}
        />
        <Stat label="The colour the tile takes" value={t?.tile ? <Swatch color={t.tile} /> : "–"} />
      </Stats>
      <div className="t-demo">
        <Pair url={LOGOS.kfor} scale={2.4} />
      </div>
    </>
  )
}

/* 5. the flood approach, told in order */
export function Flood() {
  const tsn = usePass(LOGOS.tsn)
  const food = usePass(LOGOS.foodNetwork)
  return (
    <>
      <Beat step="1" title="The mark has to end up white.">
        <p className="t-beat-text">
          The tile behind it is going to be TSN&rsquo;s red, so the mark cannot
          also be red. Every pixel of it needs to be white.
        </p>
        <Figures>
          <Figure src={tsn.before} caption="TSN 1, as it arrives." />
        </Figures>
      </Beat>

      <Beat step="2" title="So paint everything white. Simple enough.">
        <p className="t-beat-text">
          Take every pixel that is not transparent and make it white. It works,
          right up until you look at the number.
        </p>
        <Figures>
          <Figure
            src={tsn.flattened}
            caption="Every non-transparent pixel painted white. The 1 has gone."
          />
          <Figure
            src={tsn.classes}
            caption="Here is why. The 1 was never red. It is a hole punched through the badge, so it is light, exactly like the empty space around the logo."
          />
        </Figures>
        <p className="t-beat-text">
          The 1 is a hole, so it needs to become the tile colour, not white. The
          arrow beside it stands on its own against transparency, so it needs the
          opposite. Both are the same colour in the file. Nothing about the
          colours tells them apart.
        </p>
      </Beat>

      <Beat step="3" title="Ask each region who its neighbours are.">
        <p className="t-beat-text">
          So each region is asked one question: <em>walk its outline, and what
          fraction of that outline has mark on the other side of it?</em> Count
          every pixel just outside the region. Some are mark, some are anything
          else, and the edge of the image counts as anything else. That fraction
          is the region&rsquo;s <em>surroundedness</em>, and it runs from 0 to 1.
        </p>
        <p className="t-beat-text">
          A hole is ringed by the mark on every side, so it scores at or near 1.
          The space around a logo runs off the edge of the image, so it scores
          low. Anything above 0.55 is treated as a hole and painted the tile
          colour; everything else is left as background.
        </p>
        <Figures>
          <Figure
            src={tsn.enclosedMap}
            caption="Lime is every region that scored above 0.55, and so counts as a hole. The 1 is in. The arrow and the space around the logo are not."
          />
          <Figure
            src={tsn.after}
            caption="Mark white, holes in the tile colour, and the 1 survives."
          />
        </Figures>
      </Beat>

      <Beat step="4" title="Reachability is the obvious test, and it fails.">
        <p className="t-beat-text">
          The quicker version of this question is whether a region can reach the
          edge of the image. It falls over on Food Network: the <em>f</em> and
          the <em>d</em> graze the circle they sit in, so a single pixel of
          contact says they are outside, and they stay white on a white mark.
          Asking how much of the border touches the mark barely notices that
          contact.
        </p>
        <Figures>
          <Figure
            src={food.enclosedMap}
            caption="Food Network. The f and the d each touch the rim of the disc at a single point. Reachability calls that an escape route and leaves them white; surroundedness sees an outline that is otherwise entirely mark, scores them near 1, and fills them."
          />
          <Figure
            src={food.after}
            caption="The redrawn copy."
          />
        </Figures>
      </Beat>
    </>
  )
}

/**
 * The same redraw with nothing to colour the tile, which is the variant folded
 * into the flood section rather than given a rule of its own.
 */
export function Colourless() {
  const pass = usePass(LOGOS.nhl)
  const t = pass.trace
  return (
    <>
      <Figures>
        <Figure
          src={pass.before}
          caption="NHL Network on the tile, before. Silver ink on a near black row."
        />
        <Figure
          src={pass.after}
          caption="After. The same redraw, with the neutral tile left behind it because the logo has no colour to offer."
        />
      </Figures>
      <Stats>
        <Stat
          label="Share of the logo carrying any colour"
          value={pct(t?.colorful)}
          verdict={t && t.colorful < 0.04 ? "pass" : "fail"}
        />
        <Stat label="Share of the logo that is dark" value={pct(t?.achromaticDark)} />
      </Stats>
    </>
  )
}

/* 6. contrast, not lightness */
export function Contrast() {
  const tennis = usePass(LOGOS.tennis)
  const t = tennis.trace
  return (
    <>
      <Stats>
        <Stat
          label="The most chromatic pixel in the logo"
          value={t?.accent ? <Swatch color={t.accent} /> : "–"}
        />
        <Stat
          label="How far white stands off it"
          value={t?.contrastBefore ? `${two(t.contrastBefore)} : 1` : "–"}
          verdict={t?.contrastBefore && t.contrastBefore >= 3 ? "pass" : "fail"}
        />
        <Stat
          label="The tile, after darkening"
          value={t?.tile ? <Swatch color={t.tile} /> : "–"}
        />
        <Stat
          label="How far white stands off that"
          value={t?.contrastAfter ? `${two(t.contrastAfter)} : 1` : "–"}
          verdict={t?.contrastAfter && t.contrastAfter >= 3 ? "pass" : "fail"}
        />
      </Stats>
      <div className="t-demo">
        <Pair url={LOGOS.tennis} scale={2.4} />
      </div>
    </>
  )
}

/* 7. fitting the artwork rather than the whole image */
export function Fit() {
  const pass = usePass(LOGOS.fs1)
  const c = pass.style?.content
  return (
    <>
      <div className="t-demo t-fit">
        <div>
          <Before url={LOGOS.fs1} scale={3} />
          <p className="t-figure-caption">Fitted to the whole image, margin and all.</p>
        </div>
        <div>
          <After pass={pass} scale={3} />
          <p className="t-figure-caption">Fitted to the artwork inside it.</p>
        </div>
      </div>
      <Stats>
        <Stat
          label="The artwork, as a share of the whole image"
          value={c ? `${pct(c.width)} wide, ${pct(c.height)} tall` : "–"}
        />
        <Stat
          label="Flat colour above and below it"
          value={c ? pct(1 - c.height) : "–"}
        />
      </Stats>
    </>
  )
}
