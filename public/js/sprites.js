// Pixel art, authored as text grids and baked to canvases once at startup.
// One character = one pixel; '.' is transparent. Palettes map characters to colours.

const GIRL_PAL = {
  k: '#2a1d3f', // outline
  h: '#f5d06a', // hair
  H: '#d3a446', // hair shade
  s: '#ffd8bd', // skin
  S: '#efb293', // skin shade
  e: '#6a3a1e', // eye
  w: '#ffffff', // eye shine
  b: '#ff9bb8', // blush
  l: '#d9536f', // mouth
  j: '#e9f6ff', // earring
  p: '#ff5fae', // clip pink
  c: '#55e2ff', // clip cyan
  y: '#ffe14d', // clip yellow
  v: '#b67dff', // clip purple
  g: '#7dff8a', // clip green
  o: '#6f87a6', // overalls
  O: '#4c6080', // overalls shade
  r: '#e8344e', // badge
  n: '#f7f6ff', // sneaker
  N: '#b7b5cf', // sneaker shade
  m: '#e08bff', // mic head
  M: '#a856e6', // mic head shade
  q: '#ff8fd6', // mic handle
};

// Head is shared by every frame (18 wide).
const HEAD = [
  '......kkkkkk......',
  '....kkhhpphhkk....',
  '...khhhppphhhhk...',
  '..khcchhhphhyyhk..',
  '.khccchhhhhhyyhhk.',
  '.khhcvvhhhhhhhhhk.',
  'khhhhvvhhhhhhhhhhk',
  'khhhhhkhhhhshhshhk',
  'khhhhkskhsssssssk.',
  'kghhhkssSssskkssk.',
  'kgghhhksSsssewsssk',
  'khhhhhhkSssseessk.',
  'khhhhhhhjsssbsslk.',
  '.khhhhhhpssssssk..',
  '.khhhHhhhkkkkkk...',
];

// Body frames (rows 15..25). Arm forward with the toy mic, legs vary.
const BODY = {
  idle: [
    '..khhHhkossok..kk.',
    '..khhhkoorooskkwmk',
    '...kkkoooooosskmMk',
    '......koooooksqkk.',
    '......kOooooOk....',
    '......kOOkkOOk....',
    '.......kok.kok....',
    '.......kok.kok....',
    '......knnk.knnk...',
    '......kNNNkkNNNk..',
    '.......kkk..kkk...',
  ],
  run0: [
    '..khhHhkossok..kk.',
    '..khhhkoorooskkwmk',
    '...kkkoooooosskmMk',
    '......koooooksqkk.',
    '.....kOooooOOk....',
    '....kOOkkkkOOOk...',
    '...kook....kookk..',
    '..knok......kooNk.',
    '.knnk........knnnk',
    'kNNk..........kNNk',
    '.kk............kk.',
  ],
  run1: [
    '..khhHhkossok..kk.',
    '..khhhkoorooskkwmk',
    '...kkkoooooosskmMk',
    '......koooooksqkk.',
    '......kOooooOk....',
    '......kOOkOOOk....',
    '.......kokkook....',
    '.......kkooknk....',
    '.......knnnNNk....',
    '......kNNNkkk.....',
    '.......kkk........',
  ],
  run2: [
    '..khhHhkossok..kk.',
    '..khhhkoorooskkwmk',
    '...kkkoooooosskmMk',
    '......koooooksqkk.',
    '.....kOOooooOk....',
    '....kOOOkkkOOk....',
    '...kkook...kook...',
    '..kNook.....kook..',
    '.knnnk.......knnk.',
    'kNNk..........kNNk',
    '.kk............kk.',
  ],
  run3: [
    '..khhHhkossok..kk.',
    '..khhhkoorooskkwmk',
    '...kkkoooooosskmMk',
    '......koooooksqkk.',
    '......kOooooOk....',
    '......kOOOkOOk....',
    '.......kookkok....',
    '.......knkookk....',
    '.......kNNnnnk....',
    '........kkkNNNk...',
    '...........kkk....',
  ],
  jump: [
    '..khhHhkossok.kwmk',
    '..khhhkoorooskkmMk',
    '...kkkoooooosskqk.',
    '......kooooook....',
    '......kOooooOk....',
    '.....kOOkkkOOOk...',
    '....kook...kook...',
    '...knnk....kook...',
    '...kNNk....knnnk..',
    '....kk.....kNNNk..',
    '............kkk...',
  ],
};

export const GIRL_FRAMES = {};
for (const [name, body] of Object.entries(BODY)) {
  GIRL_FRAMES[name] = [...HEAD, ...body];
}

const COIN_PAL = { k: '#7a4a00', y: '#ffd21f', Y: '#ffef8a', o: '#e69a00', w: '#ffffff' };
const COIN_FRAMES = [
  ['..kkkk..', '.kyyYYk.', 'kyyoyYwk', 'kyoyyyYk', 'kyoyyyyk', 'kyyoyyyk', '.kyyyyk.', '..kkkk..'],
  ['...kk...', '..kyYk..', '.kyoYwk.', '.kyoyYk.', '.kyoyyk.', '.kyoyyk.', '..kyyk..', '...kk...'],
  ['...kk...', '...kk...', '...kYk..', '...kok..', '...kok..', '...kok..', '...kk...', '...kk...'],
  ['...kk...', '..kYyk..', '.kwYoyk.', '.kYyoyk.', '.kyyoyk.', '.kyyoyk.', '..kyyk..', '...kk...'],
];

const ITEM_PAL = {
  k: '#2a1d3f',
  w: '#ffffff',
  W: '#e4ecff',
  b: '#9fdcff', // glass
  p: '#ff6fb5', // straw
  r: '#ff4f7b', // gummy red
  R: '#d12a59',
  q: '#ffa3bf',
  y: '#ffe14d',
  Y: '#ffb31a',
  o: '#ff8a1a',
  e: '#7a2e00',
};
const ITEMS = {
  milk: [
    '......pp..',
    '.....p....',
    '.kkkkpkkk.',
    '.kbbbpbbk.',
    '.kwwwpwwk.',
    '.kwWwwwwk.',
    '.kwWwwwwk.',
    '..kwWwwk..',
    '..kwwwwk..',
    '..kkkkkk..',
  ],
  gummy: [
    '.kk....kk.',
    'krrk..krrk',
    '.krrrrrrk.',
    '.krerrerk.',
    '.krrqqrrk.',
    '..krrrrk..',
    '.kkrqrrkk.',
    'krrrqrrrrk',
    '.krrrrrRk.',
    'krRk..kRrk',
    '.kk....kk.',
  ],
  sun: [
    '....yy....',
    '.y..yy..y.',
    '..ykkkky..',
    '..kyyyYk..',
    'yykyeyeYyy',
    'yykyyyYYyy',
    '..kyeeYk..',
    '..ykkkky..',
    '.y..yy..y.',
    '....yy....',
  ],
};

const CANDLE_PAL = { k: '#3a0d1a', r: '#ff3b4f', R: '#c01633', w: '#ff9aa6' };
const CANDLE = [
  '..k..',
  '..k..',
  '.kkk.',
  'kwrRk',
  'krrRk',
  'krrRk',
  'krrRk',
  'krrRk',
  'krrRk',
  'krrRk',
  'krrRk',
  '.kkk.',
  '..k..',
  '..k..',
];

const MOON_PAL = { k: '#3b2f5c', m: '#fff3c4', M: '#e9d48f', c: '#d6be76', w: '#ffffff' };
const MOON = [
  '.....kkkkkk.....',
  '...kkmmmmmmkk...',
  '..kmmmwmmmmmMk..',
  '.kmmwmmmcmmmMMk.',
  '.kmmmmmccmmmmMk.',
  'kmmmmmmmmmmmmMMk',
  'kmmccmmmmmmmmMMk',
  'kmmccmmmmmcmmMMk',
  'kmmmmmmmmmccmMMk',
  'kmmmmmmmmmmmmMMk',
  'kmmmmmcmmmmmMMMk',
  '.kmmmmmmmmmmMMk.',
  '.kMmmmmmmmmMMMk.',
  '..kMMmmmmMMMMk..',
  '...kkMMMMMMkk...',
  '.....kkkkkk.....',
];

// Small HUD icons, 7×7.
const ICON_PAL = { w: '#ffffff', k: '#2a1d3f', p: '#ff6fb5', d: '#5b5f99' };
const ICONS = {
  soundOn: ['...w...', '..ww.w.', 'wwww..w', 'wwww..w', 'wwww..w', '..ww.w.', '...w...'],
  soundOff: ['...w...', '..ww...', 'wwwwp.p', 'wwww.p.', 'wwwwp.p', '..ww...', '...w...'],
  pip: ['.ddddd.', 'd.....d', 'd.....d', 'd.....d', 'd.....d', 'd.....d', '.ddddd.'],
};

function bake(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  return c;
}

// Same sprite in a single flat colour (for glitch ghosts and flashes).
function tint(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export const S = {};

export function bakeSprites() {
  S.girl = {};
  S.girlGreen = {};
  S.girlPurple = {};
  S.girlWhite = {};
  for (const [name, rows] of Object.entries(GIRL_FRAMES)) {
    S.girl[name] = bake(rows, GIRL_PAL);
    S.girlGreen[name] = tint(S.girl[name], '#39ff88');
    S.girlPurple[name] = tint(S.girl[name], '#b34dff');
    S.girlWhite[name] = tint(S.girl[name], '#ffffff');
  }
  S.coin = COIN_FRAMES.map((f) => bake(f, COIN_PAL));
  S.items = {};
  S.itemsWhite = {};
  for (const [name, rows] of Object.entries(ITEMS)) {
    S.items[name] = bake(rows, ITEM_PAL);
    S.itemsWhite[name] = tint(S.items[name], '#ffffff');
  }
  S.candle = bake(CANDLE, CANDLE_PAL);
  S.moon = bake(MOON, MOON_PAL);
  S.icons = {};
  for (const [name, rows] of Object.entries(ICONS)) S.icons[name] = bake(rows, ICON_PAL);
  return S;
}

export const ITEM_KINDS = ['milk', 'gummy', 'sun'];
export const ITEM_LABEL = { milk: 'MILK', gummy: 'GUMMIES', sun: 'SUNSHINE' };
export const ITEM_COLOR = { milk: '#e4ecff', gummy: '#ff4f7b', sun: '#ffe14d' };

// Feet anchor for the girl sprite (centre-bottom of the shoes).
export const GIRL_ANCHOR = { x: 9, y: 25 };
export const GIRL_SIZE = { w: 18, h: 26 };
