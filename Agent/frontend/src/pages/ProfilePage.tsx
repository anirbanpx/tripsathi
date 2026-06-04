import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Heart, Bookmark, Settings, ArrowLeft, MapPin, Calendar } from "lucide-react";
import type { UserContext, SavedTrip, WishlistItem, SavedHotel } from "../types";
import {
  getProfile, getSavedTrips, getWishlist, getSavedHotels, getTasteProfile,
  deleteSavedTrip, deleteWishlistItem, deleteHotel, updatePreferences,
} from "../services/api";

interface Props {
  ctx: UserContext;
  onSetContext: (patch: Partial<UserContext>) => void;
}

const INTEREST_OPTIONS = [
  "nature", "heritage", "food", "adventure", "photography",
  "spiritual", "wildlife", "shopping", "wellness", "nightlife",
];
const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Jain", "Halal", "Gluten-free", "None"];

export default function ProfilePage({ ctx, onSetContext }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<{ name: string; email: string; avatar_url: string | null; traveler_type_label: string } | null>(null);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [hotels, setHotels] = useState<SavedHotel[]>([]);
  const [tasteProfile, setTasteProfile] = useState<Record<string, unknown> | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefInterests, setPrefInterests] = useState<string[]>([]);
  const [prefDietary, setPrefDietary] = useState<string[]>([]);

  useEffect(() => {
    if (ctx.mode !== "authenticated" || !ctx.auth_user) {
      navigate("/");
      return;
    }
    Promise.all([
      getProfile(),
      getSavedTrips(),
      getWishlist(),
      getSavedHotels(),
      getTasteProfile(ctx.auth_user.user_id),
    ]).then(([profile, savedTrips, wl, savedHotels, taste]) => {
      setProfileData(profile);
      setTrips(savedTrips);
      setWishlist(wl);
      setHotels(savedHotels);
      setTasteProfile(taste);
      if (taste) {
        const interests = taste.interests as Record<string, number> | undefined;
        if (interests) {
          setPrefInterests(Object.entries(interests).filter(([, v]) => v >= 0.6).map(([k]) => k));
        }
        setPrefDietary((taste.dietary_restrictions as string[]) || []);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [ctx.mode, ctx.auth_user, navigate]);

  async function handleDeleteTrip(id: string) {
    await deleteSavedTrip(id);
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleDeleteWishlist(id: string) {
    await deleteWishlistItem(id);
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleDeleteHotel(id: string) {
    await deleteHotel(id);
    setHotels((prev) => prev.filter((h) => h.id !== id));
  }

  function toggleInterest(interest: string) {
    setPrefInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  }

  function toggleDietary(option: string) {
    setPrefDietary((prev) =>
      prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]
    );
  }

  async function handleSavePrefs() {
    setSavingPrefs(true);
    const interests: Record<string, number> = {};
    INTEREST_OPTIONS.forEach((i) => {
      interests[i] = prefInterests.includes(i) ? 0.8 : 0.3;
    });
    try {
      await updatePreferences({ interests, dietary_restrictions: prefDietary });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPrefs(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  if (loading) {
    return (
      <div className="cx" style={{ paddingTop: 80, textAlign: "center", color: "var(--fg-3)", fontSize: 14 }}>
        Loading your travel journal…
      </div>
    );
  }

  return (
    <div className="cx" style={{ paddingTop: 24, paddingBottom: 60, maxWidth: 720 }}>
      {/* Back */}
      <button
        onClick={() => navigate("/")}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
          fontFamily: "var(--font-body)", marginBottom: 24, padding: 0,
        }}
      >
        <ArrowLeft size={14} strokeWidth={2} /> Back
      </button>

      {/* User header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        {profileData?.avatar_url ? (
          <img src={profileData.avatar_url} alt={profileData.name} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 22, fontWeight: 700,
          }}>
            {profileData?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)", fontFamily: "var(--font-head)" }}>
            {profileData?.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>{profileData?.email}</div>
          {profileData?.traveler_type_label && (
            <div style={{
              display: "inline-block", marginTop: 6, padding: "3px 10px",
              background: "var(--accent-soft, #f0ede8)", borderRadius: 20,
              fontSize: 11, fontWeight: 600, color: "var(--accent)",
              fontFamily: "var(--font-body)", letterSpacing: "0.04em",
            }}>
              {profileData.traveler_type_label}
            </div>
          )}
          {!tasteProfile && (
            <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 6 }}>
              <button
                onClick={() => navigate("/onboarding")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 11, fontWeight: 600, padding: 0 }}
              >
                Set up preferences →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Saved Trips */}
      <Section icon={<Bookmark size={15} />} title="Saved Trips" count={trips.length}>
        {trips.length === 0 ? (
          <EmptyState text="No saved trips yet. Generate a plan and save it!" />
        ) : (
          trips.map((trip) => (
            <div key={trip.id} className="profile-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg-1)", fontFamily: "var(--font-head)", textTransform: "capitalize" }}>
                  {trip.destination}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3, display: "flex", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Calendar size={10} /> {trip.duration_days}d trip
                  </span>
                  <span>Saved {formatDate(trip.saved_at)}</span>
                </div>
              </div>
              <button onClick={() => handleDeleteTrip(trip.id)} style={deleteButtonStyle}>
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))
        )}
      </Section>

      {/* Wishlist */}
      <Section icon={<Heart size={15} />} title="Wishlist" count={wishlist.length}>
        {wishlist.length === 0 ? (
          <EmptyState text="Nothing wishlisted yet. Heart a destination or activity!" />
        ) : (
          wishlist.map((item) => (
            <div key={item.id} className="profile-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg-1)", fontFamily: "var(--font-head)" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3, display: "flex", gap: 10 }}>
                  <span style={{ textTransform: "capitalize" }}>{item.item_type}</span>
                  {item.location && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <MapPin size={10} /> {item.location}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => handleDeleteWishlist(item.id)} style={deleteButtonStyle}>
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))
        )}
      </Section>

      {/* Saved Hotels */}
      <Section icon={<Bookmark size={15} />} title="Saved Hotels" count={hotels.length}>
        {hotels.length === 0 ? (
          <EmptyState text="No saved hotels yet. Bookmark hotels from your plans!" />
        ) : (
          hotels.map((hotel) => (
            <div key={hotel.id} className="profile-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--fg-1)", fontFamily: "var(--font-head)" }}>
                  {hotel.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3, display: "flex", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <MapPin size={10} /> {hotel.location}
                  </span>
                  {hotel.approx_cost_per_night && (
                    <span>₹{hotel.approx_cost_per_night.toLocaleString("en-IN")}/night</span>
                  )}
                </div>
              </div>
              <button onClick={() => handleDeleteHotel(hotel.id)} style={deleteButtonStyle}>
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))
        )}
      </Section>

      {/* Preferences */}
      <Section icon={<Settings size={15} />} title="Preferences">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)", marginBottom: 8 }}>Interests</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {INTEREST_OPTIONS.map((interest) => (
            <button
              key={interest}
              onClick={() => toggleInterest(interest)}
              style={{
                padding: "5px 12px", borderRadius: 20, border: "1.5px solid",
                borderColor: prefInterests.includes(interest) ? "var(--accent)" : "var(--border)",
                background: prefInterests.includes(interest) ? "var(--accent)" : "transparent",
                color: prefInterests.includes(interest) ? "#fff" : "var(--fg-2)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
                textTransform: "capitalize",
              }}
            >
              {interest}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)", marginBottom: 8 }}>Dietary</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {DIETARY_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => toggleDietary(opt)}
              style={{
                padding: "5px 12px", borderRadius: 20, border: "1.5px solid",
                borderColor: prefDietary.includes(opt) ? "var(--accent)" : "var(--border)",
                background: prefDietary.includes(opt) ? "var(--accent)" : "transparent",
                color: prefDietary.includes(opt) ? "#fff" : "var(--fg-2)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
        <button
          onClick={handleSavePrefs}
          disabled={savingPrefs}
          style={{
            padding: "8px 20px", background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: savingPrefs ? "not-allowed" : "pointer", opacity: savingPrefs ? 0.7 : 1,
            fontFamily: "var(--font-body)",
          }}
        >
          {savingPrefs ? "Saving…" : "Save preferences"}
        </button>
      </Section>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ color: "var(--accent)" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", fontFamily: "var(--font-head)" }}>{title}</span>
        {count !== undefined && count > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, background: "var(--accent-soft, #f0ede8)",
            color: "var(--accent)", borderRadius: 10, padding: "1px 7px",
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: "16px 20px", background: "var(--bg-2, #f7f5f0)", borderRadius: 10,
      fontSize: 12, color: "var(--fg-3)", fontStyle: "italic",
    }}>
      {text}
    </div>
  );
}

const deleteButtonStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--fg-3)", padding: 6, borderRadius: 6,
  display: "flex", alignItems: "center",
};
