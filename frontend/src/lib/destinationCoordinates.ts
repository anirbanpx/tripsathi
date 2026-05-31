// Lat/lng for major Indian tourist destinations.
// Normalized keys match destinationImage.ts normalization.
const COORDS: Record<string, [number, number]> = {
  // Kerala
  kerala:       [10.8505, 76.2711],
  kochi:        [9.9312,  76.2673],
  alleppey:     [9.4981,  76.3388],
  munnar:       [10.0889, 77.0595],
  kovalam:      [8.3988,  76.9820],
  thekkady:     [9.6000,  77.1700],
  varkala:      [8.7379,  76.7165],
  wayanad:      [11.6854, 76.1320],
  kumarakom:    [9.6169,  76.4290],
  trivandrum:   [8.5241,  76.9366],
  thiruvananthapuram: [8.5241, 76.9366],

  // Goa
  goa:          [15.2993, 74.1240],
  panaji:       [15.4909, 73.8278],
  calangute:    [15.5440, 73.7553],

  // Rajasthan
  jaipur:       [26.9124, 75.7873],
  udaipur:      [24.5854, 73.7125],
  jodhpur:      [26.2389, 73.0243],
  jaisalmer:    [26.9157, 70.9083],
  pushkar:      [26.4899, 74.5511],
  ranthambore:  [26.0173, 76.5026],
  mount_abu:    [24.5926, 72.7156],
  ajmer:        [26.4499, 74.6399],
  bikaner:      [28.0229, 73.3119],

  // North India
  delhi:        [28.6139, 77.2090],
  agra:         [27.1767, 78.0081],
  varanasi:     [25.3176, 82.9739],
  amritsar:     [31.6340, 74.8723],
  rishikesh:    [30.0869, 78.2676],
  haridwar:     [29.9457, 78.1642],
  khajuraho:    [24.8318, 79.9199],
  mathura:      [27.4924, 77.6737],

  // Himalayas
  manali:       [32.2396, 77.1887],
  shimla:       [31.1048, 77.1734],
  dharamsala:   [32.2190, 76.3234],
  leh:          [34.1526, 77.5771],
  nainital:     [29.3803, 79.4636],
  mussoorie:    [30.4598, 78.0664],
  spiti:        [32.2473, 78.0341],
  kasol:        [32.0094, 77.3149],
  mcleod_ganj:  [32.2426, 76.3200],

  // South India
  mysore:       [12.2958, 76.6394],
  hampi:        [15.3350, 76.4600],
  coorg:        [12.3375, 75.8069],
  ooty:         [11.4102, 76.6950],
  kodaikanal:   [10.2381, 77.4892],
  pondicherry:  [11.9416, 79.8083],
  mahabalipuram:[12.6269, 80.1927],
  madurai:      [9.9252,  78.1198],
  bangalore:    [12.9716, 77.5946],
  bengaluru:    [12.9716, 77.5946],
  chennai:      [13.0827, 80.2707],
  hyderabad:    [17.3850, 78.4867],
  tirupati:     [13.6288, 79.4192],

  // East India
  kolkata:      [22.5726, 88.3639],
  darjeeling:   [27.0410, 88.2663],
  puri:         [19.8135, 85.8312],
  bhubaneswar:  [20.2961, 85.8245],
  gangtok:      [27.3314, 88.6138],

  // West India
  mumbai:       [19.0760, 72.8777],
  ahmedabad:    [23.0225, 72.5714],
  kutch:        [23.7337, 69.8597],
  dwarka:       [22.2393, 68.9678],

  // Islands
  andaman:      [11.7401, 92.6586],
  havelock:     [12.0264, 92.9838],
  port_blair:   [11.6234, 92.7265],

  // Wildlife
  jim_corbett:  [29.5300, 78.7747],
  kaziranga:    [26.5775, 93.1711],
  ranthambhore: [26.0173, 76.5026],
};

function normalize(location: string): string {
  return location
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()/']/g, "");
}

export function getCoordinates(location: string): [number, number] | null {
  return COORDS[normalize(location)] ?? null;
}

export function getCenterAndZoom(locations: string[]): { center: [number, number]; zoom: number } {
  const coords = locations.map(getCoordinates).filter(Boolean) as [number, number][];
  if (coords.length === 0) return { center: [20.5937, 78.9629], zoom: 5 }; // India center

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
