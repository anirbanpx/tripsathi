import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getDestinationImageUrl } from "../../lib/destinationImage";

// Fix Leaflet's broken default icon paths in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const dotIcon = L.divIcon({
  html: `<div style="
    width:10px;height:10px;border-radius:50%;
    background:#B0492F;border:2px solid #F4ECDB;
    box-shadow:0 1px 4px rgba(62,47,35,0.4);
  "></div>`,
  className: "",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -8],
});

const DESTINATIONS: Array<{ name: string; label: string; coord: [number, number] }> = [
  // Kerala
  { name: "kerala",       label: "Kerala",        coord: [10.8505, 76.2711] },
  { name: "kochi",        label: "Kochi",         coord: [9.9312,  76.2673] },
  { name: "alleppey",     label: "Alleppey",      coord: [9.4981,  76.3388] },
  { name: "munnar",       label: "Munnar",        coord: [10.0889, 77.0595] },
  { name: "kovalam",      label: "Kovalam",       coord: [8.3988,  76.9820] },
  { name: "thekkady",     label: "Thekkady",      coord: [9.6000,  77.1700] },
  { name: "varkala",      label: "Varkala",       coord: [8.7379,  76.7165] },
  { name: "wayanad",      label: "Wayanad",       coord: [11.6854, 76.1320] },
  { name: "kumarakom",    label: "Kumarakom",     coord: [9.6169,  76.4290] },
  // Goa
  { name: "goa",          label: "Goa",           coord: [15.2993, 74.1240] },
  { name: "panaji",       label: "Panaji",        coord: [15.4909, 73.8278] },
  // Rajasthan
  { name: "jaipur",       label: "Jaipur",        coord: [26.9124, 75.7873] },
  { name: "udaipur",      label: "Udaipur",       coord: [24.5854, 73.7125] },
  { name: "jodhpur",      label: "Jodhpur",       coord: [26.2389, 73.0243] },
  { name: "jaisalmer",    label: "Jaisalmer",     coord: [26.9157, 70.9083] },
  { name: "pushkar",      label: "Pushkar",       coord: [26.4899, 74.5511] },
  { name: "ranthambore",  label: "Ranthambore",   coord: [26.0173, 76.5026] },
  { name: "mount_abu",    label: "Mount Abu",     coord: [24.5926, 72.7156] },
  // North India
  { name: "delhi",        label: "Delhi",         coord: [28.6139, 77.2090] },
  { name: "agra",         label: "Agra",          coord: [27.1767, 78.0081] },
  { name: "varanasi",     label: "Varanasi",      coord: [25.3176, 82.9739] },
  { name: "amritsar",     label: "Amritsar",      coord: [31.6340, 74.8723] },
  { name: "rishikesh",    label: "Rishikesh",     coord: [30.0869, 78.2676] },
  { name: "haridwar",     label: "Haridwar",      coord: [29.9457, 78.1642] },
  { name: "khajuraho",    label: "Khajuraho",     coord: [24.8318, 79.9199] },
  // Himalayas
  { name: "manali",       label: "Manali",        coord: [32.2396, 77.1887] },
  { name: "shimla",       label: "Shimla",        coord: [31.1048, 77.1734] },
  { name: "dharamsala",   label: "Dharamsala",    coord: [32.2190, 76.3234] },
  { name: "leh",          label: "Leh",           coord: [34.1526, 77.5771] },
  { name: "nainital",     label: "Nainital",      coord: [29.3803, 79.4636] },
  { name: "mussoorie",    label: "Mussoorie",     coord: [30.4598, 78.0664] },
  { name: "spiti",        label: "Spiti",         coord: [32.2473, 78.0341] },
  // South India
  { name: "mysore",       label: "Mysore",        coord: [12.2958, 76.6394] },
  { name: "hampi",        label: "Hampi",         coord: [15.3350, 76.4600] },
  { name: "coorg",        label: "Coorg",         coord: [12.3375, 75.8069] },
  { name: "ooty",         label: "Ooty",          coord: [11.4102, 76.6950] },
  { name: "kodaikanal",   label: "Kodaikanal",    coord: [10.2381, 77.4892] },
  { name: "pondicherry",  label: "Pondicherry",   coord: [11.9416, 79.8083] },
  { name: "mahabalipuram",label: "Mahabalipuram", coord: [12.6269, 80.1927] },
  { name: "madurai",      label: "Madurai",       coord: [9.9252,  78.1198] },
  // Metro cities
  { name: "mumbai",       label: "Mumbai",        coord: [19.0760, 72.8777] },
  { name: "bangalore",    label: "Bangalore",     coord: [12.9716, 77.5946] },
  { name: "chennai",      label: "Chennai",       coord: [13.0827, 80.2707] },
  { name: "hyderabad",    label: "Hyderabad",     coord: [17.3850, 78.4867] },
  { name: "kolkata",      label: "Kolkata",       coord: [22.5726, 88.3639] },
  // East India
  { name: "darjeeling",   label: "Darjeeling",    coord: [27.0410, 88.2663] },
  { name: "puri",         label: "Puri",          coord: [19.8135, 85.8312] },
  { name: "bhubaneswar",  label: "Bhubaneswar",   coord: [20.2961, 85.8245] },
  // West India
  { name: "ahmedabad",    label: "Ahmedabad",     coord: [23.0225, 72.5714] },
  { name: "kutch",        label: "Rann of Kutch", coord: [23.7337, 69.8597] },
  // Islands
  { name: "andaman",      label: "Andaman",       coord: [11.7401, 92.6586] },
  { name: "havelock",     label: "Havelock",      coord: [12.0264, 92.9838] },
  // Wildlife
  { name: "jim_corbett",  label: "Jim Corbett",   coord: [29.5300, 78.7747] },
  { name: "kaziranga",    label: "Kaziranga",     coord: [26.5775, 93.1711] },
];

export default function IndiaDestinationsMap() {
  return (
    <div style={{
      borderRadius: 18,
      overflow: "hidden",
      border: "1.5px solid var(--border)",
      boxShadow: "0 2px 0 0 rgba(62,47,35,.1), 0 10px 28px -16px rgba(62,47,35,.28)",
    }}>
      <MapContainer
        center={[22.5, 80.0]}
        zoom={4}
        style={{ height: 420, width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {DESTINATIONS.map((dest) => (
          <Marker key={dest.name} position={dest.coord} icon={dotIcon}>
            <Popup>
              <DestinationPopup name={dest.name} label={dest.label} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

function DestinationPopup({ name, label }: { name: string; label: string }) {
  const imgUrl = getDestinationImageUrl(name);
  return (
    <div style={{ fontFamily: "Nunito, sans-serif", width: 160 }}>
      {imgUrl && (
        <div style={{ width: "100%", height: 80, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
          <img
            src={imgUrl}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
          />
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#3E2F23" }}>{label}</div>
    </div>
  );
}
