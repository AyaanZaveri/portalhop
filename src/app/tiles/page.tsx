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
            Thirty-three thousand channels arrive as image files from hosts that
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
              Nothing is decided until each pixel is sorted. It is transparent,
              or it is <em>mark</em> because it carries a hue or it is dark, or
              it is <em>light</em>, which is everything left over. Almost every
              rule after this is a question about those three counts.
            </>
          }
        >
          <Classes />
        </Section>

        <Section
          title="Walk the perimeter"
          standfirst={
            <>
              Some logos are already tiles: a filled rectangle with the artwork
              sitting inside it. Those need no redrawing, only a tile in the
              same colour so the two read as one shape instead of a square
              inside a box. To find that colour, walk the outer two pixels and
              ask what they are mostly made of.
            </>
          }
        >
          <Perimeter />
          <p className="t-note">
            Mostly, not on average. A wordmark that runs out to the edge puts a
            few of its own pixels into the sample, and an average slides off to
            a colour that is nowhere on the edge at all. The pass buckets the
            ring and takes the heaviest bucket, so a handful of intruders are
            outvoted rather than averaged in.
          </p>
        </Section>

        <Section
          title="Count hues as angles, not as numbers"
          standfirst={
            <>
              A mark of one colour can be flattened to white and set on that
              colour. A mark of several cannot, because its colours are what
              identify it. So the hues are averaged as vectors on a circle. Red
              at 2° and red at 358° average back to red, where as plain numbers
              they would average to cyan.
            </>
          }
        >
          <Hues />
        </Section>

        <Section
          title="Dark lettering needs a light tile"
          standfirst={
            <>
              A peacock keeps its colours, so the tile stays out of the way. But
              the black lettering beside it then disappears into a dark row.
              When the ink carrying no colour is mostly dark, the tile goes the
              other way up and turns to paper.
            </>
          }
        >
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
            inside a dark mark. That crescent is fully enclosed, so the flood
            treats it as a knockout and punches it through, and the logo comes
            out with a bite taken from it. ABC is the clearest case: its
            highlight measures 1,588 pixels and 1.00 surrounded, identical to a
            real hole. Telling a highlight from a knockout probably means
            measuring how even the region is, since a knockout is flat and a
            highlight is a gradient. It is not implemented.
          </p>
        </Section>

        <Section
          title="Lightness is not brightness"
          standfirst={
            <>
              Every tile used to be clamped to the same lightness, and white
              still read against them at anything from 5.7 : 1 down to 1.7 : 1. A
              yellow green at lightness 0.42 carries four times the luminance of
              a red at 0.42, and the colour model calls them identical.
            </>
          }
        >
          <Contrast />
          <p className="t-note">
            So the tile is held to a contrast against white instead, and the
            lightness that satisfies it is found by halving, because luminance
            runs through a gamma curve and a weighted sum of three channels and
            there is nothing to rearrange for. The floor is 3 : 1, which is what
            the standards ask of large text. At the size a tile is drawn, the
            large text is the only part anyone reads.
          </p>
        </Section>

        <Section
          title="Fit the artwork, not the canvas"
          standfirst={
            <>
              A logo file&rsquo;s margin is arbitrary. One carries half its
              height as flat colour above and below the mark, the next is drawn
              edge to edge, and neither knows the other exists. Fitting the image hands that straight through, and
              one arrives as a postage stamp beside the other.
            </>
          }
        >
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
