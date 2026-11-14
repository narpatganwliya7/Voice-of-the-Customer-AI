import React from "react";
import { registerRoot, Composition, Audio, staticFile, AbsoluteFill } from "remotion";
import { Film } from "./Film.jsx";
import data from "./data.json";

const WithSound = (props) => (
  <AbsoluteFill>
    <Film {...props} />
    {data.audio !== false && <Audio src={staticFile("narration.wav")} />}
  </AbsoluteFill>
);

const Root = () => (
  <>
    <Composition id="Ecoute" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: true }} />
    <Composition id="EcouteNoCaptions" component={WithSound} durationInFrames={data.frames} fps={data.fps} width={1080} height={1350} defaultProps={{ captions: false }} />
  </>
);
registerRoot(Root);
