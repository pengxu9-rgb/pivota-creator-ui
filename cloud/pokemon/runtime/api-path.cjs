"use strict";
const operations =
  "(?:bootstrap|chat-create|chat-send|chat-action|chat-get|chat-list|chat-cancel|chat-delete|bookmark-list|bookmark-add|bookmark-remove|chat-review-bookmark|chat-review-card|chat-compare-bookmarks|collection-(?:list|add|update|remove)|alert-(?:list|add|update|remove))";
const apiPattern = new RegExp(
  "^/api/creator-agent/pokemon-collector/(?:" +
    operations +
    "|catalog/(?:search|card|status|market)|commerce/(?:research|select|handoff|psa))$",
);
module.exports = { apiPattern };
