import React from "react";
import { registerRoot, Composition, Audio, staticFile, AbsoluteFill } from "remotion";
import { Film } from "./Film.jsx";
import { Stage, Person, SKINS, HAIRS, CROWD, Mark } from "./Clay.jsx";
import { loadFonts } from "./theme.js";
import data from "./data.json";

loadFonts();

const WithSound = (props) => (
  <AbsoluteFill>
    <Film {...props} />
    {data.audio !== false && <Audio src={staticFile("narration.wav")} />}
  </AbsoluteFill>
);

/** One clay character on a transparent background (team avatars, website illustrations). */
const Portrait = ({ mood = 0.85, skin = 0, hair = 0, style = 0, ry = 0, framing = "head", shirt, stars = true }) => {
  const cam = framing === "head"
    ? { position: [0, 2.25, 4.6], fov: 30, look: [0, 1.95, 0] }
    : { position: [0, 2.2, 8.6], fov: 30, look: [0, 1.45, 0] };
  return (
    <AbsoluteFill>
      <Stage width={framing === "head" ? 600 : 800} height={framing === "head" ? 600 : 1000} cam={cam} shadow={framing === "head" ? 0 : 0.16}>
        <Person mood={mood} skin={SKINS[skin]} hair={HAIRS[hair]} style={style} ry={ry} phase={0.4} shirt={shirt} stars={stars} />
      </Stage>
    </AbsoluteFill>
  );
};

/** Website hero: the same customers, from 1★ (left) to 5★ (right). */
const CrowdHero = () => (
  <AbsoluteFill>
    <Stage width={1600} height={760} cam={{ position: [0, 2.5, 12.6], fov: 30, look: [0, 1.55, 0] }} shadow={0.16}>
      {CROWD.map((p, i) => <Person key={i} {...p} mood={i / (CROWD.length - 1)} pop={1} />)}
    </Stage>
  </AbsoluteFill>
);
const MarkPic = () => (
  <AbsoluteFill>
    <Stage width={600} height={600} cam={{ position: [0, 1.75, 7.2], fov: 30, look: [0, 1.75, 0] }} shadow={0}>
      <Mark appear={1} y={1.75} scale={1.3} />
    </Stage>
  </AbsoluteFill>
);

const Root = () => (
  <>
    <Composition id="Ecoute" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: true }} />
    <Composition id="EcouteNoCaptions" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: false }} />
    <Composition id="Avatar" component={Portrait} durationInFrames={1} fps={30} width={600} height={600} defaultProps={{ framing: "head" }} />
    <Composition id="CrowdHero" component={CrowdHero} durationInFrames={1} fps={30} width={1600} height={760} />
    <Composition id="MarkPic" component={MarkPic} durationInFrames={1} fps={30} width={600} height={600} />
    <Composition id="Character" component={Portrait} durationInFrames={1} fps={30} width={800} height={1000} defaultProps={{ framing: "body" }} />
  </>
);
registerRoot(Root);
