import React from "react";
import { registerRoot, Composition, Audio, staticFile, AbsoluteFill } from "remotion";
import { Film } from "./Film.jsx";
import { Stage, Person, SKINS, HAIRS } from "./Clay.jsx";
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

const Root = () => (
  <>
    <Composition id="Ecoute" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: true }} />
    <Composition id="EcouteNoCaptions" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: false }} />
    <Composition id="Avatar" component={Portrait} durationInFrames={1} fps={30} width={600} height={600} defaultProps={{ framing: "head" }} />
    <Composition id="Character" component={Portrait} durationInFrames={1} fps={30} width={800} height={1000} defaultProps={{ framing: "body" }} />
  </>
);
registerRoot(Root);
