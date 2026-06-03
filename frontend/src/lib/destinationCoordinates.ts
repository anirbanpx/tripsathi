// Lat/lng for major Indian tourist destinations.
const COORDS: Record<string, [number, number]> = {
  // Kerala
  kerala:       [10.8505, 76.2711],
  kochi:        [9.9312,  76.2673],
  cochin:       [9.9312,  76.2673],
  fort_kochi:   [9.9312,  76.2673],
  alleppey:     [9.4981,  76.3388],
  alappuzha:    [9.4981,  76.3388],
  backwaters:   [9.4981,  76.3388],
  munnar:       [10.0889, 77.0595],
  kovalam:      [8.3988,  76.9820],
  thekkady:     [9.6000,  77.1700],
  periyar:      [9.5600,  77.1700],
  varkala:      [8.7379,  76.7165],
  wayanad:      [11.6854, 76.1320],
  kumarakom:    [9.6169,  76.4290],
  trivandrum:   [8.5241,  76.9366],
  thiruvananthapuram: [8.5241, 76.9366],
  thrissur:     [10.5276, 76.2144],
  kozhikode:    [11.2588, 75.7804],
  calicut:      [11.2588, 75.7804],
  kannur:       [11.8745, 75.3704],
  palakkad:     [10.7867, 76.6548],
  kollam:       [8.8932,  76.6141],
  kasaragod:    [12.4996, 74.9869],

  // Goa
  goa:          [15.2993, 74.1240],
  panaji:       [15.4909, 73.8278],
  calangute:    [15.5440, 73.7553],
  panjim:       [15.4909, 73.8278],
  margao:       [15.2832, 73.9862],
  vasco:        [15.3990, 73.8127],
  anjuna:       [15.5735, 73.7412],
  baga:         [15.5565, 73.7517],

  // Rajasthan
  jaipur:       [26.9124, 75.7873],
  udaipur:      [24.5854, 73.7125],
  jodhpur:      [26.2389, 73.0243],
  jaisalmer:    [26.9157, 70.9083],
  pushkar:      [26.4899, 74.5511],
  ranthambore:  [26.0173, 76.5026],
  ranthambhore: [26.0173, 76.5026],
  mount_abu:    [24.5926, 72.7156],
  ajmer:        [26.4499, 74.6399],
  bikaner:      [28.0229, 73.3119],
  chittorgarh:  [24.8887, 74.6269],
  bundi:        [25.4338, 75.6408],
  kota:         [25.2138, 75.8648],
  sawai_madhopur: [26.0173, 76.5026],

  // North India
  delhi:        [28.6139, 77.2090],
  new_delhi:    [28.6139, 77.2090],
  agra:         [27.1767, 78.0081],
  varanasi:     [25.3176, 82.9739],
  banaras:      [25.3176, 82.9739],
  kashi:        [25.3176, 82.9739],
  amritsar:     [31.6340, 74.8723],
  rishikesh:    [30.0869, 78.2676],
  haridwar:     [29.9457, 78.1642],
  khajuraho:    [24.8318, 79.9199],
  mathura:      [27.4924, 77.6737],
  vrindavan:    [27.5759, 77.7002],
  lucknow:      [26.8467, 80.9462],
  allahabad:    [25.4358, 81.8463],
  prayagraj:    [25.4358, 81.8463],
  kanpur:       [26.4499, 80.3319],
  fatehpur_sikri: [27.0946, 77.6671],

  // Himalayas / HP
  manali:       [32.2396, 77.1887],
  shimla:       [31.1048, 77.1734],
  dharamsala:   [32.2190, 76.3234],
  mcleod_ganj:  [32.2426, 76.3200],
  dharamshala:  [32.2190, 76.3234],
  leh:          [34.1526, 77.5771],
  ladakh:       [34.1526, 77.5771],
  nainital:     [29.3803, 79.4636],
  mussoorie:    [30.4598, 78.0664],
  spiti:        [32.2473, 78.0341],
  kasol:        [32.0094, 77.3149],
  kullu:        [31.9574, 77.1095],
  palampur:     [32.1094, 76.5370],
  chamba:       [32.5530, 76.1280],
  dalhousie:    [32.5386, 75.9734],
  kufri:        [31.0962, 77.2631],
  solang:       [32.3097, 77.1503],
  sissu:        [32.4758, 77.2397],
  lahaul:       [32.4758, 77.2397],

  // Uttarakhand
  dehradun:     [30.3165, 78.0322],
  uttarakhand:  [30.0668, 79.0193],
  kedarnath:    [30.7353, 79.0669],
  badrinath:    [30.7433, 79.4938],
  auli:         [30.5093, 79.5700],
  chopta:       [30.3500, 79.1400],
  lansdowne:    [29.8363, 78.6840],
  jim_corbett:  [29.5300, 78.7747],
  corbett:      [29.5300, 78.7747],

  // South India
  mysore:       [12.2958, 76.6394],
  mysuru:       [12.2958, 76.6394],
  hampi:        [15.3350, 76.4600],
  coorg:        [12.3375, 75.8069],
  kodagu:       [12.3375, 75.8069],
  ooty:         [11.4102, 76.6950],
  udhagamandalam: [11.4102, 76.6950],
  kodaikanal:   [10.2381, 77.4892],
  pondicherry:  [11.9416, 79.8083],
  puducherry:   [11.9416, 79.8083],
  mahabalipuram:[12.6269, 80.1927],
  mamallapuram: [12.6269, 80.1927],
  madurai:      [9.9252,  78.1198],
  bangalore:    [12.9716, 77.5946],
  bengaluru:    [12.9716, 77.5946],
  chennai:      [13.0827, 80.2707],
  madras:       [13.0827, 80.2707],
  hyderabad:    [17.3850, 78.4867],
  tirupati:     [13.6288, 79.4192],
  rameshwaram:  [9.2877,  79.3129],
  kanyakumari:  [8.0883,  77.5385],
  cape_comorin: [8.0883,  77.5385],
  chikmagalur:  [13.3161, 75.7720],
  sakleshpur:   [12.9412, 75.7880],
  mangalore:    [12.9141, 74.8560],
  mangaluru:    [12.9141, 74.8560],
  udupi:        [13.3409, 74.7421],
  gokarna:      [14.5479, 74.3188],
  dandeli:      [15.2583, 74.6231],
  kabini:       [11.9398, 76.3617],
  wayanad_wildlife: [11.6854, 76.1320],

  // East India
  kolkata:      [22.5726, 88.3639],
  calcutta:     [22.5726, 88.3639],
  darjeeling:   [27.0410, 88.2663],
  puri:         [19.8135, 85.8312],
  bhubaneswar:  [20.2961, 85.8245],
  gangtok:      [27.3314, 88.6138],
  sikkim:       [27.5330, 88.5122],
  shillong:     [25.5788, 91.8933],
  meghalaya:    [25.4670, 91.3662],
  kaziranga:    [26.5775, 93.1711],
  assam:        [26.2006, 92.9376],
  guwahati:     [26.1445, 91.7362],
  aizawl:       [23.7271, 92.7176],
  kohima:       [25.6751, 94.1086],
  imphal:       [24.8170, 93.9368],

  // West India
  mumbai:       [19.0760, 72.8777],
  bombay:       [19.0760, 72.8777],
  ahmedabad:    [23.0225, 72.5714],
  kutch:        [23.7337, 69.8597],
  rann_of_kutch: [23.7337, 69.8597],
  dwarka:       [22.2393, 68.9678],
  somnath:      [20.9001, 70.3736],
  sasan_gir:    [21.1241, 70.5690],
  diu:          [20.7145, 70.9874],
  pune:         [18.5204, 73.8567],
  nashik:       [19.9975, 73.7898],
  aurangabad:   [19.8762, 75.3433],
  chhatrapati_sambhajinagar: [19.8762, 75.3433],
  ajanta:       [20.5519, 75.7005],
  ellora:       [20.0258, 75.1780],
  lonavala:     [18.7481, 73.4072],
  mahabaleshwar: [17.9238, 73.6574],

  // Islands
  andaman:      [11.7401, 92.6586],
  havelock:     [12.0264, 92.9838],
  radhanagar:   [12.0264, 92.9838],
  neil:         [11.8300, 92.7300],
  port_blair:   [11.6234, 92.7265],
  lakshadweep:  [10.5667, 72.6367],
  agatti:       [10.8239, 72.1983],

  // Wildlife
  bandhavgarh:  [23.7154, 81.0366],
  kanha:        [22.3372, 80.6116],
  pench:        [21.6800, 79.2900],
  tadoba:       [20.2082, 79.3847],
  satpura:      [22.5000, 78.0000],
  sundarbans:   [21.9497, 89.1833],
};

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[()/']/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// Extracts ordered candidate strings from a location, destination-first.
// Handles: "Kochi, Kerala" → ["kochi"]
//          "Fort Kochi"    → ["fort_kochi", "kochi"]
//          "Munnar → Thekkady" → ["thekkady", "munnar"]
//          "Kochi (Fort Kochi)" → ["kochi_fort_kochi", "fort_kochi", "kochi"]
function candidates(location: string): string[] {
  // Split on comma, take first segment
  const base = location.split(",")[0].trim();

  // Split on arrows to get journey legs; try destination (last) first
  const arrowSegs = base
    .split(/\s*(?:→|->|to)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
  const ordered = arrowSegs.length > 1 ? [...arrowSegs].reverse() : arrowSegs;

  const result: string[] = [];
  for (const seg of ordered) {
    const key = normalize(seg);
    result.push(key);
    // Also add word-subset fallbacks (tail-anchored, then head-anchored)
    const words = key.split("_").filter(Boolean);
    for (let i = 1; i < words.length; i++) {
      result.push(words.slice(i).join("_"));       // tail subset
      result.push(words.slice(0, words.length - i).join("_")); // head subset
    }
  }

  // Deduplicate while preserving order
  return [...new Set(result)];
}

const ROUTE_WAYPOINTS: Record<string, [number, number][]> = {
  kerala:     [[9.9312,76.2673],[10.0889,77.0595],[9.4981,76.3388],[9.6169,76.4290]],
  goa:        [[15.4909,73.8278],[15.5440,73.7553],[15.2832,73.9862],[15.0101,74.0233]],
  rajasthan:  [[26.9124,75.7873],[26.4899,74.5511],[26.2389,73.0243],[26.9157,70.9083],[24.5854,73.7125]],
  ladakh:     [[34.1526,77.5771],[34.6494,77.5619],[33.7706,78.6474]],
  manali:     [[32.2396,77.1887],[32.3097,77.1503],[32.4313,77.1046]],
  coorg:      [[12.4217,75.7394],[12.3784,75.6980],[12.3600,75.9200]],
  guwahati:   [[26.1445,91.7362],[26.5775,93.1711],[25.5788,91.8933]],
  puri:       [[20.2961,85.8245],[19.8135,85.8312],[19.7145,85.3186]],
  darjeeling: [[26.7271,88.3953],[27.0410,88.2663],[27.0524,88.2642]],
  shimla:     [[30.7333,76.7794],[31.1048,77.1734],[31.0962,77.2631],[31.6340,77.1673]],
  andaman:    [[11.6234,92.7265],[12.0264,92.9838],[11.8300,92.7300]],
  varanasi:   [[25.4358,81.8463],[25.3176,82.9739],[25.3734,83.0237]],
  mysore:     [[12.9716,77.5946],[12.2958,76.6394],[12.4217,75.7394]],
  hampi:      [[15.2700,76.3840],[15.3350,76.4600],[15.9100,75.6800]],
  rishikesh:  [[29.9457,78.1642],[30.0869,78.2676],[30.4498,78.7647]],
};

function matchRouteKey(destination: string): string | null {
  const dk = destination.split(",")[0].toLowerCase();
  if (dk.includes("kerala")||dk.includes("munnar")||dk.includes("alleppey")||dk.includes("kochi")||dk.includes("kovalam")||dk.includes("wayanad")) return "kerala";
  if (dk.includes("goa")||dk.includes("panaji")||dk.includes("calangute")||dk.includes("palolem")) return "goa";
  if (dk.includes("rajasthan")||dk.includes("jaipur")||dk.includes("jodhpur")||dk.includes("jaisalmer")||dk.includes("udaipur")) return "rajasthan";
  if (dk.includes("ladakh")||dk.includes("leh")) return "ladakh";
  if (dk.includes("manali")) return "manali";
  if (dk.includes("coorg")||dk.includes("kodagu")) return "coorg";
  if (dk.includes("guwahati")||dk.includes("kaziranga")) return "guwahati";
  if (dk.includes("puri")||dk.includes("bhubaneswar")||dk.includes("chilika")) return "puri";
  if (dk.includes("darjeeling")) return "darjeeling";
  if (dk.includes("shimla")||dk.includes("himachal")) return "shimla";
  if (dk.includes("andaman")) return "andaman";
  if (dk.includes("varanasi")||dk.includes("banaras")||dk.includes("kashi")) return "varanasi";
  if (dk.includes("mysore")||dk.includes("mysuru")) return "mysore";
  if (dk.includes("hampi")) return "hampi";
  if (dk.includes("rishikesh")||dk.includes("haridwar")) return "rishikesh";
  return null;
}

export function getRouteWaypoints(destination: string): [number, number][] {
  const key = matchRouteKey(destination);
  if (key) return ROUTE_WAYPOINTS[key];
  const c = getCoordinates(destination);
  return c ? [c] : [];
}

export function getCoordinates(location: string): [number, number] | null {
  for (const key of candidates(location)) {
    if (COORDS[key]) return COORDS[key];
  }
  return null;
}

export function getCenterAndZoom(locations: string[]): { center: [number, number]; zoom: number } {
  const coords = locations.map(getCoordinates).filter(Boolean) as [number, number][];
  if (coords.length === 0) return { center: [20.5937, 78.9629], zoom: 5 };

  const lats = coords.map(c => c[0]);
  const lngs = coords.map(c => c[1]);
  const center: [number, number] = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];

  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const span = Math.max(latSpan, lngSpan);
  const zoom = span < 0.5 ? 11 : span < 1.5 ? 10 : span < 3 ? 9 : span < 6 ? 8 : 7;

  return { center, zoom };
}
