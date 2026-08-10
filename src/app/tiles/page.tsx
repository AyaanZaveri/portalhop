import type { Metadata } from "next"
import type { ReactNode } from "react"

import "./tiles.css"

import { PrimaryMeshGradientBackdrop } from "@/components/mesh-gradient-backdrop"
import { ThemeToggle } from "@/components/theme-toggle"

import { Bunny } from "./bunny"
import {
  Classes,
  Colourless,
  Contrast,
  Fit,
  Flood,
  Hues,
  Paper,
  Perimeter,
  Roster,
} from "./demos"
import { TryIt } from "./try-it"

export const metadata: Metadata = {
  title: "Tiles, and how Portal Hop draws a channel logo",
  description:
    "Every rule the logo pass applies, with the algorithm running live in the page on real channel logos.",
}

function Section({
  title,
  standfirst,
  children,
}: {
  title: string
  standfirst: ReactNode
  children: ReactNode
}) {
  return (
    <section className="t-section">
      <h2 className="t-h2">{title}</h2>
      <p className="t-lede">{standfirst}</p>
      {children}
    </section>
  )
}

const LANGUAGES = [
  { name: "Kotlin", where: "on Android", icon: "/devicons/kotlin.svg" },
  { name: "Swift", where: "on iOS", icon: "/devicons/swift.svg" },
  { name: "TypeScript", where: "here", icon: "/devicons/typescript.svg" },
]

export default function TilesPage() {
  return (
    <main className="tiles">
      {/* The same backdrop the player shows with no channel selected, so the
          page opens on something the app already does rather than on a
          decoration invented for it. A band across the top rather than the
          whole page: it belongs to the header, and behind seven sections of
          measurements it would be reading matter competing with the numbers.
          Outside t-wrap so it runs the full width while the prose stays in its
          column. */}
      <div className="t-glow" aria-hidden>
        <PrimaryMeshGradientBackdrop />
      </div>

      {/* The app's own control rather than one of this page's: light, dark and
          system, writing to the same preference every other screen reads. */}
      <div className="t-theme">
        <ThemeToggle />
      </div>

      <div className="t-wrap">
        <header className="t-head">
          <Bunny />
          <h1 className="t-h1">
            A channel logo is a picture.
            <br />
            <em>A tile is a decision.</em>
          </h1>
          <p className="t-standfirst">
            Tens of thousands of channels arrive as image files from hosts that
            agree on nothing. Some are wordmarks on transparency, some are
            finished rectangles, some are white ink that vanishes against a dark
            row. This is every rule that turns one into the other, with the
            algorithm running here, in this page, on the real files.
          </p>
        </header>

        <section className="t-roster">
          <div className="t-roster-grid t-roster-head" aria-hidden>
            <div className="t-pair">
              <span>Before</span>
              <span />
              <span>After</span>
            </div>
            <div className="t-pair">
              <span>Before</span>
              <span />
              <span>After</span>
            </div>
          </div>
          <Roster />
        </section>

        {/* Ahead of the explanation on purpose. The roster above is twelve
            logos somebody else picked, and the fastest way to stop reading a
            claim and start believing it is to run it on something the page did
            not choose. */}
        <section className="t-section">
          <h2 className="t-h2">Try it yourself</h2>
          <p className="t-lede">
            Drop in a logo of your own and watch the rest of this page happen to
            it. The same code the app ships, running on your file, in this tab.
          </p>
          <TryIt />
        </section>

        <Section
          title="Every pixel is one of three things"
          standfirst={
            <>
              Nothing is decided until every pixel has been sorted into one of
              three piles. Almost every rule after this is a question about how
              big those piles are.
            </>
          }
        >
          <dl className="t-terms">
            <div className="t-term">
              <dt>Transparent</dt>
              <dd>
                Nothing was drawn here. The empty space around a logo stored on
                a clear background.
              </dd>
            </div>
            <div className="t-term">
              <dt>Mark</dt>
              <dd>
                The logo itself. Two kinds of pixel land here. One is a pixel
                carrying a hue, meaning a colour strong enough to name: a red, a
                blue, a green, rather than a grey. The other is any dark pixel,
                whether or not it has a colour in it, because dark is something
                somebody drew rather than the paper they drew it on. Black
                lettering is mark for exactly that reason.
              </dd>
            </div>
            <div className="t-term">
              <dt>Light</dt>
              <dd>
                Everything left over, which after the other two comes to one
                thing: pale pixels with no colour in them. That may be a white
                background or a white letter, and at this stage nothing has
                worked out which. Sorting those two apart is the hardest part of
                the pass, and it has a section to itself further down.
              </dd>
            </div>
          </dl>
          <Classes />
        </Section>

        <Section
          title="Walk the perimeter"
          standfirst={
            <>
              Some logos are already tiles: a filled rectangle with the artwork
              sitting inside it. Those need no redrawing, only a tile in the
              same colour so the two read as one shape instead of a square
              inside a box. To find that colour, read the two-pixel band running
              all the way around the edge of the image and ask what it is mostly
              made of.
            </>
          }
        >
          <Perimeter />
          <p className="t-note">
            Mostly, not on average. A wordmark that runs out to the edge puts a
            few of its own pixels into the band, and an average slides off to a
            colour that is nowhere on the edge at all. So the band is sorted
            into groups of near-identical colours instead, and the largest group
            wins. A handful of intruders end up in their own small group and are
            outvoted rather than averaged in.
          </p>
          <p className="t-note">
            Near-identical, precisely, means the colours land in the same
            step of 24 on each of red, green and blue. Two blacks a shade apart
            group together; a black and a red never do. The share reported below
            is then measured against the winning colour directly: how much of
            the band sits within 28 of it, out of 255, on every channel at once.
          </p>
        </Section>

        <Section
          title="Count hues as angles, not as numbers"
          standfirst={
            <>
              A mark of one colour can be flattened to white and set on that
              colour. A mark of several cannot, because its colours are what
              identify it. So the pass measures how far a logo&rsquo;s colours
              spread around the colour wheel, and calls the result its{" "}
              <em>hue spread</em>.
            </>
          }
        >
          <p className="t-note t-note-first">
            Hue spread runs from 0 to 1. At 0 every coloured pixel points at the
            same hue, so the logo is one colour. Near 1 the hues point in every
            direction and cancel each other out, so there is no single colour to
            speak of. The line is drawn at 0.25, and in practice logos land
            nowhere near it: a one-colour mark measures almost exactly 0, and a
            multicoloured one measures most of the way to 1.
          </p>
          <p className="t-note">
            Spread has to be measured around a circle rather than along a line,
            because hue is an angle and 359° sits next to 1°. Averaged as plain
            numbers, a red at 2° and a red at 358° come out at 180°, which is
            cyan: a colour in neither pixel, from a logo that only ever used one.
            Averaged as directions on the wheel, they average back to red.
          </p>
          <Hues />
        </Section>

        <Section
          title="Dark lettering needs a light tile"
          standfirst={
            <>
              A peacock keeps its colours, so the tile stays out of the way. But
              the black lettering beside it then disappears into a dark row.
              This is the one case where the tile goes the other way up and
              turns to paper.
            </>
          }
        >
          <p className="t-note t-note-first">
            Three measurements have to agree before that happens, and they are
            three parts of one sentence: <em>the mark is multicoloured, a good
            deal of the logo is colourless, and that colourless part is mostly
            dark</em>. The first says the artwork has to be kept as it is. The
            second and third say the part being kept includes dark lettering.
            Together they describe a coloured mark sitting next to black type,
            and nothing else.
          </p>
          <Paper />
          <p className="t-note">
            This is the one rule with a single family of examples. Of the
            fifty-three Canadian and American logos tested while writing this page,
            the affiliates were the only ones that took it. A multicoloured mark
            sitting beside black type is simply how that group is drawn, and the
            rule exists because of them.
          </p>
        </Section>

        <Section
          title="The flood approach"
          standfirst={
            <>
              This is the part that took the longest to get right, and the
              problem is easier to see than to describe. It is worth walking
              through in order.
            </>
          }
        >
          <p className="t-note t-note-first">
            One word first, because the rest of this section leans on it. A{" "}
            <em>region</em> is a patch of light pixels that touch one another:
            start on any light pixel, keep stepping to light pixels next to it
            until there are no more, and everything collected is one region. The
            space around a logo is a region. So is the hole in the middle of a
            letter O. The pass finds every region in the image and then decides
            about each one separately.
          </p>
          <Flood />
          <p className="t-note">
            The question turns out to be geometric, and it has to be asked per
            region rather than per logo. TSN needs both answers at once, on two
            shapes that are the same colour, so no rule about colour could ever
            have separated them.
          </p>
          <p className="t-note">
            The same redraw runs on a mark that has no colour at all, only dark
            ink. Nothing changes except which tile goes behind it: there is no
            channel colour to use, so it stays the neutral one. The mark still
            turns white, the holes still get punched, and a logo that was
            invisible against a dark row becomes readable.
          </p>
          <Colourless />
          <p className="t-note">
            One thing it gets wrong, and it is worth writing down. A glossy logo
            with a highlight painted into it, the kind of glass sphere effect
            that was everywhere in the 2000s, has a bright crescent sitting
            inside a dark mark. Its outline is entirely mark, so it scores
            as high as a real hole and gets punched through, and the logo comes
            out with a bite taken from it. ABC is the clearest case: its
            highlight is a region of 1,588 pixels whose outline is 100 per cent
            mark, which is exactly what a real hole looks like from here.
            Telling a highlight from a knockout probably means measuring how
            even the region is, since a knockout is one flat colour and a
            highlight is a gradient. It is not implemented.
          </p>
        </Section>

        <Section
          title="Lightness is not brightness"
          standfirst={
            <>
              Every tile used to be clamped to the same lightness, and the white
              mark on it still came out anywhere from clearly readable to almost
              invisible. The reason is that lightness is not brightness. A
              yellow green and a red can sit at the same lightness while the
              yellow green throws off four times as much light, because the eye
              is far more sensitive to green than to red, and the colour model
              takes no account of that.
            </>
          }
        >
          <p className="t-note t-note-first">
            So the tile is measured by contrast instead: how far apart the tile
            and the white mark on it actually are, as a ratio. Higher is easier
            to read. The pass keeps every tile at 3 : 1 or better.
          </p>
          <Contrast />
          <p className="t-note">
            That 3 : 1 is borrowed rather than owed. It is the figure the
            accessibility standards set for large text, and a tile is not text
            at all, but it is the same problem at the same size: one shape read
            against one flat colour at a glance. Nothing in the standards covers
            a channel logo, so the nearest honest target is the one for the
            thing it most resembles.
          </p>
          <p className="t-note">
            Finding the tile that hits it is done by guessing and halving. Try a
            lightness; if the contrast is too low, try halfway darker; if it is
            higher than needed, try halfway back; repeat until the two guesses
            close on each other. Twenty-four rounds gets it exact. It is done
            this way because contrast cannot be rearranged into a formula that
            hands back the lightness you want: the calculation bends each colour
            channel through a curve and then weights the three of them
            differently, and there is no way back through that.
          </p>
        </Section>

        <Section
          title="Fit the artwork, not the file"
          standfirst={
            <>
              A logo file&rsquo;s margin is arbitrary. One carries half its
              height as flat colour above and below the mark, the next is drawn
              edge to edge, and neither knows the other exists. Fitting the image hands that straight through, and
              one arrives as a postage stamp beside the other.
            </>
          }
        >
          <p className="t-note t-note-first">
            So the pass finds the artwork itself. It looks at every pixel and
            asks whether anything was drawn there, then takes the smallest
            rectangle containing all the pixels that said yes. On a logo stored
            on a clear background, drawn there means not transparent. On one
            stored on a filled background, transparency cannot answer it, so the
            colour found by walking the perimeter is used instead: a pixel
            counts as artwork if it differs from that background colour. This is
            the second job that measurement does, and the reason it happens
            before anything is fitted.
          </p>
          <Fit />
        </Section>

        <footer className="t-foot">
          <p>The same pass runs in three places, from one set of thresholds.</p>

          <ul className="t-langs">
            {LANGUAGES.map((language) => (
              <li key={language.name} className="t-lang">
                {/* eslint-disable-next-line @next/next/no-img-element -- a static mark, not content */}
                <img src={language.icon} alt="" width={16} height={16} />
                <span>
                  {language.name}
                  <span className="t-lang-where">{language.where}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="t-foot-dim">
            Every single number and tile on this page was generated in your
            browser just now.
          </p>
        </footer>
      </div>
    </main>
  )
}
