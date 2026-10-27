"use strict";

// A lost acknowledgement does not establish whether a write persisted. Send
// the mutation once, then derive the button state only from the owner's list.
async function changeBookmark({ api, cardId, existingId, payload, signal }) {
  let writeError;
  try {
    await api(existingId ? "bookmark-remove" : "bookmark-add", payload, signal);
  } catch (error) {
    writeError = error;
  }
  try {
    const bookmarks = await api("bookmark-list", {}, signal);
    if (
      !Array.isArray(bookmarks) ||
      bookmarks.some(
        (b) =>
          typeof b?.id !== "string" || typeof b?.card?.card_id !== "string",
      )
    )
      throw new Error("Invalid saved-card response.");
    const confirmed = existingId
      ? !bookmarks.some((b) => b.id === existingId)
      : bookmarks.some((b) => b.card.card_id === cardId);
    return {
      bookmarks,
      confirmed,
      unverified: false,
      error: confirmed
        ? null
        : new Error(
            existingId
              ? "Removal was not confirmed. The current saved list has been refreshed."
              : "Save was not confirmed. The current saved list has been refreshed.",
            { cause: writeError },
          ),
    };
  } catch {
    return {
      bookmarks: null,
      confirmed: false,
      unverified: true,
      error: new Error(
        "Could not verify saved cards. Reload before continuing.",
      ),
    };
  }
}
module.exports = { changeBookmark };
