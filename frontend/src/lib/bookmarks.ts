const KEY = "tripsathi_bookmarks";

export interface BookmarkItem {
  name: string;
  type: "hotel" | "activity";
  location: string;
  savedAt: string;
}

export function getBookmarks(): BookmarkItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); }
  catch { return []; }
}

export function isBookmarked(name: string): boolean {
  return getBookmarks().some((b) => b.name === name);
}

export function toggleBookmark(item: Omit<BookmarkItem, "savedAt">): boolean {
  const list = getBookmarks();
  const idx = list.findIndex((b) => b.name === item.name);
  if (idx >= 0) {
    list.splice(idx, 1);
    localStorage.setItem(KEY, JSON.stringify(list));
    return false;
  }
  list.push({ ...item, savedAt: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(list));
  return true;
}
