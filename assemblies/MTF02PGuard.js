// MTF-02P Guard bracket
const buildMTF02PGuard = () => {
  const LENGTH = 19;
  const WIDTH = 10;
  const HEIGHT = 9;

  const GAP_LENGTH = 15.75;
  const GAP_WIDTH = 10;
  const GAP_HEIGHT = 8;
  const BOTTOM_THICKNESS = 1;

  const base = translate(
    cube({ size: [LENGTH, WIDTH, HEIGHT], center: true }),
    [0, 0, HEIGHT / 2]
  );
  const cutout = translate(
    cube({ size: [GAP_LENGTH, GAP_WIDTH + 2, GAP_HEIGHT], center: true }),
    [0, 0, BOTTOM_THICKNESS + GAP_HEIGHT / 2]
  );

  return difference(base, cutout);
};

export default buildMTF02PGuard;
